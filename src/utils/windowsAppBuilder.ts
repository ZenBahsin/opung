import {
  MACOS_STANDALONE_APP_HTML,
  createUnixZipArchive,
  renderOpungIconPng,
} from './macosAppBuilder';

let cachedOpungIcoBytes: Uint8Array | null = null;

/**
 * Membangun file Windows Icon (`.ico`) resmi berisi gambar PNG 128x128 dan 256x256
 * sesuai spesifikasi Windows Vista / 10 / 11 ICONDIR + ICONDIRENTRY.
 */
export function buildOpungIcoBytes(): Uint8Array {
  if (cachedOpungIcoBytes) {
    return cachedOpungIcoBytes;
  }

  const images: Array<{ size: number; png: Uint8Array }> = [
    { size: 128, png: renderOpungIconPng(128) },
    { size: 256, png: renderOpungIconPng(256) },
  ];

  const headerSize = 6;
  const dirEntrySize = 16;
  const dirTotalSize = headerSize + dirEntrySize * images.length;
  let totalPayloadSize = 0;
  for (const img of images) {
    totalPayloadSize += img.png.length;
  }

  const ico = new Uint8Array(dirTotalSize + totalPayloadSize);
  const dv = new DataView(ico.buffer);

  // ICONDIR (6 bytes)
  dv.setUint16(0, 0, true); // Reserved (0)
  dv.setUint16(2, 1, true); // Type: 1 = Icon (.ICO)
  dv.setUint16(4, images.length, true); // Count

  let currentOffset = dirTotalSize;
  images.forEach((img, index) => {
    const entryOffset = headerSize + index * dirEntrySize;
    // Width & Height: 0 means 256px in .ICO specification
    ico[entryOffset + 0] = img.size >= 256 ? 0 : img.size;
    ico[entryOffset + 1] = img.size >= 256 ? 0 : img.size;
    ico[entryOffset + 2] = 0; // Color count (0 = >= 8bpp)
    ico[entryOffset + 3] = 0; // Reserved
    dv.setUint16(entryOffset + 4, 1, true); // Color planes
    dv.setUint16(entryOffset + 6, 32, true); // Bits per pixel (32-bit RGBA)
    dv.setUint32(entryOffset + 8, img.png.length, true); // Image bytes size
    dv.setUint32(entryOffset + 12, currentOffset, true); // Offset from beginning of file

    ico.set(img.png, currentOffset);
    currentOffset += img.png.length;
  });

  cachedOpungIcoBytes = ico;
  return ico;
}

export const WINDOWS_LAUNCHER_BAT = [
  '@echo off',
  'setlocal enabledelayedexpansion',
  'title Opung - Office Proximity Ultra Noise Gate',
  'set "APP_DIR=%~dp0app"',
  'set "APP_URL=file:///%APP_DIR:\\=/%/index.html"',
  'set "PROFILE_DIR=%LOCALAPPDATA%\\Opung\\EdgeProfile"',
  '',
  'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
  '  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%" --window-size=406,600 --user-data-dir="%PROFILE_DIR%"',
  '  exit /b 0',
  ')',
  'if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (',
  '  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%" --window-size=406,600 --user-data-dir="%PROFILE_DIR%"',
  '  exit /b 0',
  ')',
  'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
  '  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%" --window-size=406,600 --user-data-dir="%PROFILE_DIR%"',
  '  exit /b 0',
  ')',
  'if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (',
  '  start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%" --window-size=406,600 --user-data-dir="%PROFILE_DIR%"',
  '  exit /b 0',
  ')',
  '',
  'echo Microsoft Edge atau Google Chrome tidak ditemukan.',
  'echo Membuka Opung di browser default Windows...',
  'start "" "%APP_URL%"',
  'exit /b 0',
  '',
].join('\r\n');

export const WINDOWS_README_TXT = [
  'Opung - Office Proximity Ultra Noise Gate (Windows Edition)',
  '===========================================================',
  '',
  'Cara Menjalankan (Mode Ringan Edge App):',
  '1. Ekstrak seluruh isi file ZIP ini ke folder permanen (mis. C:\\Opung).',
  '2. Pastikan driver mikrofon virtual VB-CABLE sudah terpasang:',
  '   https://vb-audio.com/Cable/',
  '3. Klik 2x file "Opung-Windows.bat" untuk membuka jendela Opung.',
  '4. Di Google Meet / Zoom / Microsoft Teams, pilih Microphone:',
  '   "CABLE Output (VB-Audio Virtual Cable)".',
  '',
  'Catatan Installer Single-File (.exe):',
  'File installer native "Opung-Windows-x64.exe" (.NET 8 + WebView2 + System Tray',
  '+ NAudio WASAPI VB-CABLE Bridge) tersedia pada halaman GitHub Releases proyek ini.',
  '',
  '(c) 2026 Opung - Made with love by Muhammad Zen',
  '',
].join('\r\n');

/**
 * Membangun arsip portabel Windows (`Opung-Windows-Launcher.zip`) di browser
 * berisi peluncur Edge/Chrome App-mode (`Opung-Windows.bat`), `app/index.html`,
 * dan ikon resmi `app/Opung.ico` sebagai fallback ketika file `.exe` belum di-host.
 */
export function buildWindowsLauncherZip(): ArrayBuffer {
  const encoder = new TextEncoder();
  const empty = new Uint8Array(0);
  const icoBytes = buildOpungIcoBytes();

  return createUnixZipArchive([
    { path: 'Opung-Windows/', data: empty, unixMode: 0o040755 },
    { path: 'Opung-Windows/app/', data: empty, unixMode: 0o040755 },
    {
      path: 'Opung-Windows/Opung-Windows.bat',
      data: encoder.encode(WINDOWS_LAUNCHER_BAT),
      unixMode: 0o100755,
    },
    {
      path: 'Opung-Windows/CARA-PAKAI-WINDOWS.txt',
      data: encoder.encode(WINDOWS_README_TXT),
      unixMode: 0o100644,
    },
    {
      path: 'Opung-Windows/app/index.html',
      data: encoder.encode(MACOS_STANDALONE_APP_HTML),
      unixMode: 0o100644,
    },
    {
      path: 'Opung-Windows/app/Opung.ico',
      data: icoBytes,
      unixMode: 0o100644,
    },
  ]);
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

export interface WindowsDownloadResult {
  mode: 'exe' | 'launcher-zip';
  filename: string;
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

export async function downloadWindowsOpungApp(): Promise<WindowsDownloadResult> {
  const candidates = getWindowsExeDownloadCandidates();

  for (const url of candidates) {
    // URL eksternal (mis. GitHub Releases) memblokir preflight CORS HEAD -> unduh langsung
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
      // Pastikan respons bukan halaman SPA HTML fallback dari Vite dev server
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
