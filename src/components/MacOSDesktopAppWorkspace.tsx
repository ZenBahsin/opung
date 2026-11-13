import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Power,
  Headphones,
  Download,
  Mic,
  Volume2,
  CheckCircle2,
  Maximize2,
  Minimize2,
  RefreshCw,
  EyeOff,
} from 'lucide-react';
import {
  buildMacOSDiskImageDmg,
} from '../utils/macosAppBuilder';
import {
  downloadWindowsOpungApp,
} from '../utils/windowsAppBuilder';
import {
  isDeprecatedOpungDriverLabel,
  isVirtualCableLabel,
  isAnyVirtualOrDeprecatedInputLabel,
  isPhysicalSpeakerOrEarphoneLabel,
  formatConnectedVirtualMicBadge,
} from '../utils/audioDeviceFilters';

const RNNOISE_FRAME_SIZE = 480;
const RING_CAPACITY = 4096;
const PCM16_SCALE = 32768.0;

class CircularFloat32Buffer {
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

class NearFieldMacDspCore {
  private inputRing = new CircularFloat32Buffer(RING_CAPACITY);
  private outputRing = new CircularFloat32Buffer(RING_CAPACITY);
  private frame480 = new Float32Array(RNNOISE_FRAME_SIZE);
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
  public isGateOpen = false;
  private wasEnabled = true;

  constructor() {
    this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
  }

  public resetRings() {
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
  }

  private processFrame480(
    frame: Float32Array,
    thresholdDb: number,
    krispMode = true,
    isLoopbackTest = false
  ) {
    let vocalBandEnergy = 0;
    let totalEnergy = 0;
    let zeroCrossings = 0;

    // 1. SIDECHAIN FORMANT DETECTOR (120Hz - 3100Hz) + ZERO-CROSSING RATE (ZCR) DISCRIMINATOR:
    // Mengukur energi khusus pita suara manusia (Formant F0-F3) dan menghitung ZCR
    // agar suara bor bangunan (> 4kHz), desis kipas, atau ketikan keyboard TIDAK BISA menipu gerbang!
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      const x0 = frame[i];
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

    // 2. ADAPTIVE STATIONARY NOISE FLOOR TRACKER:
    if (totalRms < this.noiseFloorRms) {
      this.noiseFloorRms = 0.92 * this.noiseFloorRms + 0.08 * totalRms;
    } else {
      this.noiseFloorRms = 0.9985 * this.noiseFloorRms + 0.0015 * totalRms;
    }
    this.noiseFloorRms = Math.max(40.0, Math.min(4500.0, this.noiseFloorRms));

    const normRms = Math.max(1e-7, vocalRms / PCM16_SCALE);
    let frameDb = 20.0 * Math.log10(normRms);

    // Penalti Non-Manusia (Mode Krisp): Jika frekuensi sangat tinggi/kasar (ZCR > 135 seperti suara bor/ketikan),
    // turunkan dB detektor sebesar 12 dB agar suara benda mati di dekat mic tidak membuka gerbang!
    if (krispMode && zeroCrossings > 135) {
      frameDb -= 12.0;
    }

    this.lastFrameDb = Math.round(frameDb);

    // Anti-Cave-Echo Guard saat Tes Dengar Suara Sendiri aktif:
    // Mencegah pantulan speaker (~120ms kemudian) memicu ulang gerbang secara berulang seperti di goa.
    this.echoGuardDecayDb = Math.max(-80.0, this.echoGuardDecayDb - 0.45);
    const effectiveThresholdDb = isLoopbackTest
      ? Math.max(thresholdDb + 3.0, this.echoGuardDecayDb - 6.5)
      : thresholdDb;
    const activeHoldFrames = isLoopbackTest ? 9 : this.holdFrames;

    // GERBANG JARAK DEKAT MUTLAK (<= 1 METER)
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

    // 3. WIENER INTRA-SPEECH DENOISING (Mengupas bising latar SAAT Anda sedang berbicara):
    let intraSpeechDenoiseGain = 1.0;
    if (krispMode && this.isGateOpen) {
      const snr = Math.max(0.0, totalRms - this.noiseFloorRms * 1.25) / (totalRms + 1.0);
      intraSpeechDenoiseGain = Math.max(0.28, Math.min(1.0, snr * 1.15));
    }

    const effectiveTargetGain = targetGain * intraSpeechDenoiseGain;
    const maxVocalSlew = 5200.0;

    // 4. SLEW-RATE TRANSIENT DE-CLICKER + Attack cepat (0.12) & Release halus (0.008)
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
  ) {
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

export const MacOSDesktopAppWorkspace: React.FC = () => {
  // Real-Time macOS App State
  const [isMicRunning, setIsMicRunning] = useState<boolean>(false);
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [vocalClarityEnabled] = useState<boolean>(true);
  const [krispModeEnabled] = useState<boolean>(true);
  const [speakerEchoGuardEnabled] = useState<boolean>(true);
  const [thresholdDb, setThresholdDb] = useState<number>(-26);
  const [loopbackAudible, setLoopbackAudible] = useState<boolean>(false);
  const [focusedAppMode, setFocusedAppMode] = useState<boolean>(false);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');
  const [sinkConnectedText, setSinkConnectedText] = useState<string>('Siap');
  const [micError, setMicError] = useState<string | null>(null);
  const [downloadBanner, setDownloadBanner] = useState<{
    title: string;
    detail: string;
  } | null>(null);
  const [isDownloadingWin, setIsDownloadingWin] = useState<boolean>(false);

  const [liveStats, setLiveStats] = useState<{
    rawPct: number;
    cleanPct: number;
    gateOpen: boolean;
    gainVal: string;
    frameDb: number;
  }>({
    rawPct: 0,
    cleanPct: 0,
    gateOpen: false,
    gainVal: '0.00x',
    frameDb: -75,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isEnabledRef = useRef<boolean>(isEnabled);
  const vocalClarityRef = useRef<boolean>(vocalClarityEnabled);
  const krispModeRef = useRef<boolean>(krispModeEnabled);
  const speakerEchoGuardRef = useRef<boolean>(speakerEchoGuardEnabled);
  const thresholdDbRef = useRef<number>(thresholdDb);
  const isMicRunningRef = useRef<boolean>(isMicRunning);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rawAnalyserRef = useRef<AnalyserNode | null>(null);
  const cleanAnalyserRef = useRef<AnalyserNode | null>(null);
  const clarityNodesRef = useRef<{
    mudCutNode: BiquadFilterNode;
    warmthNode: BiquadFilterNode;
    presenceNode: BiquadFilterNode;
    airShelfNode: BiquadFilterNode;
    krispLowPassNode: BiquadFilterNode;
    makeupGainNode: GainNode;
  } | null>(null);
  const dspCoreRef = useRef<NearFieldMacDspCore>(new NearFieldMacDspCore());
  const micStreamRef = useRef<MediaStream | null>(null);
  const virtualSinkAudioRef = useRef<HTMLAudioElement | null>(null);
  const earphoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const cleanStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const outputDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const selectedOutputIdRef = useRef<string>('');
  const appliedSinkIdRef = useRef<string>('');
  const loopbackAudibleRef = useRef<boolean>(loopbackAudible);

  useEffect(() => {
    if (virtualSinkAudioRef.current) {
      virtualSinkAudioRef.current.muted = true;
      virtualSinkAudioRef.current.volume = 0;
    }
    if (earphoneAudioRef.current) {
      earphoneAudioRef.current.muted = true;
      earphoneAudioRef.current.volume = 0;
    }
  }, []);

  useEffect(() => {
    outputDevicesRef.current = outputDevices;
  }, [outputDevices]);

  useEffect(() => {
    selectedOutputIdRef.current = selectedOutputId;
  }, [selectedOutputId]);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  useEffect(() => {
    loopbackAudibleRef.current = loopbackAudible;
  }, [loopbackAudible]);

  useEffect(() => {
    speakerEchoGuardRef.current = speakerEchoGuardEnabled;
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      track
        .applyConstraints({
          echoCancellation: true,
          noiseSuppression: krispModeRef.current,
          autoGainControl: false,
        })
        .catch(() => {});
    }
  }, [speakerEchoGuardEnabled]);

  useEffect(() => {
    krispModeRef.current = krispModeEnabled;
    const track = micStreamRef.current?.getAudioTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      track
        .applyConstraints({
          echoCancellation: true,
          noiseSuppression: krispModeEnabled,
          autoGainControl: false,
        })
        .catch(() => {});
    }
    if (clarityNodesRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      clarityNodesRef.current.krispLowPassNode.frequency.setTargetAtTime(
        krispModeEnabled ? 4600 : 18000,
        now,
        0.02
      );
    }
  }, [krispModeEnabled]);

  useEffect(() => {
    vocalClarityRef.current = vocalClarityEnabled;
    if (clarityNodesRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      const { mudCutNode, warmthNode, presenceNode, airShelfNode, makeupGainNode } =
        clarityNodesRef.current;
      mudCutNode.gain.setTargetAtTime(vocalClarityEnabled ? -2.8 : 0.0, now, 0.02);
      warmthNode.gain.setTargetAtTime(vocalClarityEnabled ? 2.0 : 0.0, now, 0.02);
      presenceNode.gain.setTargetAtTime(vocalClarityEnabled ? 4.5 : 0.0, now, 0.02);
      airShelfNode.gain.setTargetAtTime(vocalClarityEnabled ? 3.5 : 0.0, now, 0.02);
      makeupGainNode.gain.setTargetAtTime(
        loopbackAudibleRef.current ? 0.85 : vocalClarityEnabled ? 1.65 : 1.15,
        now,
        0.02
      );
    }
  }, [vocalClarityEnabled]);

  useEffect(() => {
    thresholdDbRef.current = thresholdDb;
  }, [thresholdDb]);

  useEffect(() => {
    isMicRunningRef.current = isMicRunning;
  }, [isMicRunning]);

  const isWindowsBrowser =
    typeof navigator !== 'undefined' &&
    /windows|win32|win64/i.test(navigator.userAgent || '');

  const pickBestPhysicalInputDevice = (
    inputs: MediaDeviceInfo[],
    requestedId?: string
  ): MediaDeviceInfo | null => {
    const physicalInputs = inputs.filter(
      (d) =>
        d.kind === 'audioinput' &&
        d.deviceId !== 'default' &&
        d.deviceId !== 'communications' &&
        !isAnyVirtualOrDeprecatedInputLabel(d.label)
    );
    if (
      requestedId &&
      requestedId !== 'default' &&
      requestedId !== 'communications'
    ) {
      const exactMatch = physicalInputs.find((d) => d.deviceId === requestedId);
      if (exactMatch) return exactMatch;
    }
    const builtInMatch = physicalInputs.find((d) => {
      const l = (d.label || '').toLowerCase();
      return (
        l.includes('macbook') ||
        l.includes('built-in') ||
        l.includes('internal') ||
        l.includes('mikrofon') ||
        l.includes('microphone')
      );
    });
    return builtInMatch || physicalInputs[0] || null;
  };

  const routeEarphoneLoopbackToPhysicalDevice = useCallback(async () => {
    try {
      const audioEl = earphoneAudioRef.current as
        | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
        | null;
      if (!audioEl || typeof audioEl.setSinkId !== 'function') return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(
        (d) =>
          d.kind === 'audiooutput' &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          !isAnyVirtualOrDeprecatedInputLabel(d.label)
      );
      const headphoneOut = outputs.find((d) => {
        const l = (d.label || '').toLowerCase();
        return (
          l.includes('headphone') ||
          l.includes('earphone') ||
          l.includes('airpods') ||
          l.includes('bluetooth')
        );
      });
      const physicalOut =
        headphoneOut ||
        outputs.find((d) => isPhysicalSpeakerOrEarphoneLabel(d.label)) ||
        outputs[0];
      if (physicalOut && physicalOut.deviceId) {
        await audioEl.setSinkId(physicalOut.deviceId).catch(() => {});
      }
    } catch {
      // Ignore if sink routing unsupported
    }
  }, []);

  const applyVirtualSinkOutput = useCallback(
    async (
      sinkId: string,
      customOuts?: MediaDeviceInfo[],
      forceRebind?: boolean
    ) => {
      selectedOutputIdRef.current = sinkId;
      setSelectedOutputId(sinkId);
      const audioEl = virtualSinkAudioRef.current;
      if (!audioEl) return;

      if (
        !sinkId ||
        sinkId === 'default' ||
        sinkId === 'communications' ||
        sinkId === 'coreaudio-default'
      ) {
        appliedSinkIdRef.current = '';
        audioEl.muted = true;
        audioEl.volume = 0;
        audioEl.pause();
        audioEl.srcObject = null;
        setSinkConnectedText('Siaga (Earphone Aman)');
        return;
      }

      const list = customOuts || outputDevicesRef.current;
      const chosenDev = list.find((d) => d.deviceId === sinkId);
      if (chosenDev && isPhysicalSpeakerOrEarphoneLabel(chosenDev.label)) {
        appliedSinkIdRef.current = '';
        audioEl.muted = true;
        audioEl.volume = 0;
        audioEl.pause();
        audioEl.srcObject = null;
        setSinkConnectedText('Diblokir (Ini Earphone/Speaker!)');
        return;
      }

      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume().catch(() => {});
      }

      // PENTING: Jika sudah aktif memutar stream yang sama ke BlackHole 2ch, JANGAN pause/reset srcObject!
      if (
        !forceRebind &&
        appliedSinkIdRef.current === sinkId &&
        cleanStreamRef.current &&
        audioEl.srcObject === cleanStreamRef.current &&
        !audioEl.muted
      ) {
        if (audioEl.paused) {
          await audioEl.play().catch(() => {});
        }
        setSinkConnectedText(
          formatConnectedVirtualMicBadge(chosenDev?.label, isWindowsBrowser)
        );
        return;
      }

      try {
        const elWithSink = audioEl as HTMLAudioElement & {
          setSinkId?: (id: string) => Promise<void>;
        };
        if (typeof elWithSink.setSinkId === 'function') {
          if (appliedSinkIdRef.current !== sinkId || forceRebind) {
            audioEl.muted = true;
            await elWithSink.setSinkId(sinkId);
            appliedSinkIdRef.current = sinkId;
          }
          if (cleanStreamRef.current) {
            if (audioEl.srcObject !== cleanStreamRef.current) {
              audioEl.srcObject = cleanStreamRef.current;
            }
            audioEl.volume = 1.0;
            audioEl.muted = false;
            await audioEl.play().catch(() => {});
            setSinkConnectedText(
              formatConnectedVirtualMicBadge(chosenDev?.label, isWindowsBrowser)
            );
          } else {
            setSinkConnectedText(
              formatConnectedVirtualMicBadge(chosenDev?.label, isWindowsBrowser)
            );
          }
        } else {
          // JANGAN PERNAH unmute jika setSinkId tidak didukung, karena akan bocor ke Earphone Default!
          appliedSinkIdRef.current = '';
          audioEl.muted = true;
          audioEl.volume = 0;
          audioEl.pause();
          audioEl.srcObject = null;
          setSinkConnectedText('Siaga (Tanpa Bocor Earphone)');
        }
      } catch {
        appliedSinkIdRef.current = '';
        audioEl.muted = true;
        audioEl.volume = 0;
        audioEl.pause();
        audioEl.srcObject = null;
        setSinkConnectedText('Siaga (Earphone Aman)');
      }
    },
    []
  );

  const refreshAudioDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      // Saring ketat: Jangan pernah tampilkan BlackHole 2ch / OPUNG Microphone di dropdown Input Fisik!
      const ins = devices.filter(
        (d) =>
          d.kind === 'audioinput' &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          !isAnyVirtualOrDeprecatedInputLabel(d.label)
      );
      // Saring ketat: Hilangkan OPUNG Microphone duplikat dari daftar Output agar cukup 1 BlackHole 2ch!
      const outs = devices.filter(
        (d) =>
          d.kind === 'audiooutput' &&
          !isDeprecatedOpungDriverLabel(d.label)
      );
      setInputDevices(ins);
      outputDevicesRef.current = outs;
      setOutputDevices(outs);

      // Prioritaskan "BlackHole 2ch" sebagai satu-satunya mikrofon virtual resmi
      const blackHoleOut =
        outs.find(
          (d) =>
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            d.label.toLowerCase().includes('blackhole')
        ) ||
        outs.find(
          (d) =>
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            isVirtualCableLabel(d.label)
        );
      if (blackHoleOut) {
        const curSel = selectedOutputIdRef.current;
        const currentValid = outs.some(
          (d) =>
            d.deviceId === curSel &&
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            !isPhysicalSpeakerOrEarphoneLabel(d.label)
        );
        if (!curSel || !currentValid || curSel === blackHoleOut.deviceId) {
          await applyVirtualSinkOutput(blackHoleOut.deviceId, outs, false);
        }
      }
    } catch {
      // Ignore before permission
    }
  }, [applyVirtualSinkOutput]);

  useEffect(() => {
    refreshAudioDevices();
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshAudioDevices);
      };
    }
  }, [refreshAudioDevices]);

  const stopLiveMacMicrophone = useCallback(async () => {
    appliedSinkIdRef.current = '';
    if (virtualSinkAudioRef.current) {
      virtualSinkAudioRef.current.muted = true;
      virtualSinkAudioRef.current.volume = 0;
      virtualSinkAudioRef.current.pause();
      virtualSinkAudioRef.current.srcObject = null;
    }
    if (earphoneAudioRef.current) {
      earphoneAudioRef.current.muted = true;
      earphoneAudioRef.current.volume = 0;
      earphoneAudioRef.current.pause();
      earphoneAudioRef.current.srcObject = null;
    }
    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    cleanStreamRef.current = null;
    rawAnalyserRef.current = null;
    cleanAnalyserRef.current = null;
    clarityNodesRef.current = null;
    dspCoreRef.current.resetRings();
    setLoopbackAudible(false);
    loopbackAudibleRef.current = false;
    setIsMicRunning(false);
  }, []);

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startLiveMacMicrophone = useCallback(
    async (customInputId?: string) => {
      setMicError(null);
      try {
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          await audioCtxRef.current.close().catch(() => {});
        }

        let targetInput =
          customInputId !== undefined ? customInputId : selectedInputId;

        // 1. CEGAH KONFLIK LOOPBACK SEBELUM getUserMedia:
        // Jangan pernah biarkan OPUNG membaca dari 'default' jika 'default' macOS sedang disetel ke BlackHole 2ch!
        if (navigator.mediaDevices?.enumerateDevices) {
          const preDevices = await navigator.mediaDevices.enumerateDevices();
          const bestPreMic = pickBestPhysicalInputDevice(preDevices, targetInput);
          if (bestPreMic && bestPreMic.deviceId) {
            targetInput = bestPreMic.deviceId;
            setSelectedInputId(bestPreMic.deviceId);
          }
        }

        const useKrispMode = krispModeRef.current;

        // Hardware AEC (echoCancellation: true) WAJIB SELALU AKTIF agar suara speaker/earphone tidak pernah memantul!
        let stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId:
              targetInput &&
              targetInput !== 'default' &&
              targetInput !== 'communications'
                ? { exact: targetInput }
                : undefined,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
            echoCancellation: true,
            noiseSuppression: useKrispMode,
            autoGainControl: false,
          },
        });

        // 2. Setelah izin diberikan & label perangkat terbuka, pastikan 100% kita memakai Mikrofon Fisik MacBook (bukan BlackHole 2ch)!
        const activeTrack = stream.getAudioTracks()[0];
        const allDevsAfter = await navigator.mediaDevices.enumerateDevices();
        const bestPhysicalMic = pickBestPhysicalInputDevice(allDevsAfter, targetInput);
        const currentTrackDeviceId =
          activeTrack && typeof activeTrack.getSettings === 'function'
            ? activeTrack.getSettings().deviceId
            : '';
        const isCurrentTrackVirtual =
          activeTrack &&
          activeTrack.label &&
          isAnyVirtualOrDeprecatedInputLabel(activeTrack.label);

        if (
          bestPhysicalMic &&
          (isCurrentTrackVirtual ||
            !targetInput ||
            targetInput === 'default' ||
            (currentTrackDeviceId && currentTrackDeviceId !== bestPhysicalMic.deviceId && !customInputId))
        ) {
          stream.getTracks().forEach((t) => t.stop());
          targetInput = bestPhysicalMic.deviceId;
          setSelectedInputId(bestPhysicalMic.deviceId);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: bestPhysicalMic.deviceId },
              sampleRate: { ideal: 48000 },
              channelCount: { ideal: 1 },
              echoCancellation: true,
              noiseSuppression: useKrispMode,
              autoGainControl: false,
            },
          });
        }

        micStreamRef.current = stream;

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx({
          sampleRate: 48000,
          latencyHint: 'interactive',
        });
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        audioCtxRef.current = ctx;

        const sourceNode = ctx.createMediaStreamSource(stream);

        const rawAnalyser = ctx.createAnalyser();
        rawAnalyser.fftSize = 128;
        rawAnalyser.smoothingTimeConstant = 0.6;
        rawAnalyserRef.current = rawAnalyser;

        const cleanAnalyser = ctx.createAnalyser();
        cleanAnalyser.fftSize = 128;
        cleanAnalyser.smoothingTimeConstant = 0.6;
        cleanAnalyserRef.current = cleanAnalyser;

        const hardGateGain = ctx.createGain();
        hardGateGain.gain.value = 1.0;

        // ====================================================================
        // STUDIO HD VOCAL CLARITY EQUALIZER & KRISP VOCAL MASK (64-BIT NATIVE)
        // ====================================================================
        const isClarityOn = vocalClarityRef.current;

        const subCutNode = ctx.createBiquadFilter();
        subCutNode.type = 'highpass';
        subCutNode.frequency.value = 85;
        subCutNode.Q.value = 0.707;

        const krispLowPassNode = ctx.createBiquadFilter();
        krispLowPassNode.type = 'lowpass';
        krispLowPassNode.frequency.value = useKrispMode ? 4600 : 18000;
        krispLowPassNode.Q.value = 0.707;

        const mudCutNode = ctx.createBiquadFilter();
        mudCutNode.type = 'peaking';
        mudCutNode.frequency.value = 260;
        mudCutNode.Q.value = 1.4;
        mudCutNode.gain.value = isClarityOn ? -2.8 : 0.0;

        const warmthNode = ctx.createBiquadFilter();
        warmthNode.type = 'peaking';
        warmthNode.frequency.value = 135;
        warmthNode.Q.value = 1.1;
        warmthNode.gain.value = isClarityOn ? 2.0 : 0.0;

        const presenceNode = ctx.createBiquadFilter();
        presenceNode.type = 'peaking';
        presenceNode.frequency.value = 3500;
        presenceNode.Q.value = 1.0;
        presenceNode.gain.value = isClarityOn ? 4.5 : 0.0;

        const airShelfNode = ctx.createBiquadFilter();
        airShelfNode.type = 'highshelf';
        airShelfNode.frequency.value = 6500;
        airShelfNode.gain.value = isClarityOn ? 3.5 : 0.0;

        const studioCompressor = ctx.createDynamicsCompressor();
        studioCompressor.threshold.value = -18;
        studioCompressor.knee.value = 12;
        studioCompressor.ratio.value = 2.5;
        studioCompressor.attack.value = 0.004;
        studioCompressor.release.value = 0.12;

        const makeupGainNode = ctx.createGain();
        makeupGainNode.gain.value = loopbackAudibleRef.current
          ? 0.85
          : isClarityOn
          ? 1.65
          : 1.15;

        clarityNodesRef.current = {
          mudCutNode,
          warmthNode,
          presenceNode,
          airShelfNode,
          krispLowPassNode,
          makeupGainNode,
        };

        const processorNode = ctx.createScriptProcessor(512, 1, 1);
        processorNodeRef.current = processorNode;
        const dspCore = new NearFieldMacDspCore();
        dspCoreRef.current = dspCore;

        processorNode.onaudioprocess = (ev) => {
          const inBuf = ev.inputBuffer.getChannelData(0);
          const outBuf = ev.outputBuffer.getChannelData(0);
          const enabled = isEnabledRef.current;
          const thresh = thresholdDbRef.current;
          const krispOn = krispModeRef.current;
          const isLoopback = loopbackAudibleRef.current;

          dspCore.processAudioBlock(
            inBuf,
            outBuf,
            enabled,
            thresh,
            krispOn,
            isLoopback
          );
          hardGateGain.gain.value =
            enabled && !dspCore.isGateOpen && dspCore.smoothedGain === 0.0
              ? 0.0
              : 1.0;
        };

        const cleanDest = ctx.createMediaStreamDestination();
        try {
          cleanDest.channelCount = 2;
          cleanDest.channelCountMode = 'explicit';
          cleanDest.channelInterpretation = 'speakers';
        } catch {
          // Ignore if read-only in older engines
        }

        // Sub-audible Pilot (-96 dBFS @ 20Hz) agar Chrome tidak pernah menidurkan stream BlackHole 2ch ke Google Meet!
        const pilotOsc = ctx.createOscillator();
        pilotOsc.type = 'sine';
        pilotOsc.frequency.value = 20;
        const pilotGain = ctx.createGain();
        pilotGain.gain.value = 0.000015;
        pilotOsc.connect(pilotGain);
        pilotGain.connect(cleanDest);
        pilotOsc.start();

        cleanStreamRef.current = cleanDest.stream;

        // KEEP-ALIVE NODE (Gain = 0.0): Menjamin Chrome/WebKit selalu memproses onaudioprocess
        // tanpa mengeluarkan suara apa pun ke speaker/earphone (0.0 mutlak).
        const keepAliveGain = ctx.createGain();
        keepAliveGain.gain.value = 0.0;

        sourceNode.connect(rawAnalyser);
        rawAnalyser.connect(processorNode);
        processorNode.connect(subCutNode);
        subCutNode.connect(krispLowPassNode);
        krispLowPassNode.connect(mudCutNode);
        mudCutNode.connect(warmthNode);
        warmthNode.connect(presenceNode);
        presenceNode.connect(airShelfNode);
        airShelfNode.connect(studioCompressor);
        studioCompressor.connect(makeupGainNode);
        makeupGainNode.connect(hardGateGain);
        hardGateGain.connect(cleanAnalyser);
        cleanAnalyser.connect(cleanDest);
        cleanAnalyser.connect(keepAliveGain);
        keepAliveGain.connect(ctx.destination);

        const postAuthDevices = await navigator.mediaDevices.enumerateDevices();
        const ins = postAuthDevices.filter(
          (d) =>
            d.kind === 'audioinput' &&
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            !isAnyVirtualOrDeprecatedInputLabel(d.label)
        );
        const outs = postAuthDevices.filter(
          (d) =>
            d.kind === 'audiooutput' &&
            !isDeprecatedOpungDriverLabel(d.label)
        );
        setInputDevices(ins);
        outputDevicesRef.current = outs;
        setOutputDevices(outs);

        const blackHoleOut =
          outs.find(
            (d) =>
              d.deviceId !== 'default' &&
              d.deviceId !== 'communications' &&
              d.label.toLowerCase().includes('blackhole')
          ) ||
          outs.find(
            (d) =>
              d.deviceId !== 'default' &&
              d.deviceId !== 'communications' &&
              isVirtualCableLabel(d.label)
          );
        const validSelectedOut = outs.find(
          (d) =>
            d.deviceId === selectedOutputIdRef.current &&
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            !isPhysicalSpeakerOrEarphoneLabel(d.label)
        );
        const targetSinkId = validSelectedOut
          ? validSelectedOut.deviceId
          : blackHoleOut
          ? blackHoleOut.deviceId
          : '';

        if (virtualSinkAudioRef.current) {
          if (targetSinkId) {
            await applyVirtualSinkOutput(targetSinkId, outs, true);
          } else {
            appliedSinkIdRef.current = '';
            virtualSinkAudioRef.current.muted = true;
            virtualSinkAudioRef.current.volume = 0;
            virtualSinkAudioRef.current.pause();
            virtualSinkAudioRef.current.srcObject = null;
            setSinkConnectedText('Siaga (Earphone Aman)');
          }
        }

        if (earphoneAudioRef.current) {
          if (loopbackAudibleRef.current) {
            await routeEarphoneLoopbackToPhysicalDevice();
            earphoneAudioRef.current.srcObject = cleanDest.stream;
            earphoneAudioRef.current.volume = 0.68;
            earphoneAudioRef.current.muted = false;
            await earphoneAudioRef.current.play().catch(() => {});
          } else {
            earphoneAudioRef.current.muted = true;
            earphoneAudioRef.current.volume = 0;
            earphoneAudioRef.current.pause();
            earphoneAudioRef.current.srcObject = null;
          }
        }

        setIsMicRunning(true);
      } catch (err) {
        setMicError(
          err instanceof Error
            ? err.message
            : 'Klik Izinkan Mikrofon pada browser untuk mengaktifkan aplikasi macOS ini.'
        );
      }
    },
    [
      selectedInputId,
      applyVirtualSinkOutput,
      routeEarphoneLoopbackToPhysicalDevice,
    ]
  );

  // Fungsi 1-Klik untuk Memaksa Bangunkan (Wake-Up) & Menyambungkan Ulang BlackHole 2ch
  const handleForceWakeUpBlackHole = async () => {
    if (!isMicRunning) {
      await startLiveMacMicrophone();
      return;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outs = devices.filter(
      (d) =>
        d.kind === 'audiooutput' &&
        !isDeprecatedOpungDriverLabel(d.label)
    );
    outputDevicesRef.current = outs;
    setOutputDevices(outs);
    const blackHole =
      outs.find(
        (d) =>
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          d.label.toLowerCase().includes('blackhole')
      ) ||
      outs.find(
        (d) =>
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          isVirtualCableLabel(d.label)
      );
    if (blackHole) {
      await applyVirtualSinkOutput(blackHole.deviceId, outs, true);
    } else if (selectedOutputIdRef.current) {
      await applyVirtualSinkOutput(selectedOutputIdRef.current, outs, true);
    } else if (virtualSinkAudioRef.current) {
      appliedSinkIdRef.current = '';
      virtualSinkAudioRef.current.muted = true;
      virtualSinkAudioRef.current.volume = 0;
      virtualSinkAudioRef.current.pause();
      virtualSinkAudioRef.current.srcObject = null;
      setSinkConnectedText('BlackHole Belum Terdeteksi (Earphone Aman)');
    }
  };

  const toggleLoopbackTest = async () => {
    const next = !loopbackAudible;
    loopbackAudibleRef.current = next;
    setLoopbackAudible(next);

    if (!isMicRunning && next) {
      await startLiveMacMicrophone();
    }

    // PENTING: JANGAN PERNAH mematikan echoCancellation saat Tes Dengar Suara Sendiri!
    // Hardware AEC harus selalu aktif agar suara dari speaker/earphone tidak memantul masuk kembali ke mic (anti-efek goa).
    if (clarityNodesRef.current && audioCtxRef.current) {
      clarityNodesRef.current.makeupGainNode.gain.setTargetAtTime(
        next ? 0.85 : vocalClarityRef.current ? 1.65 : 1.15,
        audioCtxRef.current.currentTime,
        0.02
      );
    }

    if (earphoneAudioRef.current) {
      if (next && cleanStreamRef.current) {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume().catch(() => {});
        }
        await routeEarphoneLoopbackToPhysicalDevice();
        earphoneAudioRef.current.srcObject = cleanStreamRef.current;
        earphoneAudioRef.current.volume = 0.68;
        earphoneAudioRef.current.muted = false;
        await earphoneAudioRef.current.play().catch(() => {});
      } else {
        earphoneAudioRef.current.muted = true;
        earphoneAudioRef.current.volume = 0;
        earphoneAudioRef.current.pause();
        earphoneAudioRef.current.srcObject = null;
      }
    }
  };

  // Spectrum Renderer (Real Microphone when active, or realistic preview before mic starts)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rawFreq = new Uint8Array(64);
    const cleanFreq = new Uint8Array(64);
    let simTick = 0;

    const drawLoop = () => {
      // Pastikan virtualSinkAudioRef (BlackHole 2ch) tidak pernah ter-pause oleh browser saat pindah tab ke Google Meet
      if (
        isMicRunningRef.current &&
        virtualSinkAudioRef.current &&
        virtualSinkAudioRef.current.srcObject &&
        !virtualSinkAudioRef.current.muted &&
        virtualSinkAudioRef.current.paused
      ) {
        virtualSinkAudioRef.current.play().catch(() => {});
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#060911';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 1;
      for (let y = 24; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const enabled = isEnabledRef.current;
      const threshDb = thresholdDbRef.current;
      const normalizedThresh = Math.max(
        0.15,
        Math.min(0.88, (threshDb + 50) / 38)
      );
      const thresholdY = h - normalizedThresh * (h - 12);
      const barCount = 28;
      const barWidth = w / barCount;

      if (
        isMicRunningRef.current &&
        rawAnalyserRef.current &&
        cleanAnalyserRef.current
      ) {
        rawAnalyserRef.current.getByteFrequencyData(rawFreq);
        cleanAnalyserRef.current.getByteFrequencyData(cleanFreq);

        let rSum = 0;
        let cSum = 0;
        for (let i = 0; i < barCount; i++) {
          const rVal = rawFreq[i];
          const cVal = cleanFreq[i];
          rSum += rVal;
          cSum += cVal;

          const rH = (rVal / 255) * (h - 10);
          const cH = (cVal / 255) * (h - 10);

          ctx.fillStyle = 'rgba(244, 63, 94, 0.48)';
          ctx.fillRect(i * barWidth + 1, h - rH, barWidth - 2, rH);

          if (cH > 0) {
            ctx.fillStyle = enabled ? '#38bdf8' : '#94a3b8';
            ctx.fillRect(i * barWidth + 2.5, h - cH, barWidth - 5, cH);
          }
        }

        const core = dspCoreRef.current;
        setLiveStats({
          rawPct: Math.round((rSum / (barCount * 255)) * 100),
          cleanPct: Math.round((cSum / (barCount * 255)) * 100),
          gateOpen: core.isGateOpen,
          gainVal: `${core.smoothedGain.toFixed(2)}x`,
          frameDb: core.lastFrameDb,
        });
      } else {
        // Idle visual simulation before user clicks "Aktifkan Mic"
        simTick += 0.18;
        const cutoffBarValue = normalizedThresh * 255;
        let rSum = 0;
        let cSum = 0;
        let peakRaw = 0;

        for (let i = 0; i < barCount; i++) {
          const office2mNoise =
            i >= 2 && i <= 16
              ? 52 + Math.sin(simTick * 1.3 + i * 0.6) * 20
              : 20 + Math.sin(simTick + i) * 6;
          const rVal = Math.min(250, Math.max(8, office2mNoise));
          if (rVal > peakRaw) peakRaw = rVal;
          const passes = rVal >= cutoffBarValue;
          const cVal = !enabled ? rVal : passes ? rVal * 0.85 : 0;

          rSum += rVal;
          cSum += cVal;

          const rH = (rVal / 255) * (h - 10);
          const cH = (cVal / 255) * (h - 10);

          ctx.fillStyle = 'rgba(244, 63, 94, 0.42)';
          ctx.fillRect(i * barWidth + 1, h - rH, barWidth - 2, rH);

          if (cH > 0) {
            ctx.fillStyle = enabled ? '#38bdf8' : '#94a3b8';
            ctx.fillRect(i * barWidth + 2.5, h - cH, barWidth - 5, cH);
          }
        }

        const gateOpen = peakRaw >= cutoffBarValue;
        setLiveStats({
          rawPct: Math.round((rSum / (barCount * 255)) * 100),
          cleanPct: Math.round((cSum / (barCount * 255)) * 100),
          gateOpen,
          gainVal: !enabled || gateOpen ? '1.00x' : '0.00x',
          frameDb: -34,
        });
      }

      if (enabled) {
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(w, thresholdY);
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(
          `BATAS JARAK (${threshDb} dB) — DI BAWAH INI GAIN = 0.00x (BISU)`,
          6,
          Math.max(11, thresholdY - 5)
        );
        ctx.restore();
      }
    };

    drawLoop();
    const timer = window.setInterval(drawLoop, 55);
    return () => window.clearInterval(timer);
  }, []);

  // Satu Pintu Unduhan: Langsung OPUNG-Installer.dmg (Tanpa .zip / .command / Terminal)
  const handleDownloadMacDmg = () => {
    const dmgBytes = buildMacOSDiskImageDmg();
    const blob = new Blob([dmgBytes], {
      type: 'application/x-apple-diskimage',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'OPUNG-Installer.dmg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadBanner({
      title: 'OPUNG-Installer.dmg berhasil diunduh! Cukup klik 2x file OPUNG-Installer.dmg di folder Downloads Mac Anda, geser OPUNG.app ke folder Applications, lalu buka aplikasinya.',
      detail: 'Saat pertama kali membuka aplikasi Opung di Applications, cukup Klik Kanan (2 jari) → pilih Open.',
    });
  };

  const handleDownloadWindowsApp = async () => {
    setIsDownloadingWin(true);
    try {
      const res = await downloadWindowsOpungApp();
      if (res.mode === 'exe') {
        setDownloadBanner({
          title: 'Opung-Windows-x64.exe berhasil diunduh!',
          detail: 'Jalankan file Opung-Windows-x64.exe, lalu pilih CABLE Output (VB-Audio Virtual Cable) sebagai mikrofon di Google Meet / Zoom.',
        });
      } else {
        setDownloadBanner({
          title: 'Opung-Windows-Launcher.zip berhasil diunduh!',
          detail: 'Ekstrak ZIP ini, lalu klik 2x Opung-Windows.bat (memakai Edge App-mode ringan). Untuk single-file .exe native, unduh Opung-Windows-x64.exe di halaman GitHub Releases.',
        });
      }
    } finally {
      setIsDownloadingWin(false);
    }
  };

  const distanceText =
    thresholdDb >= -22
      ? '0.5m (Dekat)'
      : thresholdDb >= -30
      ? '1.0m (Kantor)'
      : '1.5m (Ruang)';

  return (
    <section
      id="macos-desktop-app-live"
      className="border border-slate-800/90 bg-[#0D1119] rounded-2xl p-6 sm:p-8"
    >
      {/* Hidden Audio Elements for Virtual Mic (BlackHole 2ch / VB-CABLE) and Earphone Loopback */}
      <audio ref={virtualSinkAudioRef} playsInline className="hidden" />
      <audio ref={earphoneAudioRef} playsInline className="hidden" />

      {/* Top Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-800/80">
        <div>
          <div className="text-xs font-mono text-sky-400 mb-2">
            OPUNG — OFFICE PROXIMITY ULTRA NOISE GATE · MACOS &amp; WINDOWS
          </div>
          <h2
            className="font-display text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Aplikasi Desktop Ringan untuk macOS (BlackHole 2ch) &amp; Windows (VB-CABLE)
          </h2>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Di macOS, logo <strong className="text-sky-300">Opung</strong> muncul di{' '}
            <strong className="text-slate-200">Menu Bar kanan atas</strong> &amp; mengalir ke{' '}
            <strong className="text-emerald-300">BlackHole 2ch</strong>. Di Windows, berjalan di{' '}
            <strong className="text-slate-200">System Tray</strong> &amp; mengalir ke{' '}
            <strong className="text-emerald-300">VB-CABLE</strong> untuk Google Meet &amp; Zoom.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadMacDmg}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            Unduh Opung (.dmg)
          </button>

          <button
            type="button"
            onClick={handleDownloadWindowsApp}
            disabled={isDownloadingWin}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            {isDownloadingWin ? 'Menyiapkan .exe...' : 'Unduh Opung (.exe)'}
          </button>

          <button
            type="button"
            onClick={() => setFocusedAppMode(!focusedAppMode)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {focusedAppMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
                Tampilkan Panduan Samping
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                Fokus Jendela Aplikasi
              </>
            )}
          </button>
        </div>
      </div>

      {downloadBanner && (
        <div className="mt-5 p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-200 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-emerald-300">{downloadBanner.title}</div>
            <div className="text-slate-300">{downloadBanner.detail}</div>
          </div>
        </div>
      )}

      {/* Main Content: Sleek Krisp-Style macOS Desktop App Window + Quick Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 items-start">
        {/* LEFT: THE CLEAN KRISP-INSPIRED MACOS MENU BAR + POPOVER WINDOW */}
        <div
          className={`${
            focusedAppMode ? 'lg:col-span-12' : 'lg:col-span-5'
          } flex flex-col items-center`}
        >
          {/* Simulated macOS Top Menu Bar Strip (Showing ONLY the Opung Logo Icon in Status Bar) */}
          <div className="w-full max-w-[390px] mb-2 px-3.5 py-1.5 rounded-lg bg-[#161D2E]/90 border border-slate-700/70 flex items-center justify-between text-[11px] text-slate-300 select-none">
            <span className="text-slate-400 font-medium">macOS Menu Bar</span>
            <div className="flex items-center gap-3">
              <span
                title="Logo Opung di Menu Bar macOS (Tanpa Teks)"
                className="inline-flex items-center justify-center p-1 rounded bg-sky-400/15 border border-sky-400/40"
              >
                <img
                  src="/opung-icon.png"
                  alt="Logo Opung Menu Bar"
                  className="w-4 h-4 rounded-[3.5px]"
                />
              </span>
              <span className="text-slate-400 font-mono text-[10px]">Wi-Fi · 100%</span>
            </div>
          </div>

          <div className="w-full max-w-[390px] rounded-2xl border border-slate-700/80 bg-[#0A0E17] shadow-2xl overflow-hidden">
            {/* Native macOS Window Titlebar */}
            <div className="flex items-center justify-between px-3.5 py-3 bg-[#111726] border-b border-slate-800/90 select-none gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] inline-block" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] inline-block" />
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight text-slate-100 font-display truncate">
                <img
                  src="/opung-icon.png"
                  alt=""
                  className="w-4 h-4 rounded-[4px] border border-sky-400/30 shrink-0"
                />
                <span className="truncate">Opung - Office Proximity Ultra Noise Gate</span>
              </div>
              <div className="w-4 shrink-0" />
            </div>

            {/* Clean Krisp-Inspired App Body */}
            <div className="px-4 pt-3.5 pb-2.5 space-y-2.5">
              {/* 1. Primary Hero Master Switch Card */}
              <div
                className={`p-3.5 rounded-xl border transition-colors ${
                  isEnabled
                    ? 'bg-gradient-to-b from-sky-500/12 to-slate-900/90 border-sky-500/40'
                    : 'bg-[#111726] border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-bold text-slate-100 tracking-tight">
                      Peredam Bising &amp; Fokus Suara
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {isEnabled
                        ? `Aktif · Radius <= ${distanceText} · Studio HD + AI Denoiser`
                        : 'Nonaktif (Mode Bypass — Suara sekitar ikut masuk)'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEnabled(!isEnabled)}
                    title="Sakelar Utama OPUNG"
                    className={`w-11 h-11 rounded-full inline-flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                      isEnabled
                        ? 'bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/25'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </button>
                </div>

                {/* Live Mic Activation Button inside Master Card */}
                <div className="mt-3 pt-3 border-t border-slate-800/80">
                  {!isMicRunning ? (
                    <button
                      type="button"
                      onClick={() => startLiveMacMicrophone()}
                      className="w-full py-2 px-3.5 rounded-lg font-semibold text-xs bg-sky-400 hover:bg-sky-300 text-slate-950 transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5 shrink-0" />
                      Aktifkan Mikrofon (Uji Langsung)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => stopLiveMacMicrophone()}
                      className="w-full py-2 px-3.5 rounded-lg font-semibold text-xs bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Power className="w-3.5 h-3.5 shrink-0" />
                      Matikan Mikrofon
                    </button>
                  )}
                </div>
              </div>

              {micError && (
                <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/70 text-[11px] text-rose-200">
                  {micError}
                </div>
              )}

              {/* 2. Clean Device Selector Card (Input Mic & Output Virtual Cable) */}
              <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-sky-400" />
                      Mikrofon Input
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        refreshAudioDevices();
                        if (isMicRunning) {
                          handleForceWakeUpBlackHole();
                        }
                      }}
                      className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 text-[10px] font-mono cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> Segarkan
                    </button>
                  </div>
                  <select
                    aria-label="Pilih Mikrofon Fisik Mac"
                    value={selectedInputId}
                    onChange={(e) => {
                      setSelectedInputId(e.target.value);
                      if (isMicRunning) {
                        startLiveMacMicrophone(e.target.value);
                      }
                    }}
                    className="w-full px-2.5 py-2 text-[11px] bg-[#090D15] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">Otomatis Mikrofon Fisik MacBook (48kHz)</option>
                    {inputDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Mikrofon Fisik (${d.deviceId.slice(0, 6)})`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                      Output ke Meet / Zoom
                    </span>
                    <span className="text-[9px] text-emerald-400 font-mono font-normal tracking-tight">
                      {sinkConnectedText}
                    </span>
                  </div>
                  <select
                    aria-label="Pilih Output Virtual Mic untuk Google Meet"
                    value={selectedOutputId}
                    onChange={(e) => applyVirtualSinkOutput(e.target.value)}
                    className="w-full px-2.5 py-2 text-[11px] bg-[#090D15] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="">
                      Siaga (Jangan Kirim ke Meet / Earphone Aman)
                    </option>
                    {outputDevices
                      .filter(
                        (d) =>
                          d.deviceId !== 'default' &&
                          d.deviceId !== 'communications' &&
                          !isDeprecatedOpungDriverLabel(d.label)
                      )
                      .map((d) => {
                        const isPhysical = isPhysicalSpeakerOrEarphoneLabel(d.label);
                        return (
                          <option
                            key={d.deviceId}
                            value={d.deviceId}
                            disabled={isPhysical}
                          >
                            {isVirtualCableLabel(d.label)
                              ? `★ ${d.label} (Aktif untuk Meet/Zoom)`
                              : isPhysical
                              ? `⛔ ${d.label} (Speaker/Earphone Diblokir)`
                              : d.label || `Output (${d.deviceId.slice(0, 6)})`}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>

              {/* 3. Radius Fokus Suara (3-Segment Control) */}
              <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-slate-200">
                    Radius Fokus Suara
                  </span>
                  <span className="font-mono text-sky-400 tabular-nums text-[10px]">
                    {distanceText} ({thresholdDb} dB)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 bg-[#090D15] p-1 rounded-lg border border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setThresholdDb(-20)}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      thresholdDb >= -22
                        ? 'bg-sky-400 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Dekat (0.5m)
                  </button>
                  <button
                    type="button"
                    onClick={() => setThresholdDb(-26)}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      thresholdDb < -22 && thresholdDb >= -30
                        ? 'bg-sky-400 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Kantor (1.0m)
                  </button>
                  <button
                    type="button"
                    onClick={() => setThresholdDb(-38)}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      thresholdDb < -30
                        ? 'bg-sky-400 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Ruang (1.5m)
                  </button>
                </div>

                <div className="flex items-center gap-2.5 text-[10px] text-slate-400 pt-0.5">
                  <span>1.5m</span>
                  <input
                    type="range"
                    min={-42}
                    max={-14}
                    step={1}
                    value={thresholdDb}
                    onChange={(e) => setThresholdDb(Number(e.target.value))}
                    aria-label="Slider Batas Jarak Tangkap Mic"
                    className="flex-1 accent-sky-400 cursor-pointer h-1.5"
                  />
                  <span>0.5m</span>
                </div>
              </div>

              {/* 4. Real-Time Voice & Noise Monitor */}
              <div className="bg-[#111726] border border-slate-800/90 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                  <span className="text-slate-300 font-semibold">
                    MONITOR SUARA &amp; BISING
                  </span>
                  <span
                    className={
                      !isEnabled
                        ? 'text-amber-400'
                        : liveStats.gateOpen
                        ? 'text-emerald-400'
                        : 'text-sky-400'
                    }
                  >
                    {!isEnabled
                      ? 'Mode Bypass'
                      : liveStats.gateOpen
                      ? 'Suara Anda Masuk · Jernih HD'
                      : 'Bising Sekitar Diblokir (0.00x)'}
                  </span>
                </div>

                <canvas
                  ref={canvasRef}
                  width={340}
                  height={76}
                  className="w-full h-[76px] block rounded-lg border border-slate-800/90 bg-[#070B12]"
                />

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                  <span className="text-rose-400/90">
                    Bising Sekitar: {liveStats.rawPct}%
                  </span>
                  <span className="text-sky-400">
                    Suara Jernih ke Meet: {liveStats.cleanPct}%
                  </span>
                </div>
              </div>

              {/* 5. Single Quiet Earphone Loopback Test Button */}
              <button
                type="button"
                onClick={toggleLoopbackTest}
                className={`w-full py-2 px-3 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap ${
                  loopbackAudible
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-[#111726] border-slate-800 text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <Headphones className="w-3.5 h-3.5 shrink-0" />
                {loopbackAudible
                  ? 'Tes Dengar Suara Sendiri: Aktif (Gunakan Earphone)'
                  : 'Tes Dengar Suara Sendiri (Gunakan Earphone)'}
              </button>

              {/* 6. Copyright & Version Footer below Loopback Test Button */}
              <div className="pt-1.5 pb-0 border-t border-slate-800/70 flex items-center justify-between text-[10px] leading-tight text-slate-400 select-none">
                <span className="inline-flex items-center gap-1">
                  <span>&copy; 2026 Opung &middot; Made with</span>
                  <span className="text-rose-500 text-[10.5px]" aria-label="love">
                    &hearts;
                  </span>
                  <span className="font-semibold text-slate-300">Muhammad Zen</span>
                </span>
                <span className="font-mono text-[9.5px] text-slate-400">
                  Versi 1.0
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AUTOMATIC ENGINE SUMMARY & QUICK TEST */}
        {!focusedAppMode && (
          <div className="lg:col-span-7 space-y-5">
            <div className="p-6 rounded-2xl border border-slate-800/90 bg-[#0A0E17] space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <div className="text-xs font-mono text-sky-400 mb-1">
                  OTOMATIS TANPA KONFIGURASI RUMIT
                </div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-slate-100">
                  4 Mesin Pintar yang Langsung Aktif Begitu Sakelar Opung Dinyalakan
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111726]/60">
                  <div className="text-xs font-mono text-sky-400 mb-1">
                    01 · Otomatis Aktif
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    Gerbang Radius &le; 1.0 Meter
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Obrolan rekan kantor di meja sebelah (&ge; 1.5 meter) otomatis diputus ke{' '}
                    <code className="font-mono text-slate-200">0.00x (-90 dB)</code> saat Anda diam.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111726]/60">
                  <div className="text-xs font-mono text-emerald-400 mb-1">
                    02 · Otomatis Aktif
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    Pengupas Bising Saat Bicara (Krisp-Grade)
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Detektor Formant 120Hz–3.1kHz + Wiener Spectral Subtraction mengupas suara bor,
                    kipas, dan ketikan keyboard bahkan ketika Anda sedang berbicara.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111726]/60">
                  <div className="text-xs font-mono text-sky-400 mb-1">
                    03 · Otomatis Aktif
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    Penjernih Vokal Studio HD (5-Stage EQ)
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Menghilangkan efek suara mendem/kaleng (<em>Anti-Mud 260Hz</em>) dan mengangkat
                    artikulasi vokal <code className="font-mono text-slate-200">+4.5 dB</code> secara otomatis.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-800/80 bg-[#111726]/60">
                  <div className="text-xs font-mono text-emerald-400 mb-1">
                    04 · Otomatis Aktif
                  </div>
                  <div className="text-sm font-bold text-slate-100">
                    Anti-Bocor Suara Speaker Laptop (AEC)
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Mencegah suara lawan bicara dari speaker MacBook Pro memantul masuk kembali ke
                    mikrofon Anda saat rapat tanpa earphone.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>100% tersembunyi saat Share Screen di Google Meet &amp; Zoom.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
