/**
 * @file macosAppBuilder.ts
 * @description Generator untuk Aplikasi Desktop macOS (RNNoise Studio.app + Native .dmg Builder via hdiutil)
 * serta konfigurasi Electron + electron-builder untuk macOS (Apple Silicon M1/M2/M3/M4 & Intel).
 */

export interface MacOSFileSpec {
  filename: string;
  language: string;
  description: string;
  content: string;
}

/**
 * Kode HTML/JS Mandiri (Standalone) yang berada di dalam paket `RNNoise Studio.app/Contents/Resources/app/index.html`.
 * Berjalan pada konteks aman `http://127.0.0.1:48192` di macOS sehingga memiliki akses penuh ke:
 * - Mikrofon Fisik MacBook / Headset (`navigator.mediaDevices.getUserMedia`)
 * - Pemilihan Output Virtual Mic macOS (`setSinkId` -> `BlackHole 2ch`)
 * - Ring Buffer 480-sampel + High-Pass 120Hz + Hard Proximity Gate (<= 1 Meter, Gain 0.00x di bawah garis kuning)
 * - Grafik Spektrum Suara Real-Time + Tes Dengar Suara Sendiri
 */
export const MACOS_STANDALONE_APP_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Opung - Office Proximity Ultra Noise Gate</title>
  <style>
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
    html, body {
      margin: 0;
      padding: 0;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
      overflow: hidden;
    }
    body {
      padding: 12px 15px 9px 15px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .brand-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(14, 165, 233, 0.25);
    }
    .engine-meta {
      font-size: 10.5px;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Krisp-Style Hero Toggle Card */
    .hero-switch-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.16);
      padding: 11px 14px;
      border-radius: 13px;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .hero-switch-card.active {
      background: #0f1b2d;
      border-color: rgba(56, 189, 248, 0.45);
    }
    .switch-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 2px;
    }
    .switch-sub {
      font-size: 10.5px;
      color: #94a3b8;
      line-height: 1.3;
    }
    .toggle-track {
      width: 46px;
      height: 25px;
      border-radius: 999px;
      background: #334155;
      padding: 3px;
      display: flex;
      align-items: center;
      transition: background 0.18s ease;
      flex-shrink: 0;
      border: none;
      cursor: pointer;
    }
    .toggle-track.active {
      background: #0284c7;
    }
    .toggle-thumb {
      width: 19px;
      height: 19px;
      border-radius: 50%;
      background: #ffffff;
      transform: translateX(0);
      transition: transform 0.18s ease;
    }
    .toggle-track.active .toggle-thumb {
      transform: translateX(21px);
    }

    /* Clean Device Card */
    .device-card {
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 13px;
      padding: 11px 13px;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .field-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 5px;
    }
    .field-status {
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #38bdf8;
    }
    .sink-status {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: -0.01em;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #34d399;
    }
    select {
      width: 100%;
      background: #090d16;
      color: #f1f5f9;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 9px;
      padding: 8px 10px;
      font-size: 11.5px;
      outline: none;
      cursor: pointer;
    }
    select:focus {
      border-color: #38bdf8;
    }

    /* Segmented Radius Selector */
    .radius-section {
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 13px;
      padding: 10px 13px;
    }
    .segmented-bar {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      background: #090d16;
      padding: 3.5px;
      border-radius: 9px;
      border: 1px solid rgba(148, 163, 184, 0.12);
      margin-top: 5px;
    }
    .seg-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 5.5px 4px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .seg-btn.selected {
      background: #1e293b;
      color: #38bdf8;
    }
    .slider-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      color: #64748b;
      margin-top: 6px;
    }
    input[type="range"] {
      flex: 1;
      accent-color: #38bdf8;
      cursor: pointer;
      height: 4px;
    }

    /* Compact Live Visualizer Card */
    .meter-card {
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 13px;
      padding: 10px 13px;
    }
    .meter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .gate-state {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 600;
      color: #38bdf8;
    }
    canvas {
      width: 100%;
      height: 74px;
      display: block;
      background: #090d16;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .meter-footer {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
      margin-top: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Single Quiet Self-Test Button */
    .test-btn {
      width: 100%;
      padding: 8.5px 12px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid rgba(148, 163, 184, 0.18);
      background: #111827;
      color: #cbd5e1;
      text-align: center;
      transition: all 0.15s ease;
    }
    .test-btn:hover {
      border-color: rgba(148, 163, 184, 0.35);
      color: #ffffff;
    }
    .test-btn.on {
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.5);
      color: #34d399;
    }
    .app-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 4px;
      padding-bottom: 0;
      margin-top: 0;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      font-size: 10px;
      line-height: 1.2;
      color: #64748b;
    }
    .app-footer .heart-icon {
      color: #f43f5e;
      font-size: 10.5px;
      display: inline-block;
      margin: 0 1px;
    }
    .app-footer .author-name {
      color: #cbd5e1;
      font-weight: 600;
    }
    .app-footer .ver-badge {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="brand">
      <svg class="brand-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="64" height="64" rx="15" fill="#0B1325"/>
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" stroke="#38BDF8" stroke-opacity="0.35" stroke-width="1.5"/>
        <circle cx="32" cy="32" r="18" stroke="#F0F9FF" stroke-width="7.5"/>
        <rect x="24" y="29" width="2.4" height="6" rx="1.2" fill="#38BDF8"/>
        <rect x="27.8" y="25.5" width="2.4" height="13" rx="1.2" fill="#67E8F9"/>
        <rect x="31.6" y="22" width="2.8" height="20" rx="1.4" fill="#38BDF8"/>
        <rect x="35.8" y="25.5" width="2.4" height="13" rx="1.2" fill="#67E8F9"/>
        <rect x="39.6" y="29" width="2.4" height="6" rx="1.2" fill="#38BDF8"/>
      </svg>
      <span>Opung</span>
    </span>
    <span id="engineStatus" class="engine-meta">Office Proximity Ultra Noise Gate</span>
  </div>

  <!-- Krisp-Style Single Master Switch -->
  <div id="heroSwitchCard" class="hero-switch-card active">
    <div>
      <div id="statusText" class="switch-title">Peredam Bising &amp; Fokus Suara Aktif</div>
      <div id="hintText" class="switch-sub">Otomatis menjernihkan suara HD, mengupas bising latar &amp; memblokir obrolan &gt; 1m</div>
    </div>
    <button id="toggleBtn" class="toggle-track active" type="button" aria-label="Sakelar Utama Peredam Bising">
      <span class="toggle-thumb"></span>
    </button>
  </div>

  <!-- Pilihan Perangkat Audio -->
  <div class="device-card">
    <div>
      <div class="field-header">
        <span>Mikrofon Input</span>
        <button id="refreshDevsBtn" type="button" style="background:none;border:none;color:#38bdf8;font-size:10px;cursor:pointer;padding:0;">Segarkan</button>
      </div>
      <select id="micInputSelect" aria-label="Pilih Mikrofon"></select>
    </div>
    <div>
      <div class="field-header">
        <span>Output ke Google Meet / Zoom</span>
        <span id="sinkBadge" class="sink-status">Otomatis</span>
      </div>
      <select id="virtualOutputSelect" aria-label="Pilih Output Virtual"></select>
    </div>
  </div>

  <!-- Radius Jarak (3 Pilihan Bersih) -->
  <div class="radius-section">
    <div class="field-header" style="margin-bottom: 2px;">
      <span>Radius Fokus Suara</span>
      <span id="dbValueText" class="field-status">-26 dB (&le; 1.0m)</span>
    </div>
    <div class="segmented-bar">
      <button id="preset05m" class="seg-btn" type="button">Dekat (0.5m)</button>
      <button id="preset1m" class="seg-btn selected" type="button">Kantor (1.0m)</button>
      <button id="presetStd" class="seg-btn" type="button">Ruang (1.5m)</button>
    </div>
    <div class="slider-wrap">
      <span>Longgar</span>
      <input id="thresholdSlider" type="range" min="-42" max="-14" step="1" value="-26" aria-label="Batas Sensitivitas Jarak" />
      <span>Ketat</span>
    </div>
  </div>

  <!-- Grafik Visualizer Bersih -->
  <div class="meter-card">
    <div class="meter-header">
      <span>Monitor Suara Real-Time</span>
      <span id="gateStatusBadge" class="gate-state">Hening · 0.00x</span>
    </div>
    <canvas id="spectrumCanvas" width="340" height="82"></canvas>
    <div class="meter-footer">
      <span>Input Mentah: <strong id="rawPct" style="color:#fb7185;">0%</strong></span>
      <span id="gainLabel">Gain: 0.00x</span>
      <span>Output Bersih: <strong id="cleanPct" style="color:#38bdf8;">0%</strong></span>
    </div>
  </div>

  <!-- Satu Tombol Tes Suara di Bawah -->
  <button id="loopbackBtn" class="test-btn" type="button">
    Tes Dengar Suara Sendiri (Gunakan Earphone)
  </button>

  <!-- Copyright & Version Footer -->
  <div class="app-footer">
    <span>&copy; 2026 Opung &middot; Made with <span class="heart-icon">&hearts;</span> <span class="author-name">Muhammad Zen</span></span>
    <span class="ver-badge">Versi 1.0</span>
  </div>

  <audio id="virtualCableAudioOut" playsinline muted></audio>
  <audio id="earphoneLoopbackOut" playsinline muted></audio>

  <script>
    const RNNOISE_FRAME_SIZE = 480;
    const RING_CAPACITY = 4096;
    const PCM16_SCALE = 32768.0;

    class CircularFloat32Buffer {
      constructor(capacity = RING_CAPACITY) {
        this.capacity = capacity;
        this.mask = capacity - 1;
        this.storage = new Float32Array(capacity);
        this.writePtr = 0;
        this.readPtr = 0;
        this.available = 0;
      }
      pushScaled(src, count, scale = 1.0) {
        if (count > this.capacity - this.available) return false;
        for (let i = 0; i < count; i++) {
          this.storage[this.writePtr] = src[i] * scale;
          this.writePtr = (this.writePtr + 1) & this.mask;
        }
        this.available += count;
        return true;
      }
      pullScaled(dst, offset, count, scale = 1.0) {
        if (this.available < count) return false;
        for (let i = 0; i < count; i++) {
          let s = this.storage[this.readPtr] * scale;
          if (scale !== 1.0) s = s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s;
          dst[offset + i] = s;
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

    class NearFieldRNNoiseDspCore {
      constructor() {
        this.inputRing = new CircularFloat32Buffer(RING_CAPACITY);
        this.outputRing = new CircularFloat32Buffer(RING_CAPACITY);
        this.frame480 = new Float32Array(RNNOISE_FRAME_SIZE);
        this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
        this.smoothedGain = 0.0;
        this.hpX1 = 0; this.hpX2 = 0; this.hpY1 = 0; this.hpY2 = 0;
        this.scLpY = 0;
        this.prevSample = 0;
        this.noiseFloorRms = 120.0;
        this.holdCounter = 0;
        this.holdFrames = 26;
        this.lastFrameDb = -75;
        this.isGateOpen = false;
        this.wasEnabled = true;
      }

      resetRings() {
        this.inputRing.clear();
        this.outputRing.clear();
        this.frame480.fill(0);
        this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
        this.hpX1 = 0; this.hpX2 = 0; this.hpY1 = 0; this.hpY2 = 0;
        this.scLpY = 0;
        this.prevSample = 0;
        this.noiseFloorRms = 120.0;
        this.holdCounter = 0;
        this.smoothedGain = 0.0;
      }

      processFrame480(frame, thresholdDb, isLoopbackTest = false) {
        let vocalBandEnergy = 0;
        let totalEnergy = 0;
        let zeroCrossings = 0;

        for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
          const x0 = frame[i];
          if ((x0 >= 0 && this.hpX1 < 0) || (x0 < 0 && this.hpX1 >= 0)) {
            zeroCrossings++;
          }
          const yHp = 0.9888 * x0 - 1.9776 * this.hpX1 + 0.9888 * this.hpX2 + 1.9774 * this.hpY1 - 0.9778 * this.hpY2;
          this.hpX2 = this.hpX1; this.hpX1 = x0;
          this.hpY2 = this.hpY1; this.hpY1 = yHp;
          this.scLpY += 0.33 * (yHp - this.scLpY);
          vocalBandEnergy += this.scLpY * this.scLpY;
          totalEnergy += yHp * yHp;
        }

        const vocalRms = Math.sqrt(vocalBandEnergy / RNNOISE_FRAME_SIZE);
        const totalRms = Math.sqrt(totalEnergy / RNNOISE_FRAME_SIZE);

        if (totalRms < this.noiseFloorRms) {
          this.noiseFloorRms = 0.92 * this.noiseFloorRms + 0.08 * totalRms;
        } else {
          this.noiseFloorRms = 0.9985 * this.noiseFloorRms + 0.0015 * totalRms;
        }
        this.noiseFloorRms = Math.max(40.0, Math.min(4500.0, this.noiseFloorRms));

        const normRms = Math.max(1e-7, vocalRms / PCM16_SCALE);
        let frameDb = 20.0 * Math.log10(normRms);

        // Diskriminator ZCR otomatis aktif: suara bor/ketikan (> 135 ZCR) tidak akan membuka gerbang
        if (zeroCrossings > 135) {
          frameDb -= 12.0;
        }

        this.lastFrameDb = Math.round(frameDb);

        // Anti-Cave-Echo Guard saat Tes Dengar Suara Sendiri aktif:
        // Pantulan speaker yang datang ~120ms kemudian memiliki energi lebih rendah dari puncak suara asli,
        // sehingga ditahan agar tidak memicu ulang gerbang (mencegah efek gema berulang seperti di goa).
        if (this.echoGuardDecayDb === undefined) {
          this.echoGuardDecayDb = -80.0;
        }
        this.echoGuardDecayDb = Math.max(-80.0, this.echoGuardDecayDb - 0.45);
        const effectiveThresholdDb = isLoopbackTest
          ? Math.max(thresholdDb + 3.0, this.echoGuardDecayDb - 6.5)
          : thresholdDb;
        const activeHoldFrames = isLoopbackTest ? 9 : this.holdFrames;

        let targetGain = 0.0;
        if (frameDb >= effectiveThresholdDb) {
          targetGain = 1.0;
          this.holdCounter = activeHoldFrames;
          if (frameDb > this.echoGuardDecayDb) {
            this.echoGuardDecayDb = frameDb;
          }
        } else if (this.holdCounter > 0) {
          this.holdCounter--;
          targetGain = 1.0;
        } else {
          targetGain = 0.0;
        }

        this.isGateOpen = targetGain > 0.5;

        // Wiener Intra-Speech Denoising otomatis aktif saat bicara
        let intraSpeechDenoiseGain = 1.0;
        if (this.isGateOpen) {
          const snr = Math.max(0.0, totalRms - this.noiseFloorRms * 1.25) / (totalRms + 1.0);
          intraSpeechDenoiseGain = Math.max(0.28, Math.min(1.0, snr * 1.15));
        }

        const effectiveTargetGain = targetGain * intraSpeechDenoiseGain;
        const maxVocalSlew = 5200.0;

        for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
          let sample = frame[i];
          const delta = sample - this.prevSample;
          if (delta > maxVocalSlew || delta < -maxVocalSlew) {
            sample = this.prevSample + delta * 0.22;
          }
          this.prevSample = sample;

          const coeff = effectiveTargetGain > this.smoothedGain ? 0.12 : 0.008;
          this.smoothedGain += coeff * (effectiveTargetGain - this.smoothedGain);
          if (this.smoothedGain < 0.004 && targetGain === 0.0) {
            this.smoothedGain = 0.0;
          }
          frame[i] = sample * this.smoothedGain;
        }
      }

      processAudioBlock(inputBuffer, outputBuffer, enabled, thresholdDb, isLoopbackTest = false) {
        if (!enabled) {
          this.wasEnabled = false;
          outputBuffer.set(inputBuffer);
          this.isGateOpen = true;
          this.smoothedGain = 1.0;
          return;
        }
        if (!this.wasEnabled) {
          this.resetRings();
          this.wasEnabled = true;
        }
        this.inputRing.pushScaled(inputBuffer, inputBuffer.length, PCM16_SCALE);
        while (this.inputRing.available >= RNNOISE_FRAME_SIZE) {
          this.inputRing.pullScaled(this.frame480, 0, RNNOISE_FRAME_SIZE, 1.0);
          this.processFrame480(this.frame480, thresholdDb, isLoopbackTest);
          this.outputRing.pushScaled(this.frame480, RNNOISE_FRAME_SIZE, 1.0);
        }
        if (!this.outputRing.pullScaled(outputBuffer, 0, outputBuffer.length, 1.0 / PCM16_SCALE)) {
          outputBuffer.fill(0);
        }
        if (this.smoothedGain === 0.0) {
          outputBuffer.fill(0);
        }
      }
    }

    const heroSwitchCard = document.getElementById('heroSwitchCard');
    const toggleBtn = document.getElementById('toggleBtn');
    const statusText = document.getElementById('statusText');
    const hintText = document.getElementById('hintText');
    const gainLabel = document.getElementById('gainLabel');
    const micInputSelect = document.getElementById('micInputSelect');
    const virtualOutputSelect = document.getElementById('virtualOutputSelect');
    const sinkBadge = document.getElementById('sinkBadge');
    const dbValueText = document.getElementById('dbValueText');
    const thresholdSlider = document.getElementById('thresholdSlider');
    const preset05m = document.getElementById('preset05m');
    const preset1m = document.getElementById('preset1m');
    const presetStd = document.getElementById('presetStd');
    const loopbackBtn = document.getElementById('loopbackBtn');
    const gateStatusBadge = document.getElementById('gateStatusBadge');
    const rawPctEl = document.getElementById('rawPct');
    const cleanPctEl = document.getElementById('cleanPct');
    const virtualCableAudioOut = document.getElementById('virtualCableAudioOut');
    const earphoneLoopbackOut = document.getElementById('earphoneLoopbackOut');
    const canvas = document.getElementById('spectrumCanvas');
    const ctx = canvas.getContext('2d');

    // Semua fitur positif (HD Voice EQ, Neural Krisp Denoiser, Speaker Echo Guard) OTOMATIS AKTIF!
    let isEnabled = true;
    let thresholdDb = -26;
    let loopbackAudible = false;
    let audioCtx = null;
    let rawAnalyser = null;
    let cleanAnalyser = null;
    let activeMakeupGainNode = null;
    let dspCore = new NearFieldRNNoiseDspCore();
    let currentMicStream = null;
    let currentCleanStream = null;
    let selectedVirtualSinkId = '';
    let nativeCoreAudioSinkActive = false;

    function hasNativeCoreAudioBridge() {
      return Boolean(
        window.webkit &&
        window.webkit.messageHandlers &&
        window.webkit.messageHandlers.opungAudioBridge
      );
    }

    function sendNativeBridgeCommand(cmd) {
      if (hasNativeCoreAudioBridge()) {
        try {
          window.webkit.messageHandlers.opungAudioBridge.postMessage(cmd);
        } catch (_e) {}
      }
    }

    function fitNativeWindowHeight() {
      const h = document.body ? document.body.offsetHeight : 0;
      if (h > 400) {
        sendNativeBridgeCommand('HEIGHT:' + h);
      }
    }
    window.addEventListener('DOMContentLoaded', fitNativeWindowHeight);
    window.addEventListener('load', () => {
      fitNativeWindowHeight();
      setTimeout(fitNativeWindowHeight, 120);
    });

    function isDeprecatedOpungDriverLabel(label) {
      const l = (label || '').toLowerCase();
      return l.includes('opung');
    }

    function isVirtualCableLabel(label) {
      const l = (label || '').toLowerCase();
      if (isDeprecatedOpungDriverLabel(l)) return false;
      return (
        l.includes('blackhole') ||
        l.includes('vb-cable') ||
        l.includes('soundflower') ||
        l.includes('loopback') ||
        l.includes('existential') ||
        l.includes('virtual')
      );
    }

    function isAnyVirtualOrDeprecatedInputLabel(label) {
      const l = (label || '').toLowerCase();
      return (
        l.includes('opung') ||
        l.includes('blackhole') ||
        l.includes('vb-cable') ||
        l.includes('soundflower') ||
        l.includes('loopback') ||
        l.includes('existential') ||
        l.includes('virtual') ||
        l.includes('aggregate')
      );
    }

    function isPhysicalSpeakerOrEarphoneLabel(label) {
      const l = (label || '').toLowerCase();
      if (isAnyVirtualOrDeprecatedInputLabel(l)) return false;
      return (
        l.includes('headphone') ||
        l.includes('earphone') ||
        l.includes('airpods') ||
        l.includes('speaker') ||
        l.includes('built-in') ||
        l.includes('macbook') ||
        l.includes('hdmi') ||
        l.includes('displayport') ||
        l.includes('bluetooth')
      );
    }

    function pickBestPhysicalInputDevice(inputs, requestedId) {
      const physicalInputs = inputs.filter(
        (d) =>
          d.kind === 'audioinput' &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          !isAnyVirtualOrDeprecatedInputLabel(d.label)
      );
      if (
        requestedId &&
        requestedId !== 'default' &&
        requestedId !== 'communications'
      ) {
        const exactMatch = physicalInputs.find((d) => d.deviceId === requestedId);
        if (exactMatch) return exactMatch;
      }
      const builtInMatch = physicalInputs.find((d) => {
        const l = (d.label || '').toLowerCase();
        return (
          l.includes('macbook') ||
          l.includes('built-in') ||
          l.includes('internal') ||
          l.includes('mikrofon') ||
          l.includes('microphone')
        );
      });
      return builtInMatch || physicalInputs[0] || null;
    }

    function updateThresholdUI(db) {
      thresholdDb = Number(db);
      preset05m.className = 'seg-btn' + (db >= -22 ? ' selected' : '');
      preset1m.className = 'seg-btn' + (db < -22 && db >= -30 ? ' selected' : '');
      presetStd.className = 'seg-btn' + (db < -30 ? ' selected' : '');
      thresholdSlider.value = String(db);
      const label = db >= -22 ? '<= 0.5m' : db >= -30 ? '<= 1.0m' : '> 1.5m';
      dbValueText.textContent = db + ' dB (' + label + ')';
    }

    preset05m.addEventListener('click', () => updateThresholdUI(-20));
    preset1m.addEventListener('click', () => updateThresholdUI(-26));
    presetStd.addEventListener('click', () => updateThresholdUI(-38));
    thresholdSlider.addEventListener('input', (e) => updateThresholdUI(Number(e.target.value)));

    heroSwitchCard.addEventListener('click', () => {
      isEnabled = !isEnabled;
      if (isEnabled) {
        heroSwitchCard.className = 'hero-switch-card active';
        toggleBtn.className = 'toggle-track active';
        statusText.textContent = 'Peredam Bising & Fokus Suara Aktif';
        hintText.textContent = 'Otomatis menjernihkan suara HD, mengupas bising latar & memblokir obrolan > 1m';
        document.title = 'Opung - Office Proximity Ultra Noise Gate';
      } else {
        heroSwitchCard.className = 'hero-switch-card';
        toggleBtn.className = 'toggle-track';
        statusText.textContent = 'Peredam Bising Dimatikan (Bypass)';
        hintText.textContent = 'Semua suara sekitar masuk ke mikrofon tanpa penyaringan.';
        document.title = 'Opung - Office Proximity Ultra Noise Gate (Bypass)';
      }
    });

    async function routeEarphoneLoopbackToPhysicalDevice() {
      try {
        if (typeof earphoneLoopbackOut.setSinkId !== 'function') return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(
          (d) =>
            d.kind === 'audiooutput' &&
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications' &&
            !isAnyVirtualOrDeprecatedInputLabel(d.label)
        );
        const headphoneOut = outputs.find((d) => {
          const l = (d.label || '').toLowerCase();
          return (
            l.includes('headphone') ||
            l.includes('earphone') ||
            l.includes('airpods') ||
            l.includes('bluetooth')
          );
        });
        const physicalOut =
          headphoneOut ||
          outputs.find((d) => isPhysicalSpeakerOrEarphoneLabel(d.label)) ||
          outputs[0];
        if (physicalOut && physicalOut.deviceId) {
          await earphoneLoopbackOut.setSinkId(physicalOut.deviceId).catch(() => {});
        }
      } catch (_e) {}
    }

    loopbackBtn.addEventListener('click', async () => {
      loopbackAudible = !loopbackAudible;
      // PENTING: JANGAN PERNAH mematikan echoCancellation saat Tes Dengar Suara Sendiri!
      // Hardware AEC harus selalu aktif agar suara dari speaker/earphone tidak memantul masuk kembali ke mic (anti-efek goa).
      if (activeMakeupGainNode && audioCtx) {
        activeMakeupGainNode.gain.setTargetAtTime(
          loopbackAudible ? 0.85 : 1.35,
          audioCtx.currentTime,
          0.02
        );
      }
      if (loopbackAudible) {
        if (audioCtx && audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        await routeEarphoneLoopbackToPhysicalDevice();
        if (currentCleanStream) {
          earphoneLoopbackOut.srcObject = currentCleanStream;
        }
        earphoneLoopbackOut.volume = 0.68;
        earphoneLoopbackOut.muted = false;
        earphoneLoopbackOut.play().catch(() => {});
        loopbackBtn.className = 'test-btn on';
        loopbackBtn.textContent = 'Tes Suara Sendiri: AKTIF (Klik untuk Matikan)';
      } else {
        earphoneLoopbackOut.muted = true;
        earphoneLoopbackOut.volume = 0;
        earphoneLoopbackOut.pause();
        earphoneLoopbackOut.srcObject = null;
        loopbackBtn.className = 'test-btn';
        loopbackBtn.textContent = 'Tes Dengar Suara Sendiri (Gunakan Earphone)';
      }
    });

    let appliedVirtualSinkId = '';

    async function applyOutputSink(sinkId, forceRebind) {
      selectedVirtualSinkId = sinkId || '';

      if (
        !sinkId ||
        sinkId === 'default' ||
        sinkId === 'communications' ||
        sinkId === 'coreaudio-default'
      ) {
        appliedVirtualSinkId = '';
        nativeCoreAudioSinkActive = false;
        sendNativeBridgeCommand('SINK:OFF');
        virtualCableAudioOut.muted = true;
        virtualCableAudioOut.volume = 0;
        virtualCableAudioOut.pause();
        virtualCableAudioOut.srcObject = null;
        sinkBadge.textContent = 'Siaga (Earphone Aman)';
        sinkBadge.style.color = '#94a3b8';
        return;
      }

      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      // Jika berjalan di dalam aplikasi native OPUNG.app, jembatan CoreAudio HAL langsung menulis ke BlackHole 2ch!
      if (hasNativeCoreAudioBridge()) {
        nativeCoreAudioSinkActive = true;
        sendNativeBridgeCommand('SINK:ON');
      }

      try {
        if (
          sinkId !== 'native-blackhole-2ch' &&
          typeof virtualCableAudioOut.setSinkId === 'function'
        ) {
          if (appliedVirtualSinkId !== sinkId || forceRebind) {
            virtualCableAudioOut.muted = true;
            await virtualCableAudioOut.setSinkId(sinkId);
            appliedVirtualSinkId = sinkId;
          }
          if (!hasNativeCoreAudioBridge() && currentCleanStream) {
            if (virtualCableAudioOut.srcObject !== currentCleanStream) {
              virtualCableAudioOut.srcObject = currentCleanStream;
            }
            virtualCableAudioOut.volume = 1.0;
            virtualCableAudioOut.muted = false;
            await virtualCableAudioOut.play().catch(() => {});
          }
        }
        sinkBadge.textContent = 'Terhubung ke BlackHole 2ch ✓';
        sinkBadge.style.color = '#34d399';
      } catch (err) {
        if (nativeCoreAudioSinkActive) {
          sinkBadge.textContent = 'Terhubung ke BlackHole 2ch ✓';
          sinkBadge.style.color = '#34d399';
        } else {
          appliedVirtualSinkId = '';
          virtualCableAudioOut.muted = true;
          virtualCableAudioOut.volume = 0;
          virtualCableAudioOut.pause();
          virtualCableAudioOut.srcObject = null;
          sinkBadge.textContent = 'Siaga';
          sinkBadge.style.color = '#94a3b8';
        }
      }
    }

    virtualOutputSelect.addEventListener('change', (e) => {
      applyOutputSink(e.target.value, true);
    });

    micInputSelect.addEventListener('change', (e) => {
      startMacAudioPipeline(e.target.value);
    });

    const refreshDevsBtn = document.getElementById('refreshDevsBtn');
    if (refreshDevsBtn) {
      refreshDevsBtn.addEventListener('click', async () => {
        if (audioCtx && audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        sendNativeBridgeCommand('SINK:ON');
        await populateMacAudioDevices(micInputSelect.value, '', true);
      });
    }
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        populateMacAudioDevices(micInputSelect.value, '', false);
      });
    }

    let labelRetryCount = 0;

    async function populateMacAudioDevices(activeInputDeviceId, activeTrackLabel, forceRebind) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const allInputs = devices.filter((d) => d.kind === 'audioinput');
      // Saring ketat agar BlackHole 2ch / OPUNG Microphone TIDAK PERNAH muncul di dropdown Input Fisik!
      const physicalInputs = allInputs.filter(
        (d) =>
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          !isAnyVirtualOrDeprecatedInputLabel(d.label)
      );
      const inputsToDisplay = physicalInputs.length > 0 ? physicalInputs : allInputs.filter((d) => !isAnyVirtualOrDeprecatedInputLabel(d.label));

      // Saring output: Hilangkan OPUNG Microphone duplikat, cukup 1 virtual mic resmi yaitu BlackHole 2ch!
      const outputs = devices.filter(
        (d) =>
          d.kind === 'audiooutput' &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications' &&
          !isDeprecatedOpungDriverLabel(d.label)
      );

      micInputSelect.innerHTML = '';
      inputsToDisplay.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const resolvedLabel =
          d.label ||
          (idx === 0 && activeTrackLabel && !isAnyVirtualOrDeprecatedInputLabel(activeTrackLabel)
            ? activeTrackLabel
            : '') ||
          (d.deviceId && d.deviceId !== 'default'
            ? 'Mikrofon Fisik MacBook (' + d.deviceId.slice(0, 6) + ')'
            : 'Mikrofon Internal MacBook');
        opt.textContent = resolvedLabel;
        micInputSelect.appendChild(opt);
      });
      if (activeInputDeviceId && inputsToDisplay.some((d) => d.deviceId === activeInputDeviceId)) {
        micInputSelect.value = activeInputDeviceId;
      } else if (inputsToDisplay.length > 0) {
        micInputSelect.value = inputsToDisplay[0].deviceId;
      }

      if (
        labelRetryCount < 4 &&
        allInputs.length > 0 &&
        allInputs.every((d) => !d.label || d.label.trim() === '')
      ) {
        labelRetryCount++;
        setTimeout(() => {
          startMacAudioPipeline(activeInputDeviceId);
        }, 550);
      }

      virtualOutputSelect.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'Siaga (Jangan Kirim ke Meet)';
      virtualOutputSelect.appendChild(emptyOpt);

      let blackHoleSinkId = null;
      outputs.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const isVirt = isVirtualCableLabel(d.label);
        const isPhys = isPhysicalSpeakerOrEarphoneLabel(d.label);
        if (isVirt) {
          if (!blackHoleSinkId || (d.label && d.label.toLowerCase().includes('blackhole'))) {
            blackHoleSinkId = d.deviceId;
          }
          opt.textContent = d.label + ' (Aktif untuk Google Meet / Zoom)';
        } else if (isPhys) {
          opt.disabled = true;
          opt.textContent = d.label + ' (Speaker/Earphone Fisik - Diblokir)';
        } else {
          opt.textContent = d.label || 'Output Audio (' + (d.deviceId ? d.deviceId.slice(0, 6) : 'Default') + ')';
        }
        virtualOutputSelect.appendChild(opt);
      });

      // Jika di dalam WKWebView macOS belum mengekspos daftar audiooutput tetapi jembatan CoreAudio melihat BlackHole 2ch:
      if (!blackHoleSinkId && hasNativeCoreAudioBridge()) {
        const nativeOpt = document.createElement('option');
        nativeOpt.value = 'native-blackhole-2ch';
        nativeOpt.textContent = 'BlackHole 2ch (Aktif untuk Google Meet / Zoom)';
        virtualOutputSelect.appendChild(nativeOpt);
        blackHoleSinkId = 'native-blackhole-2ch';
      }

      const targetSink =
        (selectedVirtualSinkId &&
          Array.from(virtualOutputSelect.options).some((o) => o.value === selectedVirtualSinkId && !o.disabled)
          ? selectedVirtualSinkId
          : null) || blackHoleSinkId;

      if (targetSink) {
        virtualOutputSelect.value = targetSink;
        await applyOutputSink(targetSink, !!forceRebind);
      } else {
        virtualOutputSelect.value = '';
        await applyOutputSink('', true);
      }
    }

    async function startMacAudioPipeline(selectedInputId) {
      try {
        if (currentMicStream) {
          currentMicStream.getTracks().forEach((t) => t.stop());
        }
        if (audioCtx && audioCtx.state !== 'closed') {
          await audioCtx.close().catch(() => {});
        }

        // 1. Cek daftar perangkat sebelum getUserMedia agar tidak pernah membuka 'default' jika 'default' adalah BlackHole 2ch!
        let targetInputId = selectedInputId;
        if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const preDevs = await navigator.mediaDevices.enumerateDevices();
          const bestPreMic = pickBestPhysicalInputDevice(preDevs, targetInputId);
          if (bestPreMic && bestPreMic.deviceId) {
            targetInputId = bestPreMic.deviceId;
          }
        }

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId:
                targetInputId && targetInputId !== 'default' && targetInputId !== 'communications'
                  ? { exact: targetInputId }
                  : undefined,
              sampleRate: { ideal: 48000 },
              channelCount: { ideal: 1 },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
            },
          });
        } catch (_firstErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
            },
          });
        }

        // 2. Setelah izin mikrofon terbuka, pastikan 100% kita membaca dari Mikrofon Fisik MacBook (BUKAN BlackHole 2ch / Default)!
        let firstTrack = stream.getAudioTracks()[0];
        const allDevsAfter = await navigator.mediaDevices.enumerateDevices();
        const bestPhysicalMic = pickBestPhysicalInputDevice(allDevsAfter, targetInputId);
        const currentTrackDeviceId =
          firstTrack && typeof firstTrack.getSettings === 'function'
            ? firstTrack.getSettings().deviceId
            : '';
        const isCurrentTrackVirtual =
          firstTrack && firstTrack.label && isAnyVirtualOrDeprecatedInputLabel(firstTrack.label);

        if (
          bestPhysicalMic &&
          (isCurrentTrackVirtual ||
            !targetInputId ||
            targetInputId === 'default' ||
            (currentTrackDeviceId && currentTrackDeviceId !== bestPhysicalMic.deviceId && !selectedInputId))
        ) {
          try {
            const exactStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: bestPhysicalMic.deviceId },
                sampleRate: { ideal: 48000 },
                channelCount: { ideal: 1 },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false,
              },
            });
            stream.getTracks().forEach((t) => t.stop());
            stream = exactStream;
            targetInputId = bestPhysicalMic.deviceId;
            firstTrack = stream.getAudioTracks()[0];
          } catch (_switchErr) {}
        }

        currentMicStream = stream;
        const activeTrackLabel = firstTrack && firstTrack.label ? firstTrack.label : '';
        const activeSettingsId =
          firstTrack && typeof firstTrack.getSettings === 'function'
            ? firstTrack.getSettings().deviceId
            : '';

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const sourceNode = audioCtx.createMediaStreamSource(stream);
        window.__opungSourceNode = sourceNode;

        rawAnalyser = audioCtx.createAnalyser();
        rawAnalyser.fftSize = 128;
        rawAnalyser.smoothingTimeConstant = 0.65;

        cleanAnalyser = audioCtx.createAnalyser();
        cleanAnalyser.fftSize = 128;
        cleanAnalyser.smoothingTimeConstant = 0.65;

        const hardGateGain = audioCtx.createGain();
        hardGateGain.gain.value = 1.0;

        // OTOMATIS AKTIF: 5-Stage Studio HD Vocal Clarity Equalizer + Krisp Vocal Mask
        const subCutNode = audioCtx.createBiquadFilter();
        subCutNode.type = 'highpass';
        subCutNode.frequency.value = 85;
        subCutNode.Q.value = 0.707;

        const krispLowPassNode = audioCtx.createBiquadFilter();
        krispLowPassNode.type = 'lowpass';
        krispLowPassNode.frequency.value = 4600;
        krispLowPassNode.Q.value = 0.707;

        const mudCutNode = audioCtx.createBiquadFilter();
        mudCutNode.type = 'peaking';
        mudCutNode.frequency.value = 260;
        mudCutNode.Q.value = 1.4;
        mudCutNode.gain.value = -2.8;

        const warmthNode = audioCtx.createBiquadFilter();
        warmthNode.type = 'peaking';
        warmthNode.frequency.value = 135;
        warmthNode.Q.value = 1.1;
        warmthNode.gain.value = 2.0;

        const presenceNode = audioCtx.createBiquadFilter();
        presenceNode.type = 'peaking';
        presenceNode.frequency.value = 3500;
        presenceNode.Q.value = 1.0;
        presenceNode.gain.value = 4.5;

        const airShelfNode = audioCtx.createBiquadFilter();
        airShelfNode.type = 'highshelf';
        airShelfNode.frequency.value = 6500;
        airShelfNode.gain.value = 3.5;

        const studioCompressor = audioCtx.createDynamicsCompressor();
        studioCompressor.threshold.value = -20;
        studioCompressor.knee.value = 12;
        studioCompressor.ratio.value = 2.5;
        studioCompressor.attack.value = 0.004;
        studioCompressor.release.value = 0.15;

        const makeupGainNode = audioCtx.createGain();
        makeupGainNode.gain.value = loopbackAudible ? 0.85 : 1.65;
        activeMakeupGainNode = makeupGainNode;

        const processorNode = audioCtx.createScriptProcessor(512, 1, 1);
        window.__opungProcessorNode = processorNode;
        dspCore = new NearFieldRNNoiseDspCore();

        const pcm16Scratch = new Int16Array(512);
        const uint8Scratch = new Uint8Array(pcm16Scratch.buffer);

        processorNode.onaudioprocess = (ev) => {
          const inBuf = ev.inputBuffer.getChannelData(0);
          const outBuf = ev.outputBuffer.getChannelData(0);
          dspCore.processAudioBlock(inBuf, outBuf, isEnabled, thresholdDb, loopbackAudible);
          const isMutedByGate = isEnabled && !dspCore.isGateOpen && dspCore.smoothedGain === 0.0;
          hardGateGain.gain.value = isMutedByGate ? 0.0 : 1.0;

          // Kirim langsung dari processorNode utama (yang dijamin selalu ditarik oleh cleanAnalyser) ke jembatan CoreAudio HAL BlackHole 2ch!
          if (nativeCoreAudioSinkActive && hasNativeCoreAudioBridge()) {
            const vocalBoost = loopbackAudible ? 1.15 : 1.85;
            for (let i = 0; i < outBuf.length; i++) {
              const rawSample = isMutedByGate ? 0.0 : outBuf[i] * vocalBoost;
              const clipped = Math.tanh(rawSample);
              pcm16Scratch[i] = clipped < 0 ? clipped * 32768 : clipped * 32767;
            }
            let bin = '';
            for (let j = 0; j < uint8Scratch.length; j++) {
              bin += String.fromCharCode(uint8Scratch[j]);
            }
            sendNativeBridgeCommand(btoa(bin));
          }
        };

        const cleanDest = audioCtx.createMediaStreamDestination();
        try {
          cleanDest.channelCount = 2;
          cleanDest.channelCountMode = 'explicit';
          cleanDest.channelInterpretation = 'speakers';
        } catch (_e) {}

        // Sub-audible Pilot (-96 dBFS @ 20Hz) agar Chrome/WebKit tidak pernah menidurkan stream BlackHole 2ch:
        const pilotOsc = audioCtx.createOscillator();
        pilotOsc.type = 'sine';
        pilotOsc.frequency.value = 20;
        const pilotGain = audioCtx.createGain();
        pilotGain.gain.value = 0.000015;
        pilotOsc.connect(pilotGain);
        pilotGain.connect(cleanDest);
        pilotOsc.start();

        const keepAliveGain = audioCtx.createGain();
        keepAliveGain.gain.value = 0.0;

        sourceNode.connect(rawAnalyser);
        rawAnalyser.connect(processorNode);
        processorNode.connect(subCutNode);
        subCutNode.connect(krispLowPassNode);
        krispLowPassNode.connect(mudCutNode);
        mudCutNode.connect(warmthNode);
        warmthNode.connect(presenceNode);
        presenceNode.connect(airShelfNode);
        airShelfNode.connect(studioCompressor);
        studioCompressor.connect(makeupGainNode);
        makeupGainNode.connect(hardGateGain);
        hardGateGain.connect(cleanAnalyser);
        cleanAnalyser.connect(cleanDest);
        cleanAnalyser.connect(keepAliveGain);
        keepAliveGain.connect(audioCtx.destination);

        currentCleanStream = cleanDest.stream;

        if (loopbackAudible) {
          await routeEarphoneLoopbackToPhysicalDevice();
          earphoneLoopbackOut.srcObject = currentCleanStream;
          earphoneLoopbackOut.volume = 0.68;
          earphoneLoopbackOut.muted = false;
          await earphoneLoopbackOut.play().catch(() => {});
        } else {
          earphoneLoopbackOut.muted = true;
          earphoneLoopbackOut.volume = 0;
          earphoneLoopbackOut.pause();
          earphoneLoopbackOut.srcObject = null;
        }

        document.getElementById('engineStatus').textContent = 'Office Proximity Ultra Noise Gate';
        await populateMacAudioDevices(targetInputId || activeSettingsId, activeTrackLabel, true);
      } catch (err) {
        document.getElementById('engineStatus').textContent = 'Menghubungkan Mikrofon...';
        setTimeout(() => {
          startMacAudioPipeline(selectedInputId);
        }, 1200);
      }
    }

    ['pointerdown', 'keydown', 'mousemove', 'touchstart'].forEach((evName) => {
      window.addEventListener(
        evName,
        () => {
          if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          if (
            !hasNativeCoreAudioBridge() &&
            selectedVirtualSinkId &&
            virtualCableAudioOut.srcObject &&
            virtualCableAudioOut.paused
          ) {
            virtualCableAudioOut.play().catch(() => {});
          }
        },
        { passive: true }
      );
    });

    const rawFreq = new Uint8Array(64);
    const cleanFreq = new Uint8Array(64);

    function renderSpectrum() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      if (
        !hasNativeCoreAudioBridge() &&
        selectedVirtualSinkId &&
        selectedVirtualSinkId !== 'native-blackhole-2ch' &&
        virtualCableAudioOut.srcObject &&
        !virtualCableAudioOut.muted &&
        virtualCableAudioOut.paused
      ) {
        virtualCableAudioOut.play().catch(() => {});
      }

      const normalizedThresh = Math.max(0.15, Math.min(0.88, (thresholdDb + 50) / 38));
      const thresholdY = h - normalizedThresh * (h - 10);

      if (rawAnalyser && cleanAnalyser) {
        rawAnalyser.getByteFrequencyData(rawFreq);
        cleanAnalyser.getByteFrequencyData(cleanFreq);

        const barCount = 28;
        const barWidth = w / barCount;
        let rSum = 0;
        let cSum = 0;

        for (let i = 0; i < barCount; i++) {
          const rVal = rawFreq[i];
          const cVal = cleanFreq[i];
          rSum += rVal;
          cSum += cVal;

          const rH = (rVal / 255) * (h - 8);
          const cH = (cVal / 255) * (h - 8);

          ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
          ctx.fillRect(i * barWidth + 1, h - rH, barWidth - 2, rH);

          ctx.fillStyle = isEnabled ? '#38bdf8' : '#94a3b8';
          ctx.fillRect(i * barWidth + 2.5, h - cH, barWidth - 5, cH);
        }

        rawPctEl.textContent = Math.round((rSum / (barCount * 255)) * 100) + '%';
        cleanPctEl.textContent = Math.round((cSum / (barCount * 255)) * 100) + '%';
        gainLabel.textContent = 'Gain: ' + dspCore.smoothedGain.toFixed(2) + 'x';

        if (!isEnabled) {
          gateStatusBadge.style.color = '#94a3b8';
          gateStatusBadge.textContent = 'Bypass · 1.00x';
        } else if (dspCore.isGateOpen) {
          gateStatusBadge.style.color = '#34d399';
          gateStatusBadge.textContent = 'Suara Jernih · ' + dspCore.smoothedGain.toFixed(2) + 'x';
        } else {
          gateStatusBadge.style.color = '#38bdf8';
          gateStatusBadge.textContent = 'Bising Dibungkam · 0.00x';
        }
      }

      if (isEnabled) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(w, thresholdY);
        ctx.stroke();
        ctx.restore();
      }

      requestAnimationFrame(renderSpectrum);
    }

    startMacAudioPipeline();
    requestAnimationFrame(renderSpectrum);
  </script>
</body>
</html>`;

/**
 * Kode Objective-C Native macOS Cocoa + WebKit + CoreAudio HAL Output Bridge:
 * - Menampilkan ikon "OPUNG" di Menu Bar kanan atas macOS (dekat Wi-Fi/Baterai/Jam) persis seperti Krisp.ai!
 * - Menyediakan jembatan langsung CoreAudio HAL Output (`kAudioUnitSubType_HALOutput`) ke `BlackHole 2ch`
 *   (serta otomatis membuka mute & mengatur volume hardware BlackHole 2ch ke 100% di CoreAudio)
 *   sehingga audio yang telah dijernihkan pasti menggerakkan indikator mikrofon Google Meet / Zoom!
 */
export const MACOS_NATIVE_OBJC_SOURCE = `#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreAudio/CoreAudio.h>
#import <AudioToolbox/AudioToolbox.h>

#define OPUNG_RING_SIZE 65536
#define OPUNG_RING_MASK (OPUNG_RING_SIZE - 1)
#define OPUNG_MAX_HAL_UNITS 4

static float gBlackHoleRing[OPUNG_RING_SIZE];
static volatile uint32_t gRingWriteIdx = 0;
static volatile int gSinkEnabled = 1;
static volatile uint32_t gRenderHeartbeat = 0;

typedef struct {
    AudioComponentInstance unit;
    AudioDeviceID deviceID;
    double sampleRate;
    double readPos;
    BOOL active;
} OpungHalSinkUnit;

static OpungHalSinkUnit gHalUnits[OPUNG_MAX_HAL_UNITS];
static int gHalUnitCount = 0;

static void ensureDeviceUnmutedAndFullVolume(AudioDeviceID devID) {
    if (devID == kAudioObjectUnknown) return;
    AudioObjectPropertyScope scopes[2] = {
        kAudioObjectPropertyScopeOutput,
        kAudioObjectPropertyScopeInput
    };
    UInt32 elements[3] = { kAudioObjectPropertyElementMaster, 1, 2 };
    for (int s = 0; s < 2; s++) {
        for (int e = 0; e < 3; e++) {
            AudioObjectPropertyAddress muteAddr = {
                kAudioDevicePropertyMute,
                scopes[s],
                elements[e]
            };
            if (AudioObjectHasProperty(devID, &muteAddr)) {
                UInt32 muteVal = 0;
                AudioObjectSetPropertyData(devID, &muteAddr, 0, NULL, sizeof(muteVal), &muteVal);
            }
            AudioObjectPropertyAddress volAddr = {
                kAudioDevicePropertyVolumeScalar,
                scopes[s],
                elements[e]
            };
            if (AudioObjectHasProperty(devID, &volAddr)) {
                Float32 volVal = 1.0f;
                AudioObjectSetPropertyData(devID, &volAddr, 0, NULL, sizeof(volVal), &volVal);
            }
        }
    }
}

static int findAllVirtualAudioDeviceIDs(AudioDeviceID *outIDs, int maxCount) {
    AudioObjectPropertyAddress propAddr = {
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
        0
    };
    UInt32 dataSize = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &propAddr, 0, NULL, &dataSize) != noErr || dataSize == 0) {
        return 0;
    }
    UInt32 count = dataSize / sizeof(AudioDeviceID);
    AudioDeviceID *devices = (AudioDeviceID *)malloc(dataSize);
    if (!devices) return 0;
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &propAddr, 0, NULL, &dataSize, devices) != noErr) {
        free(devices);
        return 0;
    }

    int foundCount = 0;
    for (UInt32 i = 0; i < count && foundCount < maxCount; i++) {
        AudioDeviceID devID = devices[i];
        AudioObjectPropertyAddress streamAddr = {
            kAudioDevicePropertyStreams,
            kAudioObjectPropertyScopeOutput,
            0
        };
        UInt32 streamSize = 0;
        if (AudioObjectGetPropertyDataSize(devID, &streamAddr, 0, NULL, &streamSize) != noErr || streamSize == 0) {
            continue;
        }
        CFStringRef cfName = NULL;
        UInt32 nameSize = sizeof(CFStringRef);
        AudioObjectPropertyAddress nameAddr = {
            kAudioObjectPropertyName,
            kAudioObjectPropertyScopeGlobal,
            0
        };
        if (AudioObjectGetPropertyData(devID, &nameAddr, 0, NULL, &nameSize, &cfName) == noErr && cfName != NULL) {
            NSString *name = [(__bridge NSString *)cfName lowercaseString];
            if ([name containsString:@"blackhole"] || [name containsString:@"opung"] || [name containsString:@"vb-cable"] || [name containsString:@"soundflower"]) {
                ensureDeviceUnmutedAndFullVolume(devID);
                outIDs[foundCount++] = devID;
            }
            CFRelease(cfName);
        }
    }
    free(devices);
    return foundCount;
}

static OSStatus opungBlackHoleRenderCallback(void *inRefCon,
                                             AudioUnitRenderActionFlags *ioActionFlags,
                                             const AudioTimeStamp *inTimeStamp,
                                             UInt32 inBusNumber,
                                             UInt32 inNumberFrames,
                                             AudioBufferList *ioData) {
    if (!ioData) return noErr;
    int unitIdx = (int)(uintptr_t)inRefCon;
    if (unitIdx < 0 || unitIdx >= OPUNG_MAX_HAL_UNITS) return noErr;

    gRenderHeartbeat++;
    OpungHalSinkUnit *sink = &gHalUnits[unitIdx];
    double step = (sink->sampleRate > 8000.0) ? (48000.0 / sink->sampleRate) : 1.0;
    uint32_t w = gRingWriteIdx;

    // Hitung jumlah sampel yang tersedia di ring buffer untuk unit ini
    uint32_t rInt = ((uint32_t)sink->readPos) & OPUNG_RING_MASK;
    uint32_t avail = (w - rInt) & OPUNG_RING_MASK;
    if (avail > 16384) {
        // Jika tertinggal terlalu jauh (atau baru mulai), lompat ke ~1536 sampel sebelum write head
        sink->readPos = (double)((w - 1536) & OPUNG_RING_MASK);
        avail = 1536;
    }

    for (UInt32 f = 0; f < inNumberFrames; f++) {
        float s = 0.0f;
        uint32_t curR = ((uint32_t)sink->readPos) & OPUNG_RING_MASK;
        if (curR != w && gSinkEnabled) {
            uint32_t nextR = (curR + 1) & OPUNG_RING_MASK;
            float frac = (float)(sink->readPos - floor(sink->readPos));
            float s0 = gBlackHoleRing[curR];
            float s1 = (nextR != w) ? gBlackHoleRing[nextR] : s0;
            s = s0 + (s1 - s0) * frac;
            sink->readPos += step;
            if (sink->readPos >= (double)OPUNG_RING_SIZE) {
                sink->readPos -= (double)OPUNG_RING_SIZE;
            }
        }
        if (ioData->mNumberBuffers == 1) {
            float *buf = (float *)ioData->mBuffers[0].mData;
            UInt32 chans = ioData->mBuffers[0].mNumberChannels;
            if (buf && chans > 0) {
                for (UInt32 c = 0; c < chans; c++) {
                    buf[f * chans + c] = s;
                }
            }
        } else {
            for (UInt32 b = 0; b < ioData->mNumberBuffers; b++) {
                float *buf = (float *)ioData->mBuffers[b].mData;
                if (buf) {
                    buf[f] = s;
                }
            }
        }
    }
    return noErr;
}

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler>
@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) NSStatusItem *statusItem;
@property (strong, nonatomic) WKWebView *webView;
@property (copy, nonatomic) NSString *htmlFilePath;
@property (assign, nonatomic) BOOL blackHoleRunning;
@property (assign, nonatomic) uint32_t lastCheckedHeartbeat;
@property (assign, nonatomic) int heartbeatStallCount;
@end

@implementation AppDelegate

- (void)stopAllBlackHoleHalUnits {
    for (int i = 0; i < gHalUnitCount; i++) {
        if (gHalUnits[i].active && gHalUnits[i].unit) {
            AudioOutputUnitStop(gHalUnits[i].unit);
            AudioUnitUninitialize(gHalUnits[i].unit);
            AudioComponentInstanceDispose(gHalUnits[i].unit);
            gHalUnits[i].unit = NULL;
            gHalUnits[i].active = NO;
        }
    }
    gHalUnitCount = 0;
    self.blackHoleRunning = NO;
}

- (void)startBlackHoleHalOutput {
    if (self.blackHoleRunning && gHalUnitCount > 0) return;
    [self stopAllBlackHoleHalUnits];

    AudioDeviceID devIDs[OPUNG_MAX_HAL_UNITS];
    int found = findAllVirtualAudioDeviceIDs(devIDs, OPUNG_MAX_HAL_UNITS);
    if (found <= 0) return;

    AudioComponentDescription desc = {0};
    desc.componentType = kAudioUnitType_Output;
    desc.componentSubType = kAudioUnitSubType_HALOutput;
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;

    AudioComponent comp = AudioComponentFindNext(NULL, &desc);
    if (!comp) return;

    int startedCount = 0;
    for (int idx = 0; idx < found && startedCount < OPUNG_MAX_HAL_UNITS; idx++) {
        AudioDeviceID bhID = devIDs[idx];
        ensureDeviceUnmutedAndFullVolume(bhID);

        AudioComponentInstance unit = NULL;
        if (AudioComponentInstanceNew(comp, &unit) != noErr || !unit) continue;

        UInt32 enableIO = 1;
        AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Output, 0, &enableIO, sizeof(enableIO));
        UInt32 disableInput = 0;
        AudioUnitSetProperty(unit, kAudioOutputUnitProperty_EnableIO, kAudioUnitScope_Input, 1, &disableInput, sizeof(disableInput));

        if (AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &bhID, sizeof(bhID)) != noErr) {
            AudioComponentInstanceDispose(unit);
            continue;
        }

        // Baca format asli hardware BlackHole 2ch (baik 48000 Hz maupun 44100 Hz) agar AudioUnitInitialize selalu sukses!
        AudioStreamBasicDescription hwFormat = {0};
        UInt32 fmtSize = sizeof(hwFormat);
        Float64 hwSampleRate = 48000.0;
        UInt32 hwChannels = 2;
        if (AudioUnitGetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &hwFormat, &fmtSize) == noErr) {
            if (hwFormat.mSampleRate >= 8000.0 && hwFormat.mSampleRate <= 192000.0) {
                hwSampleRate = hwFormat.mSampleRate;
            }
            if (hwFormat.mChannelsPerFrame >= 1 && hwFormat.mChannelsPerFrame <= 16) {
                hwChannels = hwFormat.mChannelsPerFrame;
            }
        }

        AudioStreamBasicDescription asbd = {0};
        asbd.mSampleRate = hwSampleRate;
        asbd.mFormatID = kAudioFormatLinearPCM;
        asbd.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
        asbd.mFramesPerPacket = 1;
        asbd.mChannelsPerFrame = hwChannels;
        asbd.mBitsPerChannel = 32;
        asbd.mBytesPerFrame = 4 * hwChannels;
        asbd.mBytesPerPacket = 4 * hwChannels;
        AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Input, 0, &asbd, sizeof(asbd));

        int slot = startedCount;
        gHalUnits[slot].unit = unit;
        gHalUnits[slot].deviceID = bhID;
        gHalUnits[slot].sampleRate = hwSampleRate;
        gHalUnits[slot].readPos = (double)gRingWriteIdx;
        gHalUnits[slot].active = NO;

        AURenderCallbackStruct cb = {0};
        cb.inputProc = opungBlackHoleRenderCallback;
        cb.inputProcRefCon = (void *)(uintptr_t)slot;
        AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback, kAudioUnitScope_Input, 0, &cb, sizeof(cb));

        if (AudioUnitInitialize(unit) == noErr) {
            if (AudioOutputUnitStart(unit) == noErr) {
                gHalUnits[slot].active = YES;
                startedCount++;
                continue;
            }
            AudioUnitUninitialize(unit);
        }
        AudioComponentInstanceDispose(unit);
    }

    gHalUnitCount = startedCount;
    self.blackHoleRunning = (startedCount > 0);
    self.lastCheckedHeartbeat = gRenderHeartbeat;
    self.heartbeatStallCount = 0;
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"opungAudioBridge"]) return;
    if (![message.body isKindOfClass:[NSString class]]) return;

    NSString *body = (NSString *)message.body;
    if ([body hasPrefix:@"HEIGHT:"]) {
        CGFloat h = [[body substringFromIndex:7] doubleValue];
        if (h >= 420.0 && h <= 700.0 && self.window) {
            NSRect oldFrame = self.window.frame;
            NSRect contentRect = [self.window contentRectForFrameRect:oldFrame];
            CGFloat deltaH = ceil(h) - contentRect.size.height;
            if (fabs(deltaH) > 1.0) {
                contentRect.size.height = ceil(h);
                contentRect.size.width = 390.0;
                NSRect newFrame = [self.window frameRectForContentRect:contentRect];
                newFrame.origin.x = oldFrame.origin.x;
                newFrame.origin.y = oldFrame.origin.y - (newFrame.size.height - oldFrame.size.height);
                [self.window setFrame:newFrame display:YES animate:NO];
            }
        }
        return;
    }
    if ([body hasPrefix:@"SINK:"]) {
        if ([body isEqualToString:@"SINK:ON"]) {
            gSinkEnabled = 1;
            if (!self.blackHoleRunning) {
                [self startBlackHoleHalOutput];
            }
        } else {
            gSinkEnabled = 0;
        }
        return;
    }

    if (!self.blackHoleRunning) {
        [self startBlackHoleHalOutput];
    } else {
        uint32_t curHb = gRenderHeartbeat;
        if (curHb == self.lastCheckedHeartbeat) {
            self.heartbeatStallCount++;
            if (self.heartbeatStallCount > 35) {
                // Jika CoreAudio sempat di-restart atau Google Meet mengubah sample rate BlackHole 2ch, otomatis sambung ulang!
                self.blackHoleRunning = NO;
                [self startBlackHoleHalOutput];
            }
        } else {
            self.lastCheckedHeartbeat = curHb;
            self.heartbeatStallCount = 0;
        }
    }

    NSData *pcmData = [[NSData alloc] initWithBase64EncodedString:body options:0];
    if (!pcmData || pcmData.length < 2) return;

    const int16_t *samples = (const int16_t *)pcmData.bytes;
    NSUInteger count = pcmData.length / sizeof(int16_t);
    uint32_t w = gRingWriteIdx;
    for (NSUInteger i = 0; i < count; i++) {
        gBlackHoleRing[w] = ((float)samples[i]) / 32768.0f;
        w = (w + 1) & OPUNG_RING_MASK;
    }
    gRingWriteIdx = w;
}

- (void)setupMainMenu {
    NSMenu *menubar = [[NSMenu alloc] init];
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:appMenuItem];
    [NSApp setMainMenu:menubar];

    NSMenu *appMenu = [[NSMenu alloc] init];
    NSMenuItem *toggleItem = [[NSMenuItem alloc] initWithTitle:@"Tampilkan / Sembunyikan Panel Opung"
                                                        action:@selector(toggleMenuBarWindow:)
                                                 keyEquivalent:@"o"];
    [toggleItem setTarget:self];
    [appMenu addItem:toggleItem];
    [appMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Keluar dari Opung"
                                                      action:@selector(terminate:)
                                               keyEquivalent:@"q"];
    [appMenu addItem:quitItem];
    [appMenuItem setSubmenu:appMenu];
}

- (NSImage *)createOpungMenuBarLogoIcon {
    NSImage *logo = [NSImage imageWithSize:NSMakeSize(18.0, 18.0) flipped:NO drawingHandler:^BOOL(NSRect dstRect) {
        // 1. Dark Navy Squircle Background (#0A101E)
        NSBezierPath *bgPath = [NSBezierPath bezierPathWithRoundedRect:NSMakeRect(0.8, 0.8, 16.4, 16.4) xRadius:4.2 yRadius:4.2];
        [[NSColor colorWithSRGBRed:0.04 green:0.063 blue:0.118 alpha:1.0] setFill];
        [bgPath fill];

        // Subtle Sky-Blue Border
        [[NSColor colorWithSRGBRed:0.22 green:0.74 blue:0.97 alpha:0.35] setStroke];
        [bgPath setLineWidth:0.6];
        [bgPath stroke];

        // 2. White Outer 'O' Ring (#F1F5F9)
        NSBezierPath *ringPath = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(3.4, 3.4, 11.2, 11.2)];
        [[NSColor colorWithSRGBRed:0.95 green:0.97 blue:1.0 alpha:1.0] setStroke];
        [ringPath setLineWidth:2.05];
        [ringPath stroke];

        // 3. 5 Vertical Soundwave Bars Inside 'O' (#38BDF8)
        [[NSColor colorWithSRGBRed:0.22 green:0.74 blue:0.97 alpha:1.0] setStroke];
        CGFloat xs[5] = { 6.6, 7.8, 9.0, 10.2, 11.4 };
        CGFloat halfHeights[5] = { 1.1, 2.0, 2.85, 2.0, 1.1 };
        for (int i = 0; i < 5; i++) {
            NSBezierPath *bar = [NSBezierPath bezierPath];
            [bar setLineCapStyle:NSLineCapStyleRound];
            [bar setLineWidth:0.92];
            [bar moveToPoint:NSMakePoint(xs[i], 9.0 - halfHeights[i])];
            [bar lineToPoint:NSMakePoint(xs[i], 9.0 + halfHeights[i])];
            [bar stroke];
        }
        return YES;
    }];
    [logo setTemplate:NO];
    return logo;
}

- (void)setupMenuBarStatusItem {
    self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
    NSStatusBarButton *button = self.statusItem.button;
    if (button) {
        NSImage *logoIcon = [self createOpungMenuBarLogoIcon];
        if (logoIcon) {
            button.image = logoIcon;
            button.imagePosition = NSImageOnly;
        }
        button.title = @"";
        button.toolTip = @"Opung - Office Proximity Ultra Noise Gate";
        button.target = self;
        button.action = @selector(toggleMenuBarWindow:);
    }
}

- (void)toggleMenuBarWindow:(id)sender {
    if ([self.window isVisible] && [self.window isKeyWindow]) {
        [self.window orderOut:nil];
        return;
    }

    NSWindow *statusWindow = self.statusItem.button.window;
    if (statusWindow) {
        NSRect buttonFrame = statusWindow.frame;
        NSRect winFrame = self.window.frame;
        if (buttonFrame.origin.y > 100 && buttonFrame.origin.x > 0) {
            CGFloat x = NSMidX(buttonFrame) - (NSWidth(winFrame) / 2.0);
            CGFloat y = NSMinY(buttonFrame) - NSHeight(winFrame) - 6.0;
            NSScreen *screen = statusWindow.screen ?: [NSScreen mainScreen];
            if (screen) {
                NSRect visible = screen.visibleFrame;
                if (x + NSWidth(winFrame) > NSMaxX(visible) - 8.0) {
                    x = NSMaxX(visible) - NSWidth(winFrame) - 8.0;
                }
                if (x < NSMinX(visible) + 8.0) {
                    x = NSMinX(visible) + 8.0;
                }
            }
            [self.window setFrameOrigin:NSMakePoint(x, y)];
        }
    }

    [self.window makeKeyAndOrderFront:nil];
    [self.window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];
}

- (void)loadOpungInterface {
    [self startBlackHoleHalOutput];
    NSError *err = nil;
    NSString *htmlContent = [NSString stringWithContentsOfFile:self.htmlFilePath encoding:NSUTF8StringEncoding error:&err];
    if (htmlContent && htmlContent.length > 0) {
        [self.webView loadHTMLString:htmlContent baseURL:[NSURL URLWithString:@"https://localhost/"]];
    } else {
        NSURL *fileUrl = [NSURL fileURLWithPath:self.htmlFilePath];
        NSURL *dirUrl = [fileUrl URLByDeletingLastPathComponent];
        [self.webView loadFileURL:fileUrl allowingReadAccessToURL:dirUrl];
    }
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self setupMainMenu];
    [self setupMenuBarStatusItem];

    NSString *resDir = [[self.htmlFilePath stringByDeletingLastPathComponent] stringByDeletingLastPathComponent];
    NSString *iconPath = [resDir stringByAppendingPathComponent:@"AppIcon.icns"];
    NSImage *appIcon = [[NSImage alloc] initWithContentsOfFile:iconPath];
    if (appIcon) {
        [NSApp setApplicationIconImage:appIcon];
    }

    NSRect frame = NSMakeRect(0, 0, 390, 526);
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;
    self.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
    [self.window setTitle:@"Opung - Office Proximity Ultra Noise Gate"];
    [self.window center];
    [self.window setDelegate:self];
    [self.window setReleasedWhenClosed:NO];
    [self.window setLevel:NSFloatingWindowLevel];
    if (@available(macOS 10.14, *)) {
        [self.window setAppearance:[NSAppearance appearanceNamed:NSAppearanceNameDarkAqua]];
    }
    [self.window setBackgroundColor:[NSColor colorWithSRGBRed:0.035 green:0.05 blue:0.086 alpha:1.0]];

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    if (@available(macOS 10.12, *)) {
        config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    }
    [config.userContentController addScriptMessageHandler:self name:@"opungAudioBridge"];
    @try { [config.preferences setValue:@YES forKey:@"mediaDevicesEnabled"]; } @catch (NSException *e) {}
    @try { [config.preferences setValue:@NO forKey:@"mediaCaptureRequiresSecureConnection"]; } @catch (NSException *e) {}
    @try { [config.preferences setValue:@NO forKey:@"getUserMediaRequiresFocus"]; } @catch (NSException *e) {}
    @try { [config.preferences setValue:@YES forKey:@"exposeSpeakersEnabled"]; } @catch (NSException *e) {}
    @try { [config.preferences setValue:@YES forKey:@"perElementSpeakerSelectionEnabled"]; } @catch (NSException *e) {}

    self.webView = [[WKWebView alloc] initWithFrame:frame configuration:config];
    [self.webView setUIDelegate:(id)self];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self.window setContentView:self.webView];

    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [self.window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];

    if (@available(macOS 10.14, *)) {
        AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
        if (status == AVAuthorizationStatusNotDetermined) {
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    [self loadOpungInterface];
                });
            }];
            return;
        }
    }
    [self loadOpungInterface];
}

- (void)webView:(WKWebView *)webView
requestMediaCapturePermissionForOrigin:(id)origin
initiatedByFrame:(id)frame
           type:(NSInteger)type
decisionHandler:(void (^)(NSInteger decision))decisionHandler {
    if (decisionHandler) {
        decisionHandler(1);
    }
}

- (BOOL)windowShouldClose:(NSWindow *)sender {
    [sender orderOut:nil];
    return NO;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)theApplication hasVisibleWindows:(BOOL)flag {
    [self.window makeKeyAndOrderFront:nil];
    [self.window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];
    return YES;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return NO;
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        if (argc > 1 && argv[1][0] == '/') {
            delegate.htmlFilePath = [NSString stringWithUTF8String:argv[1]];
        } else {
            NSString *execDir = [[[NSBundle mainBundle] executablePath] stringByDeletingLastPathComponent];
            delegate.htmlFilePath = [[execDir stringByAppendingPathComponent:@"../Resources/app/index.html"] stringByStandardizingPath];
        }
        [app setDelegate:delegate];
        [app run];
    }
    return 0;
}
`;

/**
 * Fallback JXA (JavaScript for Automation) Native Cocoa + WebKit + Menu Bar Status Item
 * Bekerja langsung di semua MacBook (termasuk milik orang awam yang TIDAK menginstal Xcode / clang).
 */
export const MACOS_NATIVE_JXA_SCRIPT = `ObjC.import('Cocoa');
ObjC.import('WebKit');
ObjC.import('Foundation');

function run(argv) {
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyRegular);

  const rect = $.NSMakeRect(0, 0, 390, 526);
  const styleMask = (1 << 0) | (1 << 1) | (1 << 2);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    rect,
    styleMask,
    $.NSBackingStoreBuffered,
    false
  );
  win.center;
  win.title = $('Opung - Office Proximity Ultra Noise Gate');
  win.releasedWhenClosed = false;
  win.level = 3;
  try {
    win.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.035, 0.05, 0.086, 1.0);
  } catch (_e) {}

  let htmlPathNs = null;
  try {
    if (argv && argv.length > 0 && argv[0]) {
      htmlPathNs = $(String(argv[0]));
    } else {
      const env = $.NSProcessInfo.processInfo.environment;
      htmlPathNs = env.objectForKey($('OPUNG_HTML_FILE'));
    }
  } catch (_e) {}

  try {
    const statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength(-2);
    if (statusItem && statusItem.button) {
      statusItem.button.title = $('');
      if (htmlPathNs) {
        const resDir = htmlPathNs.stringByDeletingLastPathComponent.stringByDeletingLastPathComponent;
        const iconPath = resDir.stringByAppendingPathComponent($('AppIcon.icns'));
        const menuIcon = $.NSImage.alloc.initWithContentsOfFile(iconPath);
        if (menuIcon) {
          menuIcon.setSize($.NSMakeSize(18, 18));
          statusItem.button.image = menuIcon;
        }
      }
    }
  } catch (_e) {}

  const config = $.WKWebViewConfiguration.alloc.init;
  try {
    config.mediaTypesRequiringUserActionForPlayback = 0;
    config.preferences.setValueForKey($(true), $('mediaDevicesEnabled'));
    config.preferences.setValueForKey($(false), $('mediaCaptureRequiresSecureConnection'));
  } catch (_e) {}

  const webView = $.WKWebView.alloc.initWithFrameConfiguration(rect, config);
  win.contentView = webView;

  win.center;
  win.makeKeyAndOrderFront(null);
  win.orderFrontRegardless;
  app.activateIgnoringOtherApps(true);

  try {
    if (htmlPathNs) {
      const data = $.NSData.dataWithContentsOfFile(htmlPathNs);
      if (data) {
        const htmlStr = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
        const baseUrl = $.NSURL.URLWithString($('https://localhost/'));
        webView.loadHTMLStringBaseURL(htmlStr, baseUrl);
      } else {
        const fileUrl = $.NSURL.fileURLWithPath(htmlPathNs);
        const dirUrl = fileUrl.URLByDeletingLastPathComponent;
        webView.loadFileURLAllowingReadAccessToURL(fileUrl, dirUrl);
      }
    }
  } catch (_e) {}

  app.run;
}
`;

/**
 * Launcher Script Instan (< 0.1 detik) untuk Contents/MacOS/OPUNG & RNNoiseStudio:
 * - Otomatis menyalin OPUNG.app ke /Applications jika dibuka dari .DMG (/Volumes/...)
 * - Otomatis membersihkan driver duplikat lama (/Library/Audio/Plug-Ins/HAL/OPUNG.driver) agar hanya ada
 *   1 mikrofon virtual resmi ("BlackHole 2ch") tanpa bentrok UID di Google Meet / Zoom!
 * - Otomatis menjembatani izin mikrofon macOS TCC (Terminal Responsible Process Bridge) saat OPUNG.app
 *   diklik langsung di Finder / Applications, sekaligus menutup jendela Terminal secara otomatis!
 */
export const MACOS_NATIVE_LAUNCHER_SH = `#!/bin/bash
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$PATH"

MACOS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
BUNDLE_DIR="$(cd "$MACOS_DIR/../.." && pwd -P)"
APP_DIR="$(cd "$MACOS_DIR/../Resources/app" && pwd -P)"
HTML_FILE="$APP_DIR/index.html"

export OPUNG_HTML_FILE="$HTML_FILE"

# 0A. LANGSUNG TIMPA /Applications/OPUNG.app LAMA JIKA DIBUKA DARI DISK IMAGE (.DMG)
if [[ "$BUNDLE_DIR" == /Volumes/* ]] && [ -w "/Applications" ]; then
  rm -rf "/Applications/OPUNG.app" 2>/dev/null || true
  cp -R "$BUNDLE_DIR" "/Applications/OPUNG.app" 2>/dev/null || true
  chmod +x "/Applications/OPUNG.app/Contents/MacOS/RNNoiseStudio" 2>/dev/null || true
  chmod +x "/Applications/OPUNG.app/Contents/MacOS/OPUNG" 2>/dev/null || true
  /usr/bin/xattr -cr "/Applications/OPUNG.app" 2>/dev/null || true
  /usr/bin/touch "/Applications/OPUNG.app" 2>/dev/null || true
  (
    /usr/bin/codesign --force --deep --sign - "/Applications/OPUNG.app" 2>/dev/null || true
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "/Applications/OPUNG.app" 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
  if [ -f "/Applications/OPUNG.app/Contents/Resources/app/index.html" ]; then
    BUNDLE_DIR="/Applications/OPUNG.app"
    MACOS_DIR="/Applications/OPUNG.app/Contents/MacOS"
    APP_DIR="/Applications/OPUNG.app/Contents/Resources/app"
    HTML_FILE="$APP_DIR/index.html"
    export OPUNG_HTML_FILE="$HTML_FILE"
  fi
fi

# Segarkan cache ikon OPUNG.app di Finder / LaunchServices
/usr/bin/touch "$BUNDLE_DIR" 2>/dev/null || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$BUNDLE_DIR" 2>/dev/null || true

# 0B. JEMBATAN OTOMATIS IZIN MIKROFON TCC macOS SAAT OPUNG.app DIKLIK LANGSUNG DI FINDER / APPLICATIONS
if [ "$TERM_PROGRAM" != "Apple_Terminal" ] && [ "$OPUNG_TCC_BRIDGE" != "1" ]; then
  BRIDGE_CMD="/tmp/opung_tcc_bridge_$(id -u).command"
  cat << EOF_BRIDGE > "$BRIDGE_CMD"
#!/bin/bash
export OPUNG_TCC_BRIDGE=1
exec "$MACOS_DIR/OPUNG"
EOF_BRIDGE
  chmod +x "$BRIDGE_CMD" 2>/dev/null || true
  /usr/bin/xattr -cr "$BRIDGE_CMD" 2>/dev/null || true
  if open -g -a Terminal "$BRIDGE_CMD" 2>/dev/null || open -a Terminal "$BRIDGE_CMD" 2>/dev/null; then
    exit 0
  fi
fi

# Cari compiler clang asli & SDK macOS
CLANG_REAL=""
if [ -x "/Library/Developer/CommandLineTools/usr/bin/clang" ]; then
  CLANG_REAL="/Library/Developer/CommandLineTools/usr/bin/clang"
elif [ -x "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang" ]; then
  CLANG_REAL="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
fi

SDK_ARGS=()
if [ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk" ]; then
  export SDKROOT="/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk"
  SDK_ARGS=("-isysroot" "$SDKROOT")
elif [ -d "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk" ]; then
  export SDKROOT="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
  SDK_ARGS=("-isysroot" "$SDKROOT")
fi

# 0C. BERSIHKAN DRIVER DUPLIKAT "OPUNG.driver" SECARA SINKRON SEBELUM BINARY JALAN AGAR TIDAK MEMATIKAN COREAUDIO SAAT AKTIF
if [ -d "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" ] && [ -w "/Library/Audio/Plug-Ins/HAL" ]; then
  rm -rf "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" 2>/dev/null && killall coreaudiod 2>/dev/null && sleep 0.3 || true
fi

# Jika BlackHole2ch.driver belum terpasang sama sekali di Mac pengguna, pasang BlackHole 2ch resmi:
if [ ! -d "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver" ]; then
  (
    HAL_TMP="/tmp/opung-bh2ch-$$"
    mkdir -p "$HAL_TMP/BlackHole2ch.driver/Contents/MacOS"
    cat << 'EOF_BH_PLIST' > "$HAL_TMP/BlackHole2ch.driver/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>BlackHole</string>
  <key>CFBundleIdentifier</key>
  <string>audio.existential.BlackHole2ch</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>BlackHole2ch</string>
  <key>CFBundleDisplayName</key>
  <string>BlackHole 2ch</string>
  <key>CFBundlePackageType</key>
  <string>BNDL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.6.0</string>
  <key>CFBundleVersion</key>
  <string>600</string>
  <key>CFPlugInFactories</key>
  <dict>
    <key>e395c745-4eea-4d94-bb92-46224221047c</key>
    <string>BlackHole_Create</string>
  </dict>
  <key>CFPlugInTypes</key>
  <dict>
    <key>443abab8-e7b3-491a-b985-beb9187030db</key>
    <array>
      <string>e395c745-4eea-4d94-bb92-46224221047c</string>
    </array>
  </dict>
</dict>
</plist>
EOF_BH_PLIST
    if [ -n "$CLANG_REAL" ] && command -v curl >/dev/null 2>&1; then
      if curl -fsSL --max-time 10 "https://raw.githubusercontent.com/ExistentialAudio/BlackHole/master/BlackHole/BlackHole.c" -o "$HAL_TMP/BlackHole.c" 2>/dev/null; then
        "$CLANG_REAL" -bundle -O2 "\${SDK_ARGS[@]}" \\
          -framework CoreAudio -framework CoreFoundation \\
          '-DkNumber_Of_Channels=2' \\
          "$HAL_TMP/BlackHole.c" \\
          -o "$HAL_TMP/BlackHole2ch.driver/Contents/MacOS/BlackHole" 2>/dev/null || true
      fi
    fi
    if [ -f "$HAL_TMP/BlackHole2ch.driver/Contents/MacOS/BlackHole" ]; then
      chmod +x "$HAL_TMP/BlackHole2ch.driver/Contents/MacOS/BlackHole"
      /usr/bin/xattr -cr "$HAL_TMP/BlackHole2ch.driver" 2>/dev/null || true
      /usr/bin/codesign --force --deep --sign - "$HAL_TMP/BlackHole2ch.driver" 2>/dev/null || true
      /usr/bin/osascript -e "do shell script \\"cp -R '$HAL_TMP/BlackHole2ch.driver' '/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver' && rm -rf '/Library/Audio/Plug-Ins/HAL/OPUNG.driver' && chown -R root:wheel '/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver' && killall coreaudiod || true\\" with administrator privileges" 2>/dev/null || true
    fi
    rm -rf "$HAL_TMP" 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
fi

# Fungsi peluncuran terlepas (double-fork POSIX::setsid) yang mewarisi izin mikrofon TCC Terminal.app
# sekaligus menutup jendela Terminal secara otomatis tanpa mematikan aplikasi OPUNG!
launch_native_detached() {
  local BIN_PATH="$1"
  local HTML_ARG="$2"

  killall -9 RNNoiseStudioNative RNNoiseStudioNativeV10 RNNoiseStudioNativeV11 RNNoiseStudioNativeV12 RNNoiseStudioNativeV13 RNNoiseStudioNativeV14 RNNoiseStudioNativeV15 RNNoiseStudioNativeV16 RNNoiseStudioNativeV17 2>/dev/null || true

  if [ -x "/usr/bin/perl" ]; then
    /usr/bin/perl -MPOSIX -e '
      my ($bin, $html) = @ARGV;
      my $pid = fork();
      exit 0 if $pid;
      POSIX::setsid();
      my $pid2 = fork();
      exit 0 if $pid2;
      open STDIN, "</dev/null";
      open STDOUT, ">/dev/null";
      open STDERR, ">/dev/null";
      exec($bin, $html);
    ' "$BIN_PATH" "$HTML_ARG"
  else
    nohup "$BIN_PATH" "$HTML_ARG" </dev/null >/dev/null 2>&1 &
  fi

  (
    sleep 0.35
    /usr/bin/osascript -e 'tell application "Terminal" to close (every window whose name contains "opung_tcc_bridge" or name contains "OPUNG" or name contains "Opung" or name contains "RNNoiseStudio")' 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &

  exit 0
}

SHADOW_BUNDLE="/tmp/OPUNG-Runtime-$(id -u)/OPUNG.app"
SHADOW_MACOS_DIR="$SHADOW_BUNDLE/Contents/MacOS"
SHADOW_APP_DIR="$SHADOW_BUNDLE/Contents/Resources/app"
SHADOW_BIN="$SHADOW_MACOS_DIR/RNNoiseStudioNativeV17"
LOCAL_BIN="$MACOS_DIR/RNNoiseStudioNativeV17"

# 1. Jalur Cepat Instan (0.01 detik): Jika binary V17 sudah ada di bundle lokal atau di /tmp shadow bundle
if [ -x "$LOCAL_BIN" ]; then
  launch_native_detached "$LOCAL_BIN" "$HTML_FILE"
fi
if [ -x "$SHADOW_BIN" ] && [ -f "$SHADOW_APP_DIR/index.html" ]; then
  launch_native_detached "$SHADOW_BIN" "$SHADOW_APP_DIR/index.html"
fi

# 2. Tentukan target kompilasi yang 100% WRITABLE (bebas dari Read-Only DMG / AppTranslocation)
if [ -w "$MACOS_DIR" ]; then
  /usr/bin/xattr -cr "$BUNDLE_DIR" 2>/dev/null || true
  TARGET_BIN="$LOCAL_BIN"
  TARGET_HTML="$HTML_FILE"
else
  mkdir -p "$SHADOW_MACOS_DIR" "$SHADOW_APP_DIR" 2>/dev/null || true
  cp -f "$BUNDLE_DIR/Contents/Info.plist" "$SHADOW_BUNDLE/Contents/Info.plist" 2>/dev/null || true
  cp -f "$BUNDLE_DIR/Contents/Resources/AppIcon.icns" "$SHADOW_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null || true
  cp -f "$HTML_FILE" "$SHADOW_APP_DIR/index.html" 2>/dev/null || true
  TARGET_BIN="$SHADOW_BIN"
  TARGET_HTML="$SHADOW_APP_DIR/index.html"
fi

if [ -n "$CLANG_REAL" ]; then
  TMP_BIN="\${TARGET_BIN}.tmp.$$"
  ENT_PLIST="/tmp/opung_entitlements_$$.plist"
  cat << 'EOF_ENT' > "$ENT_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <key>com.apple.security.device.microphone</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
EOF_ENT

  "$CLANG_REAL" -O0 -fobjc-arc "\${SDK_ARGS[@]}" \\
    -framework Cocoa -framework WebKit -framework AVFoundation -framework CoreAudio -framework AudioToolbox \\
    "$APP_DIR/native_host.m" -o "$TMP_BIN" 2>/dev/null || true

  if [ -f "$TMP_BIN" ]; then
    chmod +x "$TMP_BIN" 2>/dev/null || true
    /usr/bin/xattr -cr "$TMP_BIN" 2>/dev/null || true
    /usr/bin/codesign --force --entitlements "$ENT_PLIST" --sign - "$TMP_BIN" 2>/dev/null || /usr/bin/codesign --force --sign - "$TMP_BIN" 2>/dev/null || true
    mv -f "$TMP_BIN" "$TARGET_BIN" 2>/dev/null || true
    rm -f "$ENT_PLIST" 2>/dev/null || true

    if [ -x "$TARGET_BIN" ]; then
      launch_native_detached "$TARGET_BIN" "$TARGET_HTML"
    fi
  fi
  rm -f "$ENT_PLIST" 2>/dev/null || true
fi

# 3. Fallback Jendela Aplikasi Standalone jika Mac tidak memiliki compiler Xcode
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "/Applications/Google Chrome.app" --args --app="file://$HTML_FILE" --window-size=400,640
  exit 0
fi

/usr/bin/osascript -l JavaScript "$APP_DIR/native_host.jxa.js" "$HTML_FILE" 2>/dev/null && exit 0
open "$HTML_FILE"
`;

/**
 * Generator Script 1-Klik untuk macOS:
 * 1. Memasang OPUNG.app (edisi Menu Bar seperti Krisp.ai) langsung ke /Applications/OPUNG.app
 * 2. Membersihkan OPUNG.driver lama & memastikan BlackHole 2ch aktif tanpa duplikat
 * 3. Mencetak file Disk Image resmi "OPUNG-Installer.dmg" di Desktop (via hdiutil)
 */
export function generateMacOSOneClickInstallerScript(): string {
  const base64HtmlPayload = btoa(
    unescape(encodeURIComponent(MACOS_STANDALONE_APP_HTML))
  );
  const base64ObjcPayload = btoa(
    unescape(encodeURIComponent(MACOS_NATIVE_OBJC_SOURCE))
  );
  const base64JxaPayload = btoa(
    unescape(encodeURIComponent(MACOS_NATIVE_JXA_SCRIPT))
  );

  return `#!/bin/bash
# ==============================================================================
# OPUNG macOS — Auto-Installer (/Applications + BlackHole 2ch + Menu Bar + .DMG)
# ==============================================================================

set -e

echo "=================================================================="
echo "🎙️ Memasang OPUNG (Menu Bar + BlackHole 2ch) & Membuat .DMG"
echo "=================================================================="

APP_NAME="OPUNG"
APP_BUNDLE="/Applications/\${APP_NAME}.app"
DMG_STAGING="/tmp/opung-dmg-staging-\$\$"
DMG_OUTPUT="\$HOME/Desktop/OPUNG-Installer.dmg"

rm -rf "\$APP_BUNDLE"
mkdir -p "\$APP_BUNDLE/Contents/MacOS"
mkdir -p "\$APP_BUNDLE/Contents/Resources/app"

cat << 'EOF_PLIST' > "\$APP_BUNDLE/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>RNNoiseStudio</string>
  <key>CFBundleIdentifier</key>
  <string>com.opung.studio.macos</string>
  <key>CFBundleName</key>
  <string>OPUNG</string>
  <key>CFBundleDisplayName</key>
  <string>OPUNG</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>13.0.0</string>
  <key>CFBundleVersion</key>
  <string>13000</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>OPUNG membutuhkan akses mikrofon untuk memfilter suara di luar radius 1 meter dan menjernihkan vokal Anda.</string>
</dict>
</plist>
EOF_PLIST

echo "${base64HtmlPayload}" | base64 --decode > "\$APP_BUNDLE/Contents/Resources/app/index.html"
echo "${base64ObjcPayload}" | base64 --decode > "\$APP_BUNDLE/Contents/Resources/app/native_host.m"
echo "${base64JxaPayload}" | base64 --decode > "\$APP_BUNDLE/Contents/Resources/app/native_host.jxa.js"

cat << 'EOF_EXEC' > "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudio"
${MACOS_NATIVE_LAUNCHER_SH}
EOF_EXEC

cp -f "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudio" "\$APP_BUNDLE/Contents/MacOS/OPUNG"
chmod +x "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudio" "\$APP_BUNDLE/Contents/MacOS/OPUNG"

if [ -d "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" ]; then
  sudo rm -rf "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" 2>/dev/null || true
  sudo killall coreaudiod 2>/dev/null || true
fi

/usr/bin/xattr -cr "\$APP_BUNDLE" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "\$APP_BUNDLE" 2>/dev/null || true

if command -v hdiutil >/dev/null 2>&1; then
  rm -rf "\$DMG_STAGING" "\$DMG_OUTPUT"
  mkdir -p "\$DMG_STAGING"
  cp -R "\$APP_BUNDLE" "\$DMG_STAGING/"
  ln -s /Applications "\$DMG_STAGING/Applications"
  hdiutil create -volname "OPUNG Installer" -srcfolder "\$DMG_STAGING" -ov -format UDZO "\$DMG_OUTPUT" >/dev/null 2>&1 || true
  /usr/bin/xattr -cr "\$DMG_OUTPUT" 2>/dev/null || true
  rm -rf "\$DMG_STAGING"
fi

echo "🎉 SELESAI! Pilih 'BlackHole 2ch' sebagai mikrofon di Google Meet / Zoom."
open -a "\$APP_BUNDLE"
`;
}

export const ELECTRON_MACOS_FILES: MacOSFileSpec[] = [
  {
    filename: 'native_host.m',
    language: 'objective-c',
    description:
      'Source Code Native macOS Cocoa + WebKit + CoreAudio HAL Output Bridge: Menampilkan ikon OPUNG di Menu Bar atas macOS & mengalirkan audio 48kHz ke BlackHole 2ch!',
    content: MACOS_NATIVE_OBJC_SOURCE,
  },
  {
    filename: 'Install-OPUNG-MacOS.command',
    language: 'bash',
    description:
      'Installer Otomatis macOS: Memasang "/Applications/OPUNG.app" (Menu Bar Edition + BlackHole 2ch Bridge) serta mencetak file "OPUNG-Installer.dmg" di Desktop Anda.',
    content: generateMacOSOneClickInstallerScript(),
  },
  {
    filename: 'electron-main.cjs',
    language: 'javascript',
    description:
      'File utama Electron (opsional jika mem-build via electron-builder).',
    content: `const { app, BrowserWindow, systemPreferences } = require('electron');
const path = require('path');

let mainWindow = null;

async function createMacWindow() {
  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone');
  }

  mainWindow = new BrowserWindow({
    width: 390,
    height: 620,
    resizable: false,
    fullscreenable: false,
    backgroundColor: '#070b12',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createMacWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});`,
  },
];

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  path: string;
  data: Uint8Array;
  unixMode: number;
}

function createUnixZipArchive(entries: ZipEntryInput[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localHeadersAndData: Uint8Array[] = [];
  const centralDirectoryHeaders: Uint8Array[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = entry.data;
    const crc = computeCrc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0x4800, true);
    lv.setUint16(12, 0x5869, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localHeadersAndData.push(localHeader);
    localHeadersAndData.push(dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 0x0314, true); // UNIX permissions (0755)
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0x4800, true);
    cv.setUint16(14, 0x5869, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, (entry.unixMode << 16) >>> 0, true);
    cv.setUint32(42, currentOffset, true);
    centralHeader.set(nameBytes, 46);

    centralDirectoryHeaders.push(centralHeader);
    currentOffset += localHeader.length + dataBytes.length;
  }

  let centralDirSize = 0;
  for (const cd of centralDirectoryHeaders) {
    centralDirSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, currentOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = currentOffset + centralDirSize + eocd.length;
  const outputBuffer = new ArrayBuffer(totalSize);
  const output = new Uint8Array(outputBuffer);
  let ptr = 0;
  for (const chunk of localHeadersAndData) {
    output.set(chunk, ptr);
    ptr += chunk.length;
  }
  for (const cd of centralDirectoryHeaders) {
    output.set(cd, ptr);
    ptr += cd.length;
  }
  output.set(eocd, ptr);
  return outputBuffer;
}

export const MACOS_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>OPUNG</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon.icns</string>
  <key>CFBundleIconName</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.opung.desktop.v12</string>
  <key>CFBundleName</key>
  <string>Opung</string>
  <key>CFBundleDisplayName</key>
  <string>Opung</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>100</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>Opung membutuhkan akses mikrofon untuk memfilter suara di luar radius 1 meter dan menjernihkan vokal Anda.</string>
</dict>
</plist>`;

let cachedOpungIcnsBytes: Uint8Array | null = null;

/**
 * Menghasilkan file ikon resmi macOS Apple Icon Image (`AppIcon.icns`) murni di memori:
 * - Desain Ikon Option 1 (Kubah Akustik Putih "O" + 5 Bar Equalizer Vokal Electric Cyan di atas Squircle Midnight Sapphire)
 * - Berisi chunk 'ic08' (256x256 Retina PNG) dan 'ic07' (128x128 PNG) sesuai spesifikasi Apple ICNS.
 */
export function buildOpungAppIconIcns(): Uint8Array {
  if (cachedOpungIcnsBytes) {
    return cachedOpungIcnsBytes;
  }

  function clampVal(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
  }
  function smoothstepVal(edge0: number, edge1: number, x: number): number {
    const t = clampVal((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function sdRoundedBox(px: number, py: number, bx: number, by: number, r: number): number {
    const qx = Math.abs(px) - bx + r;
    const qy = Math.abs(py) - by + r;
    const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inDist = Math.min(Math.max(qx, qy), 0);
    return outDist + inDist - r;
  }
  function sdVerticalCapsule(px: number, py: number, cx: number, halfH: number, rad: number): number {
    const dx = px - cx;
    const clampedY = clampVal(py, -halfH, halfH);
    const dy = py - clampedY;
    return Math.hypot(dx, dy) - rad;
  }

  const bars = [
    { cx: -0.205, halfH: 0.055 },
    { cx: -0.1025, halfH: 0.118 },
    { cx: 0.0, halfH: 0.185 },
    { cx: 0.1025, halfH: 0.118 },
    { cx: 0.205, halfH: 0.055 },
  ];

  function renderIconPng(width: number, height: number): Uint8Array {
    const rawData = new Uint8Array(height * (1 + width * 4));
    const aa = 2.2 / width;

    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + width * 4);
      rawData[rowStart] = 0; // PNG Filter 0
      const ny = ((y + 0.5) / height) * 2 - 1;

      for (let x = 0; x < width; x++) {
        const nx = ((x + 0.5) / width) * 2 - 1;
        const idx = rowStart + 1 + x * 4;

        const dBox = sdRoundedBox(nx, ny, 0.86, 0.86, 0.39);
        if (dBox > aa * 2) {
          continue;
        }
        const bgAlpha = 1 - smoothstepVal(-aa, aa, dBox);

        const diag = clampVal((nx * 0.4 + ny * 0.7 + 1) * 0.5, 0, 1);
        const distCenter = Math.hypot(nx, ny);
        const centerGlow = Math.exp(-distCenter * distCenter * 4.2);

        let r = 15 * (1 - diag) + 6 * diag + centerGlow * 12;
        let g = 27 * (1 - diag) + 11 * diag + centerGlow * 38;
        let b = 52 * (1 - diag) + 23 * diag + centerGlow * 68;

        const rimDist = Math.abs(dBox + 0.015);
        const rimFactor =
          (1 - smoothstepVal(0, 0.025, rimDist)) * clampVal(1 - (nx + ny) * 0.4, 0.15, 1);
        r = r * (1 - rimFactor * 0.35) + 56 * rimFactor * 0.35;
        g = g * (1 - rimFactor * 0.35) + 189 * rimFactor * 0.35;
        b = b * (1 - rimFactor * 0.35) + 248 * rimFactor * 0.35;

        const dRing = Math.abs(distCenter - 0.555) - 0.132;

        let dBars = 999;
        for (let bi = 0; bi < bars.length; bi++) {
          const db = sdVerticalCapsule(nx, ny, bars[bi].cx, bars[bi].halfH, 0.027);
          if (db < dBars) dBars = db;
        }

        if (dBars > 0 && dBars < 0.14) {
          const glow = Math.exp(-dBars * 24) * 0.42;
          r += 14 * glow;
          g += 165 * glow;
          b += 233 * glow;
        }

        const ringMask = 1 - smoothstepVal(-aa, aa, dRing);
        if (ringMask > 0) {
          const vt = clampVal((ny + 0.68) / 1.36, 0, 1);
          const ringR = 255 * (1 - vt) + 218 * vt;
          const ringG = 255 * (1 - vt) + 240 * vt;
          const ringB = 255;
          r = r * (1 - ringMask) + ringR * ringMask;
          g = g * (1 - ringMask) + ringG * ringMask;
          b = b * (1 - ringMask) + ringB * ringMask;
        }

        const barMask = 1 - smoothstepVal(-aa, aa, dBars);
        if (barMask > 0) {
          const bt = clampVal((ny + 0.22) / 0.44, 0, 1);
          const barR = 115 * (1 - bt) + 14 * bt;
          const barG = 240 * (1 - bt) + 165 * bt;
          const barB = 255 * (1 - bt) + 245 * bt;
          r = r * (1 - barMask) + barR * barMask;
          g = g * (1 - barMask) + barG * barMask;
          b = b * (1 - barMask) + barB * barMask;
        }

        rawData[idx] = Math.round(clampVal(r, 0, 255));
        rawData[idx + 1] = Math.round(clampVal(g, 0, 255));
        rawData[idx + 2] = Math.round(clampVal(b, 0, 255));
        rawData[idx + 3] = Math.round(clampVal(bgAlpha * 255, 0, 255));
      }
    }

    // Bungkus rawData ke dalam stream Zlib Uncompressed (RFC 1950 / RFC 1951)
    const maxBlock = 65535;
    const numBlocks = Math.ceil(rawData.length / maxBlock) || 1;
    const idatData = new Uint8Array(2 + numBlocks * 5 + rawData.length + 4);
    idatData[0] = 0x78;
    idatData[1] = 0x01;
    let pos = 2;
    let offset = 0;
    for (let blk = 0; blk < numBlocks; blk++) {
      const isLast = blk === numBlocks - 1;
      const len = Math.min(maxBlock, rawData.length - offset);
      const nlen = ~len & 0xffff;
      idatData[pos++] = isLast ? 1 : 0;
      idatData[pos++] = len & 0xff;
      idatData[pos++] = (len >> 8) & 0xff;
      idatData[pos++] = nlen & 0xff;
      idatData[pos++] = (nlen >> 8) & 0xff;
      idatData.set(rawData.subarray(offset, offset + len), pos);
      pos += len;
      offset += len;
    }
    let s1 = 1;
    let s2 = 0;
    for (let i = 0; i < rawData.length; i++) {
      s1 = (s1 + rawData[i]) % 65521;
      s2 = (s2 + s1) % 65521;
    }
    const adler = ((s2 << 16) | s1) >>> 0;
    idatData[pos++] = (adler >>> 24) & 0xff;
    idatData[pos++] = (adler >>> 16) & 0xff;
    idatData[pos++] = (adler >>> 8) & 0xff;
    idatData[pos++] = adler & 0xff;

    function encodePngChunk(typeStr: string, chunkData: Uint8Array): Uint8Array {
      const chunk = new Uint8Array(12 + chunkData.length);
      const dv = new DataView(chunk.buffer);
      dv.setUint32(0, chunkData.length, false);
      for (let i = 0; i < 4; i++) {
        chunk[4 + i] = typeStr.charCodeAt(i);
      }
      chunk.set(chunkData, 8);
      const crc = computeCrc32(chunk.subarray(4, 8 + chunkData.length));
      dv.setUint32(8 + chunkData.length, crc, false);
      return chunk;
    }

    const ihdr = new Uint8Array(13);
    const ihdrDv = new DataView(ihdr.buffer);
    ihdrDv.setUint32(0, width, false);
    ihdrDv.setUint32(4, height, false);
    ihdr[8] = 8; // 8-bit depth
    ihdr[9] = 6; // RGBA color type

    const pngSig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrChunk = encodePngChunk('IHDR', ihdr);
    const idatChunk = encodePngChunk('IDAT', idatData);
    const iendChunk = encodePngChunk('IEND', new Uint8Array(0));

    const pngOut = new Uint8Array(
      pngSig.length + ihdrChunk.length + idatChunk.length + iendChunk.length
    );
    let p = 0;
    pngOut.set(pngSig, p);
    p += pngSig.length;
    pngOut.set(ihdrChunk, p);
    p += ihdrChunk.length;
    pngOut.set(idatChunk, p);
    p += idatChunk.length;
    pngOut.set(iendChunk, p);
    return pngOut;
  }

  const png128 = renderIconPng(128, 128);
  const png256 = renderIconPng(256, 256);
  const totalIcnsLen = 8 + (8 + png128.length) + (8 + png256.length);
  const icns = new Uint8Array(totalIcnsLen);
  const icnsDv = new DataView(icns.buffer);
  // Header 'icns'
  icns[0] = 0x69; // 'i'
  icns[1] = 0x63; // 'c'
  icns[2] = 0x6e; // 'n'
  icns[3] = 0x73; // 's'
  icnsDv.setUint32(4, totalIcnsLen, false);

  // Chunk 1: 'ic07' (128x128 PNG)
  let icnsPos = 8;
  icns[icnsPos + 0] = 0x69; // 'i'
  icns[icnsPos + 1] = 0x63; // 'c'
  icns[icnsPos + 2] = 0x30; // '0'
  icns[icnsPos + 3] = 0x37; // '7'
  icnsDv.setUint32(icnsPos + 4, 8 + png128.length, false);
  icns.set(png128, icnsPos + 8);
  icnsPos += 8 + png128.length;

  // Chunk 2: 'ic08' (256x256 Retina PNG untuk ikon 128pt tajam di jendela .DMG & Dock)
  icns[icnsPos + 0] = 0x69; // 'i'
  icns[icnsPos + 1] = 0x63; // 'c'
  icns[icnsPos + 2] = 0x30; // '0'
  icns[icnsPos + 3] = 0x38; // '8'
  icnsDv.setUint32(icnsPos + 4, 8 + png256.length, false);
  icns.set(png256, icnsPos + 8);

  cachedOpungIcnsBytes = icns;
  return icns;
}

/**
 * Menghasilkan file metadata Finder macOS asli (`.DS_Store` — 15.364 byte, Buddy Allocator `Bud1` + B-Tree `DSDB`):
 * - Mengatur ukuran jendela Finder kompak `540 x 380` (`WindowBounds: "{{260, 220}, {540, 380}}"`) persis seperti Termul Manager
 * - Menyembunyikan toolbar, sidebar, tab bar, dan menampilkan status bar bawah (`2 items`)
 * - Mengatur `arrangeBy: "none"` dan `iconSize: 128.0` agar ikon besar, tajam, dan TIDAK terbalik oleh urutan abjad
 * - Menempatkan `OPUNG.app` di sebelah KIRI (`x = 145, y = 165`) dan `Applications` di sebelah KANAN (`x = 395, y = 165`)
 */
export function buildOpungDmgDsStore(): Uint8Array {
  const ds = new Uint8Array(15364);
  const runs: Array<[number, string]> = [
    [3, '01427564310000200000000800000020000000100c'],
    [46, '0800000008'],
    [71, '02'],
    [79, '0600000001000010'],
    [2055, '01'],
    [2062, '080b'],
    [3111, '01000000200000000100000040000000010000008000000001000001'],
    [3143, '01000002'],
    [3151, '01000004'],
    [3163, '01000010'],
    [3171, '01000020'],
    [3179, '01000040'],
    [3187, '01000080'],
    [3195, '010001'],
    [3203, '010002'],
    [3211, '010004'],
    [3219, '010008'],
    [3227, '010010'],
    [3235, '010020'],
    [3243, '010040'],
    [3251, '010080'],
    [3259, '0101'],
    [3267, '0102'],
    [3275, '0104'],
    [3283, '0108'],
    [3291, '0110'],
    [3299, '0120'],
    [3307, '0140'],
    [
      4107,
      '0600000001002e62777370626c6f62000000ef62706c6973743030d90102030405060708090a0a0a0a0b0a0a0c0d5f1014436f6e7461696e657253686f77536964656261725f10155072657669657750616e655669736962696c6974795b53686f77506174686261725b53686f77536964656261725d53686f775374617475734261725b53686f77546162566965775b53686f77546f6f6c6261725c5369646562617257696474685c57696e646f77426f756e6473080910005f10187b7b3236302c203232307d2c207b3534302c203338307d7d081b324a5662707c8895a2a3a4a6',
    ],
    [4339, '0101'],
    [4348, '0e'],
    [
      4364,
      'c100000001002e69637670626c6f620000017e62706c6973743030de0102030405060708090a0b0c0d0e0f1010101112121314151516171159617272616e676542795f10136261636b67726f756e64436f6c6f72426c75655f10146261636b67726f756e64436f6c6f72477265656e5f10126261636b67726f756e64436f6c6f725265645e6261636b67726f756e64547970655b677269644f6666736574585b677269644f6666736574595b6772696453706163696e675869636f6e53697a655d6c6162656c4f6e426f74746f6d5f100f73686f7749636f6e507265766965775c73686f774974656d496e666f587465787453697a655f1012766965774f7074696f6e7356657273696f6e546e6f6e65233ff0',
    ],
    [4645, '100123'],
    [4656, '234059'],
    [4665, '234060'],
    [4674, '0908234028'],
    [
      4686,
      '080025002f0045005c00710080008c009800a400ad00bb00cd00da00e300f800fd010601080111011a012301240125',
    ],
    [4739, '0201'],
    [4748, '18'],
    [
      4763,
      '012e00000001002e7653726e6c6f6e670000000100000001002e7673746c7479706569636e760000000c004100700070006c00690063006100740069006f006e0073496c6f63626c6f62000000100000018b000000a5ffffff',
    ],
    [
      4860,
      '09004f00500055004e0047002e006100700070496c6f63626c6f620000001000000091000000a5ffffff',
    ],
    [8199, '03'],
    [8206, '200b000000450000100c'],
    [9231, '01044453444200000001'],
    [9264, '020000002000000060'],
    [9280, '010000008000000001000001'],
    [9296, '01000002'],
    [9304, '01000004'],
    [9312, '0200000800000028'],
    [9324, '01000030'],
    [9336, '01000040'],
    [9344, '01000080'],
    [9352, '010001'],
    [9360, '010002'],
    [9368, '010004'],
    [9376, '010008'],
    [9384, '010010'],
    [9392, '010020'],
    [9400, '010040'],
    [9408, '010080'],
    [9416, '0101'],
    [9424, '0102'],
    [9432, '0104'],
    [9440, '0108'],
    [9448, '0110'],
    [9456, '0120'],
    [9464, '0140'],
  ];

  for (const [offset, hex] of runs) {
    for (let i = 0; i < hex.length; i += 2) {
      ds[offset + (i >> 1)] = parseInt(hex.slice(i, i + 2), 16);
    }
  }
  return ds;
}

/**
 * Membangun Disk Image macOS Asli (.DMG — Apple HFS Plus version 4 / TN1150) murni di browser:
 * - Memiliki HFSPlusVolumeHeader resmi ('H+' 0x482B di offset 1024 & Backup Volume Header di akhir disk)
 * - Mengatur finderInfo[2] = 2 (kHFSRootFolderID) sehingga saat file OPUNG-Installer.dmg diklik di
 *   Downloads / Finder macOS, jendela Finder "OPUNG" OTOMATIS langsung terbuka di layar!
 * - Dilengkapi `.DS_Store` & `.VolumeIcon.icns` resmi sehingga ukuran jendela kompak (540x380),
 *   ikon berukuran 128pt Retina, `OPUNG.app` berada di sebelah KIRI (145, 165) dan `Applications`
 *   berada di sebelah KANAN (395, 165) persis seperti Termul Manager!
 */
export function buildMacOSDiskImageDmg(): ArrayBuffer {
  const encoder = new TextEncoder();
  const BLOCK_SIZE = 4096;
  const TOTAL_BLOCKS = 256; // 256 * 4096 = 1,048,576 bytes (1.0 MB HFS+ Volume)
  const HFS_TIMESTAMP = 3853017600; // Seconds since 1904-01-01 00:00:00 UTC
  const appIconIcnsBytes = buildOpungAppIconIcns();
  const dsStoreBytes = buildOpungDmgDsStore();

  interface HfsFolderItem {
    kind: 'folder';
    cnid: number;
    parentCnid: number;
    name: string;
    valence: number;
    isBundle?: boolean;
    isRoot?: boolean;
  }

  interface HfsFileItem {
    kind: 'file';
    cnid: number;
    parentCnid: number;
    name: string;
    mode: number;
    data: Uint8Array;
    isSymlink?: boolean;
    isInvisible?: boolean;
    locationX?: number;
    locationY?: number;
    startBlock?: number;
    blockCount?: number;
  }

  const folders: HfsFolderItem[] = [
    {
      kind: 'folder',
      cnid: 2,
      parentCnid: 1,
      name: 'OPUNG',
      valence: 4,
      isRoot: true,
    },
    {
      kind: 'folder',
      cnid: 16,
      parentCnid: 2,
      name: 'OPUNG.app',
      valence: 1,
      isBundle: true,
    },
    {
      kind: 'folder',
      cnid: 17,
      parentCnid: 16,
      name: 'Contents',
      valence: 3,
    },
    {
      kind: 'folder',
      cnid: 18,
      parentCnid: 17,
      name: 'MacOS',
      valence: 2,
    },
    {
      kind: 'folder',
      cnid: 19,
      parentCnid: 17,
      name: 'Resources',
      valence: 2,
    },
    {
      kind: 'folder',
      cnid: 20,
      parentCnid: 19,
      name: 'app',
      valence: 3,
    },
  ];

  const files: HfsFileItem[] = [
    {
      kind: 'file',
      cnid: 21,
      parentCnid: 2,
      name: '.DS_Store',
      mode: 0o100644,
      isInvisible: true,
      data: dsStoreBytes,
    },
    {
      kind: 'file',
      cnid: 22,
      parentCnid: 2,
      name: '.VolumeIcon.icns',
      mode: 0o100644,
      isInvisible: true,
      data: appIconIcnsBytes,
    },
    {
      kind: 'file',
      cnid: 23,
      parentCnid: 2,
      name: 'Applications',
      mode: 0o120755,
      isSymlink: true,
      locationX: 395,
      locationY: 165,
      data: encoder.encode('/Applications'),
    },
    {
      kind: 'file',
      cnid: 24,
      parentCnid: 17,
      name: 'Info.plist',
      mode: 0o100644,
      data: encoder.encode(MACOS_INFO_PLIST),
    },
    {
      kind: 'file',
      cnid: 25,
      parentCnid: 18,
      name: 'OPUNG',
      mode: 0o100755,
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
    },
    {
      kind: 'file',
      cnid: 26,
      parentCnid: 18,
      name: 'RNNoiseStudio',
      mode: 0o100755,
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
    },
    {
      kind: 'file',
      cnid: 27,
      parentCnid: 19,
      name: 'AppIcon.icns',
      mode: 0o100644,
      data: appIconIcnsBytes,
    },
    {
      kind: 'file',
      cnid: 28,
      parentCnid: 20,
      name: 'index.html',
      mode: 0o100644,
      data: encoder.encode(MACOS_STANDALONE_APP_HTML),
    },
    {
      kind: 'file',
      cnid: 29,
      parentCnid: 20,
      name: 'native_host.jxa.js',
      mode: 0o100644,
      data: encoder.encode(MACOS_NATIVE_JXA_SCRIPT),
    },
    {
      kind: 'file',
      cnid: 30,
      parentCnid: 20,
      name: 'native_host.m',
      mode: 0o100644,
      data: encoder.encode(MACOS_NATIVE_OBJC_SOURCE),
    },
  ];

  // Alokasi Blok HFS+:
  // Block 0: Boot Blocks + Primary HFSPlusVolumeHeader (di offset 1024)
  // Block 1: Allocation Bitmap File (1 block = 4096 bytes)
  // Block 2..3: Extents Overflow B-Tree (2 blocks = 8192 bytes, nodeSize = 4096)
  // Block 4..7: Catalog B-Tree (4 blocks = 16384 bytes, nodeSize = 8192, Node 0 = Header, Node 1 = Leaf)
  // Block 8..N: Data Fork untuk setiap file
  // Block 255: Backup HFSPlusVolumeHeader (di 1024 byte terakhir volume)
  let nextBlock = 8;
  for (const f of files) {
    const blocksNeeded = Math.max(1, Math.ceil(f.data.byteLength / BLOCK_SIZE));
    f.startBlock = nextBlock;
    f.blockCount = blocksNeeded;
    nextBlock += blocksNeeded;
  }
  const usedBlocksBeforeEnd = nextBlock;

  const hfsByteLength = TOTAL_BLOCKS * BLOCK_SIZE;
  const hfsBuffer = new ArrayBuffer(hfsByteLength);
  const dmgBytes = new Uint8Array(hfsBuffer);

  // Salin isi setiap file ke blok yang telah dialokasikan
  for (const f of files) {
    dmgBytes.set(f.data, f.startBlock! * BLOCK_SIZE);
  }

  function encodeCatalogKey(parentCnid: number, name: string): Uint8Array {
    const nameLen = name.length;
    const keyLength = 6 + nameLen * 2;
    const buf = new Uint8Array(2 + keyLength);
    const dv = new DataView(buf.buffer);
    dv.setUint16(0, keyLength, false);
    dv.setUint32(2, parentCnid, false);
    dv.setUint16(6, nameLen, false);
    for (let i = 0; i < nameLen; i++) {
      dv.setUint16(8 + i * 2, name.charCodeAt(i), false);
    }
    return buf;
  }

  function encodeFolderRecord(folder: HfsFolderItem): Uint8Array {
    const buf = new Uint8Array(88);
    const dv = new DataView(buf.buffer);
    dv.setInt16(0, 0x0001, false); // kHFSPlusFolderRecord
    dv.setUint16(2, 0x0002, false); // kHFSThreadExistsMask
    dv.setUint32(4, folder.valence, false);
    dv.setUint32(8, folder.cnid, false);
    dv.setUint32(12, HFS_TIMESTAMP, false); // createDate
    dv.setUint32(16, HFS_TIMESTAMP, false); // contentModDate
    dv.setUint32(20, HFS_TIMESTAMP, false); // attributeModDate
    dv.setUint32(24, HFS_TIMESTAMP, false); // accessDate
    dv.setUint32(28, 0, false); // backupDate
    // HFSPlusBSDInfo (offset 32..47): ownerID=99 (_unknown), groupID=99, fileMode=0o040755
    dv.setUint32(32, 99, false);
    dv.setUint32(36, 99, false);
    dv.setUint16(42, 0o040755, false);

    // FolderInfo (offset 48..63)
    if (folder.isRoot) {
      // Ukuran & posisi jendela Finder (top=220, left=260, bottom=600, right=800 -> 540x380) + kHasCustomIcon (0x0400)
      dv.setInt16(48, 220, false);
      dv.setInt16(50, 260, false);
      dv.setInt16(52, 600, false);
      dv.setInt16(54, 800, false);
      dv.setUint16(56, 0x0400, false); // kHasCustomIcon untuk menampilkan .VolumeIcon.icns di titlebar jendela Finder
    } else if (folder.isBundle) {
      // kHasBundle = 0x2000 agar Finder macOS mengenali OPUNG.app sebagai Application Bundle dengan ikon AppIcon.icns!
      dv.setUint16(56, 0x2000, false);
      dv.setInt16(58, 165, false); // icon location Y (sejajar dengan Applications di kanan)
      dv.setInt16(60, 145, false); // icon location X (di sisi KIRI jendela Finder)
    }
    return buf;
  }

  function encodeFileRecord(file: HfsFileItem): Uint8Array {
    const buf = new Uint8Array(248);
    const dv = new DataView(buf.buffer);
    dv.setInt16(0, 0x0002, false); // kHFSPlusFileRecord
    dv.setUint16(2, 0x0002, false); // kHFSThreadExistsMask
    dv.setUint32(4, 0, false);
    dv.setUint32(8, file.cnid, false);
    dv.setUint32(12, HFS_TIMESTAMP, false);
    dv.setUint32(16, HFS_TIMESTAMP, false);
    dv.setUint32(20, HFS_TIMESTAMP, false);
    dv.setUint32(24, HFS_TIMESTAMP, false);
    dv.setUint32(28, 0, false);
    // HFSPlusBSDInfo (offset 32..47): ownerID=99 (_unknown), groupID=99, fileMode
    dv.setUint32(32, 99, false);
    dv.setUint32(36, 99, false);
    dv.setUint16(42, file.mode, false);

    // FileInfo / FinderInfo (offset 48..63)
    if (file.isSymlink) {
      // Symlink HFS+ resmi sesuai Apple TN1150: fileType = 'slnk' (0x736C6E6B), fileCreator = 'rhap' (0x72686170)
      dv.setUint32(48, 0x736c6e6b, false); // 'slnk'
      dv.setUint32(52, 0x72686170, false); // 'rhap'
      dv.setUint16(56, 0x0000, false);
      dv.setInt16(58, file.locationY ?? 165, false); // icon location Y
      dv.setInt16(60, file.locationX ?? 395, false); // icon location X (di sisi KANAN jendela Finder)
    } else if (file.isInvisible) {
      // kIsInvisible = 0x4000 agar .DS_Store dan .VolumeIcon.icns tersembunyi dan Finder menampilkan "2 items"
      dv.setUint16(56, 0x4000, false);
      dv.setInt16(58, 900, false);
      dv.setInt16(60, 900, false);
    }

    // Data Fork HFSPlusForkData (offset 88..167)
    dv.setUint32(88, 0, false); // logicalSize high
    dv.setUint32(92, file.data.byteLength, false); // logicalSize low
    dv.setUint32(96, file.blockCount! * BLOCK_SIZE, false); // clumpSize
    dv.setUint32(100, file.blockCount!, false); // totalBlocks
    dv.setUint32(104, file.startBlock!, false); // extents[0].startBlock
    dv.setUint32(108, file.blockCount!, false); // extents[0].blockCount
    return buf;
  }

  function encodeThreadRecord(
    isFolder: boolean,
    parentCnid: number,
    name: string
  ): Uint8Array {
    const nameLen = name.length;
    const buf = new Uint8Array(10 + nameLen * 2);
    const dv = new DataView(buf.buffer);
    dv.setInt16(0, isFolder ? 0x0003 : 0x0004, false); // FolderThread (3) or FileThread (4)
    dv.setInt16(2, 0, false);
    dv.setUint32(4, parentCnid, false);
    dv.setUint16(8, nameLen, false);
    for (let i = 0; i < nameLen; i++) {
      dv.setUint16(10 + i * 2, name.charCodeAt(i), false);
    }
    return buf;
  }

  interface CatalogBTreeEntry {
    sortParentCnid: number;
    sortNameKey: string;
    bytes: Uint8Array;
  }

  const catalogEntries: CatalogBTreeEntry[] = [];

  for (const folder of folders) {
    const key = encodeCatalogKey(folder.parentCnid, folder.name);
    const val = encodeFolderRecord(folder);
    const combined = new Uint8Array(key.length + val.length);
    combined.set(key, 0);
    combined.set(val, key.length);
    catalogEntries.push({
      sortParentCnid: folder.parentCnid,
      sortNameKey: folder.name.toLowerCase(),
      bytes: combined,
    });

    const tKey = encodeCatalogKey(folder.cnid, '');
    const tVal = encodeThreadRecord(true, folder.parentCnid, folder.name);
    const tCombined = new Uint8Array(tKey.length + tVal.length);
    tCombined.set(tKey, 0);
    tCombined.set(tVal, tKey.length);
    catalogEntries.push({
      sortParentCnid: folder.cnid,
      sortNameKey: '',
      bytes: tCombined,
    });
  }

  for (const file of files) {
    const key = encodeCatalogKey(file.parentCnid, file.name);
    const val = encodeFileRecord(file);
    const combined = new Uint8Array(key.length + val.length);
    combined.set(key, 0);
    combined.set(val, key.length);
    catalogEntries.push({
      sortParentCnid: file.parentCnid,
      sortNameKey: file.name.toLowerCase(),
      bytes: combined,
    });

    const tKey = encodeCatalogKey(file.cnid, '');
    const tVal = encodeThreadRecord(false, file.parentCnid, file.name);
    const tCombined = new Uint8Array(tKey.length + tVal.length);
    tCombined.set(tKey, 0);
    tCombined.set(tVal, tKey.length);
    catalogEntries.push({
      sortParentCnid: file.cnid,
      sortNameKey: '',
      bytes: tCombined,
    });
  }

  // Urutkan Catalog B-Tree sesuai aturan HFS+ Case-Folding (parentID ascending, lalu nama)
  catalogEntries.sort((a, b) => {
    if (a.sortParentCnid !== b.sortParentCnid) {
      return a.sortParentCnid - b.sortParentCnid;
    }
    if (a.sortNameKey < b.sortNameKey) return -1;
    if (a.sortNameKey > b.sortNameKey) return 1;
    return 0;
  });

  // 1. Bangun Allocation Bitmap di Block 1 (offset 4096..8191)
  const bitmap = new Uint8Array(hfsBuffer, 1 * BLOCK_SIZE, BLOCK_SIZE);
  function markBlockAllocated(blockIndex: number) {
    const byteIdx = blockIndex >> 3;
    const bitMask = 1 << (7 - (blockIndex & 7));
    bitmap[byteIdx] |= bitMask;
  }
  for (let b = 0; b < usedBlocksBeforeEnd; b++) {
    markBlockAllocated(b);
  }
  // Blok terakhir (TOTAL_BLOCKS - 1) dipakai untuk Backup Volume Header
  markBlockAllocated(TOTAL_BLOCKS - 1);

  // 2. Bangun Extents Overflow B-Tree di Block 2..3 (nodeSize = 4096, 2 nodes, kosong)
  {
    const extNode0 = new Uint8Array(hfsBuffer, 2 * BLOCK_SIZE, 4096);
    const dv = new DataView(extNode0.buffer, extNode0.byteOffset, 4096);
    // BTNodeDescriptor (14 bytes)
    dv.setUint32(0, 0, false); // fLink
    dv.setUint32(4, 0, false); // bLink
    dv.setInt8(8, 1); // kBTHeaderNode = 1
    dv.setUint8(9, 0); // height = 0
    dv.setUint16(10, 3, false); // numRecords = 3

    // Record 0 (offset 14, 106 bytes): BTHeaderRec
    dv.setUint16(14 + 0, 0, false); // treeDepth = 0
    dv.setUint32(14 + 2, 0, false); // rootNode = 0
    dv.setUint32(14 + 6, 0, false); // leafRecords = 0
    dv.setUint32(14 + 10, 0, false); // firstLeafNode = 0
    dv.setUint32(14 + 14, 0, false); // lastLeafNode = 0
    dv.setUint16(14 + 18, 4096, false); // nodeSize = 4096
    dv.setUint16(14 + 20, 10, false); // maxKeyLength = 10
    dv.setUint32(14 + 22, 2, false); // totalNodes = 2
    dv.setUint32(14 + 26, 1, false); // freeNodes = 1
    dv.setUint32(14 + 32, 8192, false); // clumpSize = 8192
    dv.setUint8(14 + 36, 0); // btreeType = 0
    dv.setUint8(14 + 37, 0); // keyCompareType = 0
    dv.setUint32(14 + 38, 2, false); // attributes = kBTBigKeysMask (2)

    // Record 2 (offset 248): Map Record (Node 0 terpakai = 0x80)
    extNode0[248] = 0x80;

    // Tabel Offset di ujung akhir Node 0
    dv.setUint16(4096 - 2, 14, false); // Offset Record 0
    dv.setUint16(4096 - 4, 120, false); // Offset Record 1 (User Data 128B)
    dv.setUint16(4096 - 6, 248, false); // Offset Record 2 (Map Record)
    dv.setUint16(4096 - 8, 4088, false); // Offset Free Space
  }

  // 3. Bangun Catalog B-Tree di Block 4..7 (nodeSize = 8192, totalNodes = 2: Node 0 Header, Node 1 Leaf)
  {
    const catNode0 = new Uint8Array(hfsBuffer, 4 * BLOCK_SIZE, 8192);
    const dv0 = new DataView(catNode0.buffer, catNode0.byteOffset, 8192);
    // BTNodeDescriptor
    dv0.setUint32(0, 0, false);
    dv0.setUint32(4, 0, false);
    dv0.setInt8(8, 1); // kBTHeaderNode = 1
    dv0.setUint8(9, 0); // height = 0
    dv0.setUint16(10, 3, false); // numRecords = 3

    // Record 0 (offset 14, 106 bytes): BTHeaderRec
    dv0.setUint16(14 + 0, 1, false); // treeDepth = 1
    dv0.setUint32(14 + 2, 1, false); // rootNode = 1
    dv0.setUint32(14 + 6, catalogEntries.length, false); // leafRecords
    dv0.setUint32(14 + 10, 1, false); // firstLeafNode = 1
    dv0.setUint32(14 + 14, 1, false); // lastLeafNode = 1
    dv0.setUint16(14 + 18, 8192, false); // nodeSize = 8192
    dv0.setUint16(14 + 20, 516, false); // maxKeyLength = 516
    dv0.setUint32(14 + 22, 2, false); // totalNodes = 2
    dv0.setUint32(14 + 26, 0, false); // freeNodes = 0
    dv0.setUint32(14 + 32, 16384, false); // clumpSize = 16384
    dv0.setUint8(14 + 36, 0); // btreeType = 0
    dv0.setUint8(14 + 37, 0xcf); // keyCompareType = kHFSCaseFolding (0xCF)
    dv0.setUint32(14 + 38, 6, false); // attributes = kBTBigKeysMask | kBTVariableIndexKeysMask (6)

    // Record 2 (offset 248): Map Record (Node 0 & Node 1 terpakai = 0xC0)
    catNode0[248] = 0xc0;

    dv0.setUint16(8192 - 2, 14, false);
    dv0.setUint16(8192 - 4, 120, false);
    dv0.setUint16(8192 - 6, 248, false);
    dv0.setUint16(8192 - 8, 8184, false);

    // Node 1 (Leaf Node di offset 4 * BLOCK_SIZE + 8192 = Block 6..7)
    const catNode1 = new Uint8Array(hfsBuffer, 6 * BLOCK_SIZE, 8192);
    const dv1 = new DataView(catNode1.buffer, catNode1.byteOffset, 8192);
    dv1.setUint32(0, 0, false); // fLink = 0
    dv1.setUint32(4, 0, false); // bLink = 0
    dv1.setInt8(8, -1); // kBTLeafNode = -1 (0xFF)
    dv1.setUint8(9, 1); // height = 1
    dv1.setUint16(10, catalogEntries.length, false); // numRecords

    let recOffset = 14;
    for (let i = 0; i < catalogEntries.length; i++) {
      const recBytes = catalogEntries[i].bytes;
      dv1.setUint16(8192 - (i + 1) * 2, recOffset, false);
      catNode1.set(recBytes, recOffset);
      recOffset += recBytes.length;
      if (recOffset % 2 !== 0) recOffset += 1;
    }
    // Free space offset di akhir tabel offset
    dv1.setUint16(8192 - (catalogEntries.length + 1) * 2, recOffset, false);
  }

  // 4. Bangun HFSPlusVolumeHeader (512 bytes) untuk offset 1024 dan Backup di (totalSize - 1024)
  const vh = new Uint8Array(512);
  const vhd = new DataView(vh.buffer);
  vhd.setUint16(0, 0x482b, false); // Signature 'H+' (0x482B)
  vhd.setUint16(2, 4, false); // Version = 4
  vhd.setUint32(4, 0x00000100, false); // Attributes = kHFSVolumeUnmountedBit (1 << 8)
  vhd.setUint32(8, 0x31302e30, false); // lastMountedVersion = '10.0'
  vhd.setUint32(12, 0, false); // journalInfoBlock = 0
  vhd.setUint32(16, HFS_TIMESTAMP, false); // createDate
  vhd.setUint32(20, HFS_TIMESTAMP, false); // modifyDate
  vhd.setUint32(24, 0, false); // backupDate
  vhd.setUint32(28, HFS_TIMESTAMP, false); // checkedDate
  vhd.setUint32(32, files.length, false); // fileCount = 8
  vhd.setUint32(36, folders.length - 1, false); // folderCount (excluding root folder per TN1150)
  vhd.setUint32(40, BLOCK_SIZE, false); // blockSize = 4096
  vhd.setUint32(44, TOTAL_BLOCKS, false); // totalBlocks = 256
  vhd.setUint32(48, TOTAL_BLOCKS - usedBlocksBeforeEnd - 1, false); // freeBlocks
  vhd.setUint32(52, usedBlocksBeforeEnd, false); // nextAllocation
  vhd.setUint32(56, 16384, false); // rsrcClumpSize
  vhd.setUint32(60, 16384, false); // dataClumpSize
  vhd.setUint32(64, 32, false); // nextCatalogID
  vhd.setUint32(68, 1, false); // writeCount
  vhd.setUint32(72, 0, false); // encodingsBitmap high
  vhd.setUint32(76, 1, false); // encodingsBitmap low = 1

  // finderInfo[8] (offset 80..111):
  // finderInfo[2] (offset 88) = 2 (kHFSRootFolderID) -> Memerintahkan Finder macOS untuk OTOMATIS
  // membuka jendela folder "OPUNG Installer" begitu file .dmg diklik!
  const uniqueSeed = (Date.now() & 0xffffffff) >>> 0;
  vhd.setUint32(88, 2, false);
  vhd.setUint32(104, 0x4f505631, false); // Volume UUID high ('OPV1')
  vhd.setUint32(108, uniqueSeed ^ 0x32444d47, false); // Unique Volume UUID low

  // allocationFile ForkData (offset 112..191): Block 1 (1 block = 4096B)
  vhd.setUint32(112 + 4, BLOCK_SIZE, false); // logicalSize low
  vhd.setUint32(112 + 8, BLOCK_SIZE, false); // clumpSize
  vhd.setUint32(112 + 12, 1, false); // totalBlocks = 1
  vhd.setUint32(112 + 16, 1, false); // extents[0].startBlock = 1
  vhd.setUint32(112 + 20, 1, false); // extents[0].blockCount = 1

  // extentsFile ForkData (offset 192..271): Block 2..3 (2 blocks = 8192B)
  vhd.setUint32(192 + 4, 2 * BLOCK_SIZE, false);
  vhd.setUint32(192 + 8, 2 * BLOCK_SIZE, false);
  vhd.setUint32(192 + 12, 2, false);
  vhd.setUint32(192 + 16, 2, false); // extents[0].startBlock = 2
  vhd.setUint32(192 + 20, 2, false); // extents[0].blockCount = 2

  // catalogFile ForkData (offset 272..351): Block 4..7 (4 blocks = 16384B)
  vhd.setUint32(272 + 4, 4 * BLOCK_SIZE, false);
  vhd.setUint32(272 + 8, 4 * BLOCK_SIZE, false);
  vhd.setUint32(272 + 12, 4, false);
  vhd.setUint32(272 + 16, 4, false); // extents[0].startBlock = 4
  vhd.setUint32(272 + 20, 4, false); // extents[0].blockCount = 4

  // Tulis Primary Volume Header di byte 1024 dan Backup Volume Header di (totalSize - 1024)
  dmgBytes.set(vh, 1024);
  dmgBytes.set(vh, hfsByteLength - 1024);

  // 5. Bangun Apple UDIF Trailer (mish + XML Plist + 512-byte 'koly' block)
  // sehingga DiskImages2 (macOS Ventura / Sonoma / Sequoia) maupun HFS+ mounter langsung mengenali .dmg ini!
  const sectorCount512 = hfsByteLength / 512; // 2048 sektor @ 512B

  const mish = new Uint8Array(204 + 2 * 40);
  const mdv = new DataView(mish.buffer);
  mdv.setUint32(0, 0x6d697368, false); // 'mish'
  mdv.setUint32(4, 1, false); // version = 1
  mdv.setUint32(8, 0, false); // firstSectorNumber high
  mdv.setUint32(12, 0, false); // firstSectorNumber low
  mdv.setUint32(16, 0, false); // sectorCount high
  mdv.setUint32(20, sectorCount512, false); // sectorCount low = 2048
  mdv.setUint32(24, 0, false); // dataOffset high
  mdv.setUint32(28, 0, false); // dataOffset low
  mdv.setUint32(32, 2048, false); // buffersNeeded
  mdv.setUint32(36, 0xffffffff, false); // blockDescriptors = -1
  mdv.setUint32(64, 0, false); // checksum.type = kUDIFChecksumTypeNone (0)
  mdv.setUint32(68, 0, false); // checksum.size = 0
  mdv.setUint32(200, 2, false); // numberOfBlockChunks = 2

  // Chunk 0: BT_RAW (0x00000001) — Uncompressed HFS+ Volume
  mdv.setUint32(204, 0x00000001, false);
  mdv.setUint32(208, 0, false);
  mdv.setUint32(212, 0, false); // sectorNumber high
  mdv.setUint32(216, 0, false); // sectorNumber low
  mdv.setUint32(220, 0, false); // sectorCount high
  mdv.setUint32(224, sectorCount512, false); // sectorCount low = 2048
  mdv.setUint32(228, 0, false); // compressedOffset high
  mdv.setUint32(232, 0, false); // compressedOffset low
  mdv.setUint32(236, 0, false); // compressedLength high
  mdv.setUint32(240, hfsByteLength, false); // compressedLength low

  // Chunk 1: BT_TERM (0xFFFFFFFF) — End of Block Table
  mdv.setUint32(244, 0xffffffff, false);
  mdv.setUint32(248, 0, false);
  mdv.setUint32(252, 0, false);
  mdv.setUint32(256, sectorCount512, false);
  mdv.setUint32(260, 0, false);
  mdv.setUint32(264, 0, false);
  mdv.setUint32(268, 0, false);
  mdv.setUint32(272, hfsByteLength, false);
  mdv.setUint32(276, 0, false);
  mdv.setUint32(280, 0, false);

  let mishBinaryStr = '';
  for (let i = 0; i < mish.length; i++) {
    mishBinaryStr += String.fromCharCode(mish[i]);
  }
  const mishBase64 = btoa(mishBinaryStr);

  const udifPlistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>resource-fork</key>
\t<dict>
\t\t<key>blkx</key>
\t\t<array>
\t\t\t<dict>
\t\t\t\t<key>Attributes</key>
\t\t\t\t<string>0x0050</string>
\t\t\t\t<key>CFName</key>
\t\t\t\t<string>whole disk (Apple_HFS : 0)</string>
\t\t\t\t<key>Data</key>
\t\t\t\t<data>${mishBase64}</data>
\t\t\t\t<key>ID</key>
\t\t\t\t<string>-1</string>
\t\t\t\t<key>Name</key>
\t\t\t\t<string>whole disk (Apple_HFS : 0)</string>
\t\t\t</dict>
\t\t</array>
\t</dict>
</dict>
</plist>
`;
  const xmlBytes = encoder.encode(udifPlistXml);

  const koly = new Uint8Array(512);
  const kdv = new DataView(koly.buffer);
  kdv.setUint32(0, 0x6b6f6c79, false); // 'koly'
  kdv.setUint32(4, 4, false); // version = 4
  kdv.setUint32(8, 512, false); // headerSize = 512
  kdv.setUint32(12, 1, false); // flags = kUDIFFlagsFlattened (1)
  kdv.setUint32(16, 0, false); // runningDataForkOffset high
  kdv.setUint32(20, 0, false); // runningDataForkOffset low
  kdv.setUint32(24, 0, false); // dataForkOffset high
  kdv.setUint32(28, 0, false); // dataForkOffset low
  kdv.setUint32(32, 0, false); // dataForkLength high
  kdv.setUint32(36, hfsByteLength, false); // dataForkLength low
  kdv.setUint32(40, 0, false); // rsrcForkOffset high
  kdv.setUint32(44, 0, false); // rsrcForkOffset low
  kdv.setUint32(48, 0, false); // rsrcForkLength high
  kdv.setUint32(52, 0, false); // rsrcForkLength low
  kdv.setUint32(56, 1, false); // segmentNumber = 1
  kdv.setUint32(60, 1, false); // segmentCount = 1
  kdv.setUint32(64, 0x4f505631, false); // segmentID[0]
  kdv.setUint32(68, 0x325f444d, false); // segmentID[1]
  kdv.setUint32(72, uniqueSeed, false); // segmentID[2]
  kdv.setUint32(76, 0x56313230, false); // segmentID[3]
  kdv.setUint32(80, 0, false); // dataForkChecksum.type = None (0)
  kdv.setUint32(84, 0, false); // dataForkChecksum.size = 0
  kdv.setUint32(216, 0, false); // xmlOffset high
  kdv.setUint32(220, hfsByteLength, false); // xmlOffset low
  kdv.setUint32(224, 0, false); // xmlLength high
  kdv.setUint32(228, xmlBytes.length, false); // xmlLength low
  kdv.setUint32(352, 0, false); // masterChecksum.type = None (0)
  kdv.setUint32(356, 0, false); // masterChecksum.size = 0
  kdv.setUint32(488, 1, false); // imageVariant = kUDIFDeviceImageType (1)
  kdv.setUint32(492, 0, false); // sectorCount high
  kdv.setUint32(496, sectorCount512, false); // sectorCount low = 2048

  const finalDmgBuffer = new ArrayBuffer(
    hfsByteLength + xmlBytes.length + koly.length
  );
  const finalDmgBytes = new Uint8Array(finalDmgBuffer);
  finalDmgBytes.set(dmgBytes, 0);
  finalDmgBytes.set(xmlBytes, hfsByteLength);
  finalDmgBytes.set(koly, hfsByteLength + xmlBytes.length);

  return finalDmgBuffer;
}

export function buildMacOSAppBundleZip(): ArrayBuffer {
  const encoder = new TextEncoder();
  const empty = new Uint8Array(0);
  const oneClickInstallerScript = generateMacOSOneClickInstallerScript();
  const appIconIcnsBytes = buildOpungAppIconIcns();

  return createUnixZipArchive([
    { path: 'OPUNG.app/', data: empty, unixMode: 0o040755 },
    { path: 'OPUNG.app/Contents/', data: empty, unixMode: 0o040755 },
    { path: 'OPUNG.app/Contents/MacOS/', data: empty, unixMode: 0o040755 },
    { path: 'OPUNG.app/Contents/Resources/', data: empty, unixMode: 0o040755 },
    { path: 'OPUNG.app/Contents/Resources/app/', data: empty, unixMode: 0o040755 },
    {
      path: 'OPUNG.app/Contents/Info.plist',
      data: encoder.encode(MACOS_INFO_PLIST),
      unixMode: 0o100644,
    },
    {
      path: 'OPUNG.app/Contents/Resources/AppIcon.icns',
      data: appIconIcnsBytes,
      unixMode: 0o100644,
    },
    {
      path: 'OPUNG.app/Contents/Resources/app/index.html',
      data: encoder.encode(MACOS_STANDALONE_APP_HTML),
      unixMode: 0o100644,
    },
    {
      path: 'OPUNG.app/Contents/Resources/app/native_host.m',
      data: encoder.encode(MACOS_NATIVE_OBJC_SOURCE),
      unixMode: 0o100644,
    },
    {
      path: 'OPUNG.app/Contents/Resources/app/native_host.jxa.js',
      data: encoder.encode(MACOS_NATIVE_JXA_SCRIPT),
      unixMode: 0o100644,
    },
    {
      path: 'OPUNG.app/Contents/MacOS/OPUNG',
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
      unixMode: 0o100755,
    },
    {
      path: 'OPUNG.app/Contents/MacOS/RNNoiseStudio',
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
      unixMode: 0o100755,
    },
    {
      path: 'Install-OPUNG-dan-Buat-DMG-PKG.command',
      data: encoder.encode(oneClickInstallerScript),
      unixMode: 0o100755,
    },
  ]);
}

export function buildChromeExtensionZip(
  files: { filename: string; content: string }[]
): ArrayBuffer {
  const encoder = new TextEncoder();
  const empty = new Uint8Array(0);
  const entries: ZipEntryInput[] = [
    { path: 'OPUNG-Google-Meet-Extension/', data: empty, unixMode: 0o040755 },
  ];
  for (const file of files) {
    entries.push({
      path: `OPUNG-Google-Meet-Extension/${file.filename}`,
      data: encoder.encode(file.content),
      unixMode: 0o100644,
    });
  }
  return createUnixZipArchive(entries);
}



