import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function skipHeavySourcemapPlugin(): Plugin {
  return {
    name: 'opung-skip-heavy-sourcemap',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('rnnoiseSyncInline') || id.includes('macosAppBuilder')) {
        return {code, map: {mappings: ''}};
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), skipHeavySourcemapPlugin()],
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['@jitsi/rnnoise-wasm'],
    },
    worker: {
      format: 'es' as const,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
