export const CALIBRATION_DURATION_MS = 3000;
export const MIN_CALIBRATED_THRESHOLD_DB = -36;
export const MAX_CALIBRATED_THRESHOLD_DB = -16;

export interface RoomCalibrationResult {
  recommendedThresholdDb: number;
  ambientFloorDb: number;
  p90AmbientDb: number;
  sampleCount: number;
}

/**
 * Menghitung ambang batas jarak optimal (dB) dari kumpulan sampel bising ruangan/rekan kerja
 * selama 3 detik ketika pembicara utama sedang diam.
 * Menggunakan persentil ke-90 (p90) + margin keamanan 6 dB agar puncak suara meja sebelah
 * tetap terblokir ke 0.00x namun suara pembicara (<= 1.0m) tetap mudah membuka gerbang.
 */
export function computeRecommendedThresholdDb(
  rawSamplesDb: number[]
): RoomCalibrationResult {
  const valid = rawSamplesDb
    .filter((v) => Number.isFinite(v) && v >= -85 && v <= 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    return {
      recommendedThresholdDb: -26,
      ambientFloorDb: -65,
      p90AmbientDb: -60,
      sampleCount: 0,
    };
  }

  const p50Idx = Math.min(valid.length - 1, Math.floor(valid.length * 0.5));
  const p90Idx = Math.min(valid.length - 1, Math.floor(valid.length * 0.9));

  const ambientFloorDb = Math.round(valid[p50Idx]);
  const p90AmbientDb = Math.round(valid[p90Idx]);

  // Tambah margin aman +6 dB di atas p90 bising ruangan agar obrolan meja sebelah terkunci mati
  const targetDb = Math.round(p90AmbientDb + 6);
  const clamped = Math.max(
    MIN_CALIBRATED_THRESHOLD_DB,
    Math.min(MAX_CALIBRATED_THRESHOLD_DB, targetDb)
  );

  return {
    recommendedThresholdDb: clamped,
    ambientFloorDb,
    p90AmbientDb,
    sampleCount: valid.length,
  };
}
