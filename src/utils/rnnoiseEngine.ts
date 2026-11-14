import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';
import { RNNOISE_FRAME_SIZE, type RnnoiseProcessorAdapter } from './hybridDspCore';

interface RnnoiseWasmModuleInstance {
  HEAPF32: Float32Array;
  _rnnoise_create(model?: number): number;
  _rnnoise_destroy(state: number): void;
  _rnnoise_process_frame(state: number, outputPtr: number, inputPtr: number): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  ready?: Promise<unknown>;
}

/**
 * Menginisialisasi instance real RNNoise 0.2 WASM (@jitsi/rnnoise-wasm)
 * dengan lifecycle memori aman (`_malloc` / `_free` & `_rnnoise_destroy` idempoten).
 */
export async function createRnnoiseWasmProcessor(): Promise<RnnoiseProcessorAdapter> {
  const mod = createRNNWasmModuleSync() as unknown as RnnoiseWasmModuleInstance;
  if (mod.ready) {
    await mod.ready;
  }

  const ctxPtr = mod._rnnoise_create(0);
  if (!ctxPtr) {
    throw new Error('Failed to allocate RNNoise neural state context');
  }

  const framePtr = mod._malloc(RNNOISE_FRAME_SIZE * 4);
  if (!framePtr) {
    mod._rnnoise_destroy(ctxPtr);
    throw new Error('Failed to allocate RNNoise 480-sample PCM buffer');
  }

  let destroyed = false;

  return {
    processFrameInPlace(frame480: Float32Array): number {
      if (destroyed) return 0;
      const heapOffset = framePtr >> 2;
      mod.HEAPF32.set(frame480, heapOffset);
      const vadProb = mod._rnnoise_process_frame(ctxPtr, framePtr, framePtr);
      frame480.set(
        mod.HEAPF32.subarray(heapOffset, heapOffset + RNNOISE_FRAME_SIZE)
      );
      return Number.isFinite(vadProb) ? vadProb : 0;
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      try {
        mod._free(framePtr);
      } catch {
        // Ignore double-free guard
      }
      try {
        mod._rnnoise_destroy(ctxPtr);
      } catch {
        // Ignore destroy guard
      }
    },
  };
}
