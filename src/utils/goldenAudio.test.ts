import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderHybridDemoComparison, DEMO_DSP_SAMPLE_RATE, resampleLinearTo48k } from './demoDspProcessor';
import { buildOpungWorkletModuleCode } from './opungWorkletBuilder';
import { RNNOISE_SYNC_INLINE_SCRIPT } from './rnnoiseSyncInline';
import { isExternalHttpUrl } from './windowsAppBuilder';

function encodeMonoWavPcm16(samples: Float32Array, sampleRate = DEMO_DSP_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true); // PCM chunk size
  dv.setUint16(20, 1, true); // PCM linear
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

function decodeMonoWavPcm16(wavBytes: Uint8Array): { sampleRate: number; samples: Float32Array } {
  const dv = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  assert.equal(magic, 'RIFF');
  const format = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  assert.equal(format, 'WAVE');
  const sampleRate = dv.getUint32(24, true);
  const dataSize = dv.getUint32(40, true);
  const count = dataSize / 2;
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = dv.getInt16(44 + i * 2, true) / 32768.0;
  }
  return { sampleRate, samples };
}

function segmentRms(buf: Float32Array, startSample: number, endSample: number): number {
  let sum = 0;
  const count = Math.max(1, endSample - startSample);
  for (let i = startSample; i < endSample; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / count);
}

test('Golden WAV Regression: 48 kHz RIFF/PCM16 round-trip blocks distant coworker & drill while preserving near-field speech', async () => {
  const sr = DEMO_DSP_SAMPLE_RATE;
  const totalSamples = sr * 3; // 3 detik penuh
  const fixture = new Float32Array(totalSamples);

  let phaseNear = 0;
  let phaseFar = 0;
  let lcg = 0x13579bdf;

  for (let i = 0; i < totalSamples; i++) {
    lcg = (1664525 * lcg + 1013904223) >>> 0;
    const white = (lcg / 0xffffffff) * 2 - 1;

    if (i < sr) {
      // Segmen 0..1s: Suara rekan meja sebelah (-35 dBFS) + AC rendah
      phaseFar += (165 + 22 * Math.sin(i * 0.0004)) / sr;
      if (phaseFar >= 1) phaseFar -= 1;
      const farVoice =
        ((2 * phaseFar - 1) * 0.4 + Math.sin(2 * Math.PI * phaseFar) * 0.6) * 0.018;
      fixture[i] = farVoice + white * 0.006;
    } else if (i < sr * 2) {
      // Segmen 1..2s: Pembicara utama dekat (<= 1.0m) + suara bor & ketikan
      phaseNear += (145 + 30 * Math.sin(i * 0.0005)) / sr;
      if (phaseNear >= 1) phaseNear -= 1;
      const nearVoice =
        (Math.sin(2 * Math.PI * phaseNear) * 0.65 +
          Math.sin(4 * Math.PI * phaseNear) * 0.45 +
          Math.sin(6 * Math.PI * phaseNear) * 0.25) *
        0.38;
      const drill = (white * 0.7 + Math.sin(i * 0.85) * 0.4) * 0.06;
      fixture[i] = Math.max(-0.98, Math.min(0.98, nearVoice + drill));
    } else {
      // Segmen 2..3s: Bising bor & ketikan tanpa pembicara
      const drill = (white * 0.75 + Math.sin(i * 0.85) * 0.45) * 0.14;
      fixture[i] = drill;
    }
  }

  // Simulasikan golden PCM16 WAV file encode -> decode
  const wavEncoded = encodeMonoWavPcm16(fixture, sr);
  const wavDecoded = decodeMonoWavPcm16(wavEncoded);
  assert.equal(wavDecoded.sampleRate, 48000);
  assert.equal(wavDecoded.samples.length, totalSamples);

  const { cleaned, rnnoiseUsed } = await renderHybridDemoComparison(wavDecoded.samples, -26, false);
  assert.equal(rnnoiseUsed, true);

  // Re-encode hasil output ke WAV PCM16 dan verifikasi integritasnya
  const cleanedWav = encodeMonoWavPcm16(cleaned, sr);
  assert.equal(cleanedWav.byteLength, 44 + totalSamples * 2);

  const rmsDistant = segmentRms(cleaned, Math.round(sr * 0.2), Math.round(sr * 0.9));
  const rmsNearSpeech = segmentRms(cleaned, Math.round(sr * 1.25), Math.round(sr * 1.9));
  const rmsDrillOnly = segmentRms(cleaned, Math.round(sr * 2.45), Math.round(sr * 2.95));

  assert.ok(rmsDistant < 0.002, `Distant chatter must be muted, got RMS=${rmsDistant}`);
  assert.ok(rmsNearSpeech > 0.05, `Near-field speech must remain clear, got RMS=${rmsNearSpeech}`);
  assert.ok(
    rmsNearSpeech / Math.max(1e-6, rmsDistant) > 25,
    `Near-field speech must exceed distant floor by >28 dB (near=${rmsNearSpeech}, distant=${rmsDistant})`
  );
  assert.ok(rmsDrillOnly < 0.003, `Drill noise alone must be muted, got RMS=${rmsDrillOnly}`);
});

test('resampleLinearTo48k converts 44.1 kHz speech buffers cleanly to 48 kHz', () => {
  const src = new Float32Array(44100);
  for (let i = 0; i < src.length; i++) {
    src[i] = Math.sin((2 * Math.PI * 220 * i) / 44100) * 0.5;
  }
  const out = resampleLinearTo48k(src, 44100);
  assert.equal(out.length, 48000);
  assert.ok(Math.abs(out[12000]) <= 0.501);
});

test('OpungHybridWorkletProcessor initializes RNNoise WASM inside AudioWorkletGlobalScope sandbox and streams stats + Int16 PCM', () => {
  const workletCode = buildOpungWorkletModuleCode(RNNOISE_SYNC_INLINE_SCRIPT);
  type WorkletInstance = {
    port: { onmessage: ((ev: { data: unknown }) => void) | null };
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  };
  const registry: Record<string, new () => WorkletInstance> = {};
  const postedMessages: Array<Record<string, unknown>> = [];

  class MockAudioWorkletProcessor {
    port = {
      onmessage: null as ((ev: { data: unknown }) => void) | null,
      postMessage: (msg: Record<string, unknown>) => {
        postedMessages.push(msg);
      },
    };
  }

  const sandbox: Record<string, unknown> = {
    console,
    Uint8Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    Math,
    Number,
    String,
    Array,
    Object,
    Promise,
    Error,
    TypeError,
    RangeError,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    sampleRate: 48000,
    registerProcessor: (name: string, ctor: new () => WorkletInstance) => {
      registry[name] = ctor;
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const script = new vm.Script(workletCode, { filename: 'opung-worklet.js' });
  script.runInNewContext(sandbox);

  const ProcessorCtor = registry['opung-hybrid-processor'];
  assert.ok(ProcessorCtor, 'registerProcessor must register OpungHybridWorkletProcessor');
  const node = new ProcessorCtor();

  // Pastikan 'ready' mengirim rnnoiseActive = true tanpa window/document/atob!
  assert.equal(postedMessages[0]?.type, 'ready');
  assert.equal(postedMessages[0]?.rnnoiseActive, true);

  // Aktifkan streaming Int16 PCM & jalankan 8 quantum 128-sampel (= 1024 sampel -> memicu stats & pcm chunks)
  node.port.onmessage?.({
    data: {
      type: 'config',
      enabled: true,
      thresholdDb: -26,
      krispMode: true,
      isLoopbackTest: false,
      needPcmStream: true,
    },
  });

  const inQuantum = new Float32Array(128);
  const outQuantum = new Float32Array(128);
  for (let q = 0; q < 8; q++) {
    for (let i = 0; i < 128; i++) {
      inQuantum[i] = Math.sin((q * 128 + i) * 0.02) * 0.3;
    }
    const keepAlive = node.process([[inQuantum]], [[outQuantum]]);
    assert.equal(keepAlive, true);
  }

  const statsMsgs = postedMessages.filter((m) => m.type === 'stats');
  const pcmMsgs = postedMessages.filter((m) => m.type === 'pcm');
  assert.ok(statsMsgs.length >= 2, 'Expected stats telemetry every 4 quanta');
  assert.ok(pcmMsgs.length >= 2, 'Expected transferable Int16 PCM 512-sample chunks');

  // Bersihkan resource WASM via 'destroy'
  node.port.onmessage?.({ data: { type: 'destroy' } });
  const stillAliveAfterDestroy = node.process([[inQuantum]], [[outQuantum]]);
  assert.equal(stillAliveAfterDestroy, false);
});

test('isExternalHttpUrl safely distinguishes GitHub Release URLs from local relative asset paths', () => {
  assert.equal(
    isExternalHttpUrl('https://github.com/org/opung/releases/download/v1.0/Opung-Windows-x64.exe'),
    true
  );
  assert.equal(isExternalHttpUrl('/Opung-Windows-x64.exe'), false);
  assert.equal(isExternalHttpUrl(''), false);
});
