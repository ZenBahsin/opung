declare module '@jitsi/rnnoise-wasm' {
  export interface RNNWasmModule {
    HEAPF32: Float32Array;
    _rnnoise_create(model?: number): number;
    _rnnoise_destroy(state: number): void;
    _rnnoise_process_frame(
      state: number,
      outputPtr: number,
      inputPtr: number
    ): number;
    _malloc(bytes: number): number;
    _free(ptr: number): void;
    ready?: Promise<RNNWasmModule>;
  }

  export function createRNNWasmModule(options?: {
    wasmBinary?: Uint8Array | ArrayBuffer;
  }): Promise<RNNWasmModule>;

  export function createRNNWasmModuleSync(): RNNWasmModule;
}
