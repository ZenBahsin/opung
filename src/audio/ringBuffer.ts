/**
 * @file ringBuffer.ts
 * @description Implementasi Zero-Allocation Circular Ring Buffer & Frame Adapter
 * untuk menyelaraskan ukuran quantum AudioWorklet (128 sampel) dengan ukuran frame
 * wajib RNNoise WASM (480 sampel pada 48.000 Hz = 10ms).
 *
 * Konstrain Real-Time Audio Thread:
 * 1. DILARANG melakukan alokasi memori baru (`new Float32Array`) di dalam `process()`.
 * 2. Gunakan bitwise mask (`& mask`) dengan kapasitas Power-of-2 (2048) untuk operasi
 *    modulo O(1) yang jauh lebih cepat dibandingkan operator `%`.
 * 3. Konversi skala: Web Audio API menggunakan Float32 [-1.0, 1.0], sedangkan
 *    RNNoise C/WASM mengharapkan skala PCM 16-bit signed float [-32768.0, 32767.0].
 */

export const WORKLET_QUANTUM_SIZE = 128;
export const RNNOISE_FRAME_SIZE = 480;
export const DEFAULT_RING_CAPACITY = 2048; // Harus Power-of-2 (2^11 = 2048)
export const PCM16_SCALE = 32768.0;

/**
 * Kelas Circular Float32 Ring Buffer bebas alokasi memori (Zero-GC)
 * dirancang khusus untuk dieksekusi di dalam AudioWorkletGlobalScope.
 */
export class Float32RingBuffer {
  private readonly buffer: Float32Array;
  private readonly capacity: number;
  private readonly mask: number;
  private writeIndex = 0;
  private readIndex = 0;
  private availableSamples = 0;

  constructor(capacity: number = DEFAULT_RING_CAPACITY) {
    // Validasi bahwa kapasitas adalah bilangan pangkat dua (Power of Two)
    if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
      throw new Error(`Capacity (${capacity}) harus merupakan bilangan Power-of-2 (contoh: 1024, 2048, 4096).`);
    }
    this.capacity = capacity;
    this.mask = capacity - 1;
    this.buffer = new Float32Array(capacity);
  }

  /** Jumlah sampel yang saat ini tersimpan dan siap dibaca */
  public get available(): number {
    return this.availableSamples;
  }

  /** Sisa ruang kosong yang dapat ditulis */
  public get freeSpace(): number {
    return this.capacity - this.availableSamples;
  }

  /** Kapasitas total buffer */
  public get size(): number {
    return this.capacity;
  }

  /** Posisi pointer baca saat ini (untuk telemetri/inspeksi) */
  public get currentReadPos(): number {
    return this.readIndex;
  }

  /** Posisi pointer tulis saat ini (untuk telemetri/inspeksi) */
  public get currentWritePos(): number {
    return this.writeIndex;
  }

  /**
   * Menambahkan array sampel ke dalam ring buffer.
   * @param src Array sumber (contoh: 128 sampel dari input AudioWorklet atau 480 sampel hasil RNNoise)
   * @param length Jumlah elemen yang ingin ditulis (default: src.length)
   * @returns true jika berhasil ditulis penuh, false jika terjadi buffer overflow
   */
  public push(src: Float32Array, length: number = src.length): boolean {
    if (length > this.freeSpace) {
      return false; // Overflow protection
    }

    for (let i = 0; i < length; i++) {
      this.buffer[this.writeIndex] = src[i];
      // Bitwise AND dengan (capacity - 1) menggantikan modulo (%) untuk performa tinggi
      this.writeIndex = (this.writeIndex + 1) & this.mask;
    }

    this.availableSamples += length;
    return true;
  }

  /**
   * Menarik sejumlah sampel dari ring buffer ke dalam array tujuan yang sudah dialokasikan sebelumnya.
   * @param dest Array tujuan pre-allocated (contoh: frameBuffer 480 sampel atau output AudioWorklet 128 sampel)
   * @param length Jumlah elemen yang ingin ditarik (default: dest.length)
   * @returns true jika jumlah sampel mencukupi dan berhasil disalin, false jika underflow
   */
  public pull(dest: Float32Array, length: number = dest.length): boolean {
    if (this.availableSamples < length) {
      return false; // Underflow: belum cukup sampel terkumpul
    }

    for (let i = 0; i < length; i++) {
      dest[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) & this.mask;
    }

    this.availableSamples -= length;
    return true;
  }

  /**
   * Mengosongkan state pointer tanpa mengalokasikan ulang memori.
   */
  public clear(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.availableSamples = 0;
    this.buffer.fill(0);
  }
}

export interface FrameStepSnapshot {
  stepNumber: number;
  inputAvailableBefore: number;
  inputAvailableAfter: number;
  outputAvailableBefore: number;
  outputAvailableAfter: number;
  rnnoiseTriggered: boolean;
  vadProbability: number;
  readPointerInput: number;
  writePointerInput: number;
  readPointerOutput: number;
  writePointerOutput: number;
  underrunOccurred: boolean;
}

/**
 * Orkestrator Dual-Ring Buffer untuk pipeline 128 -> 480 -> 128 sampel.
 * Memisahkan logika antrean dan penskalaan amplitudo dari ketergantungan global AudioWorklet
 * sehingga dapat diuji secara deterministik (unit test) maupun dijalankan di simulasi visual.
 */
export class RNNoiseFramePipeline {
  public readonly inputRing: Float32RingBuffer;
  public readonly outputRing: Float32RingBuffer;
  private readonly scratchFrame480: Float32Array;
  private stepCount = 0;
  private totalFramesProcessed = 0;
  private lastVadScore = 0;

  constructor(capacity: number = DEFAULT_RING_CAPACITY) {
    this.inputRing = new Float32RingBuffer(capacity);
    this.outputRing = new Float32RingBuffer(capacity);
    this.scratchFrame480 = new Float32Array(RNNOISE_FRAME_SIZE);
    // Pre-fill Output Ring Buffer dengan 1 frame RNNoise (480 sampel = 10ms) silence
    // untuk menyerap jitter ukuran blok 128 vs 480 (di mana pada Quantum ke-7 dalam siklus 15-quantum,
    // input mencapai 448 sampel < 480 sehingga butuh cadangan 64 sampel di output).
    this.outputRing.push(this.scratchFrame480, RNNOISE_FRAME_SIZE);
  }

  /**
   * Memproses satu siklus quantum AudioWorklet (128 sampel masuk -> 128 sampel keluar).
   * @param input128 Float32Array berukuran 128 sampel dari mikrofon [-1.0, 1.0]
   * @param output128 Float32Array berukuran 128 sampel menuju speaker/WebRTC [-1.0, 1.0]
   * @param dspCallback Fungsi pemroses 480 sampel dalam skala PCM16 [-32768, 32768] yang mengembalikan skor VAD [0.0, 1.0]
   */
  public processQuantum(
    input128: Float32Array,
    output128: Float32Array,
    dspCallback: (pcmScaledFrame480: Float32Array) => number
  ): FrameStepSnapshot {
    this.stepCount++;

    const inputBefore = this.inputRing.available;
    const outputBefore = this.outputRing.available;

    // 1. Tabung 128 sampel baru dari AudioWorklet ke dalam Input Ring Buffer
    this.inputRing.push(input128, WORKLET_QUANTUM_SIZE);

    let rnnoiseTriggered = false;

    // 2. Selama Input Ring Buffer memiliki minimal 480 sampel, jalankan frame RNNoise
    while (this.inputRing.available >= RNNOISE_FRAME_SIZE) {
      this.inputRing.pull(this.scratchFrame480, RNNOISE_FRAME_SIZE);

      // Konversi skala Web Audio [-1.0, 1.0] -> Skala RNNoise C PCM16 [-32768.0, 32767.0]
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        this.scratchFrame480[i] *= PCM16_SCALE;
      }

      // Eksekusi fungsi WASM (_rnnoise_process_frame) atau DSP denoiser
      this.lastVadScore = dspCallback(this.scratchFrame480);

      // Kembalikan skala dari PCM16 [-32768.0, 32767.0] -> Web Audio [-1.0, 1.0] dengan hard-clipping aman
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        const normalized = this.scratchFrame480[i] / PCM16_SCALE;
        this.scratchFrame480[i] = normalized > 1.0 ? 1.0 : normalized < -1.0 ? -1.0 : normalized;
      }

      // Simpan 480 sampel yang telah bersih ke dalam Output Ring Buffer
      this.outputRing.push(this.scratchFrame480, RNNOISE_FRAME_SIZE);
      this.totalFramesProcessed++;
      rnnoiseTriggered = true;
    }

    // 3. Distribusi kembali ke chunk 128 sampel untuk output AudioWorklet
    let underrunOccurred = false;
    if (this.outputRing.available >= WORKLET_QUANTUM_SIZE) {
      this.outputRing.pull(output128, WORKLET_QUANTUM_SIZE);
    } else {
      output128.fill(0);
      underrunOccurred = true;
    }

    return {
      stepNumber: this.stepCount,
      inputAvailableBefore: inputBefore,
      inputAvailableAfter: this.inputRing.available,
      outputAvailableBefore: outputBefore,
      outputAvailableAfter: this.outputRing.available,
      rnnoiseTriggered,
      vadProbability: this.lastVadScore,
      readPointerInput: this.inputRing.currentReadPos,
      writePointerInput: this.inputRing.currentWritePos,
      readPointerOutput: this.outputRing.currentReadPos,
      writePointerOutput: this.outputRing.currentWritePos,
      underrunOccurred,
    };
  }

  public get framesProcessed(): number {
    return this.totalFramesProcessed;
  }

  public reset(): void {
    this.inputRing.clear();
    this.outputRing.clear();
    this.scratchFrame480.fill(0);
    this.outputRing.push(this.scratchFrame480, RNNOISE_FRAME_SIZE);
    this.stepCount = 0;
    this.totalFramesProcessed = 0;
    this.lastVadScore = 0;
  }
}
