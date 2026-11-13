import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeProgress } from '../js/analysis/classify.js';
import { gaugePercent, rateGaugeRange } from '../js/util/gauge.js';
import { STATUS_COLORS, THEME } from '../js/config.js';

const S = { rateMin: 270, rateMax: 330 };

test('time progress clamps at 1', () => {
  assert.equal(timeProgress(150, 300), 0.5);
  assert.equal(timeProgress(400, 300), 1);
});

test('gauge math', () => {
  assert.equal(gaugePercent(0, -15, 15), 50);
  assert.equal(gaugePercent(-40, -15, 15), 0);
  assert.equal(gaugePercent(99, -15, 15), 100);
  assert.deepEqual(rateGaugeRange(S), { min: 180, max: 420 });
});

test('theme and status colors live in config', () => {
  assert.equal(THEME.bg, '#0a0a0a'); assert.equal(THEME.card, '#171717');
  assert.deepEqual([STATUS_COLORS.ok, STATUS_COLORS.warn, STATUS_COLORS.bad], ['#4ade80', '#fbbf24', '#ff6467']);
});
