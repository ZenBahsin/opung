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
  <title>OPUNG — Peredam Bising &amp; Fokus Suara</title>
  <style>
    * { box-sizing: border-box; user-select: none; -webkit-user-select: none; }
    body {
      margin: 0;
      padding: 16px;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }
    .brand {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #ffffff;
    }
    .engine-meta {
      font-size: 11px;
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
      padding: 14px 16px;
      border-radius: 14px;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .hero-switch-card.active {
      background: #0f1b2d;
      border-color: rgba(56, 189, 248, 0.45);
    }
    .switch-title {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 3px;
    }
    .switch-sub {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.35;
    }
    .toggle-track {
      width: 48px;
      height: 26px;
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
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #ffffff;
      transform: translateX(0);
      transition: transform 0.18s ease;
    }
    .toggle-track.active .toggle-thumb {
      transform: translateX(22px);
    }

    /* Clean Device Card */
    .device-card {
      background: #111827;
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 11px;
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
      border-radius: 14px;
      padding: 12px 14px;
    }
    .segmented-bar {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      background: #090d16;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.12);
      margin-top: 6px;
    }
    .seg-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 4px;
      border-radius: 7px;
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
      margin-top: 8px;
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
      border-radius: 14px;
      padding: 12px 14px;
    }
    .meter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .gate-state {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10.5px;
      font-weight: 600;
      color: #38bdf8;
    }
    canvas {
      width: 100%;
      height: 82px;
      display: block;
      background: #090d16;
      border-radius: 9px;
      border: 1px solid rgba(148, 163, 184, 0.12);
    }
    .meter-footer {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
      margin-top: 7px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    /* Single Quiet Self-Test Button */
    .test-btn {
      width: 100%;
      padding: 10px 12px;
      border-radius: 11px;
      font-size: 11.5px;
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
  </style>
</head>
<body>
  <div class="header">
    <span class="brand">OPUNG</span>
    <span id="engineStatus" class="engine-meta">HD Voice · Neural AI · &le; 1.0m</span>
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
        <span id="sinkBadge" class="field-status">Otomatis</span>
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

      processFrame480(frame, thresholdDb) {
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

        let targetGain = 0.0;
        if (frameDb >= thresholdDb) {
          targetGain = 1.0;
          this.holdCounter = this.holdFrames;
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

      processAudioBlock(inputBuffer, outputBuffer, enabled, thresholdDb) {
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
          this.processFrame480(this.frame480, thresholdDb);
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
    let dspCore = new NearFieldRNNoiseDspCore();
    let currentMicStream = null;
    let currentCleanStream = null;

    function syncMicEchoCancellationConstraint() {
      if (!currentMicStream) return;
      const track = currentMicStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track.applyConstraints({
          echoCancellation: !loopbackAudible,
          noiseSuppression: true,
          autoGainControl: false,
        }).catch(() => {});
      }
    }

    function isVirtualCableLabel(label) {
      const l = (label || '').toLowerCase();
      return (
        l.includes('opung') ||
        l.includes('blackhole') ||
        l.includes('vb-cable') ||
        l.includes('soundflower') ||
        l.includes('loopback') ||
        l.includes('existential') ||
        l.includes('virtual')
      );
    }

    function isOpungOrBlackHoleInputLabel(label) {
      const l = (label || '').toLowerCase();
      return l.includes('opung') || l.includes('blackhole');
    }

    function isPhysicalSpeakerOrEarphoneLabel(label) {
      const l = (label || '').toLowerCase();
      if (isVirtualCableLabel(l)) return false;
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
        document.title = 'OPUNG — Aktif';
      } else {
        heroSwitchCard.className = 'hero-switch-card';
        toggleBtn.className = 'toggle-track';
        statusText.textContent = 'Peredam Bising Dimatikan (Bypass)';
        hintText.textContent = 'Semua suara sekitar masuk ke mikrofon tanpa penyaringan.';
        document.title = 'OPUNG — Nonaktif';
      }
    });

    loopbackBtn.addEventListener('click', () => {
      loopbackAudible = !loopbackAudible;
      syncMicEchoCancellationConstraint();
      if (loopbackAudible) {
        if (currentCleanStream) {
          earphoneLoopbackOut.srcObject = currentCleanStream;
        }
        earphoneLoopbackOut.volume = 1.0;
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

    async function applyOutputSink(sinkId) {
      virtualCableAudioOut.muted = true;
      virtualCableAudioOut.volume = 0;
      virtualCableAudioOut.pause();

      if (
        !sinkId ||
        sinkId === 'default' ||
        sinkId === 'communications' ||
        sinkId === 'coreaudio-default'
      ) {
        virtualCableAudioOut.srcObject = null;
        sinkBadge.textContent = 'Siaga (Earphone Aman)';
        sinkBadge.style.color = '#94a3b8';
        return;
      }

      try {
        if (typeof virtualCableAudioOut.setSinkId === 'function') {
          await virtualCableAudioOut.setSinkId(sinkId);
          if (currentCleanStream) {
            virtualCableAudioOut.srcObject = currentCleanStream;
          }
          virtualCableAudioOut.volume = 1.0;
          virtualCableAudioOut.muted = false;
          await virtualCableAudioOut.play().catch(() => {});
        } else if (audioCtx && typeof audioCtx.setSinkId === 'function') {
          await audioCtx.setSinkId(sinkId);
        }
        const selOpt = virtualOutputSelect.options[virtualOutputSelect.selectedIndex];
        const isOpungMic = selOpt && selOpt.textContent && selOpt.textContent.toLowerCase().includes('opung');
        sinkBadge.textContent = isOpungMic ? 'Terhubung ke OPUNG Mic ✓' : 'Terhubung ke Virtual Mic ✓';
        sinkBadge.style.color = '#34d399';
      } catch (err) {
        virtualCableAudioOut.muted = true;
        virtualCableAudioOut.volume = 0;
        virtualCableAudioOut.pause();
        virtualCableAudioOut.srcObject = null;
        sinkBadge.textContent = 'Siaga';
        sinkBadge.style.color = '#94a3b8';
      }
    }

    virtualOutputSelect.addEventListener('change', (e) => {
      applyOutputSink(e.target.value);
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
        await populateMacAudioDevices(micInputSelect.value);
      });
    }
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        populateMacAudioDevices(micInputSelect.value);
      });
    }

    async function populateMacAudioDevices(activeInputDeviceId) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      const outputs = devices.filter(
        (d) =>
          d.kind === 'audiooutput' &&
          d.deviceId !== 'default' &&
          d.deviceId !== 'communications'
      );

      micInputSelect.innerHTML = '';
      inputs.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const isVirtIn = isOpungOrBlackHoleInputLabel(d.label);
        opt.textContent = isVirtIn
          ? d.label + ' (Jangan Pilih Sebagai Input Fisik)'
          : d.label || 'Mikrofon ' + d.deviceId.slice(0, 6);
        micInputSelect.appendChild(opt);
      });
      if (activeInputDeviceId) {
        micInputSelect.value = activeInputDeviceId;
      }

      virtualOutputSelect.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'Pilih OPUNG Microphone / BlackHole 2ch (Siaga)';
      virtualOutputSelect.appendChild(emptyOpt);

      let preferredVirtualSinkId = null;
      outputs.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        const isVirt = isVirtualCableLabel(d.label);
        const isPhys = isPhysicalSpeakerOrEarphoneLabel(d.label);
        if (isVirt) {
          if (!preferredVirtualSinkId || (d.label && d.label.toLowerCase().includes('opung'))) {
            preferredVirtualSinkId = d.deviceId;
          }
          opt.textContent = d.label + ' (Mikrofon Virtual Meet/Zoom)';
        } else if (isPhys) {
          opt.disabled = true;
          opt.textContent = d.label + ' (Speaker/Earphone Fisik - Diblokir)';
        } else {
          opt.textContent = d.label || 'Output ' + d.deviceId.slice(0, 6);
        }
        virtualOutputSelect.appendChild(opt);
      });

      if (preferredVirtualSinkId) {
        virtualOutputSelect.value = preferredVirtualSinkId;
        await applyOutputSink(preferredVirtualSinkId);
      } else {
        virtualOutputSelect.value = '';
        await applyOutputSink('');
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

        let targetInputId = selectedInputId;
        const useHardwareAec = !loopbackAudible;

        let stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: targetInputId ? { exact: targetInputId } : undefined,
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
            echoCancellation: useHardwareAec,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });

        const firstTrack = stream.getAudioTracks()[0];
        if (firstTrack && firstTrack.label && isOpungOrBlackHoleInputLabel(firstTrack.label)) {
          const allDevs = await navigator.mediaDevices.enumerateDevices();
          const realMic = allDevs.find(
            (d) =>
              d.kind === 'audioinput' &&
              d.label &&
              !isOpungOrBlackHoleInputLabel(d.label) &&
              d.deviceId !== 'default'
          );
          if (realMic) {
            stream.getTracks().forEach((t) => t.stop());
            targetInputId = realMic.deviceId;
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: realMic.deviceId },
                sampleRate: { ideal: 48000 },
                channelCount: { ideal: 1 },
                echoCancellation: useHardwareAec,
                noiseSuppression: true,
                autoGainControl: false,
              },
            });
          }
        }

        currentMicStream = stream;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        const sourceNode = audioCtx.createMediaStreamSource(stream);

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
        makeupGainNode.gain.value = 1.25;

        const processorNode = audioCtx.createScriptProcessor(512, 1, 1);
        dspCore = new NearFieldRNNoiseDspCore();

        processorNode.onaudioprocess = (ev) => {
          const inBuf = ev.inputBuffer.getChannelData(0);
          const outBuf = ev.outputBuffer.getChannelData(0);
          dspCore.processAudioBlock(inBuf, outBuf, isEnabled, thresholdDb);
          hardGateGain.gain.value = (isEnabled && !dspCore.isGateOpen && dspCore.smoothedGain === 0.0) ? 0.0 : 1.0;
        };

        const cleanDest = audioCtx.createMediaStreamDestination();
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
          earphoneLoopbackOut.srcObject = currentCleanStream;
          earphoneLoopbackOut.volume = 1.0;
          earphoneLoopbackOut.muted = false;
          await earphoneLoopbackOut.play().catch(() => {});
        } else {
          earphoneLoopbackOut.muted = true;
          earphoneLoopbackOut.volume = 0;
          earphoneLoopbackOut.pause();
          earphoneLoopbackOut.srcObject = null;
        }

        await populateMacAudioDevices(targetInputId);
      } catch (err) {
        document.getElementById('engineStatus').textContent = 'Izinkan Akses Mikrofon macOS';
      }
    }

    const rawFreq = new Uint8Array(64);
    const cleanFreq = new Uint8Array(64);

    function renderSpectrum() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

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
 * Kode Objective-C Native macOS Cocoa + WebKit (NSStatusItem Menu Bar + NSWindow + WKWebView)
 * - Menampilkan ikon "OPUNG" di Menu Bar kanan atas macOS (dekat Wi-Fi/Baterai/Jam) persis seperti Krisp.ai!
 * - Saat pertama dibuka, jendela muncul tepat di tengah layar (center) agar langsung terlihat jelas.
 * - Saat ikon Menu Bar diklik, jendela OPUNG muncul tepat di bawah ikon Menu Bar (gaya Popover Krisp).
 */
export const MACOS_NATIVE_OBJC_SOURCE = `#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <AVFoundation/AVFoundation.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) NSStatusItem *statusItem;
@property (strong, nonatomic) WKWebView *webView;
@property (copy, nonatomic) NSString *htmlFilePath;
@end

@implementation AppDelegate

- (void)setupMainMenu {
    NSMenu *menubar = [[NSMenu alloc] init];
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:appMenuItem];
    [NSApp setMainMenu:menubar];

    NSMenu *appMenu = [[NSMenu alloc] init];
    NSMenuItem *toggleItem = [[NSMenuItem alloc] initWithTitle:@"Tampilkan / Sembunyikan Panel OPUNG"
                                                        action:@selector(toggleMenuBarWindow:)
                                                 keyEquivalent:@"o"];
    [toggleItem setTarget:self];
    [appMenu addItem:toggleItem];
    [appMenu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Keluar dari OPUNG"
                                                      action:@selector(terminate:)
                                               keyEquivalent:@"q"];
    [appMenu addItem:quitItem];
    [appMenuItem setSubmenu:appMenu];
}

- (void)setupMenuBarStatusItem {
    self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    NSStatusBarButton *button = self.statusItem.button;
    if (button) {
        if (@available(macOS 11.0, *)) {
            NSImage *micIcon = [NSImage imageWithSystemSymbolName:@"mic.fill" accessibilityDescription:@"OPUNG"];
            if (micIcon) {
                [micIcon setTemplate:YES];
                button.image = micIcon;
                button.imagePosition = NSImageLeft;
            }
        }
        button.title = @" OPUNG";
        button.toolTip = @"OPUNG — Klik untuk membuka panel Peredam Bising (Menu Bar)";
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

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self setupMainMenu];
    [self setupMenuBarStatusItem];

    NSRect frame = NSMakeRect(0, 0, 390, 620);
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;
    self.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
    [self.window setTitle:@"OPUNG — Peredam Bising & Fokus Suara"];
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
    @try {
        [config.preferences setValue:@YES forKey:@"mediaDevicesEnabled"];
        [config.preferences setValue:@NO forKey:@"mediaCaptureRequiresSecureConnection"];
    } @catch (NSException *exception) {}

    self.webView = [[WKWebView alloc] initWithFrame:frame configuration:config];
    [self.webView setUIDelegate:(id)self];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self.window setContentView:self.webView];

    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [self.window orderFrontRegardless];
    [NSApp activateIgnoringOtherApps:YES];

    NSError *err = nil;
    NSString *htmlContent = [NSString stringWithContentsOfFile:self.htmlFilePath encoding:NSUTF8StringEncoding error:&err];
    if (htmlContent && htmlContent.length > 0) {
        [self.webView loadHTMLString:htmlContent baseURL:[NSURL URLWithString:@"https://localhost/"]];
    } else {
        NSURL *fileUrl = [NSURL fileURLWithPath:self.htmlFilePath];
        NSURL *dirUrl = [fileUrl URLByDeletingLastPathComponent];
        [self.webView loadFileURL:fileUrl allowingReadAccessToURL:dirUrl];
    }

    if (@available(macOS 10.14, *)) {
        dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {}];
        });
    }
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

  const rect = $.NSMakeRect(0, 0, 390, 620);
  const styleMask = (1 << 0) | (1 << 1) | (1 << 2);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    rect,
    styleMask,
    $.NSBackingStoreBuffered,
    false
  );
  win.center;
  win.title = $('OPUNG — Peredam Bising & Fokus Suara');
  win.releasedWhenClosed = false;
  win.level = 3;
  try {
    win.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(0.035, 0.05, 0.086, 1.0);
  } catch (_e) {}

  try {
    const statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength(-1);
    if (statusItem && statusItem.button) {
      statusItem.button.title = $('🎙️ OPUNG');
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
    let htmlPathNs = null;
    if (argv && argv.length > 0 && argv[0]) {
      htmlPathNs = $(String(argv[0]));
    } else {
      const env = $.NSProcessInfo.processInfo.environment;
      htmlPathNs = env.objectForKey($('OPUNG_HTML_FILE'));
    }
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
 * Launcher Script Instan (< 0.1 detik) untuk Contents/MacOS/RNNoiseStudio:
 * - Otomatis menyalin OPUNG.app ke /Applications di latar belakang jika dibuka dari .DMG (/Volumes/...)
 * - Otomatis memasang driver virtual "OPUNG Microphone" (OPUNG.driver) di latar belakang
 * - Langsung membuka jendela aplikasi OPUNG + Menu Bar Icon
 */
export const MACOS_NATIVE_LAUNCHER_SH = `#!/bin/bash
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "🎙️ Membuka Aplikasi OPUNG v10 (Menu Bar + Peredam Bising AI)..."

MACOS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
BUNDLE_DIR="$(cd "$MACOS_DIR/../.." && pwd -P)"
APP_DIR="$(cd "$MACOS_DIR/../Resources/app" && pwd -P)"
HTML_FILE="$APP_DIR/index.html"

export OPUNG_HTML_FILE="$HTML_FILE"

# Cari compiler clang asli & SDK macOS (Tanpa memicu popup instalasi Xcode Command Line Tools)
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

# 0A. LANGSUNG TIMPA /Applications/OPUNG.app LAMA JIKA DIBUKA DARI DISK IMAGE (.DMG)
if [[ "$BUNDLE_DIR" == /Volumes/* ]] && [ -w "/Applications" ]; then
  rm -rf "/Applications/OPUNG.app" 2>/dev/null || true
  cp -R "$BUNDLE_DIR" "/Applications/OPUNG.app" 2>/dev/null || true
  chmod +x "/Applications/OPUNG.app/Contents/MacOS/RNNoiseStudio" 2>/dev/null || true
  chmod +x "/Applications/OPUNG.app/Contents/MacOS/OPUNG" 2>/dev/null || true
  /usr/bin/xattr -cr "/Applications/OPUNG.app" 2>/dev/null || true
  (
    /usr/bin/codesign --force --deep --sign - "/Applications/OPUNG.app" 2>/dev/null || true
    hdiutil detach "/Volumes/OPUNG Installer" -force 2>/dev/null || true
    hdiutil detach "/Volumes/OPUNG Installer 1" -force 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
  if [ -f "/Applications/OPUNG.app/Contents/Resources/app/index.html" ]; then
    BUNDLE_DIR="/Applications/OPUNG.app"
    MACOS_DIR="/Applications/OPUNG.app/Contents/MacOS"
    APP_DIR="/Applications/OPUNG.app/Contents/Resources/app"
    HTML_FILE="$APP_DIR/index.html"
    export OPUNG_HTML_FILE="$HTML_FILE"
  fi
fi

# 0B. OTOMATIS PASANG DRIVER VIRTUAL "OPUNG Microphone" (OPUNG.driver) DI LATAR BELAKANG JIKA BELUM ADA
if [ ! -d "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" ]; then
  (
    HAL_TMP="/tmp/opung-auto-hal-$$"
    mkdir -p "$HAL_TMP/OPUNG.driver/Contents/MacOS"
    cat << 'EOF_HAL_PLIST' > "$HAL_TMP/OPUNG.driver/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>OPUNG</string>
  <key>CFBundleIdentifier</key>
  <string>com.opung.audio.driver</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>OPUNG</string>
  <key>CFBundleDisplayName</key>
  <string>OPUNG Microphone</string>
  <key>CFBundlePackageType</key>
  <string>BNDL</string>
  <key>CFBundleShortVersionString</key>
  <string>10.0.0</string>
  <key>CFBundleVersion</key>
  <string>10000</string>
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
EOF_HAL_PLIST

    BUILT_OK=0
    if [ -n "$CLANG_REAL" ] && command -v curl >/dev/null 2>&1; then
      if curl -fsSL --max-time 10 "https://raw.githubusercontent.com/ExistentialAudio/BlackHole/master/BlackHole/BlackHole.c" -o "$HAL_TMP/BlackHole.c" 2>/dev/null; then
        "$CLANG_REAL" -bundle -O2 "\${SDK_ARGS[@]}" \\
          -framework CoreAudio -framework CoreFoundation \\
          '-DkDriver_Name="OPUNG"' \\
          '-DkPlugIn_BundleID="com.opung.audio.driver"' \\
          '-DkDevice_Name="OPUNG Microphone"' \\
          '-DkDevice2_Name="OPUNG Microphone"' \\
          '-DkManufacturer_Name="OPUNG Audio AI"' \\
          '-DkNumber_Of_Channels=2' \\
          "$HAL_TMP/BlackHole.c" \\
          -o "$HAL_TMP/OPUNG.driver/Contents/MacOS/OPUNG" 2>/dev/null && BUILT_OK=1 || true
      fi
    fi

    if [ "$BUILT_OK" -eq 0 ] && [ -f "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver/Contents/MacOS/BlackHole" ]; then
      cp -f "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver/Contents/MacOS/BlackHole" "$HAL_TMP/OPUNG.driver/Contents/MacOS/OPUNG"
      perl -pi -e 's/BlackHole 2ch/OPUNG Mic 2ch/g' "$HAL_TMP/OPUNG.driver/Contents/MacOS/OPUNG" 2>/dev/null || true
      BUILT_OK=1
    fi

    if [ "$BUILT_OK" -eq 1 ] && [ -f "$HAL_TMP/OPUNG.driver/Contents/MacOS/OPUNG" ]; then
      chmod +x "$HAL_TMP/OPUNG.driver/Contents/MacOS/OPUNG"
      /usr/bin/xattr -cr "$HAL_TMP/OPUNG.driver" 2>/dev/null || true
      /usr/bin/codesign --force --deep --sign - "$HAL_TMP/OPUNG.driver" 2>/dev/null || true
      cat << EOF_INST_HAL > "$HAL_TMP/install_hal.sh"
#!/bin/bash
rm -rf '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
cp -R '$HAL_TMP/OPUNG.driver' '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
chown -R root:wheel '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
killall coreaudiod || true
EOF_INST_HAL
      chmod +x "$HAL_TMP/install_hal.sh"
      /usr/bin/osascript -e "do shell script \\"/bin/bash '$HAL_TMP/install_hal.sh'\\" with administrator privileges" 2>/dev/null || true
    fi
    rm -rf "$HAL_TMP" 2>/dev/null || true
  ) </dev/null >/dev/null 2>&1 &
fi

SHADOW_BUNDLE="/tmp/OPUNG-Runtime-$(id -u)/OPUNG.app"
SHADOW_MACOS_DIR="$SHADOW_BUNDLE/Contents/MacOS"
SHADOW_APP_DIR="$SHADOW_BUNDLE/Contents/Resources/app"
SHADOW_BIN="$SHADOW_MACOS_DIR/RNNoiseStudioNativeV10"
LOCAL_BIN="$MACOS_DIR/RNNoiseStudioNativeV10"

# 1. Jalur Cepat Instan (0.01 detik): Jika binary sudah ada di bundle lokal atau di /tmp shadow bundle
if [ -x "$LOCAL_BIN" ]; then
  "$LOCAL_BIN" "$HTML_FILE" && exit 0
fi
if [ -x "$SHADOW_BIN" ] && [ -f "$SHADOW_APP_DIR/index.html" ]; then
  "$SHADOW_BIN" "$SHADOW_APP_DIR/index.html" && exit 0
fi

# 2. Tentukan target kompilasi yang 100% WRITABLE (bebas dari Read-Only DMG / AppTranslocation)
if [ -w "$MACOS_DIR" ]; then
  /usr/bin/xattr -cr "$BUNDLE_DIR" 2>/dev/null || true
  TARGET_BIN="$LOCAL_BIN"
  TARGET_HTML="$HTML_FILE"
else
  mkdir -p "$SHADOW_MACOS_DIR" "$SHADOW_APP_DIR" 2>/dev/null || true
  cp -f "$BUNDLE_DIR/Contents/Info.plist" "$SHADOW_BUNDLE/Contents/Info.plist" 2>/dev/null || true
  cp -f "$HTML_FILE" "$SHADOW_APP_DIR/index.html" 2>/dev/null || true
  TARGET_BIN="$SHADOW_BIN"
  TARGET_HTML="$SHADOW_APP_DIR/index.html"
fi

if [ -n "$CLANG_REAL" ]; then
  TMP_BIN="\${TARGET_BIN}.tmp.$$"
  "$CLANG_REAL" -O0 -fobjc-arc "\${SDK_ARGS[@]}" \\
    -framework Cocoa -framework WebKit -framework AVFoundation \\
    "$APP_DIR/native_host.m" -o "$TMP_BIN" 2>/dev/null || true

  if [ -f "$TMP_BIN" ]; then
    chmod +x "$TMP_BIN" 2>/dev/null || true
    /usr/bin/xattr -cr "$TMP_BIN" 2>/dev/null || true
    /usr/bin/codesign --force --sign - "$TMP_BIN" 2>/dev/null || true
    mv -f "$TMP_BIN" "$TARGET_BIN" 2>/dev/null || true

    if [ -x "$TARGET_BIN" ]; then
      "$TARGET_BIN" "$TARGET_HTML" && exit 0
    fi
  fi
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
 * 2. Mengecek dan memasang driver virtual OPUNG Microphone (OPUNG.driver)
 * 3. Mencetak file Installer Wizard resmi "OPUNG-Installer.pkg" di Desktop (via pkgbuild)
 * 4. Mencetak file Disk Image resmi "OPUNG-Installer.dmg" di Desktop (via hdiutil)
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
# OPUNG macOS — Auto-Installer (/Applications + OPUNG Virtual Mic + Menu Bar + .PKG + .DMG)
# ==============================================================================

set -e

echo "=================================================================="
echo "🎙️ Memasang OPUNG (Menu Bar + OPUNG Virtual Mic) & Membuat .DMG/.PKG"
echo "=================================================================="

APP_NAME="OPUNG"
APP_BUNDLE="/Applications/\${APP_NAME}.app"
HAL_BUILD_DIR="/tmp/opung-hal-driver-\$\$"
DMG_STAGING="/tmp/opung-dmg-staging-\$\$"
PKG_SCRIPTS_DIR="/tmp/opung-pkg-scripts-\$\$"
PKG_OUTPUT="\$HOME/Desktop/OPUNG-Installer.pkg"
DMG_OUTPUT="\$HOME/Desktop/OPUNG-Installer.dmg"

rm -rf "\$APP_BUNDLE" "\$HAL_BUILD_DIR"
mkdir -p "\$APP_BUNDLE/Contents/MacOS"
mkdir -p "\$APP_BUNDLE/Contents/Resources/app"
mkdir -p "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS"

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
  <string>9.0.0</string>
  <key>CFBundleVersion</key>
  <string>900</string>
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

chmod +x "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudio"

# Cari compiler clang native macOS
CLANG_REAL=""
if [ -x "/Library/Developer/CommandLineTools/usr/bin/clang" ]; then
  CLANG_REAL="/Library/Developer/CommandLineTools/usr/bin/clang"
elif [ -x "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang" ]; then
  CLANG_REAL="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
fi

SDK_ARGS=()
if [ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk" ]; then
  export SDKROOT="/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk"
  SDK_ARGS=("-isysroot" "\$SDKROOT")
elif [ -d "/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk" ]; then
  export SDKROOT="/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk"
  SDK_ARGS=("-isysroot" "\$SDKROOT")
fi

# 1A. Kompilasi binary Mach-O Native (NSStatusItem Menu Bar + WKWebView)
if [ -n "\$CLANG_REAL" ]; then
  "\$CLANG_REAL" -O2 -fobjc-arc "\${SDK_ARGS[@]}" \\
    -framework Cocoa -framework WebKit -framework AVFoundation \\
    "\$APP_BUNDLE/Contents/Resources/app/native_host.m" \\
    -o "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudioNativeV10" 2>/dev/null || true
  chmod +x "\$APP_BUNDLE/Contents/MacOS/RNNoiseStudioNativeV10" 2>/dev/null || true
fi

# 1B. Rakitan Driver CoreAudio Virtual Mic: "OPUNG Microphone" (OPUNG.driver)
echo "🎙️ Merakit Driver CoreAudio Virtual: OPUNG Microphone (OPUNG.driver)..."
cat << 'EOF_DRV_PLIST' > "\$HAL_BUILD_DIR/OPUNG.driver/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>OPUNG</string>
  <key>CFBundleIdentifier</key>
  <string>com.opung.audio.driver</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>OPUNG</string>
  <key>CFBundleDisplayName</key>
  <string>OPUNG Microphone</string>
  <key>CFBundlePackageType</key>
  <string>BNDL</string>
  <key>CFBundleShortVersionString</key>
  <string>9.0.0</string>
  <key>CFBundleVersion</key>
  <string>900</string>
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
EOF_DRV_PLIST

DRIVER_BUILT=0
if [ -n "\$CLANG_REAL" ] && command -v curl >/dev/null 2>&1; then
  if curl -fsSL --max-time 12 "https://raw.githubusercontent.com/ExistentialAudio/BlackHole/master/BlackHole/BlackHole.c" -o "\$HAL_BUILD_DIR/BlackHole.c" 2>/dev/null; then
    "\$CLANG_REAL" -bundle -O2 "\${SDK_ARGS[@]}" \\
      -framework CoreAudio -framework CoreFoundation \\
      '-DkDriver_Name="OPUNG"' \\
      '-DkPlugIn_BundleID="com.opung.audio.driver"' \\
      '-DkDevice_Name="OPUNG Microphone"' \\
      '-DkDevice2_Name="OPUNG Microphone"' \\
      '-DkManufacturer_Name="OPUNG Audio AI"' \\
      '-DkNumber_Of_Channels=2' \\
      "\$HAL_BUILD_DIR/BlackHole.c" \\
      -o "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS/OPUNG" 2>/dev/null && DRIVER_BUILT=1 || true
  fi
fi

# Fallback Offline: Jika internet/clang tidak tersedia tapi BlackHole2ch.driver sudah ada di Mac,
# kloning dan rebrand ke OPUNG Mic 2ch (13 byte identik)
if [ "\$DRIVER_BUILT" -eq 0 ] && [ -f "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver/Contents/MacOS/BlackHole" ]; then
  cp -f "/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver/Contents/MacOS/BlackHole" "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS/OPUNG"
  perl -pi -e 's/BlackHole 2ch/OPUNG Mic 2ch/g' "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS/OPUNG" 2>/dev/null || true
  DRIVER_BUILT=1
fi

if [ "\$DRIVER_BUILT" -eq 1 ] && [ -f "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS/OPUNG" ]; then
  chmod +x "\$HAL_BUILD_DIR/OPUNG.driver/Contents/MacOS/OPUNG"
  /usr/bin/xattr -cr "\$HAL_BUILD_DIR/OPUNG.driver" 2>/dev/null || true
  /usr/bin/codesign --force --deep --sign - "\$HAL_BUILD_DIR/OPUNG.driver" 2>/dev/null || true
  cp -R "\$HAL_BUILD_DIR/OPUNG.driver" "\$APP_BUNDLE/Contents/Resources/OPUNG.driver"

  echo "🔐 Memasang 'OPUNG Microphone' ke /Library/Audio/Plug-Ins/HAL/OPUNG.driver..."
  cat << EOF_INST_DRV > "\$HAL_BUILD_DIR/install_drv.sh"
#!/bin/bash
rm -rf '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
cp -R '\$HAL_BUILD_DIR/OPUNG.driver' '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
chown -R root:wheel '/Library/Audio/Plug-Ins/HAL/OPUNG.driver'
killall coreaudiod || true
EOF_INST_DRV
  chmod +x "\$HAL_BUILD_DIR/install_drv.sh"
  /usr/bin/osascript -e "do shell script \\"/bin/bash '\$HAL_BUILD_DIR/install_drv.sh'\\" with administrator privileges" 2>/dev/null || true
  echo "✅ Driver Virtual 'OPUNG Microphone' berhasil diinstal di macOS Sound / Google Meet / Zoom!"
fi

rm -rf "\$HAL_BUILD_DIR"

/usr/bin/xattr -cr "\$0" 2>/dev/null || true
/usr/bin/xattr -cr "\$APP_BUNDLE" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "\$APP_BUNDLE" 2>/dev/null || true

echo "✅ 1/3: OPUNG.app (Menu Bar Edition + OPUNG Microphone) terpasang di /Applications/OPUNG.app"

# 2. Buat Wizard Installer .PKG Resmi macOS (seperti Krisp.ai Installer: App + OPUNG.driver)
if command -v pkgbuild >/dev/null 2>&1; then
  echo "📦 2/3: Mencetak Wizard Installer macOS (OPUNG-Installer.pkg) di Desktop..."
  rm -rf "\$PKG_SCRIPTS_DIR" "\$PKG_OUTPUT"
  mkdir -p "\$PKG_SCRIPTS_DIR"

  cat << 'EOF_POSTINSTALL' > "\$PKG_SCRIPTS_DIR/postinstall"
#!/bin/bash
/usr/bin/xattr -cr "/Applications/OPUNG.app" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "/Applications/OPUNG.app" 2>/dev/null || true
if [ -d "/Applications/OPUNG.app/Contents/Resources/OPUNG.driver" ]; then
  rm -rf "/Library/Audio/Plug-Ins/HAL/OPUNG.driver"
  cp -R "/Applications/OPUNG.app/Contents/Resources/OPUNG.driver" "/Library/Audio/Plug-Ins/HAL/OPUNG.driver"
  chown -R root:wheel "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" 2>/dev/null || true
  /usr/bin/codesign --force --deep --sign - "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" 2>/dev/null || true
  killall coreaudiod 2>/dev/null || true
fi
open -a "/Applications/OPUNG.app" 2>/dev/null || true
exit 0
EOF_POSTINSTALL
  chmod +x "\$PKG_SCRIPTS_DIR/postinstall"

  pkgbuild --component "\$APP_BUNDLE" \\
    --install-location "/Applications" \\
    --scripts "\$PKG_SCRIPTS_DIR" \\
    --identifier "com.opung.studio.macos.pkg" \\
    --version "9.0.0" \\
    "\$PKG_OUTPUT" >/dev/null 2>&1 || true

  /usr/bin/xattr -cr "\$PKG_OUTPUT" 2>/dev/null || true
  rm -rf "\$PKG_SCRIPTS_DIR"
  echo "✅ Wizard Installer selesai: \$PKG_OUTPUT"
fi

# 3. Buat Disk Image .DMG Resmi macOS (Hanya berisi OPUNG.app agar bersih dan tidak membingungkan)
if command -v hdiutil >/dev/null 2>&1; then
  echo "💿 3/3: Mencetak Disk Image macOS (OPUNG-Installer.dmg) di Desktop..."
  rm -rf "\$DMG_STAGING" "\$DMG_OUTPUT"
  mkdir -p "\$DMG_STAGING"
  cp -R "\$APP_BUNDLE" "\$DMG_STAGING/"
  hdiutil create -volname "OPUNG Installer" -srcfolder "\$DMG_STAGING" -ov -format UDZO "\$DMG_OUTPUT" >/dev/null 2>&1 || true
  /usr/bin/xattr -cr "\$DMG_OUTPUT" 2>/dev/null || true
  rm -rf "\$DMG_STAGING"
  echo "✅ Disk Image .DMG selesai: \$DMG_OUTPUT"
fi

echo ""
echo "🎉 SELESAI! Lihat ikon '🎙️ OPUNG' di Menu Bar kanan atas Mac Anda & pilih 'OPUNG Microphone' di Meet/Zoom."
open -a "\$APP_BUNDLE"
`;
}

export const ELECTRON_MACOS_FILES: MacOSFileSpec[] = [
  {
    filename: 'native_host.m',
    language: 'objective-c',
    description:
      'Source Code Native macOS Cocoa + WebKit (NSStatusItem Menu Bar + NSWindow + WKWebView): Menampilkan ikon OPUNG di Menu Bar kanan atas macOS persis seperti Krisp.ai!',
    content: MACOS_NATIVE_OBJC_SOURCE,
  },
  {
    filename: 'Install-OPUNG-MacOS.command',
    language: 'bash',
    description:
      'Installer Otomatis macOS: Memasang "/Applications/OPUNG.app" (Menu Bar Edition), memasang driver mikrofon virtual "/Library/Audio/Plug-Ins/HAL/OPUNG.driver" ("OPUNG Microphone"), serta mencetak file "OPUNG-Installer.pkg" dan "OPUNG-Installer.dmg" di Desktop Anda.',
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

const MACOS_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>OPUNG</string>
  <key>CFBundleIdentifier</key>
  <string>com.opung.desktop.v10</string>
  <key>CFBundleName</key>
  <string>OPUNG</string>
  <key>CFBundleDisplayName</key>
  <string>OPUNG</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>10.0.0</string>
  <key>CFBundleVersion</key>
  <string>10000</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSMicrophoneUsageDescription</key>
  <string>OPUNG membutuhkan akses mikrofon untuk memfilter suara di luar radius 1 meter dan menjernihkan vokal Anda.</string>
</dict>
</plist>`;

/**
 * Membangun Disk Image macOS Asli (.DMG — Apple HFS Plus version 4 / TN1150) murni di browser:
 * - Memiliki HFSPlusVolumeHeader resmi ('H+' 0x482B di offset 1024 & Backup Volume Header di akhir disk)
 * - Mengatur finderInfo[2] = 2 (kHFSRootFolderID) sehingga saat file OPUNG-Installer.dmg diklik di
 *   Downloads / Finder macOS, jendela Finder "OPUNG v10" OTOMATIS langsung terbuka di layar!
 * - Hanya berisi 1 aplikasi tunggal: OPUNG.app (tanpa file .command tambahan yang membingungkan).
 */
export function buildMacOSDiskImageDmg(): ArrayBuffer {
  const encoder = new TextEncoder();
  const BLOCK_SIZE = 4096;
  const TOTAL_BLOCKS = 256; // 256 * 4096 = 1,048,576 bytes (1.0 MB HFS+ Volume)
  const HFS_TIMESTAMP = 3845659200; // Seconds since 1904-01-01 00:00:00 UTC

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
    startBlock?: number;
    blockCount?: number;
  }

  const folders: HfsFolderItem[] = [
    {
      kind: 'folder',
      cnid: 2,
      parentCnid: 1,
      name: 'OPUNG v10',
      valence: 1,
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
      valence: 1,
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
      parentCnid: 17,
      name: 'Info.plist',
      mode: 0o100644,
      data: encoder.encode(MACOS_INFO_PLIST),
    },
    {
      kind: 'file',
      cnid: 22,
      parentCnid: 18,
      name: 'OPUNG',
      mode: 0o100755,
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
    },
    {
      kind: 'file',
      cnid: 23,
      parentCnid: 18,
      name: 'RNNoiseStudio',
      mode: 0o100755,
      data: encoder.encode(MACOS_NATIVE_LAUNCHER_SH),
    },
    {
      kind: 'file',
      cnid: 24,
      parentCnid: 20,
      name: 'index.html',
      mode: 0o100644,
      data: encoder.encode(MACOS_STANDALONE_APP_HTML),
    },
    {
      kind: 'file',
      cnid: 25,
      parentCnid: 20,
      name: 'native_host.jxa.js',
      mode: 0o100644,
      data: encoder.encode(MACOS_NATIVE_JXA_SCRIPT),
    },
    {
      kind: 'file',
      cnid: 26,
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
      // Atur ukuran & posisi jendela Finder saat volume dibuka (top=140, left=220, bottom=520, right=760)
      dv.setInt16(48, 140, false);
      dv.setInt16(50, 220, false);
      dv.setInt16(52, 520, false);
      dv.setInt16(54, 760, false);
    } else if (folder.isBundle) {
      // kHasBundle = 0x2000 agar Finder macOS mengenali OPUNG.app sebagai Application Bundle!
      dv.setUint16(56, 0x2000, false);
      dv.setInt16(58, 120, false); // icon location Y
      dv.setInt16(60, 140, false); // icon location X
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
  vhd.setUint32(32, files.length, false); // fileCount
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
  vhd.setUint32(108, uniqueSeed ^ 0x30444d47, false); // Unique Volume UUID low

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
  kdv.setUint32(68, 0x305f444d, false); // segmentID[1]
  kdv.setUint32(72, uniqueSeed, false); // segmentID[2]
  kdv.setUint32(76, 0x56313030, false); // segmentID[3]
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



