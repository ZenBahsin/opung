import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Konfigurasi opsional untuk hook `useNoiseCancellation`.
 */
export interface UseNoiseCancellationOptions {
  /**
   * Path atau URL ke file AudioWorkletProcessor.
   * Di Vite: letakkan di `/public/noise-processor.js` atau gunakan import `?worker&url`.
   * @default '/noise-processor.js'
   */
  workletUrl?: string;
  /**
   * Path atau URL ke file biner `.wasm` dari `@jitsi/rnnoise-wasm`.
   * Di Vite: import rnnoiseWasmUrl from '@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url'
   * @default '/rnnoise.wasm'
   */
  wasmUrl?: string;
  /**
   * ID perangkat mikrofon spesifik (opsional, dari enumerateDevices).
   */
  deviceId?: string;
  /**
   * Tingkat agresivitas peredaman derau [0.0 - 1.0].
   * @default 0.85
   */
  initialAggressiveness?: number;
}

/**
 * Data telemetri real-time dari thread AudioWorkletProcessor.
 */
export interface WorkletTelemetry {
  framesProcessed: number;
  quantumsProcessed: number;
  vadProbability: number;
  inputRingAvailable: number;
  outputRingAvailable: number;
  wasmNativeActive: boolean;
}

export type AudioSourceMode = 'idle' | 'microphone' | 'synthetic';

export interface SyntheticSignalConfig {
  voiceEnabled: boolean;
  fanHumLevel: number;
  whiteNoiseHissLevel: number;
}

export interface UseNoiseCancellationReturn {
  /** Stream bersih (`MediaStream`) siap dikirim ke `RTCPeerConnection.addTrack()` atau `MediaRecorder` */
  processedStream: MediaStream | null;
  /** Stream mentah sebelum melewati AudioWorklet (berguna untuk komparasi A/B) */
  rawStream: MediaStream | null;
  /** Status apakah pipeline AudioContext + AudioWorklet sedang berjalan aktif */
  isActive: boolean;
  /** Status loading saat inisialisasi `getUserMedia` dan `audioWorklet.addModule` */
  isLoading: boolean;
  /** Status apakah noise cancellation sedang aktif (false = mode bypass) */
  isNoiseCancelled: boolean;
  /** Mode sumber audio saat ini ('microphone' | 'synthetic' | 'idle') */
  sourceMode: AudioSourceMode;
  /** Pesan error yang ramah pengguna jika izin mikrofon ditolak atau AudioWorklet gagal */
  error: string | null;
  /** Data telemetri langsung dari Ring Buffer di dalam AudioWorklet */
  telemetry: WorkletTelemetry;
  /** Tingkat agresivitas denoise [0.0 - 1.0] */
  aggressiveness: number;
  /** Memulai intersepsi mikrofon asli melalui `navigator.mediaDevices.getUserMedia` */
  startMicrophone: () => Promise<MediaStream | null>;
  /** Memulai generator sinyal sintetis (Suara + Derau) untuk pengujian tanpa mikrofon fisik */
  startSyntheticTestbench: (config?: Partial<SyntheticSignalConfig>) => Promise<MediaStream | null>;
  /** Menghentikan seluruh pipeline, menutup AudioContext, membebaskan memori WASM, dan mematikan track mikrofon */
  stopAudioPipeline: () => Promise<void>;
  /** Mengaktifkan atau menonaktifkan bypass RNNoise secara instan tanpa memutus stream WebRTC */
  toggleNoiseCancellation: (enabled?: boolean) => void;
  /** Mengatur tingkat agresivitas noise suppression secara real-time */
  setAggressiveness: (value: number) => void;
  /** Mengatur parameter generator sinyal sintetis secara real-time */
  updateSyntheticConfig: (config: Partial<SyntheticSignalConfig>) => void;
  /** Mengatur apakah audio diputar ke speaker lokal (local monitor) */
  setLocalMonitor: (audible: boolean) => void;
  isLocalMonitorEnabled: boolean;
  /** Which mengambil spektrum frekuensi & waveform sebelum dan sesudah prosesor untuk visualisasi Canvas */
  getAnalyserSnapshots: (
    rawTimeDomain: Float32Array<ArrayBuffer>,
    processedTimeDomain: Float32Array<ArrayBuffer>,
    rawFreqDomain: Uint8Array<ArrayBuffer>,
    processedFreqDomain: Uint8Array<ArrayBuffer>
  ) => void;
}

const SAMPLE_RATE_RNNOISE = 48000; // RNNoise wajib beroperasi pada sample rate 48kHz

/**
 * Custom React Hook Production-Grade untuk memintas mikrofon (`getUserMedia`),
 * memprosesnya melalui `AudioWorkletNode` (`rnnoise-worklet-processor`), dan
 * menghasilkan `MediaStream` bersih melalui `MediaStreamAudioDestinationNode`
 * yang siap dikirim ke WebRTC (`RTCPeerConnection`) atau backend.
 */
export function useNoiseCancellation(
  options: UseNoiseCancellationOptions = {}
): UseNoiseCancellationReturn {
  const {
    workletUrl = '/noise-processor.js',
    wasmUrl = '/rnnoise.wasm',
    deviceId,
    initialAggressiveness = 0.85,
  } = options;

  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isNoiseCancelled, setIsNoiseCancelled] = useState<boolean>(true);
  const [sourceMode, setSourceMode] = useState<AudioSourceMode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [aggressiveness, setAggressivenessState] = useState<number>(initialAggressiveness);
  const [isLocalMonitorEnabled, setIsLocalMonitorEnabled] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<WorkletTelemetry>({
    framesProcessed: 0,
    quantumsProcessed: 0,
    vadProbability: 0,
    inputRingAvailable: 0,
    outputRingAvailable: 0,
    wasmNativeActive: false,
  });

  // Referensi persisten untuk objek Web Audio API agar tidak memicu re-render berlebih
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const rawAnalyserRef = useRef<AnalyserNode | null>(null);
  const processedAnalyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainNodeRef = useRef<GainNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rawMicStreamRef = useRef<MediaStream | null>(null);

  // Referensi node sintetis (untuk mode Uji Lab tanpa mikrofon fisik)
  const synthCleanFnRef = useRef<(() => void) | null>(null);
  const synthGainRefs = useRef<{
    voiceGain?: GainNode;
    humGain?: GainNode;
    hissGain?: GainNode;
  }>({});

  /**
   * Fungsi pembersih menyeluruh untuk memastikan tidak ada memory leak pada WASM heap,
   * AudioWorklet, maupun indikator hardware mikrofon di browser.
   */
  const stopAudioPipeline = useCallback(async () => {
    // 1. Hentikan generator sintetis jika ada
    if (synthCleanFnRef.current) {
      synthCleanFnRef.current();
      synthCleanFnRef.current = null;
    }
    synthGainRefs.current = {};

    // 2. Kirim sinyal DESTROY ke AudioWorkletProcessor agar memanggil `_rnnoise_destroy` & `_free` di C Heap
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage({ type: 'DESTROY' });
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
        // Abaikan jika sudah terputus
      }
      workletNodeRef.current = null;
    }

    // 3. Putuskan node sumber dan analyser
    if (mediaStreamSourceRef.current) {
      try {
        mediaStreamSourceRef.current.disconnect();
      } catch {
        // Abaikan
      }
      mediaStreamSourceRef.current = null;
    }

    // 4. Matikan seluruh MediaStreamTrack dari getUserMedia agar lampu indikator mikrofon mati
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach((track) => track.stop());
      rawMicStreamRef.current = null;
    }

    // 5. Tutup AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        await audioContextRef.current.close();
      } catch {
        // Abaikan
      }
    }
    audioContextRef.current = null;
    destinationNodeRef.current = null;
    rawAnalyserRef.current = null;
    processedAnalyserRef.current = null;
    monitorGainNodeRef.current = null;

    setProcessedStream(null);
    setRawStream(null);
    setIsActive(false);
    setSourceMode('idle');
    setIsLocalMonitorEnabled(false);
  }, []);

  /**
   * Memuat biner `.wasm` di Main Thread menggunakan `fetch()` lalu mengirimkannya
   * sebagai `ArrayBuffer` ke `AudioWorkletProcessor`.
   * Catatan Arsitektur: `AudioWorkletGlobalScope` tidak memiliki akses ke `fetch()`
   * di banyak browser standar, sehingga pola paling andal di production adalah
   * melakukan `fetch(wasmUrl)` di Main Thread dan mengirim `ArrayBuffer`-nya via `processorOptions` atau `port.postMessage`.
   */
  const fetchWasmBinarySafe = async (url: string): Promise<ArrayBuffer | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      // Cegah false-positive jika server SPA mengembalikan index.html untuk rute yang belum ada
      if (contentType.includes('text/html')) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  };

  /**
   * Membangun grafik Web Audio API:
   * [SourceNode] -> [RawAnalyser] -> [AudioWorkletNode (RNNoise 128->480->128)] -> [ProcessedAnalyser] -> [MediaStreamDestination]
   */
  const initializeAudioGraph = useCallback(
    async (connectSourceNode: (ctx: AudioContext) => AudioNode): Promise<MediaStream> => {
      // Buat AudioContext dengan sampleRate 48000 Hz (wajib untuk frame 10ms = 480 sampel RNNoise)
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({
        sampleRate: SAMPLE_RATE_RNNOISE,
        latencyHint: 'interactive',
      });
      audioContextRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 1. Muat modul AudioWorkletProcessor
      await ctx.audioWorklet.addModule(workletUrl);

      // 2. Ambil biner WASM (opsional jika tersedia di bundle/public)
      const wasmBinary = await fetchWasmBinarySafe(wasmUrl);

      // 3. Instansiasi AudioWorkletNode
      const workletNode = new AudioWorkletNode(ctx, 'rnnoise-worklet-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          wasmBinary,
        },
      });
      workletNodeRef.current = workletNode;

      // Setel konfigurasi awal
      workletNode.port.postMessage({
        type: 'SET_BYPASS',
        payload: { bypass: !isNoiseCancelled },
      });
      workletNode.port.postMessage({
        type: 'SET_AGGRESSIVENESS',
        payload: { aggressiveness },
      });

      // Dengarkan pesan telemetri dari AudioWorkletProcessor
      workletNode.port.onmessage = (event: MessageEvent) => {
        const { type, payload } = event.data || {};
        if (type === 'TELEMETRY_TICK' && payload) {
          setTelemetry(payload);
        }
      };

      // 4. Siapkan AnalyserNode (sebelum & sesudah RNNoise) untuk inspeksi spektrum real-time
      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 1024;
      rawAnalyser.smoothingTimeConstant = 0.75;
      rawAnalyserRef.current = rawAnalyser;

      const processedAnalyser = ctx.createAnalyser();
      processedAnalyser.fftSize = 1024;
      processedAnalyser.smoothingTimeConstant = 0.75;
      processedAnalyserRef.current = processedAnalyser;

      // 5. Siapkan MediaStreamAudioDestinationNode untuk menghasilkan output MediaStream (WebRTC / Backend)
      const streamDestination = ctx.createMediaStreamDestination();
      destinationNodeRef.current = streamDestination;

      // 6. Siapkan GainNode untuk Local Speaker Monitoring (default bisu/0 agar tidak feedback loop saat pakai mic)
      const monitorGain = ctx.createGain();
      monitorGain.gain.value = 0.0;
      monitorGainNodeRef.current = monitorGain;

      // 7. Siapkan 5-Stage Studio HD Vocal Clarity Equalizer & Broadcast Leveler
      // Menjernihkan suara keluaran tanpa mengubah fitur noise gate <= 1m
      const subCutNode = ctx.createBiquadFilter();
      subCutNode.type = 'highpass';
      subCutNode.frequency.value = 75;
      subCutNode.Q.value = 0.707;

      const mudCutNode = ctx.createBiquadFilter();
      mudCutNode.type = 'peaking';
      mudCutNode.frequency.value = 260;
      mudCutNode.Q.value = 1.4;
      mudCutNode.gain.value = -2.8;

      const warmthNode = ctx.createBiquadFilter();
      warmthNode.type = 'peaking';
      warmthNode.frequency.value = 135;
      warmthNode.Q.value = 1.1;
      warmthNode.gain.value = 2.0;

      const presenceNode = ctx.createBiquadFilter();
      presenceNode.type = 'peaking';
      presenceNode.frequency.value = 3500;
      presenceNode.Q.value = 1.0;
      presenceNode.gain.value = 4.5;

      const airShelfNode = ctx.createBiquadFilter();
      airShelfNode.type = 'highshelf';
      airShelfNode.frequency.value = 6500;
      airShelfNode.gain.value = 3.5;

      const studioCompressor = ctx.createDynamicsCompressor();
      studioCompressor.threshold.value = -18;
      studioCompressor.knee.value = 12;
      studioCompressor.ratio.value = 2.5;
      studioCompressor.attack.value = 0.004;
      studioCompressor.release.value = 0.12;

      const makeupGainNode = ctx.createGain();
      makeupGainNode.gain.value = 1.25;

      // 8. Hubungkan seluruh rantai sinyal (Audio Graph Wiring)
      const sourceNode = connectSourceNode(ctx);
      sourceNode.connect(rawAnalyser);
      rawAnalyser.connect(workletNode);
      workletNode.connect(subCutNode);
      subCutNode.connect(mudCutNode);
      mudCutNode.connect(warmthNode);
      warmthNode.connect(presenceNode);
      presenceNode.connect(airShelfNode);
      airShelfNode.connect(studioCompressor);
      studioCompressor.connect(makeupGainNode);
      makeupGainNode.connect(processedAnalyser);

      // Cabang 1: Menuju MediaStreamDestination (untuk WebRTC RTCPeerConnection / MediaRecorder)
      processedAnalyser.connect(streamDestination);

      // Cabang 2: Menuju Local Monitor (opsional didengarkan lewat speaker/headphone)
      processedAnalyser.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      return streamDestination.stream;
    },
    [workletUrl, wasmUrl, isNoiseCancelled, aggressiveness]
  );

  /**
   * Memulai intersepsi stream mikrofon menggunakan `navigator.mediaDevices.getUserMedia`.
   * Menonaktifkan filter bawaan browser (`echoCancellation`, `noiseSuppression`, `autoGainControl`)
   * pada level constraints agar sinyal yang masuk ke RNNoise murni dan tidak mengalami comb-filtering.
   */
  const startMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    setIsLoading(true);
    setError(null);

    try {
      await stopAudioPipeline();

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: { ideal: SAMPLE_RATE_RNNOISE },
          channelCount: { ideal: 1 },
          // Matikan DSP bawaan browser (termasuk echoCancellation) agar vokal tidak mengalami comb-filtering saat monitor/virtual mic aktif
          noiseSuppression: false,
          echoCancellation: false,
          autoGainControl: false,
        },
        video: false,
      });

      rawMicStreamRef.current = micStream;
      setRawStream(micStream);

      const cleanOutputMediaStream = await initializeAudioGraph((ctx) => {
        const source = ctx.createMediaStreamSource(micStream);
        mediaStreamSourceRef.current = source;
        return source;
      });

      setProcessedStream(cleanOutputMediaStream);
      setSourceMode('microphone');
      setIsActive(true);
      setIsLoading(false);
      return cleanOutputMediaStream;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Gagal mengakses mikrofon atau memuat AudioWorklet.';
      setError(
        `Akses Mikrofon Gagal (${message}). Anda dapat menggunakan "Mode Sinyal Uji Sintetis" untuk menguji pipeline AudioWorklet 48kHz secara langsung.`
      );
      setIsLoading(false);
      return null;
    }
  }, [deviceId, initializeAudioGraph, stopAudioPipeline]);

  /**
   * Memulai Generator Sinyal Uji Sintetis (Harmonik Vokal + Derau Kipas 60Hz/120Hz + White Noise Hiss)
   * yang langsung mengalir melewati `AudioWorkletNode` (`noise-processor.js`) dan menghasilkan
   * `MediaStreamDestination` nyata. Sangat berguna untuk pengujian otomatis & demonstrasi A/B.
   */
  const startSyntheticTestbench = useCallback(
    async (config: Partial<SyntheticSignalConfig> = {}): Promise<MediaStream | null> => {
      setIsLoading(true);
      setError(null);

      const mergedConfig: SyntheticSignalConfig = {
        voiceEnabled: config.voiceEnabled ?? true,
        fanHumLevel: config.fanHumLevel ?? 0.35,
        whiteNoiseHissLevel: config.whiteNoiseHissLevel ?? 0.25,
      };

      try {
        await stopAudioPipeline();

        const cleanOutputMediaStream = await initializeAudioGraph((ctx) => {
          const masterMix = ctx.createGain();
          masterMix.gain.value = 0.9;

          // 1. Simulasi Formant Suara Manusia (Syllable cadence ~3.2 Hz)
          const voiceCarrier = ctx.createOscillator();
          voiceCarrier.type = 'sawtooth';
          voiceCarrier.frequency.value = 145; // Fundamental pitch vokal

          const voiceFormantFilter = ctx.createBiquadFilter();
          voiceFormantFilter.type = 'bandpass';
          voiceFormantFilter.frequency.value = 620;
          voiceFormantFilter.Q.value = 2.5;

          const voiceEnvelopeGain = ctx.createGain();
          voiceEnvelopeGain.gain.value = mergedConfig.voiceEnabled ? 0.55 : 0.0;

          voiceCarrier.connect(voiceFormantFilter);
          voiceFormantFilter.connect(voiceEnvelopeGain);
          voiceEnvelopeGain.connect(masterMix);

          // 2. Simulasi Derau Kipas / AC Hum (55Hz + 110Hz的低頻噪音)
          const fanHumOsc = ctx.createOscillator();
          fanHumOsc.type = 'triangle';
          fanHumOsc.frequency.value = 58;
          const humGain = ctx.createGain();
          humGain.gain.value = mergedConfig.fanHumLevel * 0.45;
          fanHumOsc.connect(humGain);
          humGain.connect(masterMix);

          // 3. Simulasi Broadband White Noise Hiss
          const noiseBufferSize = ctx.sampleRate * 2;
          const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
          const noiseData = noiseBuffer.getChannelData(0);
          for (let i = 0; i < noiseBufferSize; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * 0.4;
          }
          const whiteNoiseSource = ctx.createBufferSource();
          whiteNoiseSource.buffer = noiseBuffer;
          whiteNoiseSource.loop = true;

          const hissFilter = ctx.createBiquadFilter();
          hissFilter.type = 'highpass';
          hissFilter.frequency.value = 1800;

          const hissGain = ctx.createGain();
          hissGain.gain.value = mergedConfig.whiteNoiseHissLevel * 0.4;

          whiteNoiseSource.connect(hissFilter);
          hissFilter.connect(hissGain);
          hissGain.connect(masterMix);

          // Modulasi irama bicara (syllable burst setiap 350ms)
          let speakingPhase = 0;
          const cadenceTimer = window.setInterval(() => {
            if (!synthGainRefs.current.voiceGain || !audioContextRef.current) return;
            speakingPhase = (speakingPhase + 1) % 6;
            // Bicara selama 4 ketukan, jeda napas 2 ketukan (untuk menguji respons VAD)
            const isSpeakingBurst = speakingPhase < 4;
            const pitchVariation = isSpeakingBurst ? 135 + (speakingPhase % 3) * 18 : 130;
            voiceCarrier.frequency.setTargetAtTime(
              pitchVariation,
              audioContextRef.current.currentTime,
              0.04
            );
          }, 260);

          voiceCarrier.start();
          fanHumOsc.start();
          whiteNoiseSource.start();

          synthGainRefs.current = {
            voiceGain: voiceEnvelopeGain,
            humGain,
            hissGain,
          };

          // Siapkan raw stream dari masterMix untuk keperluan perbandingan
          const rawDest = ctx.createMediaStreamDestination();
          masterMix.connect(rawDest);
          setRawStream(rawDest.stream);

          synthCleanFnRef.current = () => {
            window.clearInterval(cadenceTimer);
            try {
              voiceCarrier.stop();
              fanHumOsc.stop();
              whiteNoiseSource.stop();
              masterMix.disconnect();
            } catch {
              // Abaikan
            }
          };

          return masterMix;
        });

        setProcessedStream(cleanOutputMediaStream);
        setSourceMode('synthetic');
        setIsActive(true);
        setIsLoading(false);
        return cleanOutputMediaStream;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memulai sinyal sintetis.';
        setError(msg);
        setIsLoading(false);
        return null;
      }
    },
    [initializeAudioGraph, stopAudioPipeline]
  );

  /**
   * Mengaktifkan atau menonaktifkan fitur Noise Cancellation secara on-the-fly.
   */
  const toggleNoiseCancellation = useCallback(
    (enabled?: boolean) => {
      setIsNoiseCancelled((prev) => {
        const nextState = typeof enabled === 'boolean' ? enabled : !prev;
        if (workletNodeRef.current) {
          workletNodeRef.current.port.postMessage({
            type: 'SET_BYPASS',
            payload: { bypass: !nextState },
          });
        }
        return nextState;
      });
    },
    []
  );

  /**
   * Mengubah tingkat agresivitas peredaman bising [0.0 - 1.0].
   */
  const setAggressiveness = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setAggressivenessState(clamped);
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({
        type: 'SET_AGGRESSIVENESS',
        payload: { aggressiveness: clamped },
      });
    }
  }, []);

  /**
   * Memperbarui level sinyal sintetis tanpa me-restart AudioContext.
   */
  const updateSyntheticConfig = useCallback((config: Partial<SyntheticSignalConfig>) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    if (config.voiceEnabled !== undefined && synthGainRefs.current.voiceGain) {
      synthGainRefs.current.voiceGain.gain.setTargetAtTime(
        config.voiceEnabled ? 0.55 : 0.0,
        now,
        0.03
      );
    }
    if (config.fanHumLevel !== undefined && synthGainRefs.current.humGain) {
      synthGainRefs.current.humGain.gain.setTargetAtTime(
        config.fanHumLevel * 0.45,
        now,
        0.03
      );
    }
    if (config.whiteNoiseHissLevel !== undefined && synthGainRefs.current.hissGain) {
      synthGainRefs.current.hissGain.gain.setTargetAtTime(
        config.whiteNoiseHissLevel * 0.4,
        now,
        0.03
      );
    }
  }, []);

  /**
   * Mengontrol apakah output audio yang telah dibersihkan diputar ke speaker lokal.
   */
  const setLocalMonitor = useCallback((audible: boolean) => {
    setIsLocalMonitorEnabled(audible);
    if (monitorGainNodeRef.current && audioContextRef.current) {
      monitorGainNodeRef.current.gain.setTargetAtTime(
        audible ? 0.85 : 0.0,
        audioContextRef.current.currentTime,
        0.02
      );
    }
  }, []);

  /**
   * Mengisi buffer Float32Array & Uint8Array dengan data osiloskop/spektrum terbaru
   * untuk di-render oleh komponen Canvas 60fps tanpa memicu React state re-render.
   */
  const getAnalyserSnapshots = useCallback(
    (
      rawTimeDomain: Float32Array<ArrayBuffer>,
      processedTimeDomain: Float32Array<ArrayBuffer>,
      rawFreqDomain: Uint8Array<ArrayBuffer>,
      processedFreqDomain: Uint8Array<ArrayBuffer>
    ) => {
      if (rawAnalyserRef.current) {
        rawAnalyserRef.current.getFloatTimeDomainData(rawTimeDomain);
        rawAnalyserRef.current.getByteFrequencyData(rawFreqDomain);
      }
      if (processedAnalyserRef.current) {
        processedAnalyserRef.current.getFloatTimeDomainData(processedTimeDomain);
        processedAnalyserRef.current.getByteFrequencyData(processedFreqDomain);
      }
    },
    []
  );

  // Pastikan seluruh resource dibersihkan saat komponen unmount
  useEffect(() => {
    return () => {
      stopAudioPipeline();
    };
  }, [stopAudioPipeline]);

  return {
    processedStream,
    rawStream,
    isActive,
    isLoading,
    isNoiseCancelled,
    sourceMode,
    error,
    telemetry,
    aggressiveness,
    startMicrophone,
    startSyntheticTestbench,
    stopAudioPipeline,
    toggleNoiseCancellation,
    setAggressiveness,
    updateSyntheticConfig,
    setLocalMonitor,
    isLocalMonitorEnabled,
    getAnalyserSnapshots,
  };
}
