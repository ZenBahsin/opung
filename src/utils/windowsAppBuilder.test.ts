import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpungIcoBytes,
  buildWindowsLauncherZip,
  getWindowsExeDownloadCandidates,
} from './windowsAppBuilder';
import { MACOS_STANDALONE_APP_HTML } from './macosAppBuilder';
import {
  isVirtualCableLabel,
  isAnyVirtualOrDeprecatedInputLabel,
  isPhysicalSpeakerOrEarphoneLabel,
  formatConnectedVirtualMicBadge,
} from './audioDeviceFilters';

test('buildOpungIcoBytes generates valid multi-size PNG-in-ICO header and entries', () => {
  const ico = buildOpungIcoBytes();
  const dv = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  // Reserved = 0, Type = 1 (.ICO), Image count = 2
  assert.equal(dv.getUint16(0, true), 0);
  assert.equal(dv.getUint16(2, true), 1);
  assert.equal(dv.getUint16(4, true), 2);

  // Entry 0: 128x128
  assert.equal(ico[6], 128);
  assert.equal(ico[7], 128);
  const offset0 = dv.getUint32(6 + 12, true);
  assert.deepEqual(Array.from(ico.subarray(offset0, offset0 + 4)), [137, 80, 78, 71]);

  // Entry 1: 256x256 (stored as 0x0 in ICO spec)
  assert.equal(ico[22], 0);
  assert.equal(ico[23], 0);
  const offset1 = dv.getUint32(22 + 12, true);
  assert.deepEqual(Array.from(ico.subarray(offset1, offset1 + 4)), [137, 80, 78, 71]);
});

test('buildWindowsLauncherZip builds valid ZIP containing Windows launcher, guide, HTML, and ICO', () => {
  const zipBuf = buildWindowsLauncherZip();
  const bytes = new Uint8Array(zipBuf);

  // Local file header signature PK\x03\x04
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);

  const text = new TextDecoder().decode(bytes);
  assert.match(text, /Opung-Windows\/Opung-Windows\.bat/);
  assert.match(text, /Opung-Windows\/CARA-PAKAI-WINDOWS\.txt/);
  assert.match(text, /Opung-Windows\/app\/index\.html/);
  assert.match(text, /Opung-Windows\/app\/Opung\.ico/);
});

test('getWindowsExeDownloadCandidates includes local /Opung-Windows-x64.exe path', () => {
  const candidates = getWindowsExeDownloadCandidates();
  assert.ok(candidates.includes('/Opung-Windows-x64.exe'));
});

test('cross-platform audio device filters classify macOS BlackHole and Windows VB-CABLE safely', () => {
  assert.equal(isVirtualCableLabel('BlackHole 2ch'), true);
  assert.equal(isVirtualCableLabel('CABLE Input (VB-Audio Virtual Cable)'), true);
  assert.equal(isVirtualCableLabel('VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)'), true);
  assert.equal(isVirtualCableLabel('Realtek(R) Audio Speakers'), false);

  // Virtual cables & deprecated Opung drivers must NEVER appear in physical mic input
  assert.equal(isAnyVirtualOrDeprecatedInputLabel('CABLE Output (VB-Audio Virtual Cable)'), true);
  assert.equal(isAnyVirtualOrDeprecatedInputLabel('BlackHole 2ch'), true);
  assert.equal(isAnyVirtualOrDeprecatedInputLabel('MacBook Pro Microphone'), false);
  assert.equal(isAnyVirtualOrDeprecatedInputLabel('Microphone Array (Realtek High Definition Audio)'), false);

  assert.equal(isPhysicalSpeakerOrEarphoneLabel('Speakers (Realtek High Definition Audio)'), true);
  assert.equal(isPhysicalSpeakerOrEarphoneLabel('CABLE Input (VB-Audio Virtual Cable)'), false);

  assert.equal(
    formatConnectedVirtualMicBadge('CABLE Input (VB-Audio Virtual Cable)', true),
    'Terhubung ke VB-CABLE ✓'
  );
  assert.equal(formatConnectedVirtualMicBadge('BlackHole 2ch', false), 'Terhubung ke BlackHole 2ch ✓');
});

test('MACOS_STANDALONE_APP_HTML supports both WebKit (macOS) and WebView2 (Windows) bridges', () => {
  assert.match(MACOS_STANDALONE_APP_HTML, /window\.webkit\.messageHandlers\.opungAudioBridge/);
  assert.match(MACOS_STANDALONE_APP_HTML, /window\.chrome\.webview/);
  assert.match(MACOS_STANDALONE_APP_HTML, /native-virtual-cable/);
  assert.match(MACOS_STANDALONE_APP_HTML, /Terhubung ke VB-CABLE/);
});
