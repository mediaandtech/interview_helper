import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLabel, volumeLabel, classifyPitchVar, classifyTime, timeProgress } from '../js/analysis/classify.js';
import { gaugePercent, rateGaugeRange } from '../js/util/gauge.js';
import { formatOverClock } from '../js/util/time.js';
import { STATUS_COLORS, THEME } from '../js/config.js';

const S = { rateMin: 270, rateMax: 330 };

test('rateLabel: state words come first', () => {
  assert.equal(rateLabel(null, S), '측정 대기');
  assert.equal(rateLabel(250, S), '느림');
  assert.equal(rateLabel(300, S), '적정');
  assert.equal(rateLabel(360, S), '빠름');
});

test('volumeLabel: silence is not "작음"', () => {
  assert.equal(volumeLabel(null, false, false), '측정 대기');
  assert.equal(volumeLabel(-30, false, true), '쉬는 중');
  assert.equal(volumeLabel(-8, true, true), '작음');
  assert.equal(volumeLabel(0, true, true), '적정');
  assert.equal(volumeLabel(10, true, true), '큼');
});

test('pitch label waits for data', () => {
  assert.deepEqual(classifyPitchVar(null), { status: 'idle', label: '측정 대기' });
});

test('live timer shows overtime as +MM:SS and progress clamps at 1', () => {
  assert.equal(formatOverClock(24), '+00:24');
  assert.deepEqual(classifyTime(324, 300), { status: 'bad', text: '+00:24' });
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
  assert.equal(THEME.bg, '#111820'); assert.equal(THEME.panel, '#1d2935');
  assert.deepEqual([STATUS_COLORS.ok, STATUS_COLORS.warn, STATUS_COLORS.bad], ['#73bf69', '#ff9830', '#f2495c']);
});
