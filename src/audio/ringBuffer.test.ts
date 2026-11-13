import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Float32RingBuffer,
  RNNoiseFramePipeline,
  WORKLET_QUANTUM_SIZE,
  RNNOISE_FRAME_SIZE,
  PCM16_SCALE,
} from './ringBuffer';

test('Float32RingBuffer enforces power-of-two capacity', () => {
  assert.throws(() => new Float32RingBuffer(1000), /Power-of-2/);
  assert.throws(() => new Float32RingBuffer(480), /Power-of-2/);
  const validRing = new Float32RingBuffer(1024);
  assert.equal(validRing.size, 1024);
  assert.equal(validRing.available, 0);
});

test('RNNoiseFramePipeline accumulates 128-sample quantums and triggers 480-sample frame on exact cadence', () => {
  const pipeline = new RNNoiseFramePipeline(2048);
  const inputQuantum = new Float32Array(WORKLET_QUANTUM_SIZE);
  const outputQuantum = new Float32Array(WORKLET_QUANTUM_SIZE);

  // Isi input dengan nilai konstan 0.5
  inputQuantum.fill(0.5);

  const dspIdentity = (frame480: Float32Array): number => {
    // Pastikan di dalam callback, sampel sudah diskalakan ke PCM16 (0.5 * 32768 = 16384)
    assert.equal(frame480.length, RNNOISE_FRAME_SIZE);
    assert.equal(Math.round(frame480[0]), 0.5 * PCM16_SCALE);
    return 0.92; // Mock VAD probability
  };

  // Quantum 1: Input 0 + 128 = 128 (< 480). Output pre-seeded 480 - 128 = 352 sampel.
  const s1 = pipeline.processQuantum(inputQuantum, outputQuantum, dspIdentity);
  assert.equal(s1.rnnoiseTriggered, false);
  assert.equal(s1.inputAvailableAfter, 128);
  assert.equal(s1.outputAvailableAfter, 352);
  assert.equal(s1.underrunOccurred, false);
  assert.equal(outputQuantum[0], 0); // Pre-seeded 480 initial lookahead silence

  // Quantum 2: Input 128 + 128 = 256 (< 480). Output 352 - 128 = 224 sampel.
  const s2 = pipeline.processQuantum(inputQuantum, outputQuantum, dspIdentity);
  assert.equal(s2.rnnoiseTriggered, false);
  assert.equal(s2.inputAvailableAfter, 256);
  assert.equal(s2.outputAvailableAfter, 224);
  assert.equal(s2.underrunOccurred, false);

  // Quantum 3: Input 256 + 128 = 384 (< 480). Output 224 - 128 = 96 sampel.
  const s3 = pipeline.processQuantum(inputQuantum, outputQuantum, dspIdentity);
  assert.equal(s3.rnnoiseTriggered, false);
  assert.equal(s3.inputAvailableAfter, 384);
  assert.equal(s3.outputAvailableAfter, 96);
  assert.equal(s3.underrunOccurred, false);

  // Quantum 4: Input 384 + 128 = 512 (>= 480) -> MEMICU RNNoise!
  // Sisa input: 512 - 480 = 32 sampel.
  // Output ring: 96 + 480 = 576 sampel -> ditarik 128 sampel -> sisa 448 sampel.
  const s4 = pipeline.processQuantum(inputQuantum, outputQuantum, dspIdentity);
  assert.equal(s4.rnnoiseTriggered, true);
  assert.equal(s4.inputAvailableAfter, 32);
  assert.equal(s4.outputAvailableAfter, 448);
  assert.equal(s4.underrunOccurred, false);
  assert.equal(s4.vadProbability, 0.92);

  // Quantum 5: 32 + 128 = 160 sampel (< 480). Output ring: 448 - 128 = 320 sampel.
  // 96 sampel silence terakhir habis di Q4, sehingga Q5 murni berisi sampel 0.5 hasil RNNoise!
  const s5 = pipeline.processQuantum(inputQuantum, outputQuantum, dspIdentity);
  assert.equal(s5.rnnoiseTriggered, false);
  assert.equal(s5.inputAvailableAfter, 160);
  assert.equal(s5.outputAvailableAfter, 320);
  assert.equal(s5.underrunOccurred, false);
  assert.equal(outputQuantum[0], 0.5);
});

test('RNNoiseFramePipeline maintains zero-underrun steady state over 10,000 quantums (~26.6 seconds at 48kHz)', () => {
  const pipeline = new RNNoiseFramePipeline(2048);
  const input = new Float32Array(WORKLET_QUANTUM_SIZE);
  const output = new Float32Array(WORKLET_QUANTUM_SIZE);

  // Buat gelombang sinus uji
  for (let i = 0; i < WORKLET_QUANTUM_SIZE; i++) {
    input[i] = Math.sin((2 * Math.PI * i) / WORKLET_QUANTUM_SIZE) * 0.8;
  }

  let totalUnderruns = 0;
  for (let step = 1; step <= 10000; step++) {
    const snap = pipeline.processQuantum(input, output, (frame) => {
      // Attenuate sebesar 0.5x di domain PCM16
      for (let j = 0; j < frame.length; j++) {
        frame[j] *= 0.5;
      }
      return 0.85;
    });

    if (snap.underrunOccurred) {
      totalUnderruns++;
    }
  }

  assert.equal(totalUnderruns, 0);
  // 10000 * 128 = 1.280.000 sampel -> 1.280.000 / 480 = 2666 frame RNNoise penuh
  assert.equal(pipeline.framesProcessed, Math.floor((10000 * 128) / 480));
});

test('macOS Menu Bar (NSStatusItem), OPUNG Virtual Mic (OPUNG.driver), and Direct .DMG Disk Image verification', async () => {
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const {
    MACOS_STANDALONE_APP_HTML,
    MACOS_NATIVE_OBJC_SOURCE,
    MACOS_NATIVE_LAUNCHER_SH,
    MACOS_INFO_PLIST,
    generateMacOSOneClickInstallerScript,
    buildOpungAppIconIcns,
    buildOpungDmgDsStore,
    buildMacOSDiskImageDmg,
  } = await import('../utils/macosAppBuilder');

  // Pastikan skrip bash RNNoiseStudio & installer bebas dari syntax error (/bin/bash -n)
  fs.writeFileSync('/tmp/opung_test_launcher.sh', MACOS_NATIVE_LAUNCHER_SH);
  fs.writeFileSync('/tmp/opung_test_installer.sh', generateMacOSOneClickInstallerScript());
  execFileSync('/bin/bash', ['-n', '/tmp/opung_test_launcher.sh']);
  execFileSync('/bin/bash', ['-n', '/tmp/opung_test_installer.sh']);

  // Pastikan kode Objective-C menyertakan NSStatusBar (Menu Bar kanan atas macOS) dengan logo OPUNG saja (tanpa teks "OPUNG"), AppIcon.icns untuk Dock, loadOpungInterface setelah izin AVFoundation, dan tetap aktif saat ditutup
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('NSStatusBar systemStatusBar'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('createOpungMenuBarLogoIcon'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('NSImageOnly'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('button.title = @"";'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('toggleMenuBarWindow:'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('windowShouldClose:'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('loadOpungInterface'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('authorizationStatusForMediaType:AVMediaTypeAudio'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('AppIcon.icns'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('setApplicationIconImage:'));

  // Pastikan Info.plist mereferensikan AppIcon.icns
  assert.ok(MACOS_INFO_PLIST.includes('<key>CFBundleIconFile</key>'));
  assert.ok(MACOS_INFO_PLIST.includes('<string>AppIcon.icns</string>'));

  // Pastikan buildOpungAppIconIcns() menghasilkan file Apple Icon Image (.icns) valid dengan header 'icns', 'ic07' (128x128) & 'ic08' (256x256 Retina)
  const icnsBytes = buildOpungAppIconIcns();
  const icnsMagic = new TextDecoder().decode(icnsBytes.subarray(0, 4));
  const icnsType = new TextDecoder().decode(icnsBytes.subarray(8, 12));
  assert.equal(icnsMagic, 'icns');
  assert.equal(icnsType, 'ic07');
  assert.ok(icnsBytes.byteLength > 200000);

  // Pastikan buildOpungDmgDsStore() menghasilkan file .DS_Store (Bud1 + DSDB + bwsp 540x380 + icvp 128pt + Iloc OPUNG.app di kiri & Applications di kanan)
  const dsBytes = buildOpungDmgDsStore();
  assert.equal(dsBytes.byteLength, 15364);
  const dsBud1 = new TextDecoder().decode(dsBytes.subarray(4, 8));
  assert.equal(dsBud1, 'Bud1');
  const dsText = new TextDecoder().decode(dsBytes);
  assert.ok(dsText.includes('{{260, 220}, {540, 380}}'));

  // Pastikan OPUNG.app hanya menggunakan 1 virtual mic resmi (BlackHole 2ch), memfilter OPUNG.driver duplikat, dan mengaktifkan echoGuardDecayDb + echoCancellation: true
  assert.ok(MACOS_STANDALONE_APP_HTML.includes('isDeprecatedOpungDriverLabel'));
  assert.ok(MACOS_STANDALONE_APP_HTML.includes('isAnyVirtualOrDeprecatedInputLabel'));
  assert.ok(MACOS_STANDALONE_APP_HTML.includes('pickBestPhysicalInputDevice'));
  assert.ok(MACOS_STANDALONE_APP_HTML.includes('echoGuardDecayDb'));
  assert.ok(MACOS_STANDALONE_APP_HTML.includes('opungAudioBridge'));
  assert.ok(!MACOS_STANDALONE_APP_HTML.includes('echoCancellation: !loopbackAudible'));

  // Pastikan jembatan CoreAudio HAL Output di Objective-C tersedia untuk menulis langsung ke BlackHole 2ch & membuka mute hardware
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('findAllVirtualAudioDeviceIDs'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('ensureDeviceUnmutedAndFullVolume'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('kAudioUnitSubType_HALOutput'));
  assert.ok(MACOS_NATIVE_OBJC_SOURCE.includes('opungAudioBridge'));

  // Pastikan launcher internal OPUNG.app otomatis menyalin ke /Applications/OPUNG.app, membersihkan OPUNG.driver duplikat, dan memastikan BlackHole2ch.driver siap
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('/Applications/OPUNG.app'));
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('OPUNG_TCC_BRIDGE'));
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('POSIX::setsid()'));
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('com.apple.security.device.audio-input'));
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('rm -rf "/Library/Audio/Plug-Ins/HAL/OPUNG.driver"'));
  assert.ok(MACOS_NATIVE_LAUNCHER_SH.includes('BlackHole2ch.driver'));

  // Pastikan buildMacOSDiskImageDmg() menghasilkan disk image Apple HFS+ + UDIF (.dmg) yang valid dengan .DS_Store, .VolumeIcon.icns, OPUNG.app & symlink Applications
  const dmgBuffer = buildMacOSDiskImageDmg();
  assert.ok(dmgBuffer.byteLength >= 1048576 + 512);
  const dmgBytes = new Uint8Array(dmgBuffer);
  const dmgDv = new DataView(dmgBuffer);

  // Periksa HFSPlusVolumeHeader pada offset 1024: signature 'H+' (0x482B), version 4, fileCount = 10, dan finderInfo[2] = 2 (auto-open window)
  assert.equal(dmgDv.getUint16(1024, false), 0x482b);
  assert.equal(dmgDv.getUint16(1026, false), 4);
  assert.equal(dmgDv.getUint32(1024 + 32, false), 10);
  assert.equal(dmgDv.getUint32(1024 + 88, false), 2);

  // Periksa trailer UDIF 'koly' pada 512 byte terakhir
  const kolySig = new TextDecoder().decode(
    dmgBytes.subarray(dmgBytes.length - 512, dmgBytes.length - 508)
  );
  assert.equal(kolySig, 'koly');

  const dmgText = new TextDecoder().decode(dmgBytes);
  assert.ok(dmgText.includes('RNNoiseStudio'));
  assert.ok(dmgText.includes('/Applications'));
  assert.ok(dmgText.includes('{{260, 220}, {540, 380}}'));
  assert.ok(dmgText.includes('whole disk (Apple_HFS : 0)'));
  assert.ok(!dmgText.includes('Klik 2x Pasang OPUNG.command'));
});




