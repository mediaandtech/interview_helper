import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyllableEstimator } from '../js/analysis/syllables.js';

const envelope = (t) => -40 + 15 * Math.sin(Math.PI * ((t % 200) / 200));

test('estimator counts envelope peaks with min gap', () => {
  const e = createSyllableEstimator(); let n = 0;
  for (let t = 0; t < 2000; t += 16) if (e.push(envelope(t), t, true)) n++;
  assert.ok(n >= 9 && n <= 11, `got ${n}`);
});

test('estimator ignores non-speaking frames', () => {
  const e = createSyllableEstimator(); let n = 0;
  for (let t = 0; t < 2000; t += 16) if (e.push(envelope(t), t, false)) n++;
  assert.equal(n, 0);
});
