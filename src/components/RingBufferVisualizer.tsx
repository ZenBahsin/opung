import React, { useState, useMemo } from 'react';
import {
  RNNoiseFramePipeline,
  WORKLET_QUANTUM_SIZE,
  RNNOISE_FRAME_SIZE,
  FrameStepSnapshot,
} from '../audio/ringBuffer';
import { Play, RotateCcw, FastForward, CheckCircle2, ArrowRight } from 'lucide-react';

export const RingBufferVisualizer: React.FC = () => {
  const [history, setHistory] = useState<FrameStepSnapshot[]>(() => {
    // Pre-populate 4 langkah awal sehingga pengguna langsung melihat siklus 128 -> 256 -> 384 -> 512 (Trigger 480!)
    const initialPipeline = new RNNoiseFramePipeline(2048);
    const dummyIn = new Float32Array(WORKLET_QUANTUM_SIZE).fill(0.42);
    const dummyOut = new Float32Array(WORKLET_QUANTUM_SIZE);
    const initialSteps: FrameStepSnapshot[] = [];
    for (let i = 0; i < 4; i++) {
      initialSteps.push(
        initialPipeline.processQuantum(dummyIn, dummyOut, () => 0.94)
      );
    }
    return initialSteps;
  });

  // Rekalkulasi state pipeline berdasarkan jumlah langkah saat ini
  const currentStepCount = history.length;

  const stepForward = (count: number) => {
    setHistory((prev) => {
      const targetSteps = Math.min(32, prev.length + count);
      const pipe = new RNNoiseFramePipeline(2048);
      const dummyIn = new Float32Array(WORKLET_QUANTUM_SIZE).fill(0.42);
      const dummyOut = new Float32Array(WORKLET_QUANTUM_SIZE);
      const nextHistory: FrameStepSnapshot[] = [];

      for (let i = 0; i < targetSteps; i++) {
        nextHistory.push(
          pipe.processQuantum(dummyIn, dummyOut, () => 0.94)
        );
      }
      return nextHistory;
    });
  };

  const resetSimulation = () => {
    setHistory([]);
  };

  const latestSnapshot: FrameStepSnapshot | null =
    history.length > 0 ? history[history.length - 1] : null;

  // Hitung pola berulang 15-quantum (15 * 128 = 1920 sampel = tepat 4 frame RNNoise @ 480 sampel)
  const lcmCycleProgress = useMemo(() => {
    const stepInCycle = ((currentStepCount - 1 + 15) % 15) + 1;
    return currentStepCount === 0 ? 0 : stepInCycle;
  }, [currentStepCount]);

  const inputFillPercent = latestSnapshot
    ? Math.min(100, (latestSnapshot.inputAvailableAfter / RNNOISE_FRAME_SIZE) * 100)
    : 0;

  const outputFillPercent = latestSnapshot
    ? Math.min(100, (latestSnapshot.outputAvailableAfter / RNNOISE_FRAME_SIZE) * 100)
    : 0;

  return (
    <section
      id="ring-buffer-simulator"
      className="scroll-mt-24 border border-slate-800 bg-slate-900/60 rounded-xl p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-sky-400 font-mono mb-1">
            <span>01. SIMULATOR MATEMATIKA RING BUFFER</span>
            <span aria-hidden="true">·</span>
            <span>128 SAMPEL KE 480 SAMPEL</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Inspektor Siklus Akumulasi Frame AudioWorklet → RNNoise WASM
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Karena <code className="text-slate-200 font-mono">480 / 128 = 3.75</code>, prosesor
            menabung potongan 128 sampel hingga mencapai minimal 480 sampel. Setiap siklus{' '}
            <code className="text-slate-200 font-mono">KPK(128, 480) = 1920 sampel</code> (15
            quantum AudioWorklet = 4 frame RNNoise), sisa sampel kembali ke 0 secara presisi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => stepForward(1)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Step +1 Quantum (+128 Sampel)
          </button>
          <button
            type="button"
            onClick={() => stepForward(4)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FastForward className="w-3.5 h-3.5" />
            Step +4 Quantums (+512 Sampel)
          </button>
          <button
            type="button"
            onClick={resetSimulation}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset (0)
          </button>
        </div>
      </div>

      {/* Visual Diagram of the 3-Stage Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
        {/* Stage 1: Input Ring Buffer */}
        <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-200">1. Input Ring Buffer (Tabungan)</span>
            <span className="font-mono text-sky-400 tabular-nums">
              WritePtr: {latestSnapshot ? latestSnapshot.writePointerInput : 0}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Menabung <span className="font-mono text-slate-200">+128</span> sampel per callback{' '}
            <code className="font-mono">process()</code> dan mengalikan skala ke PCM16 (
            <code className="font-mono">×32768</code>).
          </p>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-400">Sampel Tersedia (Threshold 480):</span>
              <span className="text-slate-100 font-semibold">
                {latestSnapshot ? latestSnapshot.inputAvailableAfter : 0} / 480 sampel
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-sm overflow-hidden border border-slate-800">
              <div
                className="h-full bg-sky-500 transition-all duration-150"
                style={{ width: `${inputFillPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-500 tabular-nums pt-1">
              <span>Sebelum Tarik: {latestSnapshot ? latestSnapshot.inputAvailableBefore + 128 : 0}</span>
              <span>Sisa Residu: {latestSnapshot ? latestSnapshot.inputAvailableAfter : 0} sampel</span>
            </div>
          </div>
        </div>

        {/* Stage 2: WASM RNNoise Frame Execution */}
        <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-200">2. Eksekusi WASM RNNoise (480)</span>
              <span className="font-mono text-amber-400 tabular-nums">10ms @ 48kHz</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Memanggil <code className="font-mono text-slate-200">_rnnoise_process_frame()</code>{' '}
              hanya ketika tabungan mencapai <span className="font-mono text-slate-200">≥ 480</span>{' '}
              sampel.
            </p>
          </div>

          <div className="p-3 rounded-md border border-slate-800 bg-slate-900/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Status Langkah Quantum #{currentStepCount}</div>
              <div className="text-sm font-mono font-semibold mt-0.5 tabular-nums">
                {latestSnapshot?.rnnoiseTriggered ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    DIEKSEKUSI (-480 sampel)
                  </span>
                ) : (
                  <span className="text-slate-400">
                    MENABUNG (Butuh{' '}
                    {Math.max(0, 480 - (latestSnapshot?.inputAvailableAfter ?? 0))} lagi)
                  </span>
                )}
              </div>
            </div>
            <div className="text-right font-mono">
              <div className="text-[11px] text-slate-400">Posisi Siklus KPK</div>
              <div className="text-sm font-semibold text-slate-200 tabular-nums">
                Quantum {lcmCycleProgress} / 15
              </div>
            </div>
          </div>
        </div>

        {/* Stage 3: Output Ring Buffer */}
        <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-200">3. Output Ring Buffer (Distribusi)</span>
            <span className="font-mono text-emerald-400 tabular-nums">
              ReadPtr: {latestSnapshot ? latestSnapshot.readPointerOutput : 0}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Menerima <span className="font-mono text-slate-200">+480</span> sampel bersih dari WASM
            dan mengeluarkan tepat <span className="font-mono text-slate-200">-128</span> sampel per
            quantum.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-400">Cadangan Output Tersisa:</span>
              <span className="text-emerald-400 font-semibold">
                {latestSnapshot ? latestSnapshot.outputAvailableAfter : 0} sampel
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-sm overflow-hidden border border-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-150"
                style={{ width: `${outputFillPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-500 tabular-nums pt-1">
              <span>
                Status Output:{' '}
                {latestSnapshot?.underrunOccurred
                  ? 'Warm-up Silence (3 quantum awal)'
                  : '128 Sampel Bersih Terkirim'}
              </span>
              <span>Zero-Underrun</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step-by-Step Mathematical Ledger Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg">
        <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
              <th className="py-2.5 px-3 font-medium">Quantum #</th>
              <th className="py-2.5 px-3 font-medium">Input Masuk</th>
              <th className="py-2.5 px-3 font-medium">Akumulasi Input</th>
              <th className="py-2.5 px-3 font-medium">Eksekusi WASM (480)</th>
              <th className="py-2.5 px-3 font-medium">Sisa Input Ring</th>
              <th className="py-2.5 px-3 font-medium">Sisa Output Ring (Setelah -128)</th>
              <th className="py-2.5 px-3 font-medium text-right">Status Output AudioWorklet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {history.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                  Klik tombol <strong>Step +1 Quantum (+128 Sampel)</strong> di atas untuk melihat
                  simulasi pergerakan pointer Ring Buffer langkah demi langkah.
                </td>
              </tr>
            ) : (
              history.slice(-10).map((row) => {
                const accumulatedBeforeCheck = row.inputAvailableBefore + WORKLET_QUANTUM_SIZE;
                return (
                  <tr
                    key={row.stepNumber}
                    className={
                      row.rnnoiseTriggered
                        ? 'bg-emerald-950/20 text-slate-100'
                        : 'bg-slate-900/30 text-slate-300'
                    }
                  >
                    <td className="py-2 px-3 font-semibold text-sky-400">
                      Q#{row.stepNumber}
                    </td>
                    <td className="py-2 px-3">+{WORKLET_QUANTUM_SIZE}</td>
                    <td className="py-2 px-3">
                      {row.inputAvailableBefore} + 128 ={' '}
                      <span className="font-semibold text-slate-100">{accumulatedBeforeCheck}</span>
                    </td>
                    <td className="py-2 px-3">
                      {row.rnnoiseTriggered ? (
                        <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                          YA ({accumulatedBeforeCheck} ≥ 480) <ArrowRight className="w-3 h-3" /> -480
                        </span>
                      ) : (
                        <span className="text-slate-500">Tidak ({accumulatedBeforeCheck} &lt; 480)</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-semibold">{row.inputAvailableAfter} sampel</td>
                    <td className="py-2 px-3 text-emerald-300">
                      {row.outputAvailableAfter} sampel
                    </td>
                    <td className="py-2 px-3 text-right">
                      {row.underrunOccurred ? (
                        <span className="text-amber-400">Warm-up Silence (128 nol)</span>
                      ) : (
                        <span className="text-emerald-400">128 Sampel Denoised</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
