import React, { useEffect, useRef, useState } from 'react';
import { UseNoiseCancellationReturn } from '../hooks/useNoiseCancellation';
import {
  Mic,
  Radio,
  Square,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldOff,
  Sliders,
  Activity,
} from 'lucide-react';

interface LiveAudioWorkbenchProps {
  audioController: UseNoiseCancellationReturn;
}

export const LiveAudioWorkbench: React.FC<LiveAudioWorkbenchProps> = ({ audioController }) => {
  const {
    processedStream,
    isActive,
    isLoading,
    isNoiseCancelled,
    sourceMode,
    error,
    telemetry,
    aggressiveness,
    startMicrophone,
    startSyntheticTestbench,
    stopAudioPipeline,
    toggleNoiseCancellation,
    setAggressiveness,
    updateSyntheticConfig,
    setLocalMonitor,
    isLocalMonitorEnabled,
    getAnalyserSnapshots,
  } = audioController;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [voiceActiveSynth, setVoiceActiveSynth] = useState(true);
  const [fanHumLevel, setFanHumLevel] = useState(0.45);
  const [whiteNoiseLevel, setWhiteNoiseLevel] = useState(0.35);

  // Simpan referensi callback dan state di useRef agar loop requestAnimationFrame Canvas
  // tidak pernah di-mount ulang saat state React berubah.
  const latestStateRef = useRef({
    isActive,
    isNoiseCancelled,
    getAnalyserSnapshots,
  });

  useEffect(() => {
    latestStateRef.current = {
      isActive,
      isNoiseCancelled,
      getAnalyserSnapshots,
    };
  }, [isActive, isNoiseCancelled, getAnalyserSnapshots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rawTime = new Float32Array(512);
    const procTime = new Float32Array(512);
    const rawFreq = new Uint8Array(256);
    const procFreq = new Uint8Array(256);

    let idlePhase = 0;

    const renderFrame = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // Latar belakang studio gelap dengan garis kisi halus
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const { isActive: active, isNoiseCancelled: denoised, getAnalyserSnapshots: fetchArrays } =
        latestStateRef.current;

      if (active) {
        fetchArrays(rawTime, procTime, rawFreq, procFreq);

        // Gambar Spektrum Frekuensi (Bar) di bagian bawah
        const barCount = 64;
        const barWidth = width / barCount;
        for (let i = 0; i < barCount; i++) {
          const rawVal = rawFreq[i] / 255.0;
          const procVal = procFreq[i] / 255.0;

          // Raw Noise Spectrum (Amber/Rose transparan di belakang)
          const rawBarHeight = rawVal * (height * 0.45);
          ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
          ctx.fillRect(
            i * barWidth + 1,
            height - rawBarHeight,
            barWidth - 2,
            rawBarHeight
          );

          // Processed Clean Spectrum (Emerald/Sky di depan)
          const procBarHeight = procVal * (height * 0.45);
          ctx.fillStyle = denoised
            ? 'rgba(16, 185, 129, 0.72)'
            : 'rgba(245, 158, 11, 0.65)';
          ctx.fillRect(
            i * barWidth + 2,
            height - procBarHeight,
            barWidth - 4,
            procBarHeight
          );
        }

        // Gambar Waveform Time-Domain Mentah (Raw Input - Merah/Oranye tipis)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
        ctx.lineWidth = 1.5;
        const sliceWidth = width / rawTime.length;
        for (let i = 0; i < rawTime.length; i++) {
          const y = height * 0.35 + rawTime[i] * (height * 0.28);
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceWidth, y);
        }
        ctx.stroke();

        // Gambar Waveform Time-Domain Bersih (Processed Output - Hijau Zamrud / Biru Langit tebal)
        ctx.beginPath();
        ctx.strokeStyle = denoised ? '#34d399' : '#fbbf24';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < procTime.length; i++) {
          const y = height * 0.35 + procTime[i] * (height * 0.28);
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceWidth, y);
        }
        ctx.stroke();
      } else {
        // Gelombang panduan statis/halus saat belum aktif
        idlePhase += 0.06;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 1.5;
        for (let x = 0; x < width; x += 4) {
          const y =
            height / 2 +
            Math.sin(x * 0.02 + idlePhase) * 12 * Math.sin(x * 0.004);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    renderFrame();
    const timerId = window.setInterval(renderFrame, 50);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const handleToggleVoiceSynth = () => {
    const next = !voiceActiveSynth;
    setVoiceActiveSynth(next);
    updateSyntheticConfig({ voiceEnabled: next });
  };

  const handleFanHumChange = (val: number) => {
    setFanHumLevel(val);
    updateSyntheticConfig({ fanHumLevel: val });
  };

  const handleWhiteNoiseChange = (val: number) => {
    setWhiteNoiseLevel(val);
    updateSyntheticConfig({ whiteNoiseHissLevel: val });
  };

  const outputTrackInfo =
    processedStream && processedStream.getAudioTracks().length > 0
      ? processedStream.getAudioTracks()[0]
      : null;

  return (
    <section
      id="live-dsp-workbench"
      className="scroll-mt-24 border border-slate-800 bg-slate-900/60 rounded-xl p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-mono mb-1">
            <span>02. LABORATORIUM UJI DSP REAL-TIME</span>
            <span aria-hidden="true">·</span>
            <span>AUDIOWORKLET 48.000 HZ</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Pengujian Interaktif Stream Mikrofon & Generator Sinyal Sintetis
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Uji langsung kelas <code className="font-mono text-slate-200">RNNoiseWorkletProcessor</code>{' '}
            dan hook <code className="font-mono text-slate-200">useNoiseCancellation</code> menggunakan
            mikrofon fisik Anda atau generator sinyal sintetis (Vokal + Derau Kipas 58Hz + Hiss).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {!isActive ? (
            <>
              <button
                type="button"
                disabled={isLoading}
                onClick={() =>
                  startSyntheticTestbench({
                    voiceEnabled: voiceActiveSynth,
                    fanHumLevel,
                    whiteNoiseHissLevel: whiteNoiseLevel,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Radio className="w-4 h-4" />
                {isLoading ? 'Menginisialisasi Worklet...' : 'Jalankan Sinyal Uji Sintetis'}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => startMicrophone()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Mic className="w-4 h-4 text-sky-400" />
                Gunakan Mikrofon (getUserMedia)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => toggleNoiseCancellation()}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isNoiseCancelled
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {isNoiseCancelled ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    RNNoise Aktif (Klik untuk Bypass)
                  </>
                ) : (
                  <>
                    <ShieldOff className="w-4 h-4" />
                    Mode Bypass (Derau Mentah)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setLocalMonitor(!isLocalMonitorEnabled)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isLocalMonitorEnabled ? (
                  <>
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    Speaker Monitor: ON
                  </>
                ) : (
                  <>
                    <VolumeX className="w-4 h-4 text-slate-400" />
                    Speaker Monitor: Mute
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => stopAudioPipeline()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Hentikan Stream
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 p-3.5 rounded-lg border border-amber-800/80 bg-amber-950/40 text-amber-200 text-xs flex items-center justify-between gap-4"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() =>
              startSyntheticTestbench({
                voiceEnabled: voiceActiveSynth,
                fanHumLevel,
                whiteNoiseHissLevel: whiteNoiseLevel,
              })
            }
            className="px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded-md shrink-0 cursor-pointer"
          >
            Aktifkan Sinyal Sintetis
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left 8 Columns: Dual Spectrum & Waveform Canvas + Telemetry Strip */}
        <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
          <div className="relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/50 text-xs">
              <div className="flex items-center gap-2.5 text-slate-300 font-medium whitespace-nowrap shrink-0">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  Osiloskop &amp; Spektrum FFT
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-slate-400 whitespace-nowrap">
                  {sourceMode === 'microphone'
                    ? 'Mikrofon 48kHz'
                    : sourceMode === 'synthetic'
                    ? 'Sintetis 48kHz'
                    : 'Siaga (Idle)'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[11px] font-mono whitespace-nowrap shrink-0">
                <span className="text-rose-400 whitespace-nowrap">Merah: Input Bising</span>
                <span className="text-emerald-400 whitespace-nowrap">Hijau: Output RNNoise</span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={760}
              height={240}
              data-testid="dsp-spectrum-canvas"
              className="w-full h-[240px] block"
            />
          </div>

          {/* Real-Time Worklet Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
            <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Frame 480 Terproses</div>
              <div className="text-lg font-bold text-slate-100 mt-0.5">
                {telemetry.framesProcessed.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Quantum 128: {telemetry.quantumsProcessed.toLocaleString('id-ID')}
              </div>
            </div>

            <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Probabilitas VAD (Suara)</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                {(telemetry.vadProbability * 100).toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Status: {telemetry.vadProbability > 0.35 ? 'Vokal Terdeteksi' : 'Reduksi Derau'}
              </div>
            </div>

            <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Residu Input / Output Ring</div>
              <div className="text-lg font-bold text-sky-400 mt-0.5">
                {telemetry.inputRingAvailable} / {telemetry.outputRingAvailable}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Kapasitas: 2048 sampel
              </div>
            </div>

            <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">MediaStreamDestination</div>
              <div className="text-sm font-bold text-slate-200 mt-1 truncate">
                {outputTrackInfo ? `Track Ready (${outputTrackInfo.readyState})` : 'Belum Aktif'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {outputTrackInfo ? 'Siap untuk RTCPeerConnection' : 'Klik tombol mulai di atas'}
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: DSP Mixer & Aggressiveness Controls */}
        <div className="lg:col-span-4 border border-slate-800 bg-slate-950/70 rounded-lg p-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Sliders className="w-4 h-4 text-sky-400" />
                Parameter DSP & Generator Derau
              </div>
              <span className="text-xs font-mono text-slate-400">48kHz Mono</span>
            </div>

            {/* Aggressiveness Control */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <label htmlFor="aggressiveness-slider" className="text-slate-300 font-medium">
                  Agresivitas Atribusi RNNoise / VAD Floor
                </label>
                <span className="font-mono text-sky-400 tabular-nums">
                  {Math.round(aggressiveness * 100)}%
                </span>
              </div>
              <input
                id="aggressiveness-slider"
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={aggressiveness}
                onChange={(e) => setAggressiveness(parseFloat(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Mengatur seberapa dalam atenuasi derau saat skor probabilitas VAD rendah.
              </p>
            </div>

            {/* Synthetic Signal Controls */}
            <div className="pt-2 border-t border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-300">
                  Formant Suara Manusia (145Hz + 620Hz)
                </span>
                <button
                  type="button"
                  onClick={handleToggleVoiceSynth}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    voiceActiveSynth
                      ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  {voiceActiveSynth ? 'Vokal: ON' : 'Vokal: OFF'}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="fan-hum-slider" className="text-slate-400">
                    Derau Kipas / AC Hum (58Hz Low-End)
                  </label>
                  <span className="font-mono text-rose-400 tabular-nums">
                    {Math.round(fanHumLevel * 100)}%
                  </span>
                </div>
                <input
                  id="fan-hum-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={fanHumLevel}
                  onChange={(e) => handleFanHumChange(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="white-noise-slider" className="text-slate-400">
                    Broadband Hiss (White Noise &gt; 1.8kHz)
                  </label>
                  <span className="font-mono text-rose-400 tabular-nums">
                    {Math.round(whiteNoiseLevel * 100)}%
                  </span>
                </div>
                <input
                  id="white-noise-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={whiteNoiseLevel}
                  onChange={(e) => handleWhiteNoiseChange(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            <strong>Tips Pengujian A/B:</strong> Klik{' '}
            <span className="text-slate-200 font-medium">Jalankan Sinyal Uji Sintetis</span>, lalu
            tekan tombol <span className="text-slate-200 font-medium">RNNoise Aktif / Bypass</span>{' '}
            untuk membandingkan grafik gelombang merah (berisik) vs hijau (bersih).
          </div>
        </div>
      </div>
    </section>
  );
};
