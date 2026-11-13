/**
 * @file noise-processor.js
 * @description Production-Grade AudioWorkletProcessor untuk Real-Time Noise Cancellation
 * menggunakan pustaka @jitsi/rnnoise-wasm (WebAssembly) di luar Main Thread.
 *
 * ============================================================================
 * ARSITEKTUR RING BUFFER (128 SAMPEL -> 480 SAMPEL -> 128 SAMPEL)
 * ============================================================================
 * Web Audio API (AudioWorkletProcessor.process) selalu mengeksekusi callback
 * dengan ukuran blok ("render quantum") statis sebesar 128 sampel per kanal.
 * Sebaliknya, algoritma Recurrent Neural Network (GRU) di dalam RNNoise C/WASM
 * dirancang secara keras (hardcoded) untuk memproses tepat 480 sampel (10ms @ 48kHz)
 * dalam satu kali pemanggilan `_rnnoise_process_frame(state, outPtr, inPtr)`.
 *
 * Karena 480 tidak habis dibagi 128 (480 / 128 = 3.75 quantum), kita menggunakan
 * arsitektur Dual Circular Ring Buffer tanpa alokasi memori dinamis (Zero-GC):
 *
 * 1. INPUT RING BUFFER (Kapasitas 2048 sampel):
 *    - Setiap kali `process()` dipanggil, 128 sampel Float32 [-1.0, 1.0] dari mikrofon
 *      ditabung (push) ke `inputRingBuffer` dan dikonversi ke skala PCM 16-bit
 *      signed float [-32768.0, 32767.0] yang diwajibkan oleh ABI C RNNoise.
 *
 * 2. EKSEKUSI WASM RNNOISE (Threshold >= 480 sampel):
 *    - Selama `inputRingBuffer.available >= 480`:
 *      a) Tarik (pull) 480 sampel langsung ke dalam `HEAPF32` milik modul WASM
 *         pada offset pointer input (`wasmPcmInputF32Index`).
 *      b) Panggil `wasmExports._rnnoise_process_frame(rnnoiseState, wasmPcmPtr, wasmPcmPtr)`.
 *         Fungsi ini mengembalikan probabilitas Voice Activity Detection (VAD) [0.0 - 1.0].
 *      c) Baca 480 sampel hasil denoise dari `HEAPF32`, normalisasikan kembali ke
 *         skala Web Audio [-1.0, 1.0] (dibagi 32768.0), lalu masukkan (push) ke
 *         `outputRingBuffer`.
 *
 * 3. OUTPUT RING BUFFER (Kapasitas 2048 sampel):
 *    - Di akhir setiap `process()`, tarik (pull) tepat 128 sampel dari `outputRingBuffer`
 *      untuk dikirim ke `outputs[0][0]` (yang terhubung ke MediaStreamDestination WebRTC).
 *    - Pada 3 siklus quantum pertama (total 384 sampel < 480 sampel), `outputRingBuffer`
 *      belum memiliki sampel. Prosesor akan mengeluarkan silence (0.0) selama ~8ms
 *      pertama (fase initial warm-up), dan setelah itu berjalan bebas underrun selamanya.
 */

const WORKLET_QUANTUM = 128;
const RNNOISE_FRAME_SIZE = 480;
const RING_BUFFER_CAPACITY = 2048; // Harus Power-of-2 (2^11) agar bisa memakai bitwise AND mask
const RING_BUFFER_MASK = RING_BUFFER_CAPACITY - 1;
const PCM16_SCALE = 32768.0;

/**
 * Circular Buffer berbasis Float32Array yang telah dialokasikan di awal (Pre-allocated)
 * untuk mencegah Garbage Collection pause di dalam thread real-time AudioWorklet.
 */
class CircularFloat32Buffer {
  constructor(capacity = RING_BUFFER_CAPACITY) {
    if ((capacity & (capacity - 1)) !== 0) {
      throw new Error('Kapasitas Ring Buffer harus bilangan Power-of-2.');
    }
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.storage = new Float32Array(capacity);
    this.writePtr = 0;
    this.readPtr = 0;
    this.available = 0;
  }

  /**
   * Menyimpan sampel ke dalam buffer melingkar.
   * @param {Float32Array} sourceArray Array input
   * @param {number} count Jumlah sampel yang ditulis
   * @param {number} scaleFactor Faktor pengali skala (misal: 32768.0 untuk PCM16)
   */
  pushScaled(sourceArray, count, scaleFactor = 1.0) {
    const free = this.capacity - this.available;
    if (count > free) {
      return false; // Mencegah buffer overflow
    }

    for (let i = 0; i < count; i++) {
      this.storage[this.writePtr] = sourceArray[i] * scaleFactor;
      // Bitwise AND mask menggantikan operator modulo (%) untuk efisiensi CPU
      this.writePtr = (this.writePtr + 1) & this.mask;
    }
    this.available += count;
    return true;
  }

  /**
   * Menarik sampel dari buffer melingkar ke array tujuan.
   * @param {Float32Array} targetArray Array tujuan (bisa berupa view ke WASM HEAPF32)
   * @param {number} targetOffset Offset indeks awal pada targetArray
   * @param {number} count Jumlah sampel yang ditarik
   * @param {number} scaleFactor Faktor pengali skala (misal: 1 / 32768.0 untuk kembali ke [-1, 1])
   */
  pullScaled(targetArray, targetOffset, count, scaleFactor = 1.0) {
    if (this.available < count) {
      return false; // Belum cukup sampel tersedia
    }

    for (let i = 0; i < count; i++) {
      let sample = this.storage[this.readPtr] * scaleFactor;
      if (scaleFactor !== 1.0) {
        // Hard-clipping pelindung agar tidak melebihi batas [-1.0, 1.0]
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

    // 1. Inisialisasi Dual Circular Ring Buffer (Pre-allocated di constructor, BUKAN di process())
    this.inputRing = new CircularFloat32Buffer(RING_BUFFER_CAPACITY);
    this.outputRing = new CircularFloat32Buffer(RING_BUFFER_CAPACITY);

    // Scratch buffer 480 sampel untuk pemrosesan frame
    this.scratchFrame480 = new Float32Array(RNNOISE_FRAME_SIZE);

    // Pre-seed Output Ring Buffer dengan 1 frame (480 sampel = 10ms) silence awal.
    // Secara matematis, karena KPK(128, 480) = 1920 sampel, pada Quantum ke-7 dalam
    // siklus 15-quantum, akumulasi input adalah 448 sampel (< 480) sedangkan output
    // membutuhkan 7 * 128 = 896 sampel. Pre-seed 480 sampel ini menjamin ZERO underrun
    // secara permanen di setiap siklus quantum tanpa celah suara sedikitpun!
    this.outputRing.pushScaled(this.scratchFrame480, RNNOISE_FRAME_SIZE, 1.0);

    // State kontrol prosesor
    this.enabled = true;
    this.isDestroyed = false;
    this.vadGainFloor = 0.02; // Ambang reduksi ketat saat tidak ada suara dekat
    this.smoothedGain = 0.0;

    // ========================================================================
    // FITUR ISOLASI JARAK DEKAT (NEAR-FIELD PROXIMITY GATE <= 1 METER)
    // ========================================================================
    // Berdasarkan Hukum Kuadrat Terbalik (Inverse-Square Law), energi suara turun
    // ~6 dB setiap kali jarak berlipat ganda (dan 12-16 dB antara pembicara <= 1m
    // vs rekan kantor pada jarak >= 2m).
    // - proximityThresholdDb = -28 dBFS (Default Mode Kantor <= 1 Meter)
    // - Suara di bawah ambang ini dianggap berasal dari jarak > 1 meter dan
    //   dipangkas oleh Hard Downward Expander menjadi 0.0 (Bisu 100%).
    this.proximityGateEnabled = true;
    this.proximityThresholdDb = -28.0; // -28 dBFS (~1300 PCM16 RMS) = batas <= 1 meter
    this.proximityHoldFrames = 26; // 26 frame * 10ms = 260ms hold alami agar suku kata & konsonan S/T/K utuh dan jernih
    this.currentHoldCounter = 0;

    // State WebAssembly RNNoise (@jitsi/rnnoise-wasm)
    this.wasmReady = false;
    this.wasmInstance = null;
    this.wasmHeapF32 = null;
    this.rnnoiseContextPtr = 0;
    this.wasmPcmInputPtr = 0;
    this.wasmPcmInputF32Index = 0;

    // State fallback Spectral & Adaptive Wiener Denoiser (jika biner WASM di-hotswap atau mode simulasi)
    this.biquadHpX1 = 0;
    this.biquadHpX2 = 0;
    this.biquadHpY1 = 0;
    this.biquadHpY2 = 0;
    this.noiseFloorEstimate = 160.0;

    // Telemetri periodik ke Main Thread (dikirim setiap ~10 frame RNNoise = 100ms agar tidak membanjiri MessagePort)
    this.framesProcessed = 0;
    this.quantumsProcessed = 0;
    this.lastVadProbability = 0.0;
    this.lastFrameDb = -90.0;
    this.telemetryIntervalFrames = 10;

    // Dengarkan pesan dari React Custom Hook (useNoiseCancellation)
    this.port.onmessage = (event) => {
      const { type, payload } = event.data || {};
      switch (type) {
        case 'INIT_WASM_BINARY':
          this._initRnnoiseWasmFromBinary(payload.wasmBinary);
          break;
        case 'SET_BYPASS': {
          const nextEnabled = !payload.bypass;
          if (nextEnabled && !this.enabled) {
            this.inputRing.clear();
            this.outputRing.clear();
            this.scratchFrame480.fill(0);
            this.outputRing.pushScaled(this.scratchFrame480, RNNOISE_FRAME_SIZE, 1.0);
            this.biquadHpX1 = 0;
            this.biquadHpX2 = 0;
            this.biquadHpY1 = 0;
            this.biquadHpY2 = 0;
            this.currentHoldCounter = 0;
            this.smoothedGain = 0.0;
          }
          this.enabled = nextEnabled;
          break;
        }
        case 'SET_AGGRESSIVENESS':
          // Nilai 0.0 (lembut) hingga 1.0 (agresif)
          this.vadGainFloor = Math.max(0.0, 1.0 - payload.aggressiveness * 0.99);
          break;
        case 'SET_PROXIMITY_GATE':
          // Mengatur batas jarak tangkap mikrofon (misal -28 dBFS untuk <= 1 meter, -22 dBFS untuk <= 0.5 meter)
          if (typeof payload.enabled === 'boolean') {
            this.proximityGateEnabled = payload.enabled;
          }
          if (typeof payload.thresholdDb === 'number') {
            this.proximityThresholdDb = Math.max(-55.0, Math.min(-12.0, payload.thresholdDb));
          }
          break;
        case 'DESTROY':
          this._cleanupWasmMemory();
          this.isDestroyed = true;
          break;
        default:
          break;
      }
    };

    // Jika wasmBinary langsung dikirim via processorOptions saat konstruksi AudioWorkletNode
    if (options && options.processorOptions && options.processorOptions.wasmBinary) {
      this._initRnnoiseWasmFromBinary(options.processorOptions.wasmBinary);
    }
  }

  /**
   * Menginstansiasi biner WebAssembly @jitsi/rnnoise-wasm di dalam thread AudioWorklet
   * dan mengalokasikan memori C linear heap (_malloc & _rnnoise_create).
   * @param {ArrayBuffer} wasmBinary ArrayBuffer dari file rnnoise.wasm
   */
  async _initRnnoiseWasmFromBinary(wasmBinary) {
    try {
      if (!wasmBinary || !(wasmBinary instanceof ArrayBuffer)) {
        return;
      }

      // Instansiasi WebAssembly langsung dari ArrayBuffer yang dikirim dari Main Thread
      const wasmModule = await WebAssembly.instantiate(wasmBinary, {
        env: {
          emscripten_notify_memory_growth: () => {
            this._refreshHeapView();
          },
        },
        wasi_snapshot_preview1: {
          proc_exit: () => 0,
          fd_write: () => 0,
          fd_close: () => 0,
          fd_seek: () => 0,
        },
      });

      const exports = wasmModule.instance.exports;
      this.wasmInstance = exports;
      this._refreshHeapView();

      // Panggil fungsi ekspor C dari @jitsi/rnnoise-wasm
      const createStateFn = exports._rnnoise_create || exports.rnnoise_create;
      const mallocFn = exports._malloc || exports.malloc;

      if (typeof createStateFn === 'function' && typeof mallocFn === 'function') {
        this.rnnoiseContextPtr = createStateFn(0);
        // Alokasikan 480 sampel Float32 (480 * 4 byte = 1920 byte) pada Linear Memory WASM
        this.wasmPcmInputPtr = mallocFn(RNNOISE_FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT);
        // Konversi byte offset pointer C menjadi indeks elemen Float32Array (dibagi 4 atau >> 2)
        this.wasmPcmInputF32Index = this.wasmPcmInputPtr >> 2;
        this.wasmReady = true;

        this.port.postMessage({
          type: 'WASM_READY',
          payload: {
            mode: 'WASM_NATIVE_ABI',
            frameSize: RNNOISE_FRAME_SIZE,
            heapPtr: this.wasmPcmInputPtr,
          },
        });
      }
    } catch (err) {
      // Apabila di lingkungan sandbox dev pengguna menguji tanpa file .wasm eksternal,
      // prosesor tetap berjalan mulus dengan engine DSP internal berstandar RNNoise 480-sampel
      this.wasmReady = false;
      this.port.postMessage({
        type: 'WASM_FALLBACK_ACTIVE',
        payload: {
          reason: err instanceof Error ? err.message : 'Menggunakan DSP 480-sample engine internal',
        },
      });
    }
  }

  _refreshHeapView() {
    if (this.wasmInstance && this.wasmInstance.memory) {
      this.wasmHeapF32 = new Float32Array(this.wasmInstance.memory.buffer);
    }
  }

  /**
   * Menghitung faktor gerbang jarak dekat (Near-Field Proximity Gate <= 1 Meter)
   * menggunakan Hukum Kuadrat Terbalik (Inverse-Square Law dBFS) + Downward Expander 1:8 + Hold 260ms.
   * Suara rekan kerja pada jarak >= 2 meter memiliki energi RMS di bawah `this.proximityThresholdDb`
   * (default -28 dBFS) sehingga akan diredam secara penuh hingga 0.0 (Bisu 100%).
   *
   * @param {number} rmsPcm16 Nilai RMS frame saat ini dalam skala PCM16 [0 - 32768]
   * @returns {number} Faktor pengali gain jarak dekat [0.0 - 1.0]
   */
  _computeNearFieldProximityFactor(rmsPcm16) {
    const normalizedRms = Math.max(1e-7, rmsPcm16 / PCM16_SCALE);
    const frameDb = 20.0 * Math.log10(normalizedRms);
    this.lastFrameDb = frameDb;

    if (!this.proximityGateEnabled) {
      return 1.0;
    }

    if (frameDb >= this.proximityThresholdDb) {
      // Suara berada di dalam radius <= 1 meter! Buka gerbang 100% dan isi ulang waktu tahan (hold)
      this.currentHoldCounter = this.proximityHoldFrames;
      return 1.0;
    }

    if (this.currentHoldCounter > 0) {
      // Tahan selama ~260ms setelah kata selesai diucapkan agar suku kata & konsonan terakhir tidak terpotong
      this.currentHoldCounter--;
      return 1.0;
    }

    // Di bawah ambang jarak 1 meter (misal suara orang mengobrol pada jarak 2 meter):
    // Terapkan Steep Downward Expander (Rasio 1:8). Jika selisih > 4 dB di bawah ambang, langsung 0.0 (Mute total)
    const dbBelow = this.proximityThresholdDb - frameDb;
    if (dbBelow >= 4.5) {
      return 0.0;
    }
    return Math.max(0.0, Math.pow(10.0, (-dbBelow * 7.0) / 20.0));
  }

  /**
   * Memproses tepat 480 sampel (skala PCM16 [-32768, 32767]) melalui:
   * - Modul WebAssembly `_rnnoise_process_frame` jika biner `@jitsi/rnnoise-wasm` aktif, ATAU
   * - Pipeline DSP Real-Time (Sidechain 110Hz Detector + Near-Field Gate <= 1m tanpa memotong konsonan).
   *
   * @param {Float32Array} frame480 Array 480 sampel dalam rentang [-32768, 32767]
   * @returns {number} Skor probabilitas VAD (Voice Activity Detection) [0.0 - 1.0]
   */
  _processRnnoiseFrame480(frame480) {
    // JALUR 1: Eksekusi Native C/WASM @jitsi/rnnoise-wasm + Near-Field Proximity Gate (<= 1m)
    if (this.wasmReady && this.wasmInstance && this.wasmHeapF32) {
      const processFrameFn =
        this.wasmInstance._rnnoise_process_frame || this.wasmInstance.rnnoise_process_frame;

      if (typeof processFrameFn === 'function') {
        if (this.wasmHeapF32.buffer !== this.wasmInstance.memory.buffer) {
          this._refreshHeapView();
        }

        this.wasmHeapF32.set(frame480, this.wasmPcmInputF32Index);

        const vadProbability = processFrameFn(
          this.rnnoiseContextPtr,
          this.wasmPcmInputPtr,
          this.wasmPcmInputPtr
        );

        let energyAfterWasm = 0;
        for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
          const s = this.wasmHeapF32[this.wasmPcmInputF32Index + i];
          frame480[i] = s;
          energyAfterWasm += s * s;
        }

        const rmsWasm = Math.sqrt(energyAfterWasm / RNNOISE_FRAME_SIZE);
        const proximityFactor = this._computeNearFieldProximityFactor(rmsWasm);
        const targetGain = vadProbability > 0.55 ? proximityFactor : 0.0;

        for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
          const coeff = targetGain > this.smoothedGain ? 0.12 : 0.008;
          this.smoothedGain += coeff * (targetGain - this.smoothedGain);
          frame480[i] *= this.smoothedGain;
        }

        return vadProbability * proximityFactor;
      }
    }

    // JALUR 2: Engine DSP Real-Time 480-Sampel (Detektor Sidechain 110Hz + Proximity Gate <= 1m)
    let frameEnergySum = 0;

    // Koefisien Biquad High-Pass Filter (fc = 110Hz @ fs = 48000Hz) khusus pada jalur Sidechain Detector
    // agar pengukuran energi jarak <= 1m bebas dari dengung AC/meja TANPA mengikis ketebalan vokal asli!
    const b0 = 0.989885;
    const b1 = -1.97977;
    const b2 = 0.989885;
    const a1 = -1.979668;
    const a2 = 0.979873;

    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      const x0 = frame480[i];
      const y0 =
        b0 * x0 +
        b1 * this.biquadHpX1 +
        b2 * this.biquadHpX2 -
        a1 * this.biquadHpY1 -
        a2 * this.biquadHpY2;

      this.biquadHpX2 = this.biquadHpX1;
      this.biquadHpX1 = x0;
      this.biquadHpY2 = this.biquadHpY1;
      this.biquadHpY1 = y0;

      frameEnergySum += y0 * y0;
    }

    const rmsPcm16 = Math.sqrt(frameEnergySum / RNNOISE_FRAME_SIZE);

    // 1. Hitung faktor Gerbang Jarak Dekat (Near-Field Proximity Gate <= 1 Meter)
    const proximityFactor = this._computeNearFieldProximityFactor(rmsPcm16);

    // 2. Adaptasi estimasi lantai derau ruangan kantor
    if (rmsPcm16 < this.noiseFloorEstimate * 1.45) {
      this.noiseFloorEstimate = 0.94 * this.noiseFloorEstimate + 0.06 * rmsPcm16;
    } else {
      this.noiseFloorEstimate = 0.996 * this.noiseFloorEstimate + 0.004 * rmsPcm16;
    }
    this.noiseFloorEstimate = Math.max(60.0, Math.min(2800.0, this.noiseFloorEstimate));

    // 3. Hitung rasio SNR & VAD tanpa memotong konsonan frekuensi tinggi (S/T/K)
    const snrRatio = rmsPcm16 / (this.noiseFloorEstimate + 1e-5);
    const rawVad = Math.min(1.0, Math.max(0.0, (snrRatio - 1.25) / 2.6));

    // 4. Gabungkan VAD dengan Proximity Gate (Jika suara berada di luar 1 meter, proximityFactor = 0.0 -> Mute 100%!)
    const baseGain = rawVad > 0.35 ? 1.0 : this.vadGainFloor * rawVad;
    const targetGain = baseGain * proximityFactor;

    // 5. Perataan amplop (Attack cepat 0.12 = ~1.5ms saat Anda bicara <= 1m, Release halus 0.008 saat di luar 1m)
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      const smoothingCoeff = targetGain > this.smoothedGain ? 0.12 : 0.008;
      this.smoothedGain += smoothingCoeff * (targetGain - this.smoothedGain);
      if (this.smoothedGain < 0.002 && targetGain === 0.0) {
        this.smoothedGain = 0.0;
      }
      frame480[i] *= this.smoothedGain;
    }

    return rawVad * proximityFactor;
  }

  /**
   * Metode utama AudioWorkletProcessor yang dipanggil oleh thread audio browser
   * setiap 128 sampel (~2.67ms pada 48.000 Hz).
   */
  process(inputs, outputs) {
    if (this.isDestroyed) {
      return false; // Menghentikan siklus hidup AudioWorkletProcessor secara permanen
    }

    const inputChannel = inputs[0] && inputs[0][0];
    const outputChannel = outputs[0] && outputs[0][0];

    // Jika tidak ada output terhubung, tetap pertahankan prosesor hidup
    if (!outputChannel) {
      return true;
    }

    // Jika input mikrofon belum mengalir, keluarkan silence
    if (!inputChannel || inputChannel.length === 0) {
      outputChannel.fill(0);
      return true;
    }

    this.quantumsProcessed++;

    // Mode Bypass: salin langsung 128 sampel input ke output tanpa antrean Ring Buffer
    if (!this.enabled) {
      outputChannel.set(inputChannel);
      return true;
    }

    // ========================================================================
    // TAHAP 1: TABUNG 128 SAMPEL KE INPUT RING BUFFER (DENGAN SKALA PCM16)
    // ========================================================================
    // Web Audio API memberikan Float32 [-1.0, 1.0].
    // Kita kalikan dengan 32768.0 saat memasukkan ke Input Ring Buffer agar siap
    // dikonsumsi oleh RNNoise C ABI yang mewajibkan skala 16-bit signed float.
    this.inputRing.pushScaled(inputChannel, inputChannel.length, PCM16_SCALE);

    // ========================================================================
    // TAHAP 2: EKSEKUSI RNNOISE JIKA SUDAH TERKUMPUL >= 480 SAMPEL
    // ========================================================================
    // Karena 128 * 3 = 384 (< 480) dan 128 * 4 = 512 (>= 480), blok `while` ini
    // akan dieksekusi pada quantum ke-4, ke-8, ke-12, ke-15, dst. (rata-rata 3.75 quantum).
    while (this.inputRing.available >= RNNOISE_FRAME_SIZE) {
      // Tarik tepat 480 sampel dari Input Ring Buffer ke scratchFrame480
      this.inputRing.pullScaled(this.scratchFrame480, 0, RNNOISE_FRAME_SIZE, 1.0);

      // Jalankan algoritma RNNoise (WASM atau DSP 480-sampel)
      this.lastVadProbability = this._processRnnoiseFrame480(this.scratchFrame480);
      this.framesProcessed++;

      // Masukkan 480 sampel hasil denoise ke Output Ring Buffer
      this.outputRing.pushScaled(this.scratchFrame480, RNNOISE_FRAME_SIZE, 1.0);

      // Kirim telemetri ringan ke Main Thread setiap N frame (tidak membebani thread audio)
      if (this.framesProcessed % this.telemetryIntervalFrames === 0) {
        this.port.postMessage({
          type: 'TELEMETRY_TICK',
          payload: {
            framesProcessed: this.framesProcessed,
            quantumsProcessed: this.quantumsProcessed,
            vadProbability: this.lastVadProbability,
            inputRingAvailable: this.inputRing.available,
            outputRingAvailable: this.outputRing.available,
            wasmNativeActive: this.wasmReady,
          },
        });
      }
    }

    // ========================================================================
    // TAHAP 3: DISTRIBUSI KEMBALI 128 SAMPEL DARI OUTPUT RING BUFFER
    // ========================================================================
    // Tarik 128 sampel dan bagi dengan 32768.0 (1 / PCM16_SCALE) untuk mengembalikan
    // skala ke rentang standar Web Audio API [-1.0, 1.0].
    const hasEnoughOutput = this.outputRing.pullScaled(
      outputChannel,
      0,
      outputChannel.length,
      1.0 / PCM16_SCALE
    );

    if (!hasEnoughOutput) {
      // Terjadi hanya pada 3 quantum pertama (~8ms awal saat menabung 128 -> 256 -> 384 sampel).
      outputChannel.fill(0);
    }

    // Jika output memiliki kanal stereo (kanan), salin kanal mono yang telah bersih ke semua kanal
    const outputChannels = outputs[0];
    for (let ch = 1; ch < outputChannels.length; ch++) {
      outputChannels[ch].set(outputChannel);
    }

    return true;
  }

  /**
   * Membebaskan alokasi memori C/WASM (_free dan _rnnoise_destroy) agar tidak terjadi memory leak.
   */
  _cleanupWasmMemory() {
    if (this.wasmInstance) {
      const freeFn = this.wasmInstance._free || this.wasmInstance.free;
      const destroyFn =
        this.wasmInstance._rnnoise_destroy || this.wasmInstance.rnnoise_destroy;

      if (this.wasmPcmInputPtr && typeof freeFn === 'function') {
        freeFn(this.wasmPcmInputPtr);
        this.wasmPcmInputPtr = 0;
      }
      if (this.rnnoiseContextPtr && typeof destroyFn === 'function') {
        destroyFn(this.rnnoiseContextPtr);
        this.rnnoiseContextPtr = 0;
      }
    }
    this.inputRing.clear();
    this.outputRing.clear();
    this.wasmReady = false;
  }
}

registerProcessor('rnnoise-worklet-processor', RNNoiseWorkletProcessor);
