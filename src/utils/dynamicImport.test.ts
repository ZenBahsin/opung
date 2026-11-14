import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDownloadErrorMessage, importWithRetry } from './dynamicImport';

test('importWithRetry succeeds after transient fetch failures', async () => {
  let calls = 0;
  const result = await importWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new TypeError('Failed to fetch dynamically imported module: https://example.com/mod.ts');
      }
      return { ok: true };
    },
    3,
    1
  );

  assert.equal(calls, 3);
  assert.deepEqual(result, { ok: true });
});

test('importWithRetry rethrows after exhausting maxAttempts', async () => {
  let calls = 0;
  await assert.rejects(
    importWithRetry(
      async () => {
        calls += 1;
        throw new TypeError('Failed to fetch dynamically imported module');
      },
      2,
      1
    ),
    /Failed to fetch dynamically imported module/
  );
  assert.equal(calls, 2);
});

test('formatDownloadErrorMessage translates dynamic import network errors to friendly Indonesian', () => {
  const msg = formatDownloadErrorMessage(
    new TypeError('Failed to fetch dynamically imported module: https://ais-dev.run.app/src/utils/windowsAppBuilder.ts')
  );
  assert.match(msg, /muat ulang halaman/i);
});

test('importWithRetry uses fallbackLoader on retry attempts to bypass cached module failures', async () => {
  let primaryCalls = 0;
  let fallbackAttempt = 0;

  const res = await importWithRetry(
    async () => {
      primaryCalls += 1;
      throw new TypeError('Failed to fetch dynamically imported module');
    },
    3,
    1,
    async (attempt) => {
      fallbackAttempt = attempt;
      return { recovered: true };
    }
  );

  assert.equal(primaryCalls, 1);
  assert.equal(fallbackAttempt, 2);
  assert.deepEqual(res, { recovered: true });
});
