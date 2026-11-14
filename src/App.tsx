/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { MacOSDesktopAppWorkspace } from './components/MacOSDesktopAppWorkspace';
import heroStudioImg from './assets/images/opung_hero_studio_1794304548452.jpg';
import acousticRadiusImg from './assets/images/opung_acoustic_radius_1794304549629.jpg';
import vocalEqImg from './assets/images/opung_vocal_eq_1794304549883.jpg';
import {
  Download,
  Mic,
  Volume2,
  Play,
  Square,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

type DemoScenarioId = 'office-chatter' | 'drill-keyboard' | 'speaker-echo';

interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  subtitle: string;
  noiseLabel: string;
  withoutOpungDesc: string;
  withOpungDesc: string;
  beforeBars: number[];
  afterBars: number[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'office-chatter',
    title: 'Obrolan Meja Sebelah (1.8m)',
    subtitle: 'Rekan kerja sedang rapat seru tepat di sebelah meja Anda',
    noiseLabel: 'Suara Obrolan 1.8 Meter (-34 dB)',
    withoutOpungDesc:
      'Suara rekan di meja sebelah ikut bocor ke Google Meet karena dianggap suara manusia oleh filter laptop standar.',
    withOpungDesc:
      'Gerbang Radius <= 1.0m memutus suara di luar jarak kerja Anda ke 0.00x. Hanya vokal Anda yang terdengar jernih.',
    beforeBars: [42, 68, 55, 88, 62, 50, 74, 92, 60, 48, 82, 58, 45, 76, 64, 52, 85, 49, 63, 72, 54, 46, 79, 61],
    afterBars: [4, 72, 60, 92, 4, 4, 78, 95, 4, 4, 86, 4, 4, 80, 68, 4, 89, 4, 4, 76, 4, 4, 83, 4],
  },
  {
    id: 'drill-keyboard',
    title: 'Suara Bor & Ketikan Saat Bicara',
    subtitle: 'Suara bising non-manusia kencang tepat ketika Anda sedang presentasi',
    noiseLabel: 'Bor Bangunan + Mechanical Keyboard',
    withoutOpungDesc:
      'Desis bor frekuensi tinggi dan klik ketikan keyboard menembus mikrofon bersamaan dengan kalimat Anda.',
    withOpungDesc:
      'Real RNNoise 0.2 WASM Neural Denoiser mengupas bising bor & klik keyboard saat Anda berbicara tanpa membuat vokal mendem.',
    beforeBars: [75, 84, 79, 94, 82, 77, 88, 96, 81, 74, 90, 83, 78, 89, 85, 76, 92, 80, 84, 88, 79, 75, 91, 82],
    afterBars: [6, 68, 58, 88, 6, 6, 74, 90, 6, 6, 82, 6, 6, 78, 64, 6, 85, 6, 6, 72, 6, 6, 80, 6],
  },
  {
    id: 'speaker-echo',
    title: 'Rapat Tanpa Earphone (Speaker Mac)',
    subtitle: 'Suara lawan bicara keluar dari speaker MacBook Pro Anda',
    noiseLabel: 'Pantulan Speaker Laptop (Echo)',
    withoutOpungDesc:
      'Suara lawan rapat dari speaker laptop memantul masuk kembali ke mikrofon dan memicu gema (echo).',
    withOpungDesc:
      'Hardware AEC + Fokus Jarak Dekat otomatis menahan pantulan speaker laptop sehingga lawan bicara bebas gema.',
    beforeBars: [58, 70, 64, 85, 56, 62, 75, 88, 54, 60, 78, 52, 59, 72, 66, 55, 80, 57, 61, 74, 53, 58, 76, 54],
    afterBars: [3, 70, 58, 86, 3, 3, 74, 89, 3, 3, 79, 3, 3, 72, 65, 3, 81, 3, 3, 73, 3, 3, 77, 3],
  },
];

export default function App() {
  const [isDownloadingDmg, setIsDownloadingDmg] = useState(false);
  const [dmgDownloadedNotice, setDmgDownloadedNotice] = useState(false);
  const [isDownloadingWin, setIsDownloadingWin] = useState(false);
  const [winDownloadedNotice, setWinDownloadedNotice] = useState<
    'exe' | 'launcher-zip' | null
  >(null);
  const [installOsTab, setInstallOsTab] = useState<'macos' | 'windows'>('macos');

  // Interactive "Hear the Difference" (Krisp-style) Demo Player State
  const [activeScenario, setActiveScenario] = useState<DemoScenarioId>('office-chatter');
  const [demoOpungActive, setDemoOpungActive] = useState<boolean>(true);
  const [isPlayingDemo, setIsPlayingDemo] = useState<boolean>(false);
  const [demoTick, setDemoTick] = useState<number>(0);

  const demoAudioCtxRef = useRef<AudioContext | null>(null);
  const demoRawBranchGainRef = useRef<GainNode | null>(null);
  const demoCleanBranchGainRef = useRef<GainNode | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const isPlayingDemoRef = useRef<boolean>(false);
  const demoOpungActiveRef = useRef<boolean>(demoOpungActive);
  const rawMp3CacheRef = useRef<Record<string, ArrayBuffer>>({});

  useEffect(() => {
    demoOpungActiveRef.current = demoOpungActive;
  }, [demoOpungActive]);

  // Preload file rekaman suara manusia Bahasa Indonesia asli agar saat tombol diklik langsung berputar instan
  useEffect(() => {
    const urls = [
      '/demo-voice-office-chatter.mp3',
      '/demo-voice-drill-keyboard.mp3',
      '/demo-voice-speaker-echo.mp3',
      '/demo-bg-chatter.mp3',
    ];
    urls.forEach((url) => {
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => {
          if (buf) {
            rawMp3CacheRef.current[url] = buf;
          }
        })
        .catch(() => {});
    });
  }, []);

  const stopDemoAudio = () => {
    isPlayingDemoRef.current = false;
    if (demoTimerRef.current) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (demoAudioCtxRef.current) {
      demoAudioCtxRef.current.close().catch(() => {});
      demoAudioCtxRef.current = null;
    }
    demoRawBranchGainRef.current = null;
    demoCleanBranchGainRef.current = null;
    setIsPlayingDemo(false);
  };

  useEffect(() => {
    return () => {
      stopDemoAudio();
    };
  }, []);

  // Crossfade sinkron antara sinyal mentah vs output Hybrid RNNoise 0.2 WASM + Studio HD EQ
  useEffect(() => {
    const ctx = demoAudioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (demoRawBranchGainRef.current) {
      demoRawBranchGainRef.current.gain.setTargetAtTime(
        demoOpungActive ? 0.0 : 1.0,
        now,
        0.03
      );
    }
    if (demoCleanBranchGainRef.current) {
      demoCleanBranchGainRef.current.gain.setTargetAtTime(
        demoOpungActive ? 1.0 : 0.0,
        now,
        0.03
      );
    }
  }, [demoOpungActive]);

  const loadAudioBuffer = async (
    ctx: AudioContext,
    url: string
  ): Promise<AudioBuffer | null> => {
    try {
      let raw = rawMp3CacheRef.current[url];
      if (!raw) {
        const res = await fetch(url);
        if (!res.ok) return null;
        raw = await res.arrayBuffer();
        rawMp3CacheRef.current[url] = raw;
      }
      // Clone ArrayBuffer because decodeAudioData detaches the buffer in some browsers
      return await ctx.decodeAudioData(raw.slice(0));
    } catch {
      return null;
    }
  };

  const startDemoAudio = async (scenarioId: DemoScenarioId) => {
    stopDemoAudio();
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      demoAudioCtxRef.current = ctx;
      isPlayingDemoRef.current = true;
      setIsPlayingDemo(true);

      const voiceUrlMap: Record<DemoScenarioId, string> = {
        'office-chatter': '/demo-voice-office-chatter.mp3',
        'drill-keyboard': '/demo-voice-drill-keyboard.mp3',
        'speaker-echo': '/demo-voice-speaker-echo.mp3',
      };

      const [{ resampleLinearTo48k, renderHybridDemoComparison, DEMO_DSP_SAMPLE_RATE }] =
        await Promise.all([import('./utils/demoDspProcessor')]);

      const voiceBuffer =
        (await loadAudioBuffer(ctx, voiceUrlMap[scenarioId])) ||
        (await loadAudioBuffer(ctx, '/demo-voice-id.mp3'));

      if (!isPlayingDemoRef.current || demoAudioCtxRef.current !== ctx) {
        return;
      }

      const voice48k = voiceBuffer
        ? resampleLinearTo48k(voiceBuffer.getChannelData(0), voiceBuffer.sampleRate)
        : new Float32Array(DEMO_DSP_SAMPLE_RATE * 4);
      const totalSamples = Math.max(voice48k.length, DEMO_DSP_SAMPLE_RATE * 4);
      const rawMixed48k = new Float32Array(totalSamples);

      for (let i = 0; i < totalSamples; i++) {
        rawMixed48k[i] = voice48k[i % voice48k.length];
      }

      if (scenarioId === 'office-chatter') {
        const chatterBuffer = await loadAudioBuffer(ctx, '/demo-bg-chatter.mp3');
        if (!isPlayingDemoRef.current || demoAudioCtxRef.current !== ctx) {
          return;
        }
        const chatter48k = chatterBuffer
          ? resampleLinearTo48k(chatterBuffer.getChannelData(0), chatterBuffer.sampleRate)
          : null;
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < totalSamples; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const roomAc = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.022;
          b6 = white * 0.115926;
          const distantChatter = chatter48k ? chatter48k[i % chatter48k.length] * 0.42 : 0;
          rawMixed48k[i] = Math.max(-0.98, Math.min(0.98, rawMixed48k[i] + distantChatter + roomAc));
        }
      } else if (scenarioId === 'drill-keyboard') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        let brown = 0;
        for (let i = 0; i < totalSamples; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.036;
          b6 = white * 0.115926;
          brown = (brown + 0.02 * white) / 1.02;

          const tSec = i / DEMO_DSP_SAMPLE_RATE;
          const stepRate = 6.8;
          const keyIdx = Math.floor(tSec * stepRate);
          const keyPhase = tSec * stepRate - keyIdx;
          const activeKey = (keyIdx * 13 + 5) % 4 !== 0;
          const clickSwitch = activeKey && keyPhase < 0.008 ? Math.exp(-keyPhase * 450) * 0.42 : 0;
          const bottomOut =
            activeKey && keyPhase >= 0.008 && keyPhase < 0.035
              ? Math.exp(-(keyPhase - 0.008) * 140) * 0.28
              : 0;
          const drillMix = pink * 0.58 + brown * 0.24 + white * clickSwitch + pink * 6.5 * bottomOut;
          rawMixed48k[i] = Math.max(-0.98, Math.min(0.98, rawMixed48k[i] + drillMix));
        }
      } else {
        // Skenario 3: Suntikkan pantulan gema speaker laptop (145ms + 275ms) langsung ke sinyal mentah 48 kHz
        const delay1 = Math.round(0.145 * DEMO_DSP_SAMPLE_RATE);
        const delay2 = Math.round(0.275 * DEMO_DSP_SAMPLE_RATE);
        const srcCopy = new Float32Array(rawMixed48k);
        let lpEcho = 0;
        for (let i = 0; i < totalSamples; i++) {
          const e1 = i >= delay1 ? srcCopy[i - delay1] * 0.46 : 0;
          const e2 = i >= delay2 ? srcCopy[i - delay2] * 0.28 : 0;
          lpEcho += 0.24 * (e1 + e2 - lpEcho);
          rawMixed48k[i] = Math.max(-0.98, Math.min(0.98, srcCopy[i] + lpEcho));
        }
      }

      // Render nyata output Hybrid RNNoise 0.2 WASM + Proximity Gate pada sinyal 48 kHz
      const { raw, cleaned } = await renderHybridDemoComparison(
        rawMixed48k,
        scenarioId === 'office-chatter' ? -24 : -26,
        scenarioId === 'speaker-echo'
      );

      if (!isPlayingDemoRef.current || demoAudioCtxRef.current !== ctx) {
        return;
      }

      const rawBuf = ctx.createBuffer(1, raw.length, DEMO_DSP_SAMPLE_RATE);
      rawBuf.getChannelData(0).set(raw);

      const cleanBuf = ctx.createBuffer(1, cleaned.length, DEMO_DSP_SAMPLE_RATE);
      cleanBuf.getChannelData(0).set(cleaned);

      const rawSource = ctx.createBufferSource();
      rawSource.buffer = rawBuf;
      rawSource.loop = true;

      const cleanSource = ctx.createBufferSource();
      cleanSource.buffer = cleanBuf;
      cleanSource.loop = true;

      const rawBranchGain = ctx.createGain();
      rawBranchGain.gain.value = demoOpungActiveRef.current ? 0.0 : 1.0;
      demoRawBranchGainRef.current = rawBranchGain;

      // Jalur Opung Aktif juga menerapkan Studio HD Vocal EQ persis seperti di aplikasi desktop
      const eqSubCut = ctx.createBiquadFilter();
      eqSubCut.type = 'highpass';
      eqSubCut.frequency.value = 85;

      const eqMudCut = ctx.createBiquadFilter();
      eqMudCut.type = 'peaking';
      eqMudCut.frequency.value = 260;
      eqMudCut.Q.value = 1.4;
      eqMudCut.gain.value = -2.4;

      const eqWarmth = ctx.createBiquadFilter();
      eqWarmth.type = 'peaking';
      eqWarmth.frequency.value = 180;
      eqWarmth.Q.value = 1.1;
      eqWarmth.gain.value = 2.0;

      const eqPresence = ctx.createBiquadFilter();
      eqPresence.type = 'peaking';
      eqPresence.frequency.value = 3400;
      eqPresence.Q.value = 1.1;
      eqPresence.gain.value = 3.5;

      const cleanBranchGain = ctx.createGain();
      cleanBranchGain.gain.value = demoOpungActiveRef.current ? 1.0 : 0.0;
      demoCleanBranchGainRef.current = cleanBranchGain;

      rawSource.connect(rawBranchGain);
      rawBranchGain.connect(ctx.destination);

      cleanSource.connect(eqSubCut);
      eqSubCut.connect(eqMudCut);
      eqMudCut.connect(eqWarmth);
      eqWarmth.connect(eqPresence);
      eqPresence.connect(cleanBranchGain);
      cleanBranchGain.connect(ctx.destination);

      const startAt = ctx.currentTime + 0.02;
      rawSource.start(startAt);
      cleanSource.start(startAt);

      // Animasi grafik spektrum selaras dengan irama suku kata bicara manusia
      let step = 0;
      demoTimerRef.current = window.setInterval(() => {
        step += 1;
        setDemoTick(step);
      }, 120);
    } catch {
      setIsPlayingDemo(false);
    }
  };

  const handleTogglePlayDemo = () => {
    if (isPlayingDemo) {
      stopDemoAudio();
    } else {
      startDemoAudio(activeScenario);
    }
  };

  const handleSelectScenario = (id: DemoScenarioId) => {
    setActiveScenario(id);
    if (isPlayingDemo) {
      startDemoAudio(id);
    }
  };

  // Satu Pintu Unduhan: Langsung OPUNG-Installer.dmg (Lazy-loaded agar landing page super cepat)
  const handleDownloadMacOSApp = async () => {
    setIsDownloadingDmg(true);
    try {
      const { buildMacOSDiskImageDmg } = await import('./utils/macosAppBuilder');
      const dmgBuffer = buildMacOSDiskImageDmg();
      const blob = new Blob([dmgBuffer], {
        type: 'application/x-apple-diskimage',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'OPUNG-Installer.dmg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDmgDownloadedNotice(true);
    } finally {
      setIsDownloadingDmg(false);
    }
  };

  const handleDownloadWindowsApp = async () => {
    setIsDownloadingWin(true);
    try {
      const { downloadWindowsOpungApp } = await import('./utils/windowsAppBuilder');
      const result = await downloadWindowsOpungApp();
      setWinDownloadedNotice(result.mode);
    } finally {
      setIsDownloadingWin(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const currentScenario =
    DEMO_SCENARIOS.find((s) => s.id === activeScenario) || DEMO_SCENARIOS[0];

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex flex-col selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Bar Contract: Strictly 1 row, 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 bg-[#070A10]/90 backdrop-blur-md border-b border-slate-800/80">
        {/* Zone 1: Brand Wordmark + Custom App Icon */}
        <a
          href="#"
          className="inline-flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          <img
            src="/opung-icon.png"
            alt="Ikon Aplikasi Opung"
            className="w-7 h-7 rounded-[7px] shadow-md shadow-sky-500/20 border border-sky-400/25"
          />
          <span>Opung</span>
          <span className="hidden xl:inline-block text-xs font-mono font-medium text-slate-400 tracking-normal">
            - Office Proximity Ultra Noise Gate
          </span>
        </a>

        {/* Zone 2: 4 Concise Single-Line Product Navigation Links */}
        <nav
          aria-label="Navigasi Utama"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400"
        >
          <a
            href="#dengar-bedanya"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Dengar Bedanya
          </a>
          <a
            href="#macos-desktop-app-live"
            className="text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0"
          >
            Aplikasi &amp; Uji Mic
          </a>
          <a
            href="#keunggulan-otomatis"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Teknologi Otomatis
          </a>
          <a
            href="#panduan-instalasi"
            className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            Cara Pasang
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action Button (Satu Pintu .DMG) */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadMacOSApp}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh untuk macOS (.dmg)
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-24">
        {/* HERO SECTION: Crisp Commercial Value Proposition + Visual Studio Frame */}
        <section className="relative pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Left Column: Product Headline & Direct Single-Door DMG Download (7 cols) */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono uppercase tracking-widest text-sky-400 mb-4">
                  Opung - Office Proximity Ultra Noise Gate
                </div>

                <h1
                  className="font-display font-extrabold tracking-tight text-slate-50 leading-[1.06]"
                  style={{
                    fontSize: 'clamp(2.35rem, 4.3vw, 3.85rem)',
                    textWrap: 'balance',
                  }}
                >
                  Suara Anda Jernih. Bising Kantor &amp; Meja Sebelah Lenyap.
                </h1>

                <p className="text-base sm:text-lg text-slate-300 mt-5 leading-relaxed max-w-[60ch]">
                  Rapat dari kantor terbuka atau ruang kerja ramai tanpa bocor suara.{' '}
                  <strong className="text-white">Opung</strong> mengunci fokus mikrofon hanya pada
                  radius <strong className="text-sky-300">&le; 1.0 meter</strong> di depan Anda,
                  mengupas bising bor atau ketikan keyboard saat Anda berbicara, dan menjernihkan
                  vokal secara otomatis tanpa tombol pengaturan yang rumit.
                </p>

                {/* Primary CTA Row: Unduhan macOS (.dmg) & Windows (.exe) */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadMacOSApp}
                    disabled={isDownloadingDmg}
                    className="inline-flex items-center gap-2.5 px-5 py-3.5 text-sm font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-all cursor-pointer shadow-lg shadow-sky-500/15 whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    {isDownloadingDmg
                      ? 'Menyiapkan .dmg...'
                      : 'Unduh untuk macOS (.dmg)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadWindowsApp}
                    disabled={isDownloadingWin}
                    className="inline-flex items-center gap-2.5 px-5 py-3.5 text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-500/15 whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    {isDownloadingWin
                      ? 'Menyiapkan .exe...'
                      : 'Unduh untuk Windows (.exe)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollToSection('dengar-bedanya')}
                    className="inline-flex items-center gap-2 px-4 py-3.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-sky-400" />
                    Dengar Demo Suara &darr;
                  </button>
                </div>

                {dmgDownloadedNotice && (
                  <div className="mt-4 p-3.5 rounded-xl border border-sky-500/40 bg-sky-950/25 text-xs text-sky-100 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>
                      <strong>OPUNG-Installer.dmg</strong> berhasil diunduh! Klik 2x file tersebut
                      di folder Downloads Anda, geser <strong>OPUNG.app</strong> ke folder{' '}
                      <strong>Applications</strong>, lalu buka aplikasinya.
                    </span>
                  </div>
                )}

                {winDownloadedNotice === 'exe' && (
                  <div className="mt-4 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/25 text-xs text-emerald-200 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Opung-Windows-x64.exe</strong> berhasil diunduh! Jalankan aplikasinya
                      (akan tampil di System Tray Windows), lalu pilih{' '}
                      <strong>CABLE Output (VB-Audio Virtual Cable)</strong> di Google Meet / Zoom.
                    </span>
                  </div>
                )}

                {winDownloadedNotice === 'launcher-zip' && (
                  <div className="mt-4 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/25 text-xs text-emerald-200 flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Opung-Windows-Launcher.zip</strong> berhasil diunduh! Ekstrak ZIP lalu
                      klik 2x <strong>Opung-Windows.bat</strong>. Untuk file native{' '}
                      <strong>Opung-Windows-x64.exe</strong> tunggal, tersedia otomatis di{' '}
                      <strong>GitHub Releases</strong>.
                    </span>
                  </div>
                )}
              </div>

              {/* Works seamlessly with row */}
              <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
                <span>Bekerja langsung dengan semua aplikasi rapat Anda:</span>
                <div className="flex flex-wrap items-center gap-5 font-mono text-slate-300 font-semibold">
                  <span>Google Meet</span>
                  <span>·</span>
                  <span>Zoom</span>
                  <span>·</span>
                  <span>Microsoft Teams</span>
                  <span>·</span>
                  <span>Slack</span>
                  <span>·</span>
                  <span>Discord</span>
                </div>
              </div>
            </div>

            {/* Right Column: Acoustic Showcase Frame (5 cols) */}
            <div className="lg:col-span-5 flex">
              <div className="relative w-full min-h-[340px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 flex flex-col justify-end">
                <img
                  src={heroStudioImg}
                  alt="OPUNG fokus menangkap suara dalam radius 1 meter di ruang kantor"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(7,10,16,0.12) 0%, rgba(7,10,16,0.68) 55%, rgba(7,10,16,0.96) 100%)',
                  }}
                />

                <div className="relative z-10 p-6 space-y-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-sky-300">
                    OTOMATIS AKTIF · TANPA BANYAK TOMBOL
                  </div>
                  <div className="text-lg font-display font-bold text-white leading-snug">
                    Satu Sakelar Utama untuk Radius 1 Meter, Pengupas Bising AI, dan Studio HD EQ.
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/70 font-mono text-xs tabular-nums">
                    <div>
                      <div className="text-slate-400">Suara Anda (&le; 1.0m)</div>
                      <div className="text-emerald-300 font-bold mt-0.5">
                        Jernih Studio HD
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Obrolan Meja Sebelah</div>
                      <div className="text-rose-400 font-bold mt-0.5">
                        Diblokir (0.00x)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Quantitative Proof Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-10 pt-8 border-t border-slate-800/90 font-mono tabular-nums">
            <div>
              <div className="text-xs text-slate-400 uppercase">Radius Fokus Suara</div>
              <div className="text-2xl sm:text-3xl font-bold text-white mt-1 font-display">
                &le; 1.0 Meter
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Obrolan meja sebelah langsung terputus
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase">Bising Saat Bicara</div>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1 font-display">
                RNNoise 0.2 WASM
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Neural denoiser mengupas bor, kipas &amp; ketikan keyboard
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase">Kualitas Vokal</div>
              <div className="text-2xl sm:text-3xl font-bold text-sky-400 mt-1 font-display">
                48 kHz Studio HD
              </div>
              <div className="text-xs text-slate-400 mt-1">
                5-Stage EQ otomatis aktif tanpa mendem
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase">Beban CPU &amp; Latensi</div>
              <div className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1 font-display">
                10 ms · &lt; 2% CPU
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Ringan di MacBook &amp; PC Windows tanpa bikin kipas panas
              </div>
            </div>
          </div>
        </section>

        {/* SIGNATURE SECTION: INTERACTIVE "DENGARKAN BEDANYA" (KRISP-STYLE AUDIO COMPARISON PLAYER) */}
        <section id="dengar-bedanya" className="scroll-mt-24 space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-xs font-mono uppercase tracking-widest text-sky-400">
                UJI BANDING AUDIO INTERAKTIF
              </div>
              <h2
                className="font-display text-2xl sm:text-4xl font-bold text-slate-100 mt-1.5 leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Dengarkan Bedanya: Tanpa Opung vs Dengan Opung
              </h2>
              <p className="text-sm sm:text-base text-slate-400 mt-2 leading-relaxed">
                Pilih skenario kebisingan di bawah ini, tekan <strong>Putar Demo Suara</strong>,
                lalu geser sakelar <strong>Opung Aktif</strong> untuk mendengar bagaimana suara
                pengganggu langsung lenyap secara real-time.
              </p>
            </div>

            {/* Scenario Selector Tabs */}
            <div className="flex flex-wrap gap-2 shrink-0">
              {DEMO_SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectScenario(item.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeScenario === item.id
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-[#0D1119] text-slate-300 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Comparison Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#0D1119] p-6 sm:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left: Scenario Controls & Big Toggle Switch (5 cols) */}
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <div className="text-xs font-mono text-sky-400">
                    {currentScenario.noiseLabel}
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white mt-1">
                    {currentScenario.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    {currentScenario.subtitle}
                  </p>
                </div>

                {/* Big Tactile Toggle: Tanpa Opung vs Opung Aktif */}
                <div className="p-4 rounded-xl border border-slate-800 bg-[#080B11] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Status Peredam Bising:
                    </span>
                    <div className="inline-flex rounded-lg p-1 bg-slate-900 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setDemoOpungActive(false)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          !demoOpungActive
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Tanpa Opung
                      </button>
                      <button
                        type="button"
                        onClick={() => setDemoOpungActive(true)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          demoOpungActive
                            ? 'bg-sky-400 text-slate-950'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Opung Aktif
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed pt-2 border-t border-slate-800/80">
                    {demoOpungActive
                      ? currentScenario.withOpungDesc
                      : currentScenario.withoutOpungDesc}
                  </p>
                </div>

                {/* Play / Stop Audio Demo Button */}
                <button
                  type="button"
                  onClick={handleTogglePlayDemo}
                  className={`w-full py-3.5 px-5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2.5 whitespace-nowrap ${
                    isPlayingDemo
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40'
                      : 'bg-sky-400 hover:bg-sky-300 text-slate-950 shadow-lg shadow-sky-500/15'
                  }`}
                >
                  {isPlayingDemo ? (
                    <>
                      <Square className="w-4 h-4 fill-current shrink-0" />
                      Hentikan Simulasi Suara
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      Putar Demo Suara Sekarang
                    </>
                  )}
                </button>
              </div>

              {/* Right: Animated Waveform Comparison (7 cols) */}
              <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#080B11] p-6 space-y-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300 font-semibold">
                    VISUALISASI GELOMBANG SUARA KE GOOGLE MEET
                  </span>
                  <span
                    className={
                      demoOpungActive ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                    }
                  >
                    {demoOpungActive
                      ? 'BISING DIHAPUS · VOKAL JERNIH HD'
                      : 'BISING BOCOR KE LAWAN BICARA'}
                  </span>
                </div>

                {/* Waveform Bars */}
                <div className="h-40 flex items-center justify-between gap-1.5 px-2 py-4 rounded-lg bg-[#05070B] border border-slate-800/80">
                  {currentScenario.beforeBars.map((rawVal, idx) => {
                    const cleanVal = currentScenario.afterBars[idx] ?? 10;
                    const jitter = isPlayingDemo
                      ? Math.sin(demoTick * 0.9 + idx * 0.7) * 8
                      : 0;
                    const displayHeight = demoOpungActive
                      ? Math.max(4, Math.min(96, cleanVal + (cleanVal > 10 ? jitter : 0)))
                      : Math.max(12, Math.min(98, rawVal + jitter));

                    const isVoicePeak = cleanVal > 20;

                    return (
                      <div
                        key={idx}
                        className="flex-1 h-full flex flex-col justify-center items-center gap-1"
                      >
                        <div
                          className={`w-full rounded-full transition-all duration-150 ${
                            demoOpungActive
                              ? isVoicePeak
                                ? 'bg-sky-400'
                                : 'bg-slate-800'
                              : isVoicePeak
                              ? 'bg-sky-400/70'
                              : 'bg-rose-500/75'
                          }`}
                          style={{ height: `${displayHeight}%` }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-400 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm bg-sky-400 inline-block" />
                    <span>Vokal Utama Anda (&le; 1.0m)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-sm inline-block ${
                        demoOpungActive ? 'bg-slate-800' : 'bg-rose-500/80'
                      }`}
                    />
                    <span>
                      {demoOpungActive
                        ? 'Bising Sekitar: 0.00x (Dibungkam)'
                        : 'Bising Sekitar: Ikut Bocor Masuk'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE APPLICATION WORKSPACE: Minimal Krisp-Style OPUNG.app */}
        <MacOSDesktopAppWorkspace />

        {/* AUTOMATIC CAPABILITIES SECTION (BENTO GRID + CLEAN COMPARISON TABLE) */}
        <section id="keunggulan-otomatis" className="scroll-mt-24 space-y-10">
          <div className="max-w-3xl">
            <div className="text-xs font-mono uppercase tracking-widest text-sky-400">
              ARSITEKTUR PEREDAM BISING PINTAR
            </div>
            <h2
              className="font-display text-2xl sm:text-4xl font-bold text-slate-100 mt-1.5 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Dirancang Simpel Seperti Krisp, Ditambah Kekuatan Pembatas Jarak 1 Meter
            </h2>
            <p className="text-sm sm:text-base text-slate-400 mt-2.5 leading-relaxed">
              Anda tidak perlu mengatur puluhan tombol equalizer atau filter teknis saat sedang
              buru-buru rapat. Seluruh mesin pemroses vokal terbaik langsung bekerja otomatis.
            </p>
          </div>

          {/* Asymmetric Bento Grid: 7 Cols + 5 Cols */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* 7-Column Primary Card: 1.0m Acoustic Hemisphere */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#0D1119] overflow-hidden flex flex-col justify-between">
              <div className="relative aspect-[16/9] w-full bg-slate-950 border-b border-slate-800/80 overflow-hidden">
                <img
                  src={acousticRadiusImg}
                  alt="Visualisasi Kubah Akustik 1 Meter OPUNG"
                  className="w-full h-full object-cover object-center"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-200 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-800">
                  <span>ZONA DALAM (&le; 1.0M): SUARA ANDA UTUH</span>
                  <span className="text-rose-400 font-bold">
                    ZONA LUAR (&gt; 1.5M): GAIN 0.00X
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between space-y-5">
                <div>
                  <div className="text-xs font-mono text-sky-400 uppercase">
                    PROXIMITY VOICE ISOLATION + NEURAL DENOISER
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white mt-1.5">
                    Menangkal Dua Musuh Utama Rapat: Suara Teman Sekantor &amp; Bising Dekat Anda
                  </h3>
                  <p className="text-sm text-slate-300 mt-2.5 leading-relaxed">
                    Saat Anda diam, obrolan rekan kerja di meja sebelah (&ge; 1.5 meter) diputus
                    total ke <strong>0.00x</strong>. Dan ketika Anda sedang berbicara sambil ada
                    suara bor bangunan, deru kipas, atau ketikan keyboard di dekat Anda,{' '}
                    <strong>Hybrid RNNoise 0.2 WASM Neural Denoiser</strong> otomatis mengupas bising
                    non-manusia tersebut tanpa memotong kata-kata Anda.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-800/80 font-mono text-xs tabular-nums">
                  <div>
                    <div className="text-slate-400">Dekat (0.5m)</div>
                    <div className="text-slate-100 font-bold mt-0.5">-20 dB Ketat</div>
                  </div>
                  <div>
                    <div className="text-sky-400">Kantor (1.0m)</div>
                    <div className="text-sky-300 font-bold mt-0.5">-26 dB Ideal</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Ruang (1.5m)</div>
                    <div className="text-slate-100 font-bold mt-0.5">-38 dB Longgar</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5-Column Companion Card: Built-in Studio HD Vocal Equalizer */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#0D1119] overflow-hidden flex flex-col justify-between">
              <div className="relative aspect-[4/3] w-full bg-slate-950 border-b border-slate-800/80 overflow-hidden">
                <img
                  src={vocalEqImg}
                  alt="Prosesor Vokal Studio HD OPUNG"
                  className="w-full h-full object-cover object-center"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-emerald-300 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-800">
                  <span>OTOMATIS AKTIF</span>
                  <span>STUDIO HD 5-STAGE EQ</span>
                </div>
              </div>

              <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between space-y-5">
                <div>
                  <div className="text-xs font-mono text-emerald-400 uppercase">
                    SELALU AKTIF SECARA DEFAULT
                  </div>
                  <h3 className="font-display text-xl font-bold text-white mt-1.5">
                    Suara Jernih &amp; Bulat Tanpa Perlu Menekan Tombol HD Tambahan
                  </h3>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                    Peredam noise biasa sering membuat suara terdengar mendem seperti di dalam
                    kaleng. Di OPUNG, penjernih vokal 5-tahap selalu menyala otomatis:
                  </p>
                </div>

                <div className="space-y-2 pt-3 border-t border-slate-800/80 font-mono text-xs tabular-nums">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Sub-Rumble Cut (85 Hz)</span>
                    <span className="text-slate-400">Hapus dengung meja</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Chest Warmth (135 Hz)</span>
                    <span className="text-emerald-400 font-bold">+2.0 dB (Suara bulat)</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Anti-Mud Cut (260 Hz)</span>
                    <span className="text-sky-400 font-bold">-2.8 dB (Anti-mendem)</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Vocal Presence (3.5 kHz)</span>
                    <span className="text-emerald-400 font-bold">+4.5 dB (Artikulasi)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Clean Product Comparison Table */}
          <div className="rounded-2xl border border-slate-800 bg-[#0D1119] overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                Perbandingan Kemampuan Peredam Kebisingan
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-xs bg-[#090C12]">
                    <th className="py-3.5 px-6">Skenario Kebisingan Rapat</th>
                    <th className="py-3.5 px-6 text-sky-400 font-bold">OPUNG (Otomatis)</th>
                    <th className="py-3.5 px-6">Filter Bawaan Meet / Laptop</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300 tabular-nums">
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      Obrolan rekan kerja di meja sebelah (&ge; 1.5m)
                    </td>
                    <td className="py-3.5 px-6 text-emerald-400 font-semibold">
                      Diblokir mutlak ke 0.00x (-90 dB)
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">
                      Tetap bocor karena dianggap suara manusia
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      Suara bor, kipas &amp; ketikan keyboard saat Anda bicara
                    </td>
                    <td className="py-3.5 px-6 text-emerald-400 font-semibold">
                      Dikupas via Real RNNoise 0.2 WASM (Xiph.org)
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">
                      Bocor begitu gerbang mikrofon terbuka
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      Kejernihan vokal (efek mendem / robotik)
                    </td>
                    <td className="py-3.5 px-6 text-emerald-400 font-semibold">
                      Jernih &amp; bulat (5-Stage Studio HD EQ otomatis)
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">
                      Sering terdengar teredam atau terpotong
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      Pantulan suara lawan bicara dari speaker MacBook
                    </td>
                    <td className="py-3.5 px-6 text-emerald-400 font-semibold">
                      Ditangkal otomatis (Hardware Speaker AEC)
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">
                      Sering memicu umpan balik gema
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-6 font-medium text-slate-100">
                      Ukuran aplikasi &amp; privasi audio
                    </td>
                    <td className="py-3.5 px-6 text-emerald-400 font-semibold">
                      Ringan (&lt; 2.5 MB), 100% diproses lokal + offline RNNoise WASM
                    </td>
                    <td className="py-3.5 px-6 text-slate-400">
                      Bergantung pada koneksi server cloud
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* STEP-BY-STEP INSTALLATION GUIDE (MACOS .DMG & WINDOWS .EXE) */}
        <section
          id="panduan-instalasi"
          className="scroll-mt-24 rounded-2xl border border-slate-800 bg-[#0D1119] p-6 sm:p-10 space-y-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-800 pb-6">
            <div className="max-w-2xl">
              <div className="text-xs font-mono uppercase tracking-widest text-emerald-400">
                {installOsTab === 'macos'
                  ? 'INSTALASI STANDAR MACOS (.DMG) · GESER KE APPLICATIONS · TANPA TERMINAL'
                  : 'INSTALASI WINDOWS 10 / 11 (.EXE) · SYSTEM TRAY + VB-CABLE'}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1.5">
                {installOsTab === 'macos'
                  ? '3 Langkah Mudah Memasang Opung di MacBook'
                  : '3 Langkah Mudah Memasang Opung di Windows'}
              </h2>
              <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                {installOsTab === 'macos' ? (
                  <>
                    Persis seperti aplikasi macOS pada umumnya: cukup buka{' '}
                    <strong>OPUNG-Installer.dmg</strong>, geser ikon <strong>OPUNG.app</strong> ke
                    folder <strong>Applications</strong> di sebelahnya, lalu jalankan.
                  </>
                ) : (
                  <>
                    Pasang driver virtual mic gratis <strong>VB-CABLE</strong> sekali saja, lalu
                    jalankan <strong>Opung-Windows-x64.exe</strong> (atau{' '}
                    <strong>Opung-Windows.bat</strong> dari paket Launcher) untuk menjernihkan mic Anda.
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {/* OS Selector Tabs */}
              <div
                role="tablist"
                aria-label="Pilih Sistem Operasi"
                className="inline-flex rounded-xl p-1 bg-[#080B11] border border-slate-800"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={installOsTab === 'macos'}
                  onClick={() => setInstallOsTab('macos')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    installOsTab === 'macos'
                      ? 'bg-sky-400 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  macOS (.dmg)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={installOsTab === 'windows'}
                  onClick={() => setInstallOsTab('windows')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    installOsTab === 'windows'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Windows (.exe)
                </button>
              </div>

              {installOsTab === 'macos' ? (
                <button
                  type="button"
                  onClick={handleDownloadMacOSApp}
                  disabled={isDownloadingDmg}
                  className="inline-flex items-center justify-center gap-2.5 px-5 py-3 text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {isDownloadingDmg ? 'Menyiapkan .dmg...' : 'Unduh OPUNG-Installer.dmg'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadWindowsApp}
                  disabled={isDownloadingWin}
                  className="inline-flex items-center justify-center gap-2.5 px-5 py-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {isDownloadingWin ? 'Menyiapkan .exe...' : 'Unduh untuk Windows (.exe)'}
                </button>
              )}
            </div>
          </div>

          {installOsTab === 'macos' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LANGKAH 1: BUKA DMG & GESER KE APPLICATIONS */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-sky-400">
                    LANGKAH 1 · GESER KE APPLICATIONS
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Buka .dmg &amp; Geser OPUNG.app ke Applications
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Klik 2x file <code className="font-mono text-sky-300">OPUNG-Installer.dmg</code>.
                    Di jendela yang terbuka, <strong>geser (drag &amp; drop) ikon OPUNG.app</strong>{' '}
                    di kiri ke pintasan folder <strong>Applications</strong> di sebelah kanan:
                  </p>

                  {/* Visual Preview of the macOS DMG Finder Window (OPUNG.app -> Applications, 2 items) */}
                  <div className="rounded-xl border border-slate-700/80 bg-[#121824] overflow-hidden select-none">
                    <div className="px-3 py-1.5 bg-[#1B2232] border-b border-slate-700/70 flex items-center justify-between text-[10px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#ff5f56]" />
                        <span className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
                        <span className="w-2 h-2 rounded-full bg-[#27c93f]" />
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                        <img
                          src="/opung-icon.png"
                          alt=""
                          className="w-3.5 h-3.5 rounded-[3px]"
                        />
                        <span>OPUNG Installer</span>
                      </div>
                      <span className="text-slate-500 font-mono">2 items</span>
                    </div>

                    <div className="px-5 py-4 flex items-center justify-around gap-2">
                      {/* Left Item: OPUNG.app */}
                      <div className="flex flex-col items-center gap-1.5">
                        <img
                          src="/opung-icon.png"
                          alt="OPUNG.app"
                          className="w-12 h-12 rounded-xl shadow-lg shadow-sky-500/20 border border-sky-400/30"
                        />
                        <span className="text-[11px] font-semibold text-slate-100">
                          OPUNG.app
                        </span>
                      </div>

                      {/* Drag Arrow */}
                      <div className="flex flex-col items-center text-sky-400 font-mono text-[10px]">
                        <span className="uppercase tracking-wider">Geser</span>
                        <span className="text-base leading-none font-bold">&rarr;</span>
                      </div>

                      {/* Right Item: macOS Applications Folder Alias */}
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="relative w-12 h-12 rounded-xl bg-gradient-to-b from-sky-400 to-sky-600 border border-sky-300/50 shadow-lg flex items-center justify-center">
                          <span className="font-display font-extrabold text-white/85 text-lg">
                            A
                          </span>
                          <span className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-white text-slate-900 text-[9px] font-extrabold flex items-center justify-center shadow">
                            &#8618;
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-100">
                          Applications
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadMacOSApp}
                  disabled={isDownloadingDmg}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  {isDownloadingDmg ? 'Menyiapkan .dmg...' : 'Unduh OPUNG-Installer.dmg'}
                </button>
              </div>

              {/* LANGKAH 2 */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-sky-400">
                    LANGKAH 2 · BUKA DARI APPLICATIONS
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Klik Kanan &rarr; Open Opung di Applications
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Buka folder <strong>Applications</strong> di MacBook Anda, lalu pada ikon{' '}
                    <strong>Opung</strong> cukup{' '}
                    <strong>Klik Kanan (2 jari) &rarr; pilih Open</strong>. Opung akan langsung
                    memunculkan ikon <strong>Opung di Menu Bar</strong> atas dan mengalirkan
                    suara jernih ke <strong>BlackHole 2ch</strong>.
                  </p>
                </div>

                <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 text-xs font-mono text-emerald-300 flex items-center justify-between">
                  <span>Aktif di /Applications &amp; Menu Bar</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              </div>

              {/* LANGKAH 3 */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    LANGKAH 3 · PILIH MIC DI MEET / ZOOM
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Pilih &ldquo;BlackHole 2ch&rdquo; Saat Rapat
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Buka pengaturan <strong>Audio</strong> di Google Meet, Zoom, atau Microsoft Teams,
                    lalu pilih <strong>BlackHole 2ch</strong> sebagai mikrofon rapat Anda:
                  </p>
                </div>

                <div className="space-y-2.5 bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">
                      MICROPHONE (INPUT RAPAT)
                    </div>
                    <div className="text-emerald-300 font-bold mt-0.5 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      BlackHole 2ch
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">
                      SPEAKERS (OUTPUT SUARA TEMAN)
                    </div>
                    <div className="text-sky-300 font-bold mt-0.5 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" />
                      MacBook Speakers / Earphone Anda
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LANGKAH 1 WINDOWS: PASANG VB-CABLE */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    LANGKAH 1 · DRIVER VIRTUAL MIC
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Pasang VB-CABLE (Gratis, Sekali Saja)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Unduh dan ekstrak <strong>VB-Audio Virtual Cable (VB-CABLE)</strong> dari{' '}
                    <span className="font-mono text-emerald-300">vb-audio.com/Cable</span>, klik
                    kanan <code className="font-mono text-sky-300">VBCABLE_Setup_x64.exe</code>{' '}
                    &rarr; <strong>Run as administrator</strong> &rarr; <strong>Install Driver</strong>.
                  </p>
                </div>

                <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3.5 py-2.5 text-xs font-mono text-sky-300 flex items-center justify-between">
                  <span>Membuat CABLE Input &amp; Output</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              </div>

              {/* LANGKAH 2 WINDOWS: JALANKAN OPUNG .EXE */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-sky-400">
                    LANGKAH 2 · JALANKAN OPUNG WINDOWS
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Buka Opung-Windows-x64.exe
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Klik 2x <strong>Opung-Windows-x64.exe</strong> (dari GitHub Releases) atau
                    ekstrak paket <strong>Opung-Windows-Launcher.zip</strong> lalu buka{' '}
                    <code className="font-mono text-sky-300">Opung-Windows.bat</code>. Opung aktif
                    di System Tray dan otomatis mengunci output ke <strong>CABLE Input</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadWindowsApp}
                  disabled={isDownloadingWin}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  {isDownloadingWin ? 'Menyiapkan .exe...' : 'Unduh untuk Windows (.exe)'}
                </button>
              </div>

              {/* LANGKAH 3 WINDOWS: PILIH CABLE OUTPUT DI MEET / ZOOM */}
              <div className="rounded-xl border border-slate-800 bg-[#080B11] p-6 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    LANGKAH 3 · PILIH MIC DI MEET / ZOOM
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Pilih &ldquo;CABLE Output (VB-Audio)&rdquo;
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Buka pengaturan <strong>Audio</strong> di Google Meet, Zoom, atau Microsoft Teams
                    di PC Windows Anda, lalu pilih mikrofon virtual VB-CABLE:
                  </p>
                </div>

                <div className="space-y-2.5 bg-slate-900/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">
                      MICROPHONE (INPUT RAPAT)
                    </div>
                    <div className="text-emerald-300 font-bold mt-0.5 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5" />
                      CABLE Output (VB-Audio Virtual Cable)
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">
                      SPEAKERS (OUTPUT SUARA TEMAN)
                    </div>
                    <div className="text-sky-300 font-bold mt-0.5 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" />
                      Headset / Speaker Laptop Windows Anda
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Clean Product Footer */}
      <footer className="border-t border-slate-900 py-5 px-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Opung - Office Proximity Ultra Noise Gate · Versi 1.0</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>&copy; 2026 Opung &middot; Made with</span>
            <span className="text-rose-500" aria-label="love">&hearts;</span>
            <span className="font-semibold text-slate-200">Muhammad Zen</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
