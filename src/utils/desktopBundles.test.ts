import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  MACOS_STANDALONE_APP_HTML,
  buildMacOSDiskImageDmg,
} from './macosAppBuilder';
import { buildWindowsLauncherZip } from './windowsAppBuilder';

function extractScriptBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

test('MACOS_STANDALONE_APP_HTML embeds valid classic <script> blocks without ESM syntax errors', async () => {
  const scripts = extractScriptBlocks(MACOS_STANDALONE_APP_HTML);
  assert.ok(scripts.length >= 2, `Expected at least 2 script blocks, got ${scripts.length}`);

  // Blok pertama adalah inline RNNoise 0.2 WASM bundle; tidak boleh ada import.meta atau export default
  const rnnoiseScript = scripts[0];
  assert.equal(/import\.meta/.test(rnnoiseScript), false);
  assert.equal(/export\s+default/.test(rnnoiseScript), false);

  // Semua blok JS harus valid saat di-parse sebagai classic <script> (bukan module)
  for (let i = 0; i < scripts.length; i++) {
    assert.doesNotThrow(
      () => new vm.Script(scripts[i], { filename: `standalone-script-${i}.js` }),
      `Script block #${i} failed classic JS syntax validation`
    );
  }

  // Simulasikan eksekusi blok RNNoise WASM dalam sandbox classic browser window
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
    atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
    setTimeout,
    clearTimeout,
    performance,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;

  const compiled = new vm.Script(rnnoiseScript);
  compiled.runInNewContext(sandbox);

  assert.equal(typeof sandbox.__createOpungRnnoiseSync, 'function');
  const mod = (sandbox.__createOpungRnnoiseSync as () => {
    ready?: Promise<unknown>;
    _rnnoise_create(m: number): number;
    _malloc(b: number): number;
    _rnnoise_process_frame(ctx: number, out: number, inp: number): number;
    _free(p: number): void;
    _rnnoise_destroy(ctx: number): void;
  })();
  if (mod.ready) await mod.ready;

  const ctx = mod._rnnoise_create(0);
  const ptr = mod._malloc(480 * 4);
  const vad = mod._rnnoise_process_frame(ctx, ptr, ptr);
  assert.ok(Number.isFinite(vad));
  mod._free(ptr);
  mod._rnnoise_destroy(ctx);
});

test('buildMacOSDiskImageDmg dynamically sizes HFS+ volume cleanly for Hybrid RNNoise WASM bundle', () => {
  const dmgBuf = buildMacOSDiskImageDmg();
  const dmgBytes = new Uint8Array(dmgBuf);
  const dv = new DataView(dmgBuf);

  const htmlBytes = Buffer.byteLength(MACOS_STANDALONE_APP_HTML, 'utf8');
  assert.ok(htmlBytes > 1_800_000, 'Standalone HTML must include full RNNoise 0.2 WASM bundle');
  assert.ok(
    dmgBytes.byteLength > htmlBytes + 4096,
    'DMG image must be larger than embedded HTML payload'
  );

  // Verifikasi HFS+ Primary Volume Header ('H+' 0x482B di offset 1024)
  assert.equal(dv.getUint16(1024, false), 0x482b);
  const blockSize = dv.getUint32(1024 + 40, false);
  const totalBlocks = dv.getUint32(1024 + 44, false);
  const freeBlocks = dv.getUint32(1024 + 48, false);
  assert.equal(blockSize, 4096);
  assert.ok(totalBlocks >= 512, `Expected dynamic totalBlocks >= 512, got ${totalBlocks}`);
  assert.ok(freeBlocks > 0, `Expected positive freeBlocks, got ${freeBlocks}`);

  // Verifikasi Backup Volume Header & UDIF 'koly' Trailer di ujung akhir DMG
  const hfsByteLength = totalBlocks * blockSize;
  assert.equal(dv.getUint16(hfsByteLength - 1024, false), 0x482b);
  assert.equal(dv.getUint32(dmgBytes.byteLength - 512, false), 0x6b6f6c79); // 'koly'
  assert.equal(dv.getUint32(dmgBytes.byteLength - 512 + 36, false), hfsByteLength);
});

test('buildWindowsLauncherZip builds valid PKZIP archive containing RNNoise WASM HTML', () => {
  const zipBuf = buildWindowsLauncherZip();
  const zipBytes = new Uint8Array(zipBuf);
  assert.equal(zipBytes[0], 0x50); // 'P'
  assert.equal(zipBytes[1], 0x4b); // 'K'
  assert.ok(zipBytes.byteLength > 1_900_000);
});
