import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateTracker } from '../js/analysis/rate.js';

test('rate: estimates syllables per minute', () => {
  const r = createRateTracker();
  for (let i = 0; i < 50; i++) r.addEstimated(i * 0.2);
  assert.ok(Math.abs(r.rate(10, 10) - 300) < 10, String(r.rate(10, 10)));
});

test('rate: null when speaking too little', () => {
  assert.equal(createRateTracker().rate(5, 1), null);
});

test('rate: early in the session divides by elapsed time, not the full window', () => {
  const r = createRateTracker();
  for (let i = 0; i < 15; i++) r.addEstimated(i * 0.2);   // 3초에 15음절 = 300/분
  assert.ok(Math.abs(r.rate(3, 3) - 300) < 25, String(r.rate(3, 3)));
});
