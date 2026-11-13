import React, { useState, useEffect, useRef } from 'react';
import { UseNoiseCancellationReturn } from '../hooks/useNoiseCancellation';
import {
  ELECTRON_MACOS_FILES,
  generateMacOSOneClickInstallerScript,
  MACOS_STANDALONE_APP_HTML,
  buildMacOSAppBundleZip,
  buildChromeExtensionZip,
} from '../utils/macosAppBuilder';
import {
  Puzzle,
  Cable,
  Download,
  Copy,
  Check,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Power,
  Eye,
  EyeOff,
  Activity,
  Users,
  UserCheck,
  Headphones,
  Laptop,
  Terminal,
} from 'lucide-react';

interface GoogleMeetIntegrationHubProps {
  audioController: UseNoiseCancellationReturn;
}

type IntegrationMethod = 'macos-app' | 'chrome-extension' | 'virtual-cable';

interface ExtensionFileSpec {
  filename: string;
  language: string;
  description: string;
  content: string;
}

export const CHROME_EXTENSION_FILES: ExtensionFileSpec[] = [
  {
    filename: 'manifest.json',
    language: 'json',
    description:
      'Manifest V3 (v7.0 Satu Pipa Tunggal dengan Google Meet): Menghapus stream ganda dan mencabut langsung rawAudioTrack dari dalam MediaStream Google Meet (removeTrack + addTrack) agar indikator gelombang Meet & lawan bicara 100% memakai output RNNoise!',
    content: `{
  "manifest_version": 3,
  "name": "RNNoise Google Meet (v7.0 Satu Pipa Tunggal <= 1m)",
  "version": "7.0.0",
  "description": "In-Place Stream Replacement (rawStream.removeTrack + addTrack): Menjamin Google Meet & RNNoise memakai 1 pipa yang sama (bukan jalan sendiri-sendiri).",
  "permissions": ["tabs", "scripting", "activeTab"],
  "host_permissions": [
    "https://meet.google.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "RNNoise Google Meet v7.0 (Satu Pipa <= 1m)",
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*"],
      "js": ["content-injector.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://meet.google.com/*"],
      "js": ["content-bridge.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ]
}`,
  },
  {
    filename: 'background.js',
    language: 'javascript',
    description:
      'Service Worker yang menggambar Ikon Kecil di Toolbar Chrome secara dinamis: berwarna BIRU (#0284c7 + Badge ON) saat aktif, dan ABU-ABU (#475569 + Badge OFF) saat mati.',
    content: `/**
 * @file background.js (v7.0)
 * @description Mengubah warna IKON KECIL di Toolbar Chrome secara otomatis:
 * - Saat RNNoise AKTIF -> Ikon Kecil berwarna BIRU CERAH (#0284c7) + Badge "ON" Biru
 * - Saat RNNoise MATI  -> Ikon Kecil berwarna ABU-ABU (#475569) + Badge "OFF" Abu-abu
 */

function createToolbarIconImageData(size, isEnabled) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const radius = size * 0.44;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = isEnabled ? '#0284c7' : '#475569';
  ctx.fill();

  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = isEnabled ? '#38bdf8' : '#64748b';
  ctx.stroke();

  ctx.strokeStyle = isEnabled ? '#ffffff' : '#94a3b8';
  ctx.lineWidth = Math.max(1.5, size * 0.11);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(size * 0.32, size * 0.38);
  ctx.lineTo(size * 0.32, size * 0.62);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.25);
  ctx.lineTo(size * 0.5, size * 0.75);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(size * 0.68, size * 0.38);
  ctx.lineTo(size * 0.68, size * 0.62);
  ctx.stroke();

  if (!isEnabled) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.beginPath();
    ctx.moveTo(size * 0.26, size * 0.26);
    ctx.lineTo(size * 0.74, size * 0.74);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

async function updateExtensionToolbarIcon(isEnabled) {
  try {
    const imageData16 = createToolbarIconImageData(16, isEnabled);
    const imageData32 = createToolbarIconImageData(32, isEnabled);
    const imageData48 = createToolbarIconImageData(48, isEnabled);

    await chrome.action.setIcon({
      imageData: {
        16: imageData16,
        32: imageData32,
        48: imageData48,
      },
    });

    await chrome.action.setBadgeText({
      text: isEnabled ? 'ON' : 'OFF',
    });

    await chrome.action.setBadgeBackgroundColor({
      color: isEnabled ? '#0284c7' : '#64748b',
    });
  } catch (err) {
    console.warn('Gagal memperbarui ikon toolbar:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  updateExtensionToolbarIcon(true);
});

chrome.runtime.onStartup.addListener(() => {
  updateExtensionToolbarIcon(true);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'RNNOISE_STATE_UPDATE') {
    updateExtensionToolbarIcon(Boolean(msg.enabled));
  }
});`,
  },
  {
    filename: 'content-injector.js',
    language: 'javascript',
    description:
      'PERBAIKAN KUNCI v7.0 (Satu Pipa Tunggal): (1) Menghapus ensureActiveMicPipeline() yang di v6.0 membuka stream mikrofon kedua secara terpisah ("kerja masing-masing"), (2) Melakukan In-Place Stream Surgery: rawStream.removeTrack(rawTrack) + rawStream.addTrack(cleanTrack) langsung pada objek MediaStream milik Google Meet, dan (3) Menambahkan override applyConstraints() + dedicated clone destination agar Google Meet tidak pernah menolak atau mematikan pipa RNNoise!',
    content: `/**
 * @file content-injector.js (v7.0 - In-Place Stream Surgery / Satu Pipa Tunggal dengan Google Meet)
 * @description
 * Analisis Mengapa di v6.0 Google Meet & RNNoise "Kerja Masing-Masing" (Sendiri-Sendiri):
 * 1. Di v6.0, fungsi ensureActiveMicPipeline() memanggil originalGetUserMedia() sendiri. Itu membuat
 *    Stream Mikrofon #2 khusus untuk ekstensi (sehingga fitur "Tes Dengar Suara Sendiri" berhasil),
 *    tetapi Google Meet tetap memakai Stream Mikrofon #1 miliknya sendiri!
 * 2. Ketika Google Meet memanggil track.applyConstraints() pada track WebAudio, Chrome melempar
 *    OverconstrainedError jika applyConstraints tidak di-override!
 * 3. Ketika Google Meet memanggil track.clone() saat pindah dari Lobby ke Room lalu memanggil
 *    track.stop() pada track pertama, destination stream pertama ikut berhenti jika tidak dibuatkan
 *    MediaStreamAudioDestinationNode baru untuk setiap clone!
 *
 * SOLUSI ARSITEKTUR v7.0 (100% SATU PIPA TUNGGAL):
 * - TIDAK PERNAH memanggil getUserMedia sendiri di luar permintaan Google Meet.
 * - Saat Google Meet meminta mikrofon (getUserMedia), kita mencabut langsung track asli dari dalam
 *   rawStream milik Google Meet (rawStream.removeTrack(rawTrack)) dan memasukkan cleanTrack ke dalam
 *   objek rawStream yang sama (rawStream.addTrack(cleanTrack))!
 * - Hasilnya: Indikator gelombang 3-titik di tombol mic Google Meet DAN suara ke lawan bicara
 *   100% berasal dari output RNNoise! Jika di RNNoise 0%, gelombang di Google Meet juga 0% (diam)!
 */

(function initGoogleMeetRNNoiseInterceptorV7() {
  if (window.__RNNOISE_MEET_INTERCEPTOR_V7__) return;
  window.__RNNOISE_MEET_INTERCEPTOR_V7__ = true;

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
      this.holdFrames = 26; // 260ms hold alami agar suku kata & konsonan S/T/K utuh dan jernih
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

      // 1. SIDECHAIN FORMANT DETECTOR (120Hz - 3100Hz) + ZERO-CROSSING RATE (ZCR) DISCRIMINATOR:
      // Hanya digunakan untuk menghitung energi pita suara manusia <= 1 meter secara akurat
      // agar suara bor bangunan (> 4kHz), desis kipas, atau ketikan keyboard tidak membuka gerbang!
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

      // 2. ADAPTIVE STATIONARY NOISE FLOOR TRACKER:
      if (totalRms < this.noiseFloorRms) {
        this.noiseFloorRms = 0.92 * this.noiseFloorRms + 0.08 * totalRms;
      } else {
        this.noiseFloorRms = 0.9985 * this.noiseFloorRms + 0.0015 * totalRms;
      }
      this.noiseFloorRms = Math.max(40.0, Math.min(4500.0, this.noiseFloorRms));

      const normRms = Math.max(1e-7, vocalRms / PCM16_SCALE);
      let frameDb = 20.0 * Math.log10(normRms);

      if (zeroCrossings > 135) {
        frameDb -= 12.0;
      }

      this.lastFrameDb = Math.round(frameDb);

      // GERBANG JARAK DEKAT MUTLAK (HARD PROXIMITY GATE <= 1 METER) — TETAP SAMA & KETAT
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

      // 3. WIENER INTRA-SPEECH DENOISING (Mengupas bising latar SAAT Anda sedang berbicara):
      let intraSpeechDenoiseGain = 1.0;
      if (this.isGateOpen) {
        const snr = Math.max(0.0, totalRms - this.noiseFloorRms * 1.25) / (totalRms + 1.0);
        intraSpeechDenoiseGain = Math.max(0.28, Math.min(1.0, snr * 1.15));
      }

      const effectiveTargetGain = targetGain * intraSpeechDenoiseGain;
      const maxVocalSlew = 5200.0;

      // 4. SLEW-RATE TRANSIENT DE-CLICKER + Attack cepat (0.12) & Release halus (0.008)
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        let sample = frame[i];
        const delta = sample - this.prevSample;
        if (delta > maxVocalSlew || delta < -maxVocalSlew) {
          sample = this.prevSample + delta * 0.22;
        }
        this.prevSample = sample;

        const coeff = effectiveTargetGain > this.smoothedGain ? 0.12 : 0.008;
        this.smoothedGain += coeff * (effectiveTargetGain - this.smoothedGain);
        if (this.smoothedGain < 0.003 && targetGain === 0.0) {
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

  const rawToPipelineMap = new WeakMap();
  const processedTrackSet = new WeakSet();
  const activePipelines = new Set();
  const trackedPeerConnections = new Set();

  window.__RNNOISE_ACTIVE_PIPELINES__ = activePipelines;

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices
  );

  // Buat track output baru dari cleanAnalyser (dipakai baik untuk track utama maupun setiap kali Google Meet memanggil track.clone()!)
  function createCleanDestinationTrack(pipelineRecord) {
    const destNode = pipelineRecord.audioCtx.createMediaStreamDestination();
    pipelineRecord.cleanAnalyser.connect(destNode);
    const cleanTrack = destNode.stream.getAudioTracks()[0];
    pipelineRecord.destinationNodes.add(destNode);

    const rawAudioTrack = pipelineRecord.rawAudioTrack;
    processedTrackSet.add(cleanTrack);

    // 1. Samarkan seluruh metadata agar Google Meet yakin 100% ini adalah track hardware asli
    const origGetSettings = rawAudioTrack.getSettings.bind(rawAudioTrack);
    cleanTrack.getSettings = function () {
      return origGetSettings();
    };
    if (rawAudioTrack.getConstraints) {
      const origGetConstraints = rawAudioTrack.getConstraints.bind(rawAudioTrack);
      cleanTrack.getConstraints = function () {
        return origGetConstraints();
      };
    }
    if (rawAudioTrack.getCapabilities) {
      const origGetCapabilities = rawAudioTrack.getCapabilities.bind(rawAudioTrack);
      cleanTrack.getCapabilities = function () {
        return origGetCapabilities();
      };
    }

    // 2. KRITIS: Override applyConstraints agar tidak melempar OverconstrainedError di Google Meet!
    cleanTrack.applyConstraints = function (_constraints) {
      return Promise.resolve();
    };

    try {
      Object.defineProperty(cleanTrack, 'label', {
        get: () => rawAudioTrack.label || 'RNNoise Filtered Microphone',
        configurable: true,
      });
    } catch (_e) {}

    // 3. KRITIS: Saat Google Meet memanggil track.clone() (misal saat pindah dari Lobby ke dalam Room),
    // buatkan MediaStreamAudioDestinationNode baru dari cleanAnalyser yang sama!
    // Dengan begitu, saat Google Meet memanggil track.stop() pada track Lobby, track Room TIDAK IKUT MATI!
    cleanTrack.clone = function () {
      pipelineRecord.activeCloneCount++;
      return createCleanDestinationTrack(pipelineRecord);
    };

    const origStop = cleanTrack.stop.bind(cleanTrack);
    cleanTrack.stop = function () {
      pipelineRecord.activeCloneCount = Math.max(0, pipelineRecord.activeCloneCount - 1);
      try {
        pipelineRecord.cleanAnalyser.disconnect(destNode);
      } catch (_e) {}
      pipelineRecord.destinationNodes.delete(destNode);
      return origStop();
    };

    return cleanTrack;
  }

  function buildCleanProcessedAudioTrack(rawAudioTrack) {
    if (processedTrackSet.has(rawAudioTrack)) {
      return rawAudioTrack;
    }
    if (rawToPipelineMap.has(rawAudioTrack)) {
      const existingPipe = rawToPipelineMap.get(rawAudioTrack);
      if (existingPipe && existingPipe.rawAudioTrack.readyState === 'live') {
        return createCleanDestinationTrack(existingPipe);
      }
    }

    // Aktifkan echoCancellation: true (Hardware AEC) & noiseSuppression: true (Neural C++ WebRTC RNNoise)
    // untuk mengupas suara bor/sirene/bising saat Anda bicara, lalu diperjernih kembali oleh 5-Stage Studio EQ!
    if (typeof rawAudioTrack.applyConstraints === 'function') {
      rawAudioTrack
        .applyConstraints({
          echoCancellation: true,
          autoGainControl: false,
          noiseSuppression: true,
        })
        .catch(() => {});
    }

    function isGoogleMeetMicCurrentlyMuted() {
      try {
        const muteBtn = document.querySelector(
          'button[data-is-muted="true"][aria-label*="microphone" i], button[data-is-muted="true"][aria-label*="mikrofon" i], div[role="button"][data-is-muted="true"]'
        );
        return Boolean(muteBtn);
      } catch (_e) {
        return false;
      }
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const resumeOnInteraction = () => {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    };
    window.addEventListener('click', resumeOnInteraction, { passive: true });
    window.addEventListener('keydown', resumeOnInteraction, { passive: true });

    // Gunakan MediaStream terpisah yang hanya berisi rawAudioTrack untuk diumpankan ke WebAudio
    const internalRawStream = new MediaStream([rawAudioTrack]);
    const sourceNode = audioCtx.createMediaStreamSource(internalRawStream);

    const rawAnalyser = audioCtx.createAnalyser();
    rawAnalyser.fftSize = 128;
    rawAnalyser.smoothingTimeConstant = 0.6;

    const cleanAnalyser = audioCtx.createAnalyser();
    cleanAnalyser.fftSize = 128;
    cleanAnalyser.smoothingTimeConstant = 0.6;

    const hardGateGainNode = audioCtx.createGain();
    hardGateGainNode.gain.value = 1.0;

    // =========================================================================
    // STUDIO HD VOCAL CLARITY EQUALIZER & BROADCAST LEVELER (64-BIT NATIVE)
    // Menjernihkan suara keluaran tanpa mengubah fitur noise gate <= 1m:
    // =========================================================================
    const subCutNode = audioCtx.createBiquadFilter();
    subCutNode.type = 'highpass';
    subCutNode.frequency.value = 75;
    subCutNode.Q.value = 0.707;

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
    studioCompressor.threshold.value = -18;
    studioCompressor.knee.value = 12;
    studioCompressor.ratio.value = 2.5;
    studioCompressor.attack.value = 0.004;
    studioCompressor.release.value = 0.12;

    const makeupGainNode = audioCtx.createGain();
    makeupGainNode.gain.value = 1.25;

    const loopbackGain = audioCtx.createGain();
    loopbackGain.gain.value = window.__RNNOISE_MEET_STATE__.loopbackAudible ? 1.0 : 0.0;

    const dspProcessorNode = audioCtx.createScriptProcessor(512, 1, 1);
    const dspCore = new NearFieldRNNoiseDspCore();

    dspProcessorNode.onaudioprocess = function (audioProcessingEvent) {
      const inputBuf = audioProcessingEvent.inputBuffer.getChannelData(0);
      const outputBuf = audioProcessingEvent.outputBuffer.getChannelData(0);
      const isEnabled = !window.__RNNOISE_MEET_STATE__.bypass;
      const thresholdDb = window.__RNNOISE_MEET_STATE__.thresholdDb;

      // Jika tombol Mic di Google Meet sedang MUTE (Merah), langsung kunci grafik biru & output ke 0.00x
      // agar suara speaker lawan rapat tidak pernah menggerakkan grafik biru!
      if (!rawAudioTrack.enabled || isGoogleMeetMicCurrentlyMuted()) {
        outputBuf.fill(0);
        dspCore.isGateOpen = false;
        dspCore.smoothedGain = 0.0;
        hardGateGainNode.gain.value = 0.0;
        return;
      }

      dspCore.processAudioBlock(inputBuf, outputBuf, isEnabled, thresholdDb);

      if (isEnabled && !dspCore.isGateOpen && dspCore.smoothedGain === 0.0) {
        hardGateGainNode.gain.value = 0.0;
      } else {
        hardGateGainNode.gain.value = 1.0;
      }
    };

    sourceNode.connect(rawAnalyser);
    rawAnalyser.connect(dspProcessorNode);
    dspProcessorNode.connect(subCutNode);
    subCutNode.connect(mudCutNode);
    mudCutNode.connect(warmthNode);
    warmthNode.connect(presenceNode);
    presenceNode.connect(airShelfNode);
    airShelfNode.connect(studioCompressor);
    studioCompressor.connect(makeupGainNode);
    makeupGainNode.connect(hardGateGainNode);
    hardGateGainNode.connect(cleanAnalyser);

    // Hubungkan ke audioCtx.destination lewat loopbackGain (0.0 saat mati) agar Chrome selalu memutar dspProcessorNode
    cleanAnalyser.connect(loopbackGain);
    loopbackGain.connect(audioCtx.destination);

    const pipelineRecord = {
      activeCloneCount: 1,
      rawAudioTrack,
      audioCtx,
      sourceNode,
      rawAnalyser,
      cleanAnalyser,
      dspProcessorNode,
      dspCore,
      hardGateGainNode,
      loopbackGain,
      destinationNodes: new Set(),
    };

    rawToPipelineMap.set(rawAudioTrack, pipelineRecord);
    activePipelines.add(pipelineRecord);

    rawAudioTrack.addEventListener('ended', () => {
      activePipelines.delete(pipelineRecord);
      rawToPipelineMap.delete(rawAudioTrack);
      window.removeEventListener('click', resumeOnInteraction);
      window.removeEventListener('keydown', resumeOnInteraction);
      try {
        dspProcessorNode.onaudioprocess = null;
        sourceNode.disconnect();
        dspProcessorNode.disconnect();
        cleanAnalyser.disconnect();
        loopbackGain.disconnect();
      } catch (_e) {}
      if (audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    });

    const firstCleanTrack = createCleanDestinationTrack(pipelineRecord);

    return firstCleanTrack;
  }

  // Pindai seluruh RTCPeerConnection aktif & pastikan semua sender audio memakai cleanTrack
  function enforceCleanTrackOnAllPeerConnections() {
    trackedPeerConnections.forEach((pc) => {
      try {
        if (pc.connectionState === 'closed') {
          trackedPeerConnections.delete(pc);
          return;
        }
        const senders = pc.getSenders ? pc.getSenders() : [];
        senders.forEach((sender) => {
          if (sender && sender.track && sender.track.kind === 'audio' && sender.track.readyState === 'live') {
            if (!processedTrackSet.has(sender.track)) {
              const cleanTrack = buildCleanProcessedAudioTrack(sender.track);
              sender.replaceTrack(cleanTrack).catch(() => {});
            }
          }
        });
      } catch (_e) {}
    });
  }

  const rawFreqBuf = new Uint8Array(64);
  const cleanFreqBuf = new Uint8Array(64);

  window.__RNNOISE_MEET_STATE__ = {
    bypass: false,
    thresholdDb: -26,
    loopbackAudible: false,

    setBypass(shouldBypass = false) {
      this.bypass = Boolean(shouldBypass);
      this.broadcastState();
      return !this.bypass;
    },

    setThresholdDb(dbValue = -26) {
      this.thresholdDb = Math.max(-45, Math.min(-14, Number(dbValue)));
      this.broadcastState();
      return this.thresholdDb;
    },

    setLoopback(audible = false) {
      this.loopbackAudible = Boolean(audible);
      activePipelines.forEach((p) => {
        if (p.loopbackGain && p.audioCtx) {
          p.loopbackGain.gain.setTargetAtTime(
            this.loopbackAudible ? 1.0 : 0.0,
            p.audioCtx.currentTime,
            0.02
          );
        }
      });
      this.broadcastState();
      return this.loopbackAudible;
    },

    toggle() {
      return this.setBypass(!this.bypass);
    },

    getSnapshot() {
      enforceCleanTrackOnAllPeerConnections();

      let activePipe = null;
      activePipelines.forEach((p) => {
        if (p.rawAudioTrack.readyState === 'live') {
          activePipe = p;
        } else {
          activePipelines.delete(p);
        }
      });

      if (!activePipe) {
        return {
          hooked: false,
          enabled: !this.bypass,
          thresholdDb: this.thresholdDb,
          loopbackAudible: this.loopbackAudible,
          streamsCount: 0,
        };
      }

      if (activePipe.audioCtx.state === 'suspended') {
        activePipe.audioCtx.resume().catch(() => {});
      }

      activePipe.rawAnalyser.getByteFrequencyData(rawFreqBuf);
      activePipe.cleanAnalyser.getByteFrequencyData(cleanFreqBuf);

      const rawBars = Array.from(rawFreqBuf.slice(0, 28));
      const cleanBars = Array.from(cleanFreqBuf.slice(0, 28));

      let rawSum = 0;
      let cleanSum = 0;
      for (let i = 0; i < 28; i++) {
        rawSum += rawBars[i];
        cleanSum += cleanBars[i];
      }

      return {
        hooked: true,
        enabled: !this.bypass,
        thresholdDb: this.thresholdDb,
        loopbackAudible: this.loopbackAudible,
        frameDb: activePipe.dspCore.lastFrameDb,
        isGateOpen: activePipe.dspCore.isGateOpen,
        currentGain: Number(activePipe.dspCore.smoothedGain.toFixed(2)),
        streamsCount: activePipelines.size,
        rawBars,
        cleanBars,
        rawLevel: Math.round((rawSum / (28 * 255)) * 100),
        cleanLevel: Math.round((cleanSum / (28 * 255)) * 100),
      };
    },

    broadcastState() {
      const snap = this.getSnapshot();
      window.postMessage(
        {
          source: 'RNNOISE_MAIN_WORLD',
          type: 'AUDIO_GRAPH_TICK',
          ...snap,
        },
        '*'
      );
    },
  };

  // ==========================================================================
  // CEGATAN UTAMA (IN-PLACE STREAM SURGERY):
  // Mencabut langsung rawAudioTrack dari dalam rawStream milik Google Meet
  // dan menggantinya dengan cleanAudioTrack di dalam objek MediaStream yang sama!
  // ==========================================================================
  async function interceptedGetUserMedia(constraints) {
    const rawStream = await originalGetUserMedia(constraints);
    if (!constraints || !constraints.audio) {
      return rawStream;
    }

    const rawAudioTracks = rawStream.getAudioTracks();
    if (rawAudioTracks.length === 0) return rawStream;

    try {
      rawAudioTracks.forEach((rawTrack) => {
        const cleanTrack = buildCleanProcessedAudioTrack(rawTrack);
        // BEDAH IN-PLACE: Cabut track mentah dari stream Google Meet, masukkan track RNNoise!
        rawStream.removeTrack(rawTrack);
        rawStream.addTrack(cleanTrack);
      });
      return rawStream;
    } catch (err) {
      console.error('[RNNoise Meet v7.0] Error:', err);
      return rawStream;
    }
  }

  navigator.mediaDevices.getUserMedia = interceptedGetUserMedia;
  if (window.MediaDevices && window.MediaDevices.prototype) {
    window.MediaDevices.prototype.getUserMedia = interceptedGetUserMedia;
  }

  // ==========================================================================
  // CEGATAN LAPIS 2: Bungkus Konstruktor RTCPeerConnection + addTrack + replaceTrack
  // ==========================================================================
  if (window.RTCPeerConnection) {
    const OrigPeerConnection = window.RTCPeerConnection;
    const PatchedPeerConnection = function (...args) {
      const pc = new OrigPeerConnection(...args);
      trackedPeerConnections.add(pc);
      return pc;
    };
    PatchedPeerConnection.prototype = OrigPeerConnection.prototype;
    Object.setPrototypeOf(PatchedPeerConnection, OrigPeerConnection);
    window.RTCPeerConnection = PatchedPeerConnection;

    const origAddTrack = OrigPeerConnection.prototype.addTrack;
    if (typeof origAddTrack === 'function') {
      OrigPeerConnection.prototype.addTrack = function (track, ...streams) {
        trackedPeerConnections.add(this);
        if (track && track.kind === 'audio' && !processedTrackSet.has(track)) {
          try {
            const cleanTrack = buildCleanProcessedAudioTrack(track);
            if (streams && streams[0]) {
              try {
                streams[0].removeTrack(track);
                streams[0].addTrack(cleanTrack);
              } catch (_e) {}
            }
            return origAddTrack.call(this, cleanTrack, ...streams);
          } catch (_e) {}
        }
        return origAddTrack.call(this, track, ...streams);
      };
    }
  }

  if (window.RTCRtpSender && window.RTCRtpSender.prototype) {
    const origReplaceTrack = window.RTCRtpSender.prototype.replaceTrack;
    if (typeof origReplaceTrack === 'function') {
      window.RTCRtpSender.prototype.replaceTrack = function (withTrack) {
        if (withTrack && withTrack.kind === 'audio' && !processedTrackSet.has(withTrack)) {
          try {
            const cleanTrack = buildCleanProcessedAudioTrack(withTrack);
            return origReplaceTrack.call(this, cleanTrack);
          } catch (_e) {}
        }
        return origReplaceTrack.call(this, withTrack);
      };
    }
  }

  setInterval(() => {
    window.__RNNOISE_MEET_STATE__.broadcastState();
  }, 65);

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === 'RNNOISE_EXTENSION_POPUP') {
      if (event.data.action === 'TOGGLE') {
        window.__RNNOISE_MEET_STATE__.toggle();
      } else if (event.data.action === 'SET_THRESHOLD_DB') {
        window.__RNNOISE_MEET_STATE__.setThresholdDb(event.data.thresholdDb);
      } else if (event.data.action === 'TOGGLE_LOOPBACK') {
        window.__RNNOISE_MEET_STATE__.setLoopback(!window.__RNNOISE_MEET_STATE__.loopbackAudible);
      } else if (event.data.action === 'GET_STATUS') {
        window.__RNNOISE_MEET_STATE__.broadcastState();
      }
    }
  });

  // ==========================================================================
  // STEALTH MODE (AMAN SAAT SHARE SCREEN):
  // Tombol melayang (#rnnoise-meet-floating-btn) DIHAPUS TOTAL agar tidak
  // pernah terlihat oleh peserta lain saat Anda melakukan Share Screen di Meet!
  // ==========================================================================
  const existingFloatingBtn = document.getElementById('rnnoise-meet-floating-btn');
  if (existingFloatingBtn) {
    existingFloatingBtn.remove();
  }
})();`,
  },
  {
    filename: 'content-bridge.js',
    language: 'javascript',
    description:
      'Jembatan komunikasi antara Google Meet dan Background Service Worker.',
    content: `/**
 * @file content-bridge.js (v7.0)
 * @description Jembatan pesan antara halaman Google Meet dan Background Service Worker.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.action === 'TOGGLE_RNNOISE') {
    window.postMessage({ source: 'RNNOISE_EXTENSION_POPUP', action: 'TOGGLE' }, '*');
    sendResponse({ ok: true });
  } else if (msg.action === 'SET_THRESHOLD_DB') {
    window.postMessage(
      {
        source: 'RNNOISE_EXTENSION_POPUP',
        action: 'SET_THRESHOLD_DB',
        thresholdDb: msg.thresholdDb,
      },
      '*'
    );
    sendResponse({ ok: true });
  } else if (msg.action === 'TOGGLE_LOOPBACK') {
    window.postMessage({ source: 'RNNOISE_EXTENSION_POPUP', action: 'TOGGLE_LOOPBACK' }, '*');
    sendResponse({ ok: true });
  } else if (msg.action === 'GET_RNNOISE_STATUS') {
    window.postMessage({ source: 'RNNOISE_EXTENSION_POPUP', action: 'GET_STATUS' }, '*');
    sendResponse({ ok: true });
  }
  return true;
});

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.source === 'RNNOISE_MAIN_WORLD') {
    if (event.data.type === 'AUDIO_GRAPH_TICK') {
      chrome.runtime.sendMessage({
        type: 'RNNOISE_AUDIO_GRAPH',
        ...event.data,
      }).catch(() => {});
    }
  }
});`,
  },
  {
    filename: 'popup.html',
    language: 'html',
    description:
      'Popup v7.0: Dilengkapi tombol "🔄 Kunci Ulang Pipa Google Meet (Refresh Tab)" jika tab Google Meet sudah telanjur dibuka sebelum ekstensi di-reload, sehingga menjamin 100% SATU PIPA (tidak jalan sendiri-sendiri)!',
    content: `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      width: 348px;
      margin: 0;
      padding: 14px;
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .brand { font-size: 12px; font-weight: 700; color: #f1f5f9; }
    .badge {
      font-size: 10px;
      font-family: monospace;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
    }
    .badge.active { background: rgba(2, 132, 199, 0.25); color: #38bdf8; border: 1px solid #0284c7; }
    .badge.inactive { background: #1e293b; color: #94a3b8; border: 1px solid #475569; }

    .webrtc-banner {
      font-size: 10px;
      font-family: monospace;
      padding: 6px 8px;
      border-radius: 6px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .webrtc-banner.hooked {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #059669;
      color: #34d399;
    }
    .webrtc-banner.waiting {
      background: rgba(244, 63, 94, 0.18);
      border: 1px solid #e11d48;
      color: #fda4af;
    }

    .reload-meet-btn {
      width: 100%;
      padding: 8px 10px;
      margin-bottom: 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid #f59e0b;
      background: rgba(245, 158, 11, 0.2);
      color: #fde68a;
      text-align: center;
      display: none;
    }

    .control-row {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #0f172a;
      border: 1px solid #1e293b;
      padding: 10px 12px;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .power-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }
    .power-btn.active {
      background: #0284c7;
      color: #ffffff;
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.55);
    }
    .power-btn.inactive {
      background: #475569;
      color: #cbd5e1;
      box-shadow: none;
    }
    .status-title { font-size: 12px; font-weight: 700; margin-bottom: 2px; }
    .status-title.active { color: #38bdf8; }
    .status-title.inactive { color: #94a3b8; }
    .status-sub { font-size: 10px; color: #94a3b8; line-height: 1.3; }

    .distance-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .distance-title {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 7px;
    }
    .preset-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
      margin-bottom: 8px;
    }
    .preset-btn {
      background: #060911;
      border: 1px solid #1e293b;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 600;
      padding: 5px 4px;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
    }
    .preset-btn.selected {
      background: rgba(2, 132, 199, 0.22);
      border-color: #0284c7;
      color: #38bdf8;
    }
    .slider-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 10px;
      color: #94a3b8;
    }
    input[type="range"] {
      flex: 1;
      accent-color: #0284c7;
      cursor: pointer;
    }

    .loopback-btn {
      width: 100%;
      padding: 7px 10px;
      margin-bottom: 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid #334155;
      background: #1e293b;
      color: #e2e8f0;
      text-align: center;
    }
    .loopback-btn.on {
      background: rgba(16, 185, 129, 0.2);
      border-color: #10b981;
      color: #34d399;
    }

    .graph-box {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px;
    }
    .graph-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      font-family: monospace;
      color: #94a3b8;
      margin-bottom: 6px;
    }
    .gate-pill {
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      font-weight: 700;
    }
    .gate-open { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .gate-closed { background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid #e11d48; }
    .legend {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px solid #1e293b;
    }
    .leg-raw { color: #fb7185; font-weight: 600; }
    .leg-clean { color: #38bdf8; font-weight: 600; }
    canvas {
      width: 100%;
      height: 98px;
      display: block;
      background: #060911;
      border-radius: 6px;
      border: 1px solid #1e293b;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="brand">RNNoise v7.0 (Satu Pipa Meet)</span>
    <span id="topBadge" class="badge active">IKON BIRU: ON</span>
  </div>

  <div id="webrtcBanner" class="webrtc-banner waiting">
    <span id="webrtcStatusText">⚠️ Klik Tombol Kuning di Bawah Sekali</span>
    <span id="gainValText">Gain: --</span>
  </div>

  <!-- Tombol 1-Klik untuk me-reload tab Meet agar getUserMedia Meet masuk ke Satu Pipa RNNoise -->
  <button id="reloadMeetBtn" class="reload-meet-btn" type="button">
    🔄 Klik di Sini untuk Menggabungkan Pipa Mic Google Meet (Wajib 1x)
  </button>

  <div class="control-row">
    <button id="toggleBtn" class="power-btn active" title="Klik untuk Menyalakan / Mematikan">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M8 11v2"/><path d="M12 8v8"/><path d="M16 11v2"/>
      </svg>
    </button>
    <div>
      <div id="statusText" class="status-title active">RNNOISE: MENYALA (BIRU)</div>
      <div id="hintText" class="status-sub">Track asli dicabut dari Meet &amp; diganti output RNNoise!</div>
    </div>
  </div>

  <div class="distance-box">
    <div class="distance-title">
      <span>BATAS JARAK TANGKAP MIC (HARD GATE)</span>
      <span id="dbValueText" style="color: #fbbf24; font-family: monospace;">-26 dB (&le; 1m)</span>
    </div>
    <div class="preset-row">
      <button id="preset05m" class="preset-btn" type="button">&le; 0.5m (-20dB)</button>
      <button id="preset1m" class="preset-btn selected" type="button">&le; 1.0m (-26dB)</button>
      <button id="presetStd" class="preset-btn" type="button">Longgar (-38dB)</button>
    </div>
    <div class="slider-wrap">
      <span>Longgar</span>
      <input id="thresholdSlider" type="range" min="-42" max="-14" step="1" value="-26" />
      <span>Ketat (&le;0.5m)</span>
    </div>
  </div>

  <button id="loopbackBtn" class="loopback-btn" type="button">
    🎧 Tes Dengar Suara Saya Sendiri: MATI (Klik untuk Uji)
  </button>

  <div class="graph-box">
    <div class="graph-header">
      <span>GRAFIK SATU PIPA GOOGLE MEET</span>
      <span id="gateStatusBadge" class="gate-pill gate-closed">GAIN: 0.00x</span>
    </div>
    <canvas id="spectrumCanvas" width="306" height="98"></canvas>
    <div class="legend">
      <span class="leg-raw">■ Merah: Mic Mentah (<span id="rawPct">0%</span>)</span>
      <span class="leg-clean">■ Biru: Masuk ke Meet (<span id="cleanPct">0%</span>)</span>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>`,
  },
  {
    filename: 'popup.js',
    language: 'javascript',
    description:
      'Memastikan 100% Satu Pipa dengan Google Meet: Jika Google Meet sudah telanjur mengambil mikrofon sebelum ekstensi dipasang/di-reload, Popup menampilkan tombol kuning "🔄 Gabungkan Pipa Mic Google Meet" yang me-refresh tab Meet sehingga getUserMedia Google Meet masuk ke pipa RNNoise!',
    content: `/**
 * @file popup.js (v7.0 - Satu Pipa Tunggal dengan Google Meet)
 * @description
 * Tidak lagi membuat stream mikrofon ganda! Popup ini memeriksa apakah objek MediaStream
 * milik Google Meet sudah dibedah secara In-Place (removeTrack + addTrack).
 * Jika tab Google Meet dibuka sebelum ekstensi di-reload, tombol kuning akan me-refresh
 * tab Meet agar Google Meet mengambil mikrofon langsung melalui pipa RNNoise v7.0!
 */

const toggleBtn = document.getElementById('toggleBtn');
const topBadge = document.getElementById('topBadge');
const webrtcBanner = document.getElementById('webrtcBanner');
const webrtcStatusText = document.getElementById('webrtcStatusText');
const gainValText = document.getElementById('gainValText');
const reloadMeetBtn = document.getElementById('reloadMeetBtn');
const statusText = document.getElementById('statusText');
const hintText = document.getElementById('hintText');
const dbValueText = document.getElementById('dbValueText');
const thresholdSlider = document.getElementById('thresholdSlider');
const preset05m = document.getElementById('preset05m');
const preset1m = document.getElementById('preset1m');
const presetStd = document.getElementById('presetStd');
const loopbackBtn = document.getElementById('loopbackBtn');
const gateStatusBadge = document.getElementById('gateStatusBadge');
const rawPctEl = document.getElementById('rawPct');
const cleanPctEl = document.getElementById('cleanPct');
const canvas = document.getElementById('spectrumCanvas');
const ctx = canvas.getContext('2d');

let activeMeetTabId = null;
let isEnabled = true;
let isHookedToMeet = false;
let loopbackAudible = false;
let thresholdDb = -26;
let latestRawBars = new Array(28).fill(0);
let latestCleanBars = new Array(28).fill(0);
let isGateOpen = false;
let currentGain = 0.0;

function formatDistanceLabel(db) {
  if (db >= -22) return db + ' dB (<= 0.5m)';
  if (db >= -30) return db + ' dB (<= 1.0m)';
  return db + ' dB (> 1.5m)';
}

function updatePresetHighlight(db) {
  preset05m.className = 'preset-btn' + (db >= -22 ? ' selected' : '');
  preset1m.className = 'preset-btn' + (db < -22 && db >= -30 ? ' selected' : '');
  presetStd.className = 'preset-btn' + (db < -30 ? ' selected' : '');
  thresholdSlider.value = String(db);
  dbValueText.textContent = formatDistanceLabel(db);
}

function updateLoopbackUI(audible) {
  loopbackAudible = Boolean(audible);
  if (loopbackAudible) {
    loopbackBtn.className = 'loopback-btn on';
    loopbackBtn.textContent = '🔊 Tes Dengar Suara Sendiri: AKTIF (Pakai Earphone!)';
  } else {
    loopbackBtn.className = 'loopback-btn';
    loopbackBtn.textContent = '🎧 Tes Dengar Suara Saya Sendiri: MATI (Klik untuk Uji)';
  }
}

function renderState(enabled) {
  isEnabled = enabled;
  if (enabled) {
    toggleBtn.className = 'power-btn active';
    topBadge.className = 'badge active';
    topBadge.textContent = 'IKON BIRU: ON';
    statusText.className = 'status-title active';
    statusText.textContent = 'RNNOISE: MENYALA (BIRU)';
    hintText.textContent = 'Track asli dicabut dari Meet & diganti output RNNoise!';
  } else {
    toggleBtn.className = 'power-btn inactive';
    topBadge.className = 'badge inactive';
    topBadge.textContent = 'ABU-ABU: OFF';
    statusText.className = 'status-title inactive';
    statusText.textContent = 'RNNOISE: MATI (ABU-ABU)';
    hintText.textContent = 'Mode Bypass: Suara orang jarak 2 meter ikut masuk ke Meet!';
  }

  chrome.runtime.sendMessage({
    type: 'RNNOISE_STATE_UPDATE',
    enabled: isEnabled,
  }).catch(() => {});
}

function applySnapshotData(snap) {
  if (!snap) return;
  isHookedToMeet = Boolean(snap.hooked);
  renderState(Boolean(snap.enabled));

  if (typeof snap.thresholdDb === 'number') {
    thresholdDb = snap.thresholdDb;
    updatePresetHighlight(thresholdDb);
  }
  if (typeof snap.loopbackAudible === 'boolean') {
    updateLoopbackUI(snap.loopbackAudible);
  }

  if (isHookedToMeet) {
    reloadMeetBtn.style.display = 'none';
    isGateOpen = Boolean(snap.isGateOpen);
    currentGain = typeof snap.currentGain === 'number' ? snap.currentGain : 0;
    if (Array.isArray(snap.rawBars)) latestRawBars = snap.rawBars;
    if (Array.isArray(snap.cleanBars)) latestCleanBars = snap.cleanBars;
    rawPctEl.textContent = (snap.rawLevel || 0) + '%';
    cleanPctEl.textContent = (snap.cleanLevel || 0) + '%';

    webrtcBanner.className = 'webrtc-banner hooked';
    webrtcStatusText.textContent = '✅ SATU PIPA DENGAN GOOGLE MEET';
    gainValText.textContent = 'Gain: ' + currentGain.toFixed(2) + 'x';
  } else {
    reloadMeetBtn.style.display = 'block';
    latestRawBars.fill(0);
    latestCleanBars.fill(0);
    rawPctEl.textContent = '0%';
    cleanPctEl.textContent = '0%';
    webrtcBanner.className = 'webrtc-banner waiting';
    webrtcStatusText.textContent = '⚠️ Pipa Meet Belum Digabung (Klik Tombol Kuning)';
    gainValText.textContent = 'Gain: --';
  }
}

reloadMeetBtn.addEventListener('click', () => {
  if (activeMeetTabId) {
    reloadMeetBtn.textContent = '⏳ Menggabungkan Pipa Mic & Memuat Ulang Meet...';
    chrome.tabs.reload(activeMeetTabId);
  }
});

function runCommandInMeetMainWorld(fn, args = []) {
  if (!activeMeetTabId || !chrome.scripting) return;
  chrome.scripting
    .executeScript({
      target: { tabId: activeMeetTabId },
      world: 'MAIN',
      func: fn,
      args: args,
    })
    .then((results) => {
      if (results && results[0] && results[0].result) {
        applySnapshotData(results[0].result);
      }
    })
    .catch(() => {});
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.id) return;
  activeMeetTabId = activeTab.id;
  pollMeetMainWorld();
});

function pollMeetMainWorld() {
  runCommandInMeetMainWorld(() => {
    if (window.__RNNOISE_MEET_STATE__) {
      return window.__RNNOISE_MEET_STATE__.getSnapshot();
    }
    return null;
  });
}

setInterval(pollMeetMainWorld, 65);

function sendThresholdToMeet(newDb) {
  thresholdDb = Number(newDb);
  updatePresetHighlight(thresholdDb);
  runCommandInMeetMainWorld((db) => {
    if (window.__RNNOISE_MEET_STATE__) {
      window.__RNNOISE_MEET_STATE__.setThresholdDb(db);
      return window.__RNNOISE_MEET_STATE__.getSnapshot();
    }
    return null;
  }, [thresholdDb]);
}

preset05m.addEventListener('click', () => sendThresholdToMeet(-20));
preset1m.addEventListener('click', () => sendThresholdToMeet(-26));
presetStd.addEventListener('click', () => sendThresholdToMeet(-38));
thresholdSlider.addEventListener('input', (e) => sendThresholdToMeet(Number(e.target.value)));

loopbackBtn.addEventListener('click', () => {
  runCommandInMeetMainWorld(() => {
    if (window.__RNNOISE_MEET_STATE__) {
      window.__RNNOISE_MEET_STATE__.setLoopback(!window.__RNNOISE_MEET_STATE__.loopbackAudible);
      return window.__RNNOISE_MEET_STATE__.getSnapshot();
    }
    return null;
  });
});

toggleBtn.addEventListener('click', () => {
  renderState(!isEnabled);
  runCommandInMeetMainWorld(() => {
    if (window.__RNNOISE_MEET_STATE__) {
      window.__RNNOISE_MEET_STATE__.toggle();
      return window.__RNNOISE_MEET_STATE__.getSnapshot();
    }
    return null;
  });
});

function drawRealSpectrumLoop() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const normalizedThresh = Math.max(0.15, Math.min(0.88, (thresholdDb + 50) / 38));
  const thresholdY = h - normalizedThresh * (h - 12);

  if (!isHookedToMeet) {
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('Klik tombol kuning di atas (atau tekan F5 di Meet)', 20, h / 2 - 4);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText('agar Google Meet & RNNoise menyatu dalam 1 pipa!', 24, h / 2 + 12);
    gateStatusBadge.className = 'gate-pill gate-closed';
    gateStatusBadge.textContent = 'PERLU F5 1x';
    return;
  }

  if (!isEnabled) {
    gateStatusBadge.className = 'gate-pill gate-closed';
    gateStatusBadge.textContent = 'BYPASS (GAIN 1.00x)';
  } else if (isGateOpen) {
    gateStatusBadge.className = 'gate-pill gate-open';
    gateStatusBadge.textContent = 'LOLOS <= 1M (GAIN 1.00x)';
  } else {
    gateStatusBadge.className = 'gate-pill gate-closed';
    gateStatusBadge.textContent = 'DIPUTUS > 1M (GAIN 0.00x)';
  }

  const barCount = latestRawBars.length;
  const barWidth = w / barCount;

  for (let i = 0; i < barCount; i++) {
    const rawH = (latestRawBars[i] / 255) * (h - 10);
    const cleanH = (latestCleanBars[i] / 255) * (h - 10);

    ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.fillRect(i * barWidth + 1, h - rawH, barWidth - 2, rawH);

    ctx.fillStyle = isEnabled ? '#38bdf8' : '#94a3b8';
    ctx.fillRect(i * barWidth + 2.5, h - cleanH, barWidth - 5, cleanH);
  }

  if (isEnabled) {
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(w, thresholdY);
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('BATAS JARAK (' + thresholdDb + 'dB) - DI BAWAH INI GAIN = 0.00x', 6, Math.max(10, thresholdY - 4));
    ctx.restore();
  }
}

setInterval(drawRealSpectrumLoop, 55);`,
  },
];

type SimDistanceScenario = 'coworker-2m' | 'speaker-1m';

export const GoogleMeetIntegrationHub: React.FC<GoogleMeetIntegrationHubProps> = ({
  audioController,
}) => {
  const [selectedMethod, setSelectedMethod] =
    useState<IntegrationMethod>('macos-app');
  const [selectedExtFile, setSelectedExtFile] = useState<string>('content-injector.js');
  const [selectedMacFile, setSelectedMacFile] = useState<string>(
    'Install-OPUNG-MacOS.command'
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [previewExtensionEnabled, setPreviewExtensionEnabled] = useState<boolean>(true);
  const [previewThresholdDb, setPreviewThresholdDb] = useState<number>(-26);
  const [simScenario, setSimScenario] = useState<SimDistanceScenario>('coworker-2m');
  const [previewLoopback, setPreviewLoopback] = useState<boolean>(false);
  const [previewMetrics, setPreviewMetrics] = useState<{
    rawPct: number;
    cleanPct: number;
    gateOpen: boolean;
    gainVal: string;
  }>({
    rawPct: 36,
    cleanPct: 0,
    gateOpen: false,
    gainVal: '0.00x',
  });

  const popupPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewEnabledRef = useRef<boolean>(previewExtensionEnabled);
  const previewThresholdDbRef = useRef<number>(previewThresholdDb);
  const simScenarioRef = useRef<SimDistanceScenario>(simScenario);

  useEffect(() => {
    previewEnabledRef.current = previewExtensionEnabled;
  }, [previewExtensionEnabled]);

  useEffect(() => {
    previewThresholdDbRef.current = previewThresholdDb;
  }, [previewThresholdDb]);

  useEffect(() => {
    simScenarioRef.current = simScenario;
  }, [simScenario]);

  useEffect(() => {
    const canvas = popupPreviewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let tick = 0;
    const drawPopupSimulation = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#060911';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      for (let y = 24; y < h; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      tick += 0.2;
      const enabled = previewEnabledRef.current;
      const threshDb = previewThresholdDbRef.current;
      const scenario = simScenarioRef.current;
      const barCount = 28;
      const barWidth = w / barCount;

      const normalizedThresh = Math.max(0.18, Math.min(0.86, (threshDb + 50) / 38));
      const thresholdY = h - normalizedThresh * (h - 12);
      const cutoffBarValue = normalizedThresh * 255;

      let rawSum = 0;
      let cleanSum = 0;
      let peakRaw = 0;

      for (let i = 0; i < barCount; i++) {
        const office2mChatter =
          i >= 2 && i <= 16
            ? 58 + Math.sin(tick * 1.4 + i * 0.6) * 24 + ((i * 13) % 16)
            : 24 + Math.sin(tick + i) * 8;

        const near1mVoice =
          scenario === 'speaker-1m' && i >= 3 && i <= 12
            ? 140 + Math.max(0, Math.sin(tick * 0.65) * 45)
            : 0;

        const rawVal = Math.min(250, office2mChatter + near1mVoice);
        if (rawVal > peakRaw) peakRaw = rawVal;

        const passesProximityGate = rawVal >= cutoffBarValue;

        const cleanVal = !enabled
          ? rawVal
          : passesProximityGate
          ? Math.min(250, near1mVoice * 0.96 + office2mChatter * 0.12)
          : 0;

        rawSum += rawVal;
        cleanSum += cleanVal;

        const rawH = (rawVal / 255) * (h - 10);
        const cleanH = (cleanVal / 255) * (h - 10);

        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.fillRect(i * barWidth + 1, h - rawH, barWidth - 2, rawH);

        if (cleanH > 0) {
          ctx.fillStyle = enabled ? '#38bdf8' : '#94a3b8';
          ctx.fillRect(i * barWidth + 2.5, h - cleanH, barWidth - 5, cleanH);
        }
      }

      if (enabled) {
        ctx.save();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(w, thresholdY);
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9.5px monospace';
        ctx.fillText(
          `BATAS JARAK (${threshDb} dB) — DI BAWAH INI GAIN = 0.00x (BISU)`,
          6,
          Math.max(11, thresholdY - 5)
        );
        ctx.restore();
      }

      const gateOpen = peakRaw >= cutoffBarValue;
      setPreviewMetrics({
        rawPct: Math.round((rawSum / (barCount * 255)) * 100),
        cleanPct: Math.round((cleanSum / (barCount * 255)) * 100),
        gateOpen,
        gainVal: !enabled || gateOpen ? '1.00x' : '0.00x',
      });
    };

    drawPopupSimulation();
    const intervalId = window.setInterval(drawPopupSimulation, 60);
    return () => window.clearInterval(intervalId);
  }, [selectedMethod]);

  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState<string>('');
  const [sinkStatusMsg, setSinkStatusMsg] = useState<string | null>(null);
  const [isVirtualCableActive, setIsVirtualCableActive] = useState<boolean>(false);
  const hubVirtualSinkRef = useRef<HTMLAudioElement | null>(null);

  const isVirtualCableLabel = (label: string) => {
    const l = (label || '').toLowerCase();
    return (
      l.includes('blackhole') ||
      l.includes('vb-cable') ||
      l.includes('cable input') ||
      l.includes('soundflower') ||
      l.includes('loopback') ||
      l.includes('existential') ||
      l.includes('virtual')
    );
  };

  const isPhysicalSpeakerOrEarphoneLabel = (label: string) => {
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
  };

  useEffect(() => {
    const loadOutputDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(
          (d) =>
            d.kind === 'audiooutput' &&
            d.deviceId !== 'default' &&
            d.deviceId !== 'communications'
        );
        setAudioOutputDevices(outputs);
        const virtualDev = outputs.find((d) => isVirtualCableLabel(d.label));
        if (virtualDev && !selectedSinkId) {
          setSelectedSinkId(virtualDev.deviceId);
        }
      } catch {
        // Abaikan jika izin belum diberikan
      }
    };
    loadOutputDevices();
  }, [audioController.isActive, selectedSinkId]);

  const handleTogglePreviewButton = () => {
    const nextState = !previewExtensionEnabled;
    setPreviewExtensionEnabled(nextState);
    if (audioController.isActive) {
      audioController.toggleNoiseCancellation(nextState);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadExtensionFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllExtensionFiles = () => {
    const zipBytes = buildChromeExtensionZip(CHROME_EXTENSION_FILES);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'OPUNG-Google-Meet-Extension.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMacOSInstaller = () => {
    const zipBytes = buildMacOSAppBundleZip();
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'OPUNG-MacOS-App.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMacOSCommandScript = () => {
    const installerContent = generateMacOSOneClickInstallerScript();
    handleDownloadExtensionFile('Install-OPUNG-MacOS.command', installerContent);
  };

  const handleDownloadMacOSStandaloneApp = () => {
    handleDownloadExtensionFile('OPUNG-Studio-MacOS.html', MACOS_STANDALONE_APP_HTML);
  };

  const handleDownloadAllMacOSFiles = () => {
    handleDownloadMacOSInstaller();
  };

  const activeExtensionSpec =
    CHROME_EXTENSION_FILES.find((f) => f.filename === selectedExtFile) ||
    CHROME_EXTENSION_FILES[0];

  const activeMacSpec =
    ELECTRON_MACOS_FILES.find((f) => f.filename === selectedMacFile) ||
    ELECTRON_MACOS_FILES[0];

  const handleActivateVirtualCableMode = async () => {
    if (!audioController.isActive) {
      await audioController.startMicrophone();
    }
    // KRITIS ANTI-BOCOR EARPHONE:
    // JANGAN PERNAH memanggil audioController.setLocalMonitor(true) karena itu akan memutar
    // suara langsung ke ctx.destination (Earphone Default pengguna)!
    audioController.setLocalMonitor(false);

    const audioEl = hubVirtualSinkRef.current;
    if (!audioEl) return;

    audioEl.muted = true;
    audioEl.volume = 0;
    audioEl.pause();

    if (!selectedSinkId || selectedSinkId === 'default' || selectedSinkId === 'communications') {
      audioEl.srcObject = null;
      setIsVirtualCableActive(false);
      setSinkStatusMsg(
        'Earphone Aman (Anti-Bocor Aktif): Pilih perangkat "BlackHole 2ch" atau "CABLE Input (VB-Audio)" pada dropdown di atas terlebih dahulu agar suara tidak bocor ke Earphone Anda.'
      );
      return;
    }

    const chosenDev = audioOutputDevices.find((d) => d.deviceId === selectedSinkId);
    if (chosenDev && isPhysicalSpeakerOrEarphoneLabel(chosenDev.label)) {
      audioEl.srcObject = null;
      setIsVirtualCableActive(false);
      setSinkStatusMsg(
        'Diblokir (Ini Earphone/Speaker Fisik!): Pilih "BlackHole 2ch" atau "VB-Cable" agar suara Anda tidak bocor ke Earphone sendiri.'
      );
      return;
    }

    const elWithSink = audioEl as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };

    if (typeof elWithSink.setSinkId === 'function' && audioController.processedStream) {
      try {
        await elWithSink.setSinkId(selectedSinkId);
        audioEl.srcObject = audioController.processedStream;
        audioEl.volume = 1.0;
        audioEl.muted = false;
        await audioEl.play().catch(() => {});
        setIsVirtualCableActive(true);
        setSinkStatusMsg(
          'Transmisi Ke Kabel Virtual Aktif (Earphone Tetap Bisu): Sekarang pilih "BlackHole 2ch" atau "CABLE Output" sebagai Mikrofon di Google Meet.'
        );
      } catch {
        audioEl.muted = true;
        audioEl.volume = 0;
        audioEl.pause();
        audioEl.srcObject = null;
        setIsVirtualCableActive(false);
        setSinkStatusMsg('Gagal menyambungkan ke perangkat output virtual. Earphone tetap diamankan.');
      }
    } else {
      audioEl.srcObject = null;
      setIsVirtualCableActive(false);
      setSinkStatusMsg(
        'Browser ini tidak mendukung setSinkId atau mikrofon belum aktif. Gunakan OPUNG.app macOS untuk koneksi BlackHole 2ch otomatis.'
      );
    }
  };

  return (
    <section
      id="google-meet-integration"
      className="scroll-mt-24 border border-slate-800 bg-slate-900/60 rounded-xl p-6"
    >
      <audio ref={hubVirtualSinkRef} muted playsInline className="hidden" />
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400 font-mono mb-1">
            <span>01. APLIKASI DESKTOP MACOS (.DMG / .APP) &amp; EKSTENSI STEALTH v7.0</span>
            <span aria-hidden="true">·</span>
            <span>AMAN SAAT SHARE SCREEN (TANPA TOMBOL MELAYANG)</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Download Aplikasi Desktop macOS (.dmg &amp; .app) + Mode Stealth Share Screen
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Kini tersedia <strong>Installer Aplikasi Desktop macOS (.dmg &amp; .app)</strong> yang
            dapat langsung Anda unduh dan instal di MacBook/iMac Anda, lengkap dengan fitur{' '}
            <strong>Tombol Biru/Abu-abu</strong>, <strong>Batas Jarak &le; 1 Meter</strong>,{' '}
            <strong>Grafik Spektrum Live</strong>, dan rute <strong>Virtual Mic (BlackHole 2ch)</strong>.
            Selain itu, elemen <code className="font-mono text-rose-300">rnnoise-meet-floating-btn</code>{' '}
            telah <strong>dihapus 100%</strong> sehingga layar Google Meet Anda bersih saat{' '}
            <strong>Share Screen</strong>!
          </p>
        </div>

        {/* Method Selector Tabs */}
        <div
          role="tablist"
          aria-label="Metode Integrasi Google Meet"
          className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-lg shrink-0 self-start lg:self-auto"
        >
          <button
            role="tab"
            aria-selected={selectedMethod === 'macos-app'}
            type="button"
            onClick={() => setSelectedMethod('macos-app')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              selectedMethod === 'macos-app'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5 shrink-0" />
            Download for macOS (.dmg / .app)
          </button>
          <button
            role="tab"
            aria-selected={selectedMethod === 'chrome-extension'}
            type="button"
            onClick={() => setSelectedMethod('chrome-extension')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              selectedMethod === 'chrome-extension'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5 shrink-0" />
            Ekstensi Chrome v7.0 (Tanpa Tombol Melayang)
          </button>
          <button
            role="tab"
            aria-selected={selectedMethod === 'virtual-cable'}
            type="button"
            onClick={() => setSelectedMethod('virtual-cable')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              selectedMethod === 'virtual-cable'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cable className="w-3.5 h-3.5 shrink-0" />
            Transmisi Web Langsung
          </button>
        </div>
      </div>

      {/* METHOD 0: MACOS DESKTOP APPLICATION (.DMG & .APP) */}
      {selectedMethod === 'macos-app' && (
        <div className="mt-6 space-y-6">
          {/* Top Hero Download Card for macOS */}
          <div className="p-5 rounded-xl border border-emerald-700/60 bg-gradient-to-br from-emerald-950/30 via-slate-950 to-slate-950 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold">
                <Laptop className="w-3.5 h-3.5" />
                macOS Universal (Apple Silicon M1/M2/M3/M4 &amp; Intel) · macOS 12+
              </div>
              <h3 className="text-lg font-bold text-slate-100">
                RNNoise Studio for macOS — Installer .app &amp; Pembuat File .dmg Otomatis
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Unduh file installer macOS di samping. Saat dijalankan di Mac Anda, script ini akan
                secara otomatis membangun aplikasi native{' '}
                <code className="font-mono text-emerald-300">/Applications/RNNoise Studio.app</code>,
                membuat file installer{' '}
                <code className="font-mono text-sky-300">~/Desktop/RNNoise-Studio-MacOS.dmg</code>{' '}
                menggunakan <code className="font-mono text-slate-200">hdiutil</code> bawaan Apple,
                membuka kunci izin Gatekeeper (<code className="font-mono text-slate-200">xattr -cr</code>),
                dan langsung membuka jendela aplikasinya!
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 100% Aman Share Screen (Tidak Ada Floating Button di Meet)
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-sky-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Rute ke Google Meet via BlackHole 2ch
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDownloadMacOSInstaller}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                Download for macOS (.dmg &amp; .app Installer)
              </button>
              <button
                type="button"
                onClick={handleDownloadMacOSStandaloneApp}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                Unduh Engine Mandiri (RNNoise-Studio-MacOS.html)
              </button>
            </div>
          </div>

          {/* Solusi Gatekeeper macOS ("Apple could not verify Install-RNNoise-MacOS.command") */}
          <div className="p-4 rounded-xl border border-amber-500/60 bg-amber-950/25 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                Muncul Peringatan &ldquo;Apple could not verify Install-RNNoise-MacOS.command&rdquo;? Ini Cara Membukanya (3 Detik):
              </div>
              <span className="text-[11px] font-mono text-amber-400/90">
                Bypass Gatekeeper macOS
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              macOS otomatis memblokir file <code className="font-mono text-amber-300">.command</code> yang
              diklik 2x langsung dari folder Downloads karena atribut karantina browser (<code className="font-mono text-slate-200">com.apple.quarantine</code>).
              Gunakan <strong>salah satu dari 2 cara resmi</strong> berikut untuk langsung menginstalnya:
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-emerald-400">
                  Cara 1 (Paling Cepat &amp; Pasti Berhasil — Lewat Terminal):
                </div>
                <p className="text-[11px] text-slate-400">
                  Tekan <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono">Cmd + Space</kbd>,
                  ketik <strong>Terminal</strong> lalu tekan Enter. Salin &amp; Paste perintah ini lalu tekan Enter:
                </p>
                <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-emerald-700/60 font-mono text-[11px] text-emerald-300">
                  <code className="truncate">
                    xattr -cr ~/Downloads/Install-RNNoise-MacOS.command &amp;&amp; bash ~/Downloads/Install-RNNoise-MacOS.command
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        'gatekeeper-fix',
                        'xattr -cr ~/Downloads/Install-RNNoise-MacOS.command && bash ~/Downloads/Install-RNNoise-MacOS.command'
                      )
                    }
                    className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold text-[10px] shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'gatekeeper-fix' ? '✓ Disalin!' : 'Salin Perintah'}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 space-y-1.5">
                <div className="text-xs font-semibold text-sky-400">
                  Cara 2 (Tanpa Terminal — Lewat System Settings Mac):
                </div>
                <ol className="text-[11px] text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>
                    Klik <strong>Done</strong> (Selesai) pada popup peringatan Apple tersebut.
                  </li>
                  <li>
                    Buka <strong>System Settings (Pengaturan Sistem)</strong> → klik menu{' '}
                    <strong>Privacy &amp; Security (Privasi &amp; Keamanan)</strong>.
                  </li>
                  <li>
                    Gulir ke paling bawah ke bagian <strong>Security</strong>, lalu klik tombol{' '}
                    <strong>&ldquo;Open Anyway&rdquo; (Tetap Buka)</strong> di samping tulisan{' '}
                    <em>Install-RNNoise-MacOS.command was blocked</em>.
                  </li>
                </ol>
              </div>
            </div>
          </div>

          {/* 3 Key Advantages of macOS App + Stealth Screen Share */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" />
                1. 100% BERSIH SAAT SHARE SCREEN
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sesuai permintaan Anda, tombol melayang{' '}
                <code className="font-mono text-rose-300">rnnoise-meet-floating-btn</code> telah{' '}
                <strong>dihapus sepenuhnya</strong> baik di aplikasi macOS maupun di ekstensi, sehingga
                tidak akan pernah terlihat oleh peserta rapat saat Anda Share Screen!
              </p>
            </div>
            <div className="p-4 rounded-xl border border-sky-800/60 bg-sky-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-sky-400">
                2. SATU PIPA PASTI LEWAT VIRTUAL MIC MACOS
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Aplikasi macOS ini mengambil suara dari <strong>Mikrofon Fisik MacBook</strong>,
                menyaring suara di luar <strong>&le; 1 meter</strong>, lalu mengirimkannya ke{' '}
                <strong>BlackHole 2ch</strong>. Di Google Meet, Anda cukup memilih mikrofon{' '}
                <code className="font-mono text-sky-300">BlackHole 2ch</code>!
              </p>
            </div>
            <div className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-amber-400">
                3. BUILD .APP &amp; FILE .DMG ASLI DI MAC ANDA
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Installer otomatis membangun{' '}
                <code className="font-mono text-amber-300">/Applications/RNNoise Studio.app</code>{' '}
                serta mencetak file image{' '}
                <code className="font-mono text-amber-300">RNNoise-Studio-MacOS.dmg</code> di Desktop
                Mac Anda yang bisa Anda simpan atau bagikan ke perangkat Mac lain.
              </p>
            </div>
          </div>

          {/* Interactive Preview of the macOS Desktop App */}
          <div className="border border-slate-800 bg-slate-950/90 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Laptop className="w-4 h-4 text-emerald-400" />
                Pratinjau Interaktif Jendela Aplikasi Desktop macOS (RNNoise Studio.app)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSimScenario('coworker-2m')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    simScenario === 'coworker-2m'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Uji: Orang Ngobrol Jarak 2m
                </button>
                <button
                  type="button"
                  onClick={() => setSimScenario('speaker-1m')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    simScenario === 'speaker-1m'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Uji: Anda Bicara (&le; 1m)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5 items-stretch">
              {/* Left 5 Cols: Installation & Usage Steps on macOS */}
              <div className="lg:col-span-5 border border-slate-800/90 bg-slate-900/50 rounded-lg p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      Cara Install &amp; Pakai di macOS (3 Langkah Mudah)
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400">.dmg &amp; .app</span>
                  </div>

                  <div className="space-y-3 text-xs text-slate-300">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="font-semibold text-emerald-400">
                        Langkah 1: Jalankan Installer Lewat Terminal (Bebas Gatekeeper)
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Setelah klik <strong>Download for macOS</strong>, buka <strong>Terminal</strong> di
                        Mac Anda lalu jalankan perintah 1 baris ini:
                      </p>
                      <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-sky-300">
                        <code className="truncate">
                          xattr -cr ~/Downloads/Install-RNNoise-MacOS.command &amp;&amp; bash ~/Downloads/Install-RNNoise-MacOS.command
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              'mac-cmd',
                              'xattr -cr ~/Downloads/Install-RNNoise-MacOS.command && bash ~/Downloads/Install-RNNoise-MacOS.command'
                            )
                          }
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] shrink-0 cursor-pointer"
                        >
                          {copiedKey === 'mac-cmd' ? 'Disalin!' : 'Salin'}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <div className="font-semibold text-sky-400">
                        Langkah 2: Pilih Output &ldquo;BlackHole 2ch&rdquo; di Aplikasi RNNoise
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Di dalam aplikasi <strong>RNNoise Studio.app</strong> yang terbuka di Mac Anda,
                        pilih <strong>MacBook Pro Microphone</strong> sebagai Input, dan pilih{' '}
                        <strong>BlackHole 2ch</strong> pada dropdown Output Virtual Mic.
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <div className="font-semibold text-amber-400">
                        Langkah 3: Pilih Mikrofon &ldquo;BlackHole 2ch&rdquo; di Google Meet
                      </div>
                      <p className="text-slate-400 leading-relaxed">
                        Buka <strong>Google Meet → Settings → Audio → Microphone</strong>, lalu ganti
                        mikrofon ke <strong>BlackHole 2ch</strong>. Selesai! Sekarang Google Meet 100%
                        hanya menerima suara dari aplikasi RNNoise Anda!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-emerald-800/60 bg-emerald-950/20 text-xs text-emerald-200 flex items-start gap-2">
                  <EyeOff className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Bebas Share Screen:</strong> Karena aplikasi berjalan sebagai jendela
                    macOS mandiri dan <code className="font-mono">rnnoise-meet-floating-btn</code> sudah
                    dihapus, tampilan Google Meet Anda 100% bersih saat presentasi!
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: Simulated Native macOS Window */}
              <div className="lg:col-span-7 border border-slate-800/90 bg-slate-900/50 rounded-lg p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-200">
                    Tampilan Native <code className="font-mono text-emerald-400">RNNoise Studio.app</code> di macOS:
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    /Applications/RNNoise Studio.app
                  </span>
                </div>

                {/* Native macOS Window Frame */}
                <div className="max-w-md w-full mx-auto rounded-2xl border border-slate-700/90 bg-[#090d16] overflow-hidden shadow-2xl">
                  {/* macOS Titlebar with Traffic Lights */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/95 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#ff5f56] inline-block" />
                      <span className="w-3 h-3 rounded-full bg-[#ffbd2e] inline-block" />
                      <span className="w-3 h-3 rounded-full bg-[#27c93f] inline-block" />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-300">
                      RNNoise Studio — macOS (&le; 1m)
                    </div>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                        previewExtensionEnabled
                          ? 'bg-sky-500/20 text-sky-400 border-sky-600'
                          : 'bg-slate-800 text-slate-400 border-slate-600'
                      }`}
                    >
                      {previewExtensionEnabled ? 'AKTIF (BIRU)' : 'BYPASS (MATI)'}
                    </span>
                  </div>

                  {/* Window Content */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-emerald-500/15 border border-emerald-600/60 text-[10px] font-mono text-emerald-300">
                      <span>✅ DSP 48kHz Aktif → BlackHole 2ch</span>
                      <span className="font-bold">Gain: {previewMetrics.gainVal}</span>
                    </div>

                    {/* Power Toggle Card */}
                    <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
                      <button
                        type="button"
                        onClick={handleTogglePreviewButton}
                        aria-label="Simulasi Tombol Power Aplikasi macOS"
                        className={`w-12 h-12 rounded-full inline-flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
                          previewExtensionEnabled
                            ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/40'
                            : 'bg-slate-600 text-slate-300'
                        }`}
                      >
                        <Power className="w-5 h-5" />
                      </button>
                      <div className="text-left">
                        <div
                          className={`text-xs font-bold ${
                            previewExtensionEnabled ? 'text-sky-400' : 'text-slate-400'
                          }`}
                        >
                          {previewExtensionEnabled
                            ? 'RNNOISE: MENYALA (BIRU)'
                            : 'RNNOISE: MATI (ABU-ABU)'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {previewExtensionEnabled
                            ? 'Hanya suara <= 1 meter yang dikirim ke Google Meet!'
                            : 'Mode Bypass: Suara 2 meter masuk tanpa filter.'}
                        </div>
                      </div>
                    </div>

                    {/* macOS Input & Virtual Output Device Routing */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2 text-[10px]">
                      <div className="flex items-center justify-between font-bold text-slate-300">
                        <span>1. MIKROFON FISIK (INPUT MAC)</span>
                        <span className="text-sky-400 font-mono">48.000 Hz</span>
                      </div>
                      <div className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono truncate">
                        🎙️ MacBook Pro Microphone (Built-in)
                      </div>
                      <div className="flex items-center justify-between font-bold text-slate-300 pt-1">
                        <span>2. OUTPUT KE VIRTUAL MIC (UNTUK GOOGLE MEET)</span>
                        <span className="text-emerald-400 font-mono">TERHUBUNG</span>
                      </div>
                      <div className="px-2.5 py-1.5 rounded bg-emerald-950/30 border border-emerald-700/60 text-emerald-300 font-mono truncate">
                        🔊 BlackHole 2ch (Virtual Audio Driver)
                      </div>
                    </div>

                    {/* 1-Meter Proximity Gate */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-200">BATAS JARAK TANGKAP MIC (HARD GATE)</span>
                        <span className="font-mono text-amber-400">
                          {previewThresholdDb} dB (
                          {previewThresholdDb >= -22
                            ? '<= 0.5m'
                            : previewThresholdDb >= -30
                            ? '<= 1.0m'
                            : '> 1.5m'}
                          )
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewThresholdDb(-20)}
                          className={`py-1 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                            previewThresholdDb >= -22
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          &le; 0.5m (-20dB)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewThresholdDb(-26)}
                          className={`py-1 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                            previewThresholdDb < -22 && previewThresholdDb >= -30
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          &le; 1.0m (-26dB)
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewThresholdDb(-38)}
                          className={`py-1 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                            previewThresholdDb < -30
                              ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Longgar (-38dB)
                        </button>
                      </div>
                    </div>

                    {/* Loopback Self-Test Button */}
                    <button
                      type="button"
                      onClick={() => setPreviewLoopback(!previewLoopback)}
                      className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        previewLoopback
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      {previewLoopback
                        ? '🔊 Tes Dengar Suara Sendiri: AKTIF (Pakai Earphone!)'
                        : '🎧 Tes Dengar Suara Saya Sendiri: MATI (Klik untuk Uji)'}
                    </button>

                    {/* Spectrum Graph */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-300">GRAFIK SPEKTRUM SUARA (MACOS)</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                            !previewExtensionEnabled
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : previewMetrics.gateOpen
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {!previewExtensionEnabled
                            ? 'BYPASS (GAIN 1.00x)'
                            : previewMetrics.gateOpen
                            ? 'LOLOS <= 1M (GAIN 1.00x)'
                            : 'DIPUTUS > 1M (GAIN 0.00x)'}
                        </span>
                      </div>

                      <canvas
                        ref={popupPreviewCanvasRef}
                        width={340}
                        height={96}
                        className="w-full h-[96px] block rounded border border-slate-800 bg-[#060911]"
                      />

                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-slate-800/80 tabular-nums">
                        <span className="text-rose-400 font-semibold">
                          ■ Merah: Mic Mentah ({previewMetrics.rawPct}%)
                        </span>
                        <span
                          className={
                            previewExtensionEnabled
                              ? 'text-sky-400 font-semibold'
                              : 'text-slate-400 font-semibold'
                          }
                        >
                          ■ {previewExtensionEnabled ? 'Biru' : 'Abu-abu'}: Masuk ke Meet (
                          {previewMetrics.cleanPct}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: macOS Installer & Electron DMG Builder Code Viewer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 border border-slate-800 bg-slate-950/70 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-semibold text-slate-100">
                    Paket File Aplikasi Desktop macOS
                  </span>
                  <span className="text-xs font-mono text-emerald-400">macOS .dmg / .app</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Selain installer 1-klik <code className="font-mono text-emerald-300">Install-RNNoise-MacOS.command</code>{' '}
                  yang otomatis membuat <code className="font-mono text-slate-200">RNNoise Studio.app</code> dan{' '}
                  <code className="font-mono text-slate-200">RNNoise-Studio-MacOS.dmg</code> menggunakan{' '}
                  <code className="font-mono text-slate-200">hdiutil</code> bawaan macOS, tersedia juga
                  konfigurasi <strong>Electron Builder</strong> jika Anda ingin mem-build secara manual.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2.5">
                <button
                  type="button"
                  onClick={handleDownloadMacOSInstaller}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  Unduh Installer macOS (Install-RNNoise-MacOS.command)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllMacOSFiles}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  Unduh Semua File Paket macOS &amp; Electron (4 File)
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col justify-between border border-slate-800 bg-slate-950 rounded-lg overflow-hidden">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ELECTRON_MACOS_FILES.map((file) => (
                      <button
                        key={file.filename}
                        type="button"
                        onClick={() => setSelectedMacFile(file.filename)}
                        className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          selectedMacFile === file.filename
                            ? 'bg-emerald-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                        }`}
                      >
                        {file.filename}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(activeMacSpec.filename, activeMacSpec.content)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedKey === activeMacSpec.filename ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-sky-400" />
                        Salin {activeMacSpec.filename}
                      </>
                    )}
                  </button>
                </div>

                <div className="px-4 py-2.5 bg-slate-900/30 border-b border-slate-800/80 text-xs text-slate-400">
                  {activeMacSpec.description}
                </div>

                <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[260px] overflow-y-auto">
                  <code>{activeMacSpec.content}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* METHOD 1: CHROME EXTENSION v7.0 (STEALTH - NO FLOATING BUTTON) */}
      {selectedMethod === 'chrome-extension' && (
        <div className="mt-6 space-y-6">
          {/* Root Cause Breakdown Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-emerald-800/60 bg-emerald-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-emerald-400">
                1. STEALTH SHARE SCREEN (TANPA FLOATING BTN)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sesuai permintaan Anda, elemen{' '}
                <code className="font-mono text-rose-300">rnnoise-meet-floating-btn</code> telah{' '}
                <strong>dihapus total</strong> dari <code className="font-mono">content-injector.js</code>!
                Layar Google Meet Anda 100% bersih saat melakukan Share Screen!
              </p>
            </div>
            <div className="p-4 rounded-xl border border-sky-800/60 bg-sky-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-sky-400">
                2. BEDAH IN-PLACE (REMOVE-TRACK + ADD-TRACK)
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mencabut langsung <code className="font-mono text-sky-300">rawTrack</code> dari
                dalam <code className="font-mono text-sky-300">rawStream</code> Google Meet dan
                memasukkan <code className="font-mono text-sky-300">cleanTrack</code>. Indikator
                gelombang di tombol mic Meet pun kini ikut diam saat suara diblokir!
              </p>
            </div>
            <div className="p-4 rounded-xl border border-amber-800/60 bg-amber-950/20 space-y-1.5">
              <div className="text-xs font-mono font-bold text-amber-400">
                3. KONTROL PENUH LEWAT IKON TOOLBAR ATAS
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Seluruh pengaturan tombol <strong>Biru/Abu-abu</strong>, batas jarak{' '}
                <strong>&le; 1m</strong>, dan grafik spektrum dikendalikan dari popup ikon kecil di
                toolbar atas Chrome (tidak ikut terekam saat Share Tab Meet).
              </p>
            </div>
          </div>

          {/* Interactive Live Preview */}
          <div className="border border-slate-800 bg-slate-950/90 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Eye className="w-4 h-4 text-sky-400" />
                Pratinjau Popup v7.0 Stealth (Tanpa Tombol Melayang di Layar Google Meet)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSimScenario('coworker-2m')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    simScenario === 'coworker-2m'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Uji: Orang Ngobrol Jarak 2m
                </button>
                <button
                  type="button"
                  onClick={() => setSimScenario('speaker-1m')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    simScenario === 'speaker-1m'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Uji: Anda Bicara (&le; 1m)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5 items-stretch">
              {/* Left 5 Cols */}
              <div className="lg:col-span-5 border border-slate-800/90 bg-slate-900/50 rounded-lg p-5 flex flex-col justify-between space-y-5">
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-200">
                    1. Ikon Kecil di Pojok Kanan Atas Browser Chrome (Toolbar):
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 truncate">
                      https://meet.google.com/kantor-meeting
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleTogglePreviewButton}
                        aria-label="Simulasi Ikon Kecil Toolbar Chrome"
                        className="relative p-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <span
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center border transition-all duration-200 ${
                            previewExtensionEnabled
                              ? 'bg-sky-600 border-sky-400 text-white shadow-md shadow-sky-500/40'
                              : 'bg-slate-600 border-slate-500 text-slate-300'
                          }`}
                        >
                          <Activity className="w-3.5 h-3.5" />
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 px-1 text-[8px] font-mono font-bold rounded leading-tight ${
                            previewExtensionEnabled
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-600 text-slate-200'
                          }`}
                        >
                          {previewExtensionEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                      <Puzzle className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
                  <div className="font-semibold text-emerald-400">
                    Cara Mengecek Bahwa Pipa Sudah Menyatu di v7.0:
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Setelah Anda update ke v7.0 dan menekan <strong>Refresh (F5)</strong> di tab
                    Google Meet, perhatikan <strong>indikator gelombang 3 titik di Google Meet</strong>:
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Saat Anda bicara pelan/jauh (di bawah garis kuning sehingga di grafik RNNoise
                    tidak ada warna Biru), <strong>indikator gelombang di Google Meet juga akan ikut diam (tidak bergerak)</strong>!
                  </p>
                </div>

                {/* Stealth Share Screen Confirmation (Replacing Floating Button) */}
                <div className="pt-3 border-t border-slate-800/80 space-y-2">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5" />
                    2. Mode Stealth Share Screen: AKTIF
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/60 text-xs text-slate-300 leading-relaxed">
                    Elemen <code className="font-mono text-rose-300">rnnoise-meet-floating-btn</code>{' '}
                    telah <strong>dihapus total</strong>. Tidak ada tombol tambahan apa pun di dalam
                    halaman Google Meet sehingga aman 100% saat Anda melakukan <strong>Share Screen</strong>!
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: Simulated Popup Window v7.0 */}
              <div className="lg:col-span-7 border border-slate-800/90 bg-slate-900/50 rounded-lg p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-200">
                    3. Tampilan Popup v7.0 (Satu Pipa Tunggal dengan Google Meet):
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400">popup.html (v7.0)</span>
                </div>

                {/* Replica of popup.html v7.0 */}
                <div className="max-w-md w-full mx-auto rounded-xl border border-slate-700/80 bg-[#090d16] p-4 shadow-xl space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-slate-100">
                      RNNoise v7.0 (Satu Pipa Meet)
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        previewExtensionEnabled
                          ? 'bg-sky-500/20 text-sky-400 border-sky-600'
                          : 'bg-slate-800 text-slate-400 border-slate-600'
                      }`}
                    >
                      {previewExtensionEnabled ? 'IKON BIRU: ON' : 'ABU-ABU: OFF'}
                    </span>
                  </div>

                  {/* WebRTC Lock Banner */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-emerald-500/15 border border-emerald-600/60 text-[10px] font-mono text-emerald-300">
                    <span>✅ SATU PIPA DENGAN GOOGLE MEET</span>
                    <span className="font-bold">Gain: {previewMetrics.gainVal}</span>
                  </div>

                  {/* Top Button Row */}
                  <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
                    <button
                      type="button"
                      onClick={handleTogglePreviewButton}
                      aria-label="Simulasi Tombol Popup Ekstensi"
                      className={`w-12 h-12 rounded-full inline-flex items-center justify-center transition-all duration-200 cursor-pointer shrink-0 ${
                        previewExtensionEnabled
                          ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/40'
                          : 'bg-slate-600 text-slate-300'
                      }`}
                    >
                      <Power className="w-5 h-5" />
                    </button>
                    <div className="text-left">
                      <div
                        className={`text-xs font-bold ${
                          previewExtensionEnabled ? 'text-sky-400' : 'text-slate-400'
                        }`}
                      >
                        {previewExtensionEnabled
                          ? 'RNNOISE: MENYALA (BIRU)'
                          : 'RNNOISE: MATI (ABU-ABU)'}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {previewExtensionEnabled
                          ? 'Track asli dicabut dari Meet & diganti output RNNoise!'
                          : 'Mode Bypass: Suara orang jarak 2 meter ikut masuk ke Meet!'}
                      </div>
                    </div>
                  </div>

                  {/* 1-Meter Proximity Gate Controls */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-200">BATAS JARAK TANGKAP MIC (HARD GATE)</span>
                      <span className="font-mono text-amber-400">
                        {previewThresholdDb} dB (
                        {previewThresholdDb >= -22
                          ? '<= 0.5m'
                          : previewThresholdDb >= -30
                          ? '<= 1.0m'
                          : '> 1.5m'}
                        )
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewThresholdDb(-20)}
                        className={`py-1.5 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                          previewThresholdDb >= -22
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        &le; 0.5m (-20dB)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewThresholdDb(-26)}
                        className={`py-1.5 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                          previewThresholdDb < -22 && previewThresholdDb >= -30
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        &le; 1.0m (-26dB)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewThresholdDb(-38)}
                        className={`py-1.5 px-2 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
                          previewThresholdDb < -30
                            ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Longgar (-38dB)
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>Longgar</span>
                      <input
                        type="range"
                        min={-42}
                        max={-14}
                        step={1}
                        value={previewThresholdDb}
                        onChange={(e) => setPreviewThresholdDb(Number(e.target.value))}
                        aria-label="Slider Batas Jarak 1 Meter"
                        className="flex-1 accent-sky-500 cursor-pointer"
                      />
                      <span>Ketat (&le;0.5m)</span>
                    </div>
                  </div>

                  {/* Loopback Test Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewLoopback(!previewLoopback)}
                    className={`w-full py-1.5 px-3 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      previewLoopback
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    {previewLoopback
                      ? '🔊 Tes Dengar Suara Sendiri: AKTIF (Pakai Earphone!)'
                      : '🎧 Tes Dengar Suara Saya Sendiri: MATI (Klik untuk Uji)'}
                  </button>

                  {/* Bottom Live Audio Spectrum Graph */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-300">GRAFIK SATU PIPA GOOGLE MEET</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          !previewExtensionEnabled
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : previewMetrics.gateOpen
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {!previewExtensionEnabled
                          ? 'BYPASS (GAIN 1.00x)'
                          : previewMetrics.gateOpen
                          ? 'LOLOS <= 1M (GAIN 1.00x)'
                          : 'DIPUTUS > 1M (GAIN 0.00x)'}
                      </span>
                    </div>

                    <canvas
                      ref={popupPreviewCanvasRef}
                      width={340}
                      height={96}
                      className="w-full h-[96px] block rounded border border-slate-800 bg-[#060911]"
                    />

                    <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-slate-800/80 tabular-nums">
                      <span className="text-rose-400 font-semibold">
                        ■ Merah: Mic Mentah ({previewMetrics.rawPct}%)
                      </span>
                      <span
                        className={
                          previewExtensionEnabled
                            ? 'text-sky-400 font-semibold'
                            : 'text-slate-400 font-semibold'
                        }
                      >
                        ■ {previewExtensionEnabled ? 'Biru' : 'Abu-abu'}: Masuk ke Meet (
                        {previewMetrics.cleanPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 Cols: Step-by-step update instructions */}
            <div className="lg:col-span-5 border border-slate-800 bg-slate-950/70 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-semibold text-slate-100">
                    Langkah Update ke v7.0 Stealth (Tanpa Floating Button)
                  </span>
                  <span className="text-xs font-mono text-emerald-400">v7.0 Stealth</span>
                </div>

                <ol className="space-y-2.5 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                  <li>
                    Klik tombol <strong>Unduh Semua File Ekstensi v7.0 (5 File)</strong> di bawah,
                    lalu timpa file lama di dalam folder ekstensi Anda.
                  </li>
                  <li>
                    Buka <code className="font-mono text-sky-400">chrome://extensions</code>, lalu
                    klik tombol <strong>Reload (↻)</strong> pada kartu ekstensi.
                  </li>
                  <li>
                    Buka tab <strong>Google Meet</strong> Anda lalu tekan <strong>Refresh (F5)</strong>.
                    Tombol melayang di pojok kiri bawah Meet kini sudah hilang 100% (aman Share Screen)
                    dan pipa mikrofon menyatu dengan RNNoise!
                  </li>
                </ol>
              </div>

              {/* Quick Download Buttons */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <button
                  type="button"
                  onClick={handleDownloadAllExtensionFiles}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  Unduh Paket Ekstensi Chrome OPUNG (.zip — 1-Klik Siap Ekstrak)
                </button>

                <div className="flex flex-wrap gap-1.5">
                  {CHROME_EXTENSION_FILES.map((file) => (
                    <button
                      key={file.filename}
                      type="button"
                      onClick={() => handleDownloadExtensionFile(file.filename, file.content)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3 h-3 text-sky-400" />
                      {file.filename}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Extension Code Viewer */}
            <div className="lg:col-span-7 flex flex-col justify-between border border-slate-800 bg-slate-950 rounded-lg overflow-hidden">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/70">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CHROME_EXTENSION_FILES.map((file) => (
                      <button
                        key={file.filename}
                        type="button"
                        onClick={() => setSelectedExtFile(file.filename)}
                        className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          selectedExtFile === file.filename
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'text-slate-400 hover:text-slate-200 bg-slate-950'
                        }`}
                      >
                        {file.filename}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(activeExtensionSpec.filename, activeExtensionSpec.content)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedKey === activeExtensionSpec.filename ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Disalin
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-sky-400" />
                        Salin {activeExtensionSpec.filename}
                      </>
                    )}
                  </button>
                </div>

                <div className="px-4 py-2.5 bg-slate-900/30 border-b border-slate-800/80 text-xs text-slate-400">
                  {activeExtensionSpec.description}
                </div>

                <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[340px] overflow-y-auto">
                  <code>{activeExtensionSpec.content}</code>
                </pre>
              </div>

              <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/50 text-xs text-slate-400">
                <strong className="text-emerald-400">Stealth Share Screen + Satu Pipa:</strong>{' '}
                <code className="font-mono text-slate-200">
                  rnnoise-meet-floating-btn
                </code>{' '}
                dihapus total agar tidak terlihat saat Share Screen di Google Meet.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* METHOD 2: VIRTUAL AUDIO CABLE */}
      {selectedMethod === 'virtual-cable' && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 border border-slate-800 bg-slate-950/70 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-sm font-semibold text-slate-100">
                  Gunakan Aplikasi Web Ini Langsung Sebagai Prosesor Mikrofon Google Meet
                </span>
                <span className="text-xs font-mono text-sky-400">VB-Cable / BlackHole</span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Jika Anda ingin memancarkan suara bersih langsung dari halaman web ini ke daftar
                pilihan Mikrofon Google Meet menggunakan kabel audio virtual (<strong>BlackHole 2ch</strong>{' '}
                di macOS atau <strong>VB-Cable</strong> di Windows):
              </p>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
                  <div className="font-semibold text-slate-100 mb-1">
                    Langkah 1: Pasang Driver Virtual Audio (Sekali Saja)
                  </div>
                  <p className="text-slate-400">
                    • <strong>macOS:</strong> Unduh gratis <em>BlackHole 2ch</em> (via Homebrew:{' '}
                    <code className="font-mono text-slate-200">brew install blackhole-2ch</code>).
                    <br />• <strong>Windows:</strong> Unduh gratis <em>VB-CABLE Virtual Audio Device</em>.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
                  <div className="font-semibold text-slate-100 mb-1">
                    Langkah 2: Aktifkan Mikrofon &amp; Speaker Monitor di Studio Ini
                  </div>
                  <p className="text-slate-400">
                    Klik tombol <strong>Aktifkan Mikrofon + Pancarkan ke Output</strong> di panel
                    kanan, lalu arahkan output audio ke <strong>BlackHole 2ch</strong>.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
                  <div className="font-semibold text-slate-100 mb-1">
                    Langkah 3: Pilih Mikrofon Virtual di Pengaturan Google Meet
                  </div>
                  <p className="text-slate-400">
                    Buka <strong>Google Meet → Settings → Audio → Microphone</strong>, lalu pilih{' '}
                    <strong>BlackHole 2ch</strong>. Dengan cara ini, Google Meet 100% hanya menerima
                    suara dari pipa RNNoise!
                  </p>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Live Virtual Cable Transmitter Control */}
            <div className="lg:col-span-5 border border-slate-800 bg-slate-950/70 rounded-lg p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    Panel Transmisi Google Meet
                  </span>
                  <span className="text-xs font-mono text-emerald-400">
                    {audioController.isActive && isVirtualCableActive
                      ? 'TRANSMISI VIRTUAL AKTIF'
                      : 'SIAGA (EARPHONE AMAN)'}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="virtual-cable-sink-select"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Perangkat Output Audio (Khusus Virtual Cable — Earphone Diblokir):
                  </label>
                  <select
                    id="virtual-cable-sink-select"
                    value={selectedSinkId}
                    onChange={(e) => setSelectedSinkId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-800 rounded-lg text-slate-200"
                  >
                    <option value="">
                      Pilih BlackHole 2ch / VB-Cable (Saat Ini Bisu Agar Earphone Tidak Bocor)
                    </option>
                    {audioOutputDevices.map((dev) => {
                      const isVirt = isVirtualCableLabel(dev.label);
                      const isPhys = isPhysicalSpeakerOrEarphoneLabel(dev.label);
                      return (
                        <option key={dev.deviceId} value={dev.deviceId} disabled={isPhys}>
                          {isVirt
                            ? `⭐ ${dev.label} (Kabel Virtual untuk Meet)`
                            : isPhys
                            ? `⛔ ${dev.label} (Earphone/Speaker Fisik - Diblokir)`
                            : dev.label || `Audio Output (${dev.deviceId.slice(0, 8)})`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 space-y-2 text-xs font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Status AudioWorklet:</span>
                    <span className="text-slate-100 font-semibold">
                      {audioController.isActive ? 'Berjalan (48.000 Hz)' : 'Belum Dimulai'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rute Kabel Virtual:</span>
                    <span
                      className={
                        isVirtualCableActive
                          ? 'text-emerald-400 font-semibold'
                          : 'text-slate-400'
                      }
                    >
                      {isVirtualCableActive
                        ? 'AKTIF KE BLACKHOLE / VB-CABLE ✓'
                        : 'SIAGA (EARPHONE AMAN)'}
                    </span>
                  </div>
                </div>

                {sinkStatusMsg && (
                  <div className="p-3 rounded-lg border border-emerald-800/70 bg-emerald-950/30 text-emerald-200 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{sinkStatusMsg}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleActivateVirtualCableMode}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Volume2 className="w-4 h-4" />
                  Aktifkan Mikrofon + Pancarkan ke BlackHole / VB-Cable
                </button>
                <div className="flex items-center gap-2 text-[11px] text-emerald-300/90">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Proteksi Anti-Bocor Earphone Aktif: Output fisik diblokir sehingga suara Anda
                    hanya dikirim ke BlackHole 2ch / VB-Cable.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
