import React, { useState } from 'react';
import { PRODUCTION_CODE_FILES, CodeFileSpec } from '../data/codeSpecs';
import { Copy, Check, FileCode2, Terminal, Cpu, Layers } from 'lucide-react';

export const CodeArchitectureSuite: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState<CodeFileSpec['id']>('noise-processor');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeSpec =
    PRODUCTION_CODE_FILES.find((item) => item.id === activeTabId) || PRODUCTION_CODE_FILES[0];

  const handleCopyCode = async (spec: CodeFileSpec) => {
    try {
      await navigator.clipboard.writeText(spec.code);
      setCopiedId(spec.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback jika clipboard API dibatasi di iframe
      setCopiedId(spec.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Code Explorer Section */}
      <section
        id="production-code"
        className="scroll-mt-24 border border-slate-800 bg-slate-900/60 rounded-xl p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs text-sky-400 font-mono mb-1">
              <span>03. IMPLEMENTASI KODE PRODUCTION-READY</span>
              <span aria-hidden="true">·</span>
              <span>@JITSI/RNNOISE-WASM & AUDIOWORKLET</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">
              Kode Sumber Lengkap: AudioWorkletProcessor, Custom Hook & Integrasi WebRTC
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Pilih tab berkas di bawah untuk meninjau atau menyalin implementasi lengkap beserta
              komentar penjelasan detail pada bagian manajemen memori C/WASM dan Ring Buffer.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleCopyCode(activeSpec)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            {copiedId === activeSpec.id ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                Berhasil Disalin ({activeSpec.filename})
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-sky-400" />
                Salin Kode ({activeSpec.filename})
              </>
            )}
          </button>
        </div>

        {/* Interactive File Tabs */}
        <div
          role="tablist"
          aria-label="Berkas Implementasi Kode"
          className="flex items-center gap-1.5 p-1.5 bg-slate-950 border border-slate-800 rounded-lg my-5 overflow-x-auto"
        >
          {PRODUCTION_CODE_FILES.map((file) => {
            const isSelected = file.id === activeTabId;
            return (
              <button
                key={file.id}
                role="tab"
                aria-selected={isSelected}
                type="button"
                onClick={() => setActiveTabId(file.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-sky-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                {file.filename}
              </button>
            );
          })}
        </div>

        {/* File Context Header */}
        <div className="mb-4 p-4 rounded-lg bg-slate-950/90 border border-slate-800/90">
          <div className="text-sm font-semibold text-slate-100">{activeSpec.subtitle}</div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{activeSpec.description}</p>
        </div>

        {/* Code Block Viewer */}
        <div className="relative rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/70 text-xs font-mono text-slate-400">
            <span>{activeSpec.filename}</span>
            <span>{activeSpec.language.toUpperCase()}</span>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[540px] overflow-y-auto">
            <code>{activeSpec.code}</code>
          </pre>
        </div>
      </section>

      {/* Bundler & Architecture Reference Section */}
      <section
        id="bundler-guide"
        className="scroll-mt-24 border border-slate-800 bg-slate-900/60 rounded-xl p-6"
      >
        <div className="pb-5 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs text-sky-400 font-mono mb-1">
            <span>04. PANDUAN BUNDLER & ARSITEKTUR PRODUKSI</span>
            <span aria-hidden="true">·</span>
            <span>VITE & WEBPACK 5</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Cara Memastikan File .wasm (@jitsi/rnnoise-wasm) & Worklet Terbaca dengan Benar
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Tiga kendala utama yang paling sering menyebabkan kegagalan pemuatan WebAssembly di
            dalam <code className="font-mono text-slate-200">AudioWorklet</code> pada aplikasi
            React modern beserta solusinya:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100 mb-2">
              <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
              1. Ketiadaan fetch() di AudioWorklet
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Berbeda dengan <code className="font-mono text-slate-200">Web Worker</code> biasa,
              spesifikasi <code className="font-mono text-slate-200">AudioWorkletGlobalScope</code>{' '}
              tidak menyertakan fungsi <code className="font-mono text-slate-200">fetch()</code>{' '}
              atau <code className="font-mono text-slate-200">XMLHttpRequest</code>. Jika kode glue
              Emscripten mencoba mengunduh <code className="font-mono text-slate-200">rnnoise.wasm</code>{' '}
              dari dalam worklet, prosesor akan crash.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-emerald-400 font-medium">
              Solusi: Unduh file .wasm sebagai ArrayBuffer menggunakan fetch() di Main Thread (di
              dalam useNoiseCancellation.ts), lalu kirim via processorOptions atau port.postMessage.
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100 mb-2">
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
              2. Resolusi URL Statis di Vite & Webpack
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Di <strong>Vite</strong>, impor file WASM dengan akhiran{' '}
              <code className="font-mono text-slate-200">?url</code> (
              <code className="font-mono text-slate-200">
                import wasmUrl from &apos;@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url&apos;
              </code>
              ) dan tambahkan <code className="font-mono text-slate-200">exclude: [&apos;@jitsi/rnnoise-wasm&apos;]</code>{' '}
              pada <code className="font-mono text-slate-200">optimizeDeps</code> agar esbuild tidak
              merusak path relatifnya.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-emerald-400 font-medium">
              Di Webpack 5: Daftarkan rule test: /rnnoise\.wasm$/ dengan type:
              &apos;asset/resource&apos; agar menghasilkan URL publik.
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-950/70 rounded-lg p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100 mb-2">
              <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
              3. Skala Amplitudo PCM16 & Sample Rate
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Web Audio API menyalurkan sampel Float32 dalam rentang{' '}
              <code className="font-mono text-slate-200">[-1.0, 1.0]</code>, sedangkan fungsi C{' '}
              <code className="font-mono text-slate-200">_rnnoise_process_frame</code> mengharapkan
              rentang 16-bit signed integer dalam bentuk float{' '}
              <code className="font-mono text-slate-200">[-32768.0, 32767.0]</code> pada{' '}
              <code className="font-mono text-slate-200">48.000 Hz</code>.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-emerald-400 font-medium">
              Solusi: Kalikan sampel dengan 32768.0 saat push ke Input Ring Buffer, dan bagi dengan
              32768.0 saat pull dari Output Ring Buffer.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
