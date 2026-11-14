/**
 * Membangun kode Blob JavaScript untuk AudioWorkletProcessor Opung ("opung-hybrid-processor")
 * yang menjalankan Hybrid RNNoise 0.2 WASM + Near-Field Proximity Gate (<= 1.0m)
 * langsung di dedicated real-time audio rendering thread (128-sampel quantum, zero main-thread stutter).
 */
export const OPUNG_WORKLET_PROCESSOR_BODY = `
(function () {
  const RNNOISE_FRAME_SIZE = 480;
  const RING_CAPACITY = 4096;
  const PCM16_SCALE = 32768.0;

  function createWorkletRnnoiseEngine() {
    const factory = globalThis.__createOpungRnnoiseSync;
    if (typeof factory !== 'function') {
      return null;
    }
    try {
      const mod = factory();
      if (!mod || typeof mod._rnnoise_create !== 'function') {
        return null;
      }
      const ctxPtr = mod._rnnoise_create(0);
      if (!ctxPtr) return null;
      const framePtr = mod._malloc(RNNOISE_FRAME_SIZE * 4);
      if (!framePtr) {
        mod._rnnoise_destroy(ctxPtr);
        return null;
      }
      let destroyed = false;
      return {
        processFrameInPlace(frame480) {
          if (destroyed) return 0;
          const heapOffset = framePtr >> 2;
          mod.HEAPF32.set(frame480, heapOffset);
          const vadProb = mod._rnnoise_process_frame(ctxPtr, framePtr, framePtr);
          frame480.set(mod.HEAPF32.subarray(heapOffset, heapOffset + RNNOISE_FRAME_SIZE));
          return Number.isFinite(vadProb) ? vadProb : 0;
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          try { mod._free(framePtr); } catch (_e) {}
          try { mod._rnnoise_destroy(ctxPtr); } catch (_e) {}
        },
      };
    } catch (_e) {
      return null;
    }
  }

  class CircularFloat32Buffer {
    constructor(capacity) {
      this.capacity = capacity || RING_CAPACITY;
      this.mask = this.capacity - 1;
      this.storage = new Float32Array(this.capacity);
      this.writePtr = 0;
      this.readPtr = 0;
      this.available = 0;
    }
    pushScaled(src, count, scale) {
      if (count > this.capacity - this.available) return false;
      for (let i = 0; i < count; i++) {
        this.storage[this.writePtr] = src[i] * scale;
        this.writePtr = (this.writePtr + 1) & this.mask;
      }
      this.available += count;
      return true;
    }
    pullScaled(dst, offset, count, scale) {
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
    clear() {
      this.writePtr = 0;
      this.readPtr = 0;
      this.available = 0;
      this.storage.fill(0);
    }
  }

  class WorkletHybridDspCore {
    constructor(rnnoise) {
      this.inputRing = new CircularFloat32Buffer(RING_CAPACITY);
      this.outputRing = new CircularFloat32Buffer(RING_CAPACITY);
      this.frame480 = new Float32Array(RNNOISE_FRAME_SIZE);
      this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
      this.rnnoise = rnnoise || null;
      this.smoothedGain = 0.0;
      this.hpX1 = 0; this.hpX2 = 0; this.hpY1 = 0; this.hpY2 = 0;
      this.scLpY = 0;
      this.prevSample = 0;
      this.noiseFloorRms = 120.0;
      this.holdCounter = 0;
      this.holdFrames = 26;
      this.echoGuardDecayDb = -80.0;
      this.lastFrameDb = -75;
      this.lastVadProb = 0;
      this.isGateOpen = false;
      this.wasEnabled = true;
    }

    destroy() {
      if (this.rnnoise) {
        try { this.rnnoise.destroy(); } catch (_e) {}
        this.rnnoise = null;
      }
      this.resetRings();
    }

    resetRings() {
      this.inputRing.clear();
      this.outputRing.clear();
      this.frame480.fill(0);
      this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
      this.hpX1 = 0; this.hpX2 = 0; this.hpY1 = 0; this.hpY2 = 0;
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

    processFrame480(frame, thresholdDb, krispMode, isLoopbackTest) {
      const hasRnnoise = krispMode && this.rnnoise !== null;
      let vadProb = 1.0;
      if (hasRnnoise) {
        try {
          vadProb = this.rnnoise.processFrameInPlace(frame);
          if (!Number.isFinite(vadProb)) vadProb = 0;
          this.lastVadProb = Math.max(0, Math.min(1, vadProb));
        } catch (_e) {
          vadProb = 1.0;
        }
      } else {
        this.lastVadProb = 0;
      }

      let vocalBandEnergy = 0;
      let totalEnergy = 0;
      let zeroCrossings = 0;

      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        let x0 = frame[i];
        if (!Number.isFinite(x0)) {
          x0 = 0;
          frame[i] = 0;
        }
        if ((x0 >= 0 && this.hpX1 < 0) || (x0 < 0 && this.hpX1 >= 0)) {
          zeroCrossings++;
        }
        const yHp = 0.9888 * x0 - 1.9776 * this.hpX1 + 0.9888 * this.hpX2 + 1.9774 * this.hpY1 - 0.9778 * this.hpY2;
        this.hpX2 = this.hpX1; this.hpX1 = x0;
        this.hpY2 = this.hpY1; this.hpY1 = yHp;
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

      let intraSpeechDenoiseGain = 1.0;
      if (krispMode && this.isGateOpen) {
        const snr = Math.max(0.0, totalRms - this.noiseFloorRms * 1.25) / (totalRms + 1.0);
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

    processAudioBlock(inputBuffer, outputBuffer, enabled, thresholdDb, krispMode, isLoopbackTest) {
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
      if (!this.outputRing.pullScaled(outputBuffer, 0, outputBuffer.length, 1.0 / PCM16_SCALE)) {
        outputBuffer.fill(0);
      }
      if (this.smoothedGain === 0.0) {
        outputBuffer.fill(0);
      }
    }
  }

  class OpungHybridWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.alive = true;
      this.enabled = true;
      this.thresholdDb = -26;
      this.krispMode = true;
      this.isLoopbackTest = false;
      this.needPcmStream = false;
      this.quantumCount = 0;
      this.pcmAcc = new Int16Array(512);
      this.pcmPos = 0;

      const rnnoiseEngine = createWorkletRnnoiseEngine();
      this.dspCore = new WorkletHybridDspCore(rnnoiseEngine);

      this.port.postMessage({
        type: 'ready',
        rnnoiseActive: Boolean(rnnoiseEngine),
      });

      this.port.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'config') {
          if (typeof msg.enabled === 'boolean') this.enabled = msg.enabled;
          if (typeof msg.thresholdDb === 'number') this.thresholdDb = msg.thresholdDb;
          if (typeof msg.krispMode === 'boolean') this.krispMode = msg.krispMode;
          if (typeof msg.isLoopbackTest === 'boolean') this.isLoopbackTest = msg.isLoopbackTest;
          if (typeof msg.needPcmStream === 'boolean') this.needPcmStream = msg.needPcmStream;
        } else if (msg.type === 'reset') {
          this.dspCore.resetRings();
        } else if (msg.type === 'destroy') {
          this.alive = false;
          this.dspCore.destroy();
        }
      };
    }

    process(inputs, outputs) {
      if (!this.alive) return false;
      const inputGroup = inputs[0];
      const outputGroup = outputs[0];
      const inCh = inputGroup && inputGroup[0];
      const outCh = outputGroup && outputGroup[0];

      if (!outCh) return true;
      if (!inCh || inCh.length === 0) {
        outCh.fill(0);
        return true;
      }

      this.dspCore.processAudioBlock(
        inCh,
        outCh,
        this.enabled,
        this.thresholdDb,
        this.krispMode,
        this.isLoopbackTest
      );

      this.quantumCount++;
      if ((this.quantumCount & 3) === 0) {
        this.port.postMessage({
          type: 'stats',
          frameDb: this.dspCore.lastFrameDb,
          vadProb: this.dspCore.lastVadProb,
          isGateOpen: this.dspCore.isGateOpen,
          smoothedGain: this.dspCore.smoothedGain,
          rnnoiseActive: Boolean(this.dspCore.rnnoise),
        });
      }

      if (this.needPcmStream) {
        const isMutedByGate =
          this.enabled && !this.dspCore.isGateOpen && this.dspCore.smoothedGain === 0.0;
        const vocalBoost = this.isLoopbackTest ? 1.15 : 1.85;
        for (let i = 0; i < outCh.length; i++) {
          const rawSample = isMutedByGate ? 0.0 : outCh[i] * vocalBoost;
          const clipped = Math.tanh(rawSample);
          this.pcmAcc[this.pcmPos++] = clipped < 0 ? clipped * 32768 : clipped * 32767;
          if (this.pcmPos >= 512) {
            const copy = new Int16Array(this.pcmAcc);
            this.port.postMessage({ type: 'pcm', buffer: copy.buffer }, [copy.buffer]);
            this.pcmPos = 0;
          }
        }
      }

      return true;
    }
  }

  registerProcessor('opung-hybrid-processor', OpungHybridWorkletProcessor);
})();
`;

export function buildOpungWorkletModuleCode(rnnoiseInlineScript: string): string {
  return `${rnnoiseInlineScript}\n${OPUNG_WORKLET_PROCESSOR_BODY}`;
}
