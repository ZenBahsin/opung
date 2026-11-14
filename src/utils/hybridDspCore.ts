export const RNNOISE_FRAME_SIZE = 480;
export const RING_CAPACITY = 4096;
export const PCM16_SCALE = 32768.0;

export interface RnnoiseProcessorAdapter {
  processFrameInPlace(frame480: Float32Array): number;
  destroy(): void;
}

export class CircularFloat32Buffer {
  private capacity: number;
  private mask: number;
  private storage: Float32Array;
  private writePtr = 0;
  private readPtr = 0;
  public available = 0;

  constructor(capacity = RING_CAPACITY) {
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.storage = new Float32Array(capacity);
  }

  pushScaled(src: Float32Array, count: number, scale = 1.0): boolean {
    if (count > this.capacity - this.available) return false;
    for (let i = 0; i < count; i++) {
      this.storage[this.writePtr] = src[i] * scale;
      this.writePtr = (this.writePtr + 1) & this.mask;
    }
    this.available += count;
    return true;
  }

  pullScaled(dst: Float32Array, offset: number, count: number, scale = 1.0): boolean {
    if (this.available < count) return false;
    for (let i = 0; i < count; i++) {
      let s = this.storage[this.readPtr] * scale;
      if (!Number.isFinite(s)) s = 0;
      if (scale !== 1.0) s = s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s;
      dst[offset + i] = s;
      this.readPtr = (this.readPtr + 1) & this.mask;
    }
    this.available -= count;
    return true;
  }

  clear(): void {
    this.writePtr = 0;
    this.readPtr = 0;
    this.available = 0;
    this.storage.fill(0);
  }
}

export class NearFieldHybridDspCore {
  private inputRing = new CircularFloat32Buffer(RING_CAPACITY);
  private outputRing = new CircularFloat32Buffer(RING_CAPACITY);
  private frame480 = new Float32Array(RNNOISE_FRAME_SIZE);
  private rnnoise: RnnoiseProcessorAdapter | null = null;

  public smoothedGain = 0.0;
  private hpX1 = 0;
  private hpX2 = 0;
  private hpY1 = 0;
  private hpY2 = 0;
  private scLpY = 0;
  private prevSample = 0;
  private noiseFloorRms = 120.0;
  private holdCounter = 0;
  private holdFrames = 26; // 260ms hold alami agar suku kata & konsonan S/T/K utuh dan jernih
  private echoGuardDecayDb = -80.0;

  public lastFrameDb = -75;
  public lastVadProb = 0;
  public isGateOpen = false;
  private wasEnabled = true;

  constructor(rnnoise?: RnnoiseProcessorAdapter | null) {
    this.rnnoise = rnnoise ?? null;
    this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
  }

  public get isRnnoiseActive(): boolean {
    return this.rnnoise !== null;
  }

  public setRnnoiseEngine(engine: RnnoiseProcessorAdapter | null): void {
    if (this.rnnoise && this.rnnoise !== engine) {
      try {
        this.rnnoise.destroy();
      } catch {
        // Ignore cleanup failure
      }
    }
    this.rnnoise = engine;
  }

  public destroy(): void {
    if (this.rnnoise) {
      try {
        this.rnnoise.destroy();
      } catch {
        // Ignore cleanup failure
      }
      this.rnnoise = null;
    }
    this.resetRings();
  }

  public resetRings(): void {
    this.inputRing.clear();
    this.outputRing.clear();
    this.frame480.fill(0);
    this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
    this.hpX1 = 0;
    this.hpX2 = 0;
    this.hpY1 = 0;
    this.hpY2 = 0;
    this.scLpY = 0;
    this.prevSample = 0;
    this.noiseFloorRms = 120.0;
    this.holdCounter = 0;
    this.echoGuardDecayDb = -80.0;
    this.smoothedGain = 0.0;
    this.lastFrameDb = -75;
    this.lastVadProb = 0;
    this.isGateOpen = false;
  }

  private processFrame480(
    frame: Float32Array,
    thresholdDb: number,
    krispMode = true,
    isLoopbackTest = false
  ): void {
    // TAHAP 1 (HYBRID LAYER 1): Real RNNoise Neural GRU Denoiser (480 sampel / 10ms @ 48 kHz)
    // Mengupas suara bor, ketikan keyboard, kipas, dan bising non-manusia DI DALAM ucapan maupun saat hening.
    const hasRnnoise = krispMode && this.rnnoise !== null;
    let vadProb = 1.0;
    if (hasRnnoise && this.rnnoise) {
      try {
        vadProb = this.rnnoise.processFrameInPlace(frame);
        if (!Number.isFinite(vadProb)) vadProb = 0;
        this.lastVadProb = Math.max(0, Math.min(1, vadProb));
      } catch {
        vadProb = 1.0;
      }
    } else {
      this.lastVadProb = 0;
    }

    let vocalBandEnergy = 0;
    let totalEnergy = 0;
    let zeroCrossings = 0;

    // TAHAP 2: Sidechain Formant Detector (120Hz - 3100Hz) + Zero-Crossing Rate (ZCR)
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      let x0 = frame[i];
      if (!Number.isFinite(x0)) {
        x0 = 0;
        frame[i] = 0;
      }
      if ((x0 >= 0 && this.hpX1 < 0) || (x0 < 0 && this.hpX1 >= 0)) {
        zeroCrossings++;
      }
      const yHp =
        0.9888 * x0 -
        1.9776 * this.hpX1 +
        0.9888 * this.hpX2 +
        1.9774 * this.hpY1 -
        0.9778 * this.hpY2;
      this.hpX2 = this.hpX1;
      this.hpX1 = x0;
      this.hpY2 = this.hpY1;
      this.hpY1 = yHp;
      this.scLpY += 0.33 * (yHp - this.scLpY);
      vocalBandEnergy += this.scLpY * this.scLpY;
      totalEnergy += yHp * yHp;
    }

    const vocalRms = Math.sqrt(vocalBandEnergy / RNNOISE_FRAME_SIZE);
    const totalRms = Math.sqrt(totalEnergy / RNNOISE_FRAME_SIZE);

    if (totalRms < this.noiseFloorRms) {
      this.noiseFloorRms = 0.92 * this.noiseFloorRms + 0.08 * totalRms;
    } else {
      this.noiseFloorRms = 0.9985 * this.noiseFloorRms + 0.0015 * totalRms;
    }
    this.noiseFloorRms = Math.max(40.0, Math.min(4500.0, this.noiseFloorRms));

    const normRms = Math.max(1e-7, vocalRms / PCM16_SCALE);
    let frameDb = 20.0 * Math.log10(normRms);

    // Diskriminator Bising Non-Manusia Hybrid (ZCR + Neural VAD Fusion):
    // Suara benda mati/impuls keras (bor/keyboard/kipas) ditekan agar tidak menipu gerbang,
    // sementara vokal manusia sejati tetap terjaga penuh.
    if (krispMode) {
      if (hasRnnoise) {
        if (zeroCrossings > 135 && vadProb < 0.35) {
          frameDb -= 12.0;
        } else if (vadProb < 0.16 && frameDb < thresholdDb + 10.0) {
          frameDb -= 10.0;
        } else if (vadProb >= 0.65) {
          frameDb += 1.0;
        }
      } else if (zeroCrossings > 135) {
        frameDb -= 12.0;
      }
    }

    this.lastFrameDb = Math.round(frameDb);

    // TAHAP 3 (HYBRID LAYER 2): Opung Near-Field Proximity Gate (<= 1 Meter) + Anti-Cave-Echo Guard
    // Memblokir suara rekan kantor yang berbicara di meja sebelah (> 1.5m) ke mutlak 0.00x saat Anda diam.
    this.echoGuardDecayDb = Math.max(-80.0, this.echoGuardDecayDb - 0.45);
    const effectiveThresholdDb = isLoopbackTest
      ? Math.max(thresholdDb + 3.0, this.echoGuardDecayDb - 6.5)
      : thresholdDb;
    const activeHoldFrames = isLoopbackTest ? 9 : this.holdFrames;

    let targetGain = 0.0;
    if (frameDb >= effectiveThresholdDb) {
      targetGain = 1.0;
      this.holdCounter = activeHoldFrames;
      if (frameDb > this.echoGuardDecayDb) {
        this.echoGuardDecayDb = frameDb;
      }
    } else if (this.holdCounter > 0) {
      this.holdCounter--;
      targetGain = 1.0;
    } else {
      targetGain = 0.0;
    }

    this.isGateOpen = targetGain > 0.5;

    // TAHAP 4: Intra-Speech Polish (halus saat RNNoise aktif, Wiener penuh saat mode fallback)
    let intraSpeechDenoiseGain = 1.0;
    if (krispMode && this.isGateOpen) {
      const snr =
        Math.max(0.0, totalRms - this.noiseFloorRms * 1.25) / (totalRms + 1.0);
      intraSpeechDenoiseGain = hasRnnoise
        ? Math.max(0.78, Math.min(1.0, snr * 1.35))
        : Math.max(0.28, Math.min(1.0, snr * 1.15));
    }

    const effectiveTargetGain = targetGain * intraSpeechDenoiseGain;
    const maxVocalSlew = 5200.0;

    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      let sample = frame[i];
      if (krispMode) {
        const delta = sample - this.prevSample;
        if (delta > maxVocalSlew || delta < -maxVocalSlew) {
          sample = this.prevSample + delta * 0.22;
        }
        this.prevSample = sample;
      }

      const coeff = effectiveTargetGain > this.smoothedGain ? 0.12 : 0.008;
      this.smoothedGain += coeff * (effectiveTargetGain - this.smoothedGain);
      if (this.smoothedGain < 0.003 && targetGain === 0.0) {
        this.smoothedGain = 0.0;
      }
      frame[i] = sample * this.smoothedGain;
    }
  }

  public processAudioBlock(
    inputBuffer: Float32Array,
    outputBuffer: Float32Array,
    enabled: boolean,
    thresholdDb: number,
    krispMode = true,
    isLoopbackTest = false
  ): void {
    if (!enabled) {
      this.wasEnabled = false;
      outputBuffer.set(inputBuffer);
      this.isGateOpen = true;
      this.smoothedGain = 1.0;
      return;
    }

    if (!this.wasEnabled) {
      this.resetRings();
      this.wasEnabled = true;
    }

    this.inputRing.pushScaled(inputBuffer, inputBuffer.length, PCM16_SCALE);
    while (this.inputRing.available >= RNNOISE_FRAME_SIZE) {
      this.inputRing.pullScaled(this.frame480, 0, RNNOISE_FRAME_SIZE, 1.0);
      this.processFrame480(this.frame480, thresholdDb, krispMode, isLoopbackTest);
      this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
    }

    if (
      !this.outputRing.pullScaled(
        outputBuffer,
        0,
        outputBuffer.length,
        1.0 / PCM16_SCALE
      )
    ) {
      outputBuffer.fill(0);
    }

    if (this.smoothedGain === 0.0) {
      outputBuffer.fill(0);
    }
  }
}
