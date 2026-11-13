export interface CodeFileSpec {
  id: 'noise-processor' | 'use-noise-cancellation' | 'webrtc-integration' | 'bundler-config';
  filename: string;
  language: string;
  subtitle: string;
  description: string;
  code: string;
}

export const PRODUCTION_CODE_FILES: CodeFileSpec[] = [
  {
    id: 'noise-processor',
    filename: 'public/noise-processor.js',
    language: 'javascript',
    subtitle: 'AudioWorkletProcessor + Dual Circular Ring Buffer (128 → 480 → 128 sampel)',
    description:
      'Berjalan sepenuhnya di AudioWorkletGlobalScope (dedicated audio thread) tanpa alokasi memori dinamis (Zero-GC) di dalam process(). Mengonversi skala Web Audio [-1.0, 1.0] ke skala PCM 16-bit signed float [-32768.0, 32767.0] yang diwajibkan oleh ABI C @jitsi/rnnoise-wasm.',
    code: `/**
 * @file noise-processor.js
 * @description Production-Grade AudioWorkletProcessor untuk Real-Time Noise Cancellation
 * menggunakan pustaka @jitsi/rnnoise-wasm (WebAssembly) di luar Main Thread.
 *
 * ============================================================================
 * LOGIKA PENANGANAN RING BUFFER (128 SAMPEL -> 480 SAMPEL -> 128 SAMPEL)
 * ============================================================================
 * 1. Browser memanggil AudioWorkletProcessor.process() dengan ukuran blok statis
 *    ("render quantum") sebesar 128 sampel per kanal (~2.67ms pada 48kHz).
 * 2. Algoritma RNN pada RNNoise mewajibkan input tepat 480 sampel per frame (10ms @ 48kHz).
 * 3. Karena 480 / 128 = 3.75 quantum, kita merancang Dual Circular Ring Buffer:
 *    - inputRing (Kapasitas 2048): Menabung 128 sampel masuk & mengalikan dengan 32768.0
 *      (konversi dari Float32 [-1, 1] ke PCM16 signed float [-32768, 32767]).
 *    - Saat inputRing.available >= 480 (tercapai pada quantum ke-4, 8, 12, 15, dst.):
 *      Tarik 480 sampel ke Linear Memory WASM (HEAPF32), panggil _rnnoise_process_frame(),
 *      lalu simpan 480 sampel hasil denoise ke outputRing.
 *    - outputRing (Kapasitas 2048): Di setiap akhir siklus process(), tarik tepat 128 sampel,
 *      bagi dengan 32768.0 kembali ke [-1.0, 1.0], dan salin ke outputs[0][0].
 */

const WORKLET_QUANTUM = 128;
const RNNOISE_FRAME_SIZE = 480;
const RING_BUFFER_CAPACITY = 2048; // Wajib Power-of-2 (2^11) untuk bitwise AND mask
const PCM16_SCALE = 32768.0;

class CircularFloat32Buffer {
  constructor(capacity = RING_BUFFER_CAPACITY) {
    if ((capacity & (capacity - 1)) !== 0) {
      throw new Error('Kapasitas Ring Buffer harus bilangan Power-of-2.');
    }
    this.capacity = capacity;
    this.mask = capacity - 1;
    // Pre-allocated sekali di constructor: TIDAK ADA "new Float32Array" di process()
    this.storage = new Float32Array(capacity);
    this.writePtr = 0;
    this.readPtr = 0;
    this.available = 0;
  }

  /**
   * Menabung sampel ke dalam Ring Buffer dengan konversi skala opsional.
   */
  pushScaled(sourceArray, count, scaleFactor = 1.0) {
    if (count > this.capacity - this.available) {
      return false; // Proteksi Overflow
    }
    for (let i = 0; i < count; i++) {
      this.storage[this.writePtr] = sourceArray[i] * scaleFactor;
      // Bitwise AND (& mask) jauh lebih cepat daripada modulo (%) di thread audio
      this.writePtr = (this.writePtr + 1) & this.mask;
    }
    this.available += count;
    return true;
  }

  /**
   * Menarik sampel dari Ring Buffer ke array tujuan dengan normalisasi skala.
   */
  pullScaled(targetArray, targetOffset, count, scaleFactor = 1.0) {
    if (this.available < count) {
      return false; // Proteksi Underflow (belum cukup sampel)
    }
    for (let i = 0; i < count; i++) {
      let sample = this.storage[this.readPtr] * scaleFactor;
      if (scaleFactor !== 1.0) {
        if (sample > 1.0) sample = 1.0;
        else if (sample < -1.0) sample = -1.0;
      }
      targetArray[targetOffset + i] = sample;
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

class RNNoiseWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Pre-alokasi Dual Ring Buffer & Scratch Frame
    this.inputRing = new CircularFloat32Buffer(RING_BUFFER_CAPACITY);
    this.outputRing = new CircularFloat32Buffer(RING_BUFFER_CAPACITY);
    this.scratchFrame480 = new Float32Array(RNNOISE_FRAME_SIZE);

    // Pre-seed Output Ring Buffer dengan 1 frame (480 sampel = 10ms) silence awal.
    // Menjamin ZERO underrun di seluruh siklus KPK(128, 480) = 1920 sampel (termasuk pada Q#7).
    this.outputRing.pushScaled(this.scratchFrame480, RNNOISE_FRAME_SIZE, 1.0);

    this.enabled = true;
    this.isDestroyed = false;

    // Pointer & Instance untuk @jitsi/rnnoise-wasm
    this.wasmReady = false;
    this.wasmExports = null;
    this.wasmHeapF32 = null;
    this.rnnoiseStatePtr = 0;
    this.wasmPcmPtr = 0;
    this.wasmPcmF32Offset = 0;

    this.port.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'INIT_WASM_BINARY') {
        this._initWasm(payload.wasmBinary);
      } else if (type === 'SET_BYPASS') {
        this.enabled = !payload.bypass;
      } else if (type === 'DESTROY') {
        this._destroyWasm();
        this.isDestroyed = true;
      }
    };

    if (options?.processorOptions?.wasmBinary) {
      this._initWasm(options.processorOptions.wasmBinary);
    }
  }

  async _initWasm(wasmBinary) {
    const { instance } = await WebAssembly.instantiate(wasmBinary, {
      env: {
        emscripten_notify_memory_growth: () => {
          this.wasmHeapF32 = new Float32Array(this.wasmExports.memory.buffer);
        },
      },
      wasi_snapshot_preview1: {
        proc_exit: () => 0,
        fd_write: () => 0,
        fd_close: () => 0,
        fd_seek: () => 0,
      },
    });

    this.wasmExports = instance.exports;
    this.wasmHeapF32 = new Float32Array(this.wasmExports.memory.buffer);

    // 1. Buat state internal RNNoise C (_rnnoise_create)
    this.rnnoiseStatePtr = this.wasmExports._rnnoise_create(0);

    // 2. Alokasikan 480 Float32 (1920 bytes) di C Heap (_malloc)
    this.wasmPcmPtr = this.wasmExports._malloc(
      RNNOISE_FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT
    );
    // Konversi byte offset ke indeks Float32Array (dibagi 4 atau >> 2)
    this.wasmPcmF32Offset = this.wasmPcmPtr >> 2;
    this.wasmReady = true;
  }

  process(inputs, outputs) {
    if (this.isDestroyed) return false;

    const inputChannel = inputs[0]?.[0];
    const outputChannel = outputs[0]?.[0];
    if (!outputChannel) return true;

    if (!inputChannel || inputChannel.length === 0) {
      outputChannel.fill(0);
      return true;
    }

    if (!this.enabled || !this.wasmReady) {
      outputChannel.set(inputChannel);
      return true;
    }

    // 1. Tabung 128 sampel ke Input Ring Buffer + ubah skala ke PCM16 [-32768, 32767]
    this.inputRing.pushScaled(inputChannel, WORKLET_QUANTUM, PCM16_SCALE);

    // 2. Jika sampel di Input Ring Buffer sudah >= 480, proses via WASM RNNoise
    while (this.inputRing.available >= RNNOISE_FRAME_SIZE) {
      // Pastikan view HEAPF32 tetap valid jika memori WASM bertumbuh
      if (this.wasmHeapF32.buffer !== this.wasmExports.memory.buffer) {
        this.wasmHeapF32 = new Float32Array(this.wasmExports.memory.buffer);
      }

      // Tarik 480 sampel langsung ke dalam HEAPF32 pada offset pointer C
      this.inputRing.pullScaled(
        this.wasmHeapF32,
        this.wasmPcmF32Offset,
        RNNOISE_FRAME_SIZE,
        1.0
      );

      // Panggil fungsi C RNNoise secara in-place (mengembalikan skor VAD 0.0 - 1.0)
      const vadScore = this.wasmExports._rnnoise_process_frame(
        this.rnnoiseStatePtr,
        this.wasmPcmPtr,
        this.wasmPcmPtr
      );

      // Salin 480 sampel yang telah bersih dari HEAPF32 ke Output Ring Buffer
      const processedView = this.wasmHeapF32.subarray(
        this.wasmPcmF32Offset,
        this.wasmPcmF32Offset + RNNOISE_FRAME_SIZE
      );
      this.outputRing.pushScaled(processedView, RNNOISE_FRAME_SIZE, 1.0);
    }

    // 3. Tarik 128 sampel dari Output Ring Buffer & kembalikan skala ke [-1.0, 1.0]
    const pulled = this.outputRing.pullScaled(
      outputChannel,
      0,
      WORKLET_QUANTUM,
      1.0 / PCM16_SCALE
    );

    if (!pulled) {
      // Selama 3 quantum pertama (~8ms warm-up), keluarkan silence
      outputChannel.fill(0);
    }

    return true;
  }

  _destroyWasm() {
    if (this.wasmExports) {
      if (this.wasmPcmPtr) {
        this.wasmExports._free(this.wasmPcmPtr);
        this.wasmPcmPtr = 0;
      }
      if (this.rnnoiseStatePtr) {
        this.wasmExports._rnnoise_destroy(this.rnnoiseStatePtr);
        this.rnnoiseStatePtr = 0;
      }
    }
    this.inputRing.clear();
    this.outputRing.clear();
    this.wasmReady = false;
  }
}

registerProcessor('rnnoise-worklet-processor', RNNoiseWorkletProcessor);`,
  },
  {
    id: 'use-noise-cancellation',
    filename: 'src/hooks/useNoiseCancellation.ts',
    language: 'typescript',
    subtitle: 'Custom React Hook: Lifecycle AudioContext, Pemuatan WASM, & MediaStreamDestination',
    description:
      'Mengelola siklus hidup AudioContext (48kHz), memuat biner .wasm di Main Thread lalu mengirim ArrayBuffer ke AudioWorklet, memintas getUserMedia, dan mengekspor MediaStream bersih untuk WebRTC.',
    code: `import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseNoiseCancellationOptions {
  /** URL ke file worklet processor (misal: '/noise-processor.js') */
  workletUrl?: string;
  /** URL ke file biner WASM dari @jitsi/rnnoise-wasm */
  wasmUrl?: string;
  /** ID perangkat mikrofon spesifik (opsional) */
  deviceId?: string;
}

export function useNoiseCancellation(options: UseNoiseCancellationOptions = {}) {
  const {
    workletUrl = '/noise-processor.js',
    wasmUrl = '/rnnoise.wasm',
    deviceId,
  } = options;

  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [isNoiseCancelled, setIsNoiseCancelled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  /**
   * Membersihkan seluruh resource: C Heap WASM (_free, _rnnoise_destroy),
   * menutup AudioContext, dan menghentikan track mikrofon hardware.
   */
  const stopNoiseCancellation = useCallback(async () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'DESTROY' });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((track) => track.stop());
      rawStreamRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      await audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    destinationNodeRef.current = null;
    setProcessedStream(null);
  }, []);

  /**
   * Memulai intersepsi mikrofon dan merangkai pipa Web Audio API:
   * getUserMedia -> MediaStreamSource -> AudioWorkletNode -> MediaStreamDestination
   */
  const startNoiseCancellation = useCallback(async (): Promise<MediaStream | null> => {
    setIsLoading(true);
    setError(null);

    try {
      await stopNoiseCancellation();

      // 1. Pintas mikrofon dengan sampleRate 48000 Hz (wajib untuk RNNoise 480 sampel = 10ms)
      // Matikan noiseSuppression bawaan browser agar tidak berbenturan dengan RNNoise
      const rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 1 },
          noiseSuppression: false,
          echoCancellation: true,
          autoGainControl: false,
        },
        video: false,
      });
      rawStreamRef.current = rawMicStream;

      // 2. Inisialisasi AudioContext pada 48.000 Hz
      const ctx = new AudioContext({
        sampleRate: 48000,
        latencyHint: 'interactive',
      });
      audioCtxRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 3. Ambil file biner .wasm di Main Thread sebagai ArrayBuffer
      // PENTING: AudioWorkletGlobalScope tidak memiliki akses ke fetch() di banyak browser!
      // Oleh karena itu, unduh .wasm di Main Thread lalu oper ArrayBuffer via processorOptions.
      const wasmResponse = await fetch(wasmUrl);
      if (!wasmResponse.ok) {
        throw new Error(\`Gagal memuat biner WASM dari \${wasmUrl}\`);
      }
      const wasmBinary = await wasmResponse.arrayBuffer();

      // 4. Daftarkan modul AudioWorkletProcessor
      await ctx.audioWorklet.addModule(workletUrl);

      // 5. Buat node AudioWorklet beserta ArrayBuffer WASM
      const workletNode = new AudioWorkletNode(ctx, 'rnnoise-worklet-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { wasmBinary },
      });
      workletNodeRef.current = workletNode;

      // 6. Rangkai Graph: Mic Source -> Worklet -> MediaStreamDestination
      const sourceNode = ctx.createMediaStreamSource(rawMicStream);
      const destinationNode = ctx.createMediaStreamDestination();

      sourceNode.connect(workletNode);
      workletNode.connect(destinationNode);

      sourceNodeRef.current = sourceNode;
      destinationNodeRef.current = destinationNode;

      // 7. destinationNode.stream adalah MediaStream bersih untuk RTCPeerConnection
      setProcessedStream(destinationNode.stream);
      setIsLoading(false);
      return destinationNode.stream;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown AudioWorklet error';
      setError(msg);
      setIsLoading(false);
      return null;
    }
  }, [deviceId, wasmUrl, workletUrl, stopNoiseCancellation]);

  /**
   * Toggle Bypass tanpa memutus koneksi RTCPeerConnection
   */
  const toggleBypass = useCallback((bypass?: boolean) => {
    setIsNoiseCancelled((prev) => {
      const nextEnabled = typeof bypass === 'boolean' ? !bypass : !prev;
      workletNodeRef.current?.port.postMessage({
        type: 'SET_BYPASS',
        payload: { bypass: !nextEnabled },
      });
      return nextEnabled;
    });
  }, []);

  useEffect(() => {
    return () => {
      stopNoiseCancellation();
    };
  }, [stopNoiseCancellation]);

  return {
    processedStream,
    isNoiseCancelled,
    isLoading,
    error,
    startNoiseCancellation,
    stopNoiseCancellation,
    toggleBypass,
  };
}`,
  },
  {
    id: 'webrtc-integration',
    filename: 'src/examples/WebRTCPeerIntegration.tsx',
    language: 'tsx',
    subtitle: 'Integrasi Output MediaStreamDestination dengan RTCPeerConnection / Hot-Swap Track',
    description:
      'Menunjukkan cara mengirim processedStream dari useNoiseCancellation ke WebRTC PeerConnection menggunakan addTrack() maupun mengganti track secara mulus di tengah panggilan menggunakan RTCRtpSender.replaceTrack().',
    code: `import React, { useEffect, useRef } from 'react';
import { useNoiseCancellation } from '../hooks/useNoiseCancellation';

export function WebRTCCallRoom({ peerConnection }: { peerConnection: RTCPeerConnection }) {
  const {
    processedStream,
    isNoiseCancelled,
    isLoading,
    startNoiseCancellation,
    stopNoiseCancellation,
    toggleBypass,
  } = useNoiseCancellation({
    workletUrl: '/noise-processor.js',
    wasmUrl: '/rnnoise.wasm',
  });

  const audioSenderRef = useRef<RTCRtpSender | null>(null);

  // Pasang atau perbarui AudioTrack pada RTCPeerConnection ketika processedStream siap
  useEffect(() => {
    if (!processedStream) return;

    const cleanAudioTrack = processedStream.getAudioTracks()[0];
    if (!cleanAudioTrack) return;

    // Jika RTCRtpSender sudah ada di tengah panggilan, gunakan replaceTrack()
    // agar tidak memicu renegosiasi SDP (tanpa jeda audio!).
    if (audioSenderRef.current) {
      audioSenderRef.current.replaceTrack(cleanAudioTrack);
    } else {
      const existingAudioSender = peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === 'audio');

      if (existingAudioSender) {
        existingAudioSender.replaceTrack(cleanAudioTrack);
        audioSenderRef.current = existingAudioSender;
      } else {
        audioSenderRef.current = peerConnection.addTrack(
          cleanAudioTrack,
          processedStream
        );
      }
    }
  }, [processedStream, peerConnection]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => startNoiseCancellation()}
        disabled={isLoading}
        className="px-4 py-2 bg-sky-500 text-slate-950 font-semibold rounded-lg"
      >
        {isLoading ? 'Memuat RNNoise WASM...' : 'Aktifkan Mikrofon WebRTC'}
      </button>

      {processedStream && (
        <>
          <button
            onClick={() => toggleBypass()}
            className="px-4 py-2 border border-slate-700 rounded-lg"
          >
            {isNoiseCancelled ? 'RNNoise: ON (Aktif)' : 'RNNoise: BYPASS'}
          </button>
          <button
            onClick={() => stopNoiseCancellation()}
            className="px-4 py-2 bg-rose-600 text-white rounded-lg"
          >
            Matikan
          </button>
        </>
      )}
    </div>
  );
}`,
  },
  {
    id: 'bundler-config',
    filename: 'vite.config.ts & webpack.config.js',
    language: 'typescript',
    subtitle: 'Panduan Pemuatan File .wasm (@jitsi/rnnoise-wasm) & AudioWorklet di Vite / Webpack 5',
    description:
      'Konfigurasi lengkap untuk memastikan file biner rnnoise.wasm dan skrip worklet noise-processor.js ter-bundle dengan MIME type application/wasm yang benar dan dapat diakses oleh AudioWorkletProcessor.',
    code: `// ============================================================================
// 1. KONFIGURASI VITE (vite.config.ts + Penggunaan URL Import Eksplisit)
// ============================================================================
// Di Vite, gunakan akhiran "?url" saat mengimpor file .wasm dari node_modules
// agar Vite menyalin file .wasm ke folder dist/assets dengan hash cache-busting
// dan mengembalikan string URL publiknya:

import rnnoiseWasmUrl from '@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url';
import noiseProcessorUrl from './audio/noise-processor.js?worker&url';

// Kemudian berikan kedua URL tersebut ke hook:
// useNoiseCancellation({ workletUrl: noiseProcessorUrl, wasmUrl: rnnoiseWasmUrl });

// Pastikan vite.config.ts menyertakan '.wasm' di dalam assetsInclude:
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // Jangan biarkan esbuild mem-bundle ulang paket WASM saat pre-bundling dev
    exclude: ['@jitsi/rnnoise-wasm'],
  },
  worker: {
    format: 'es',
  },
});

// ============================================================================
// 2. KONFIGURASI WEBPACK 5 (webpack.config.js / Next.js webpack override)
// ============================================================================
// Di Webpack 5, gunakan Asset Modules ('asset/resource') untuk file .wasm
// sehingga Webpack mengeluarkan URL statis yang bisa di-fetch() menjadi ArrayBuffer:

module.exports = {
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /rnnoise\\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/wasm/[name].[contenthash][ext]',
        },
      },
    ],
  },
};

// Di dalam komponen React (Webpack 5):
// const wasmUrl = new URL('@jitsi/rnnoise-wasm/dist/rnnoise.wasm', import.meta.url).toString();
// const workletUrl = new URL('./noise-processor.js', import.meta.url).toString();`,
  },
];
