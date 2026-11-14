import { importWithRetry } from './dynamicImport';

export interface WindowsDownloadResult {
  mode: 'exe' | 'launcher-zip';
  filename: string;
}

export function getWindowsExeDownloadCandidates(): string[] {
  const meta =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> })
      : undefined;
  const configuredUrl = meta?.env?.VITE_WINDOWS_EXE_URL?.trim();
  const candidates: string[] = [];
  if (configuredUrl) {
    candidates.push(configuredUrl);
  }
  candidates.push('/Opung-Windows-x64.exe');
  return candidates;
}

export function isExternalHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function triggerDirectUrlDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Mengunduh Opung-Windows-x64.exe jika tersedia (via VITE_WINDOWS_EXE_URL atau /Opung-Windows-x64.exe)
 * tanpa memuat generator ZIP/WASM berat di muka, lalu fallback otomatis ke Opung-Windows-Launcher.zip.
 */
export async function downloadWindowsOpungApp(): Promise<WindowsDownloadResult> {
  const candidates = getWindowsExeDownloadCandidates();

  for (const url of candidates) {
    if (isExternalHttpUrl(url)) {
      triggerDirectUrlDownload(url, 'Opung-Windows-x64.exe');
      return {
        mode: 'exe',
        filename: 'Opung-Windows-x64.exe',
      };
    }

    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (response.ok && !contentType.includes('text/html')) {
        triggerDirectUrlDownload(url, 'Opung-Windows-x64.exe');
        return {
          mode: 'exe',
          filename: 'Opung-Windows-x64.exe',
        };
      }
    } catch {
      // Lanjut cek kandidat berikutnya atau jatuh ke launcher zip
    }
  }

  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);

  const { buildWindowsLauncherZip } = await importWithRetry(
    () => import('./windowsAppBuilder'),
    3,
    250,
    isDev
      ? (attempt) =>
          import(/* @vite-ignore */ `/src/utils/windowsAppBuilder.ts?retry=${attempt}_${Date.now()}`)
      : undefined
  );

  const zipBytes = buildWindowsLauncherZip();
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = 'Opung-Windows-Launcher.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  return {
    mode: 'launcher-zip',
    filename: 'Opung-Windows-Launcher.zip',
  };
}
