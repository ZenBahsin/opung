import {
  NearFieldHybridDspCore,
  RNNOISE_FRAME_SIZE,
  type RnnoiseProcessorAdapter,
} from './hybridDspCore';
import { createRnnoiseWasmProcessor } from './rnnoiseEngine';

export const DEMO_DSP_SAMPLE_RATE = 48000;

/**
 * Resample mono Float32Array ke 48.000 Hz (wajib untuk frame 480-sampel RNNoise 0.2).
 */
export function resampleLinearTo48k(
  input: Float32Array,
  fromSampleRate: number
): Float32Array {
  if (!input.length || fromSampleRate === DEMO_DSP_SAMPLE_RATE || fromSampleRate <= 0) {
    return new Float32Array(input);
  }
  const ratio = fromSampleRate / DEMO_DSP_SAMPLE_RATE;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const i0 = Math.min(input.length - 1, Math.floor(srcPos));
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Memproses rekaman skenario demo mentah 48 kHz secara nyata melalui mesin
 * Hybrid Real RNNoise 0.2 WASM + Near-Field Proximity Gate (<= 1.0m).
 * Instance WASM langsung dibebaskan di blok `finally` setelah selesai render.
 */
export async function renderHybridDemoComparison(
  rawMixed48k: Float32Array,
  thresholdDb = -26,
  isLoopbackScenario = false
): Promise<{ raw: Float32Array; cleaned: Float32Array; rnnoiseUsed: boolean }> {
  const raw = new Float32Array(rawMixed48k);
  const cleaned = new Float32Array(raw.length);

  let engine: RnnoiseProcessorAdapter | null = null;
  try {
    engine = await createRnnoiseWasmProcessor();
  } catch {
    engine = null;
  }

  const core = new NearFieldHybridDspCore(engine || undefined);
  try {
    const blockSize = 512;
    const inBlock = new Float32Array(blockSize);
    const outBlock = new Float32Array(blockSize);

    // Warm-up internal RNNoise GRU state & ring buffer 1 blok penuh terlebih dahulu
    for (let offset = 0; offset < raw.length; offset += blockSize) {
      const remaining = Math.min(blockSize, raw.length - offset);
      inBlock.fill(0);
      inBlock.set(raw.subarray(offset, offset + remaining), 0);
      core.processAudioBlock(inBlock, outBlock, true, thresholdDb, true, isLoopbackScenario);
      cleaned.set(outBlock.subarray(0, remaining), offset);
    }

    // Kompensasi latensi ring buffer (480 sampel / 10ms) agar sejajar fase dengan raw saat switch A/B
    if (cleaned.length > RNNOISE_FRAME_SIZE) {
      const aligned = new Float32Array(cleaned.length);
      aligned.set(cleaned.subarray(RNNOISE_FRAME_SIZE), 0);
      return { raw, cleaned: aligned, rnnoiseUsed: engine !== null };
    }

    return { raw, cleaned, rnnoiseUsed: engine !== null };
  } finally {
    core.destroy();
  }
}
