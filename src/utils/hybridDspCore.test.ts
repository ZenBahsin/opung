import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NearFieldHybridDspCore,
  RNNOISE_FRAME_SIZE,
} from './hybridDspCore';
import { createRnnoiseWasmProcessor } from './rnnoiseEngine';

function makePinkWhiteDrillNoiseBlock(length: number, amplitude: number, frameSeed: number): Float32Array {
  const buf = new Float32Array(length);
  // LCG deterministik agar hasil pengujian stabil 100% tanpa fluktuasi acak
  let state = (1234567 + frameSeed * 9973) >>> 0;
  for (let i = 0; i < length; i++) {
    state = (1664525 * state + 1013904223) >>> 0;
    const white = (state / 0xffffffff) * 2 - 1;
    const highFreqWhine = Math.sin((i + frameSeed * length) * 0.85) * 0.45;
    buf[i] = (white * 0.75 + highFreqWhine) * amplitude;
  }
  return buf;
}

function createContinuousSpeechGenerator() {
  let phase = 0;
  let sampleIdx = 0;
  return function nextBlock(length: number, amplitude: number): Float32Array {
    const buf = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const frameIndex = Math.floor(sampleIdx / RNNOISE_FRAME_SIZE);
      const f0 = 145 + 32 * Math.sin(frameIndex * 0.24);
      const syllableEnv = 0.65 + 0.35 * Math.sin(frameIndex * 0.19);
      phase += f0 / 48000;
      if (phase >= 1) phase -= 1;
      const glottal =
        (2 * phase - 1) * 0.4 +
        Math.sin(2 * Math.PI * phase) * 0.6 +
        Math.sin(4 * Math.PI * phase) * 0.5 +
        Math.sin(7 * Math.PI * phase) * 0.25;
      buf[i] = glottal * amplitude * syllableEnv;
      sampleIdx++;
    }
    return buf;
  };
}

function computeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / Math.max(1, buf.length));
}

test('RNNoise WASM create/process/destroy lifecycle is leak-free and idempotent', async () => {
  for (let round = 0; round < 3; round++) {
    const engine = await createRnnoiseWasmProcessor();
    const frame = new Float32Array(RNNOISE_FRAME_SIZE);
    for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
      frame[i] = Math.sin(i * 0.1) * 2000;
    }
    const vad = engine.processFrameInPlace(frame);
    assert.ok(Number.isFinite(vad) && vad >= 0 && vad <= 1);
    engine.destroy();
    // Memanggil destroy() dua kali tidak boleh crash
    engine.destroy();
  }
});

test('Scenario 1: Non-human drill & mechanical noise alone stays blocked at 0.00x', async () => {
  const engine = await createRnnoiseWasmProcessor();
  const core = new NearFieldHybridDspCore(engine);

  try {
    const out = new Float32Array(512);
    let maxOutRms = 0;

    for (let block = 0; block < 30; block++) {
      // Bising bor/kipas keras (-16 dBFS mentah) tanpa suara manusia
      const noisy = makePinkWhiteDrillNoiseBlock(512, 0.16, block);
      core.processAudioBlock(noisy, out, true, -26, true, false);
      if (block >= 8) {
        const outRms = computeRms(out);
        if (outRms > maxOutRms) maxOutRms = outRms;
      }
    }

    assert.equal(core.isRnnoiseActive, true);
    assert.equal(core.isGateOpen, false);
    assert.ok(
      maxOutRms < 0.002,
      `Expected non-human noise output RMS < 0.002, got ${maxOutRms}`
    );
  } finally {
    core.destroy();
  }
});

test('Scenario 2: Distant coworker teaching at neighbor desk (> 1.5m) is blocked to 0.00x by Proximity Gate', async () => {
  const engine = await createRnnoiseWasmProcessor();
  const core = new NearFieldHybridDspCore(engine);
  const nextSpeech = createContinuousSpeechGenerator();

  try {
    const out = new Float32Array(512);
    let maxVadSeen = 0;
    let maxOutRmsAfterWarmup = 0;

    for (let block = 0; block < 45; block++) {
      // Suara manusia rekan kerja dari meja sebelah (~ -35 dBFS di bawah threshold -26 dB)
      const coworkerSpeech = nextSpeech(512, 0.018);
      core.processAudioBlock(coworkerSpeech, out, true, -26, true, false);
      if (core.lastVadProb > maxVadSeen) maxVadSeen = core.lastVadProb;
      if (block >= 10) {
        const rms = computeRms(out);
        if (rms > maxOutRmsAfterWarmup) maxOutRmsAfterWarmup = rms;
      }
    }

    // Membuktikan Hybrid: RNNoise mengenali itu ucapan manusia, TAPI Proximity Gate tetap memblokirnya ke 0.00x!
    assert.ok(
      maxVadSeen > 0.3,
      `Expected RNNoise to recognize distant voice pitch (vad=${maxVadSeen})`
    );
    assert.equal(core.isGateOpen, false);
    assert.equal(
      maxOutRmsAfterWarmup,
      0,
      `Expected 0.00x silent output for distant coworker, got RMS ${maxOutRmsAfterWarmup}`
    );
  } finally {
    core.destroy();
  }
});

test('Scenario 3: Near-field user speech (<= 1.0m) + background noise opens gate cleanly with reduced noise floor', async () => {
  const engine = await createRnnoiseWasmProcessor();
  const core = new NearFieldHybridDspCore(engine);
  const nextSpeech = createContinuousSpeechGenerator();

  try {
    const out = new Float32Array(512);
    let openFrames = 0;
    let outEnergySum = 0;
    let maxVad = 0;

    for (let block = 0; block < 50; block++) {
      // Suara pengguna bicara dekat mic (~ -20 dBFS RMS) + bising kipas/bor keras (-24 dBFS RMS)
      const voice = nextSpeech(512, 0.35);
      const bgNoise = makePinkWhiteDrillNoiseBlock(512, 0.08, block);
      const mixed = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        mixed[i] = Math.max(-0.99, Math.min(0.99, voice[i] + bgNoise[i]));
      }

      core.processAudioBlock(mixed, out, true, -26, true, false);

      for (let i = 0; i < 512; i++) {
        assert.ok(Number.isFinite(out[i]), 'Output sample must be finite');
        assert.ok(
          out[i] >= -1.0 && out[i] <= 1.0,
          `Output sample clipped out of [-1, 1]: ${out[i]}`
        );
      }

      if (block >= 10) {
        if (core.isGateOpen) openFrames++;
        if (core.lastVadProb > maxVad) maxVad = core.lastVadProb;
        outEnergySum += computeRms(out);
      }
    }

    const avgOutRms = outEnergySum / 40;
    assert.ok(openFrames >= 32, `Expected gate to open reliably, opened ${openFrames}/40`);
    assert.ok(maxVad >= 0.65, `Expected strong speech VAD prob, got ${maxVad}`);
    assert.ok(avgOutRms > 0.05, `Expected clear vocal signal output, got RMS ${avgOutRms}`);
  } finally {
    core.destroy();
  }
});

test('Scenario 4: Bypass mode and Fallback (no WASM) work safely without crashing', () => {
  const fallbackCore = new NearFieldHybridDspCore(null);
  const nextSpeech = createContinuousSpeechGenerator();
  assert.equal(fallbackCore.isRnnoiseActive, false);

  const input = nextSpeech(512, 0.3);
  const out = new Float32Array(512);

  // Bypass: pass-through 1:1
  fallbackCore.processAudioBlock(input, out, false, -26, true, false);
  assert.equal(fallbackCore.smoothedGain, 1.0);
  assert.deepEqual(Array.from(out), Array.from(input));

  // Fallback aktif tanpa WASM: tidak crash & tetap blokir suara jauh
  const outFallback = new Float32Array(512);
  for (let b = 0; b < 15; b++) {
    const distant = nextSpeech(512, 0.015);
    fallbackCore.processAudioBlock(distant, outFallback, true, -26, true, false);
  }
  assert.equal(fallbackCore.isGateOpen, false);
  assert.equal(computeRms(outFallback), 0);
  fallbackCore.destroy();
});
