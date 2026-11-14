export async function importWithRetry<T>(
  loader: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 250,
  fallbackLoader?: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if (attempt > 1 && fallbackLoader) {
        return await fallbackLoader(attempt);
      }
      return await loader();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
  }

  throw lastError;
}

export function formatDownloadErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/dynamically imported module|failed to fetch|load failed/i.test(raw)) {
    return 'Gagal memuat paket unduhan karena koneksi terputus atau halaman perlu dimuat ulang. Silakan muat ulang halaman lalu klik unduh kembali.';
  }
  return 'Terjadi kendala saat menyiapkan file unduhan. Silakan coba lagi dalam beberapa detik.';
}
