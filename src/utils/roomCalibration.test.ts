import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_DURATION_MS,
  MIN_CALIBRATED_THRESHOLD_DB,
  MAX_CALIBRATED_THRESHOLD_DB,
  computeRecommendedThresholdDb,
} from './roomCalibration';

test('room calibration defaults gracefully on empty or noisy invalid readings', () => {
  assert.equal(CALIBRATION_DURATION_MS, 3000);

  const emptyRes = computeRecommendedThresholdDb([]);
  assert.equal(emptyRes.recommendedThresholdDb, -26);
  assert.equal(emptyRes.sampleCount, 0);

  const nanRes = computeRecommendedThresholdDb([NaN, Infinity, -Infinity, -120, 5]);
  assert.equal(nanRes.recommendedThresholdDb, -26);
  assert.equal(nanRes.sampleCount, 0);
});

test('room calibration computes p90 + 6 dB for typical open-office chatter', () => {
  // Simulasi 3 detik bising rekan kerja (-36 dB .. -33 dB, dengan beberapa puncak -32 dB)
  const samples = Array.from({ length: 45 }, (_, idx) => -36 + (idx % 5));
  const res = computeRecommendedThresholdDb(samples);

  assert.equal(res.sampleCount, 45);
  assert.ok(res.p90AmbientDb >= -33 && res.p90AmbientDb <= -32);
  assert.equal(res.recommendedThresholdDb, res.p90AmbientDb + 6);
  assert.ok(
    res.recommendedThresholdDb >= MIN_CALIBRATED_THRESHOLD_DB &&
      res.recommendedThresholdDb <= MAX_CALIBRATED_THRESHOLD_DB
  );
});

test('room calibration clamps safely in ultra-quiet studio and loud cafe environments', () => {
  // Ruangan sangat hening (-62 dB) -> dikunci minimal -36 dB agar napas/ketikan tidak langsung tembus
  const quiet = computeRecommendedThresholdDb(Array(30).fill(-62));
  assert.equal(quiet.recommendedThresholdDb, MIN_CALIBRATED_THRESHOLD_DB);

  // Kafe sangat bising (-18 dB) -> dibatasi maksimal -16 dB agar suara pembicara utama tetap bisa masuk
  const loud = computeRecommendedThresholdDb(Array(30).fill(-18));
  assert.equal(loud.recommendedThresholdDb, MAX_CALIBRATED_THRESHOLD_DB);
});
