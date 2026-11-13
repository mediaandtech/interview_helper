import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countHangulSyllables, createSyllableEstimator } from '../js/analysis/syllables.js';

test('countHangulSyllables', () => {
  assert.equal(countHangulSyllables('안녕하세요, 발표를 시작하겠습니다'), 15);
  assert.equal(countHangulSyllables('AI 3개'), 1);
  assert.equal(countHangulSyllables(''), 0);
});

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
