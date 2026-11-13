import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../js/analysis/scoring.js';
import { createRecorder } from '../js/recorder.js';

const SET = { presetKey: 'class', durationSec: 300, rateMin: 270, rateMax: 330, gazeTarget: 0.8, calib: { baseDb: -20 } };

function mk(sec, fn = () => ({})) {
  const out = [];
  for (let i = 0; i < sec * 10; i++) {
    const t = i / 10;
    const s = { t, frontal: true, dir: 'front', speaking: true, db: -20, deltaDb: 0,
      hz: 200 * 2 ** (3 * Math.sin(t) / 12), rate: 300 };
    out.push({ ...s, ...fn(s) });
  }
  return out;
}

test('recorder keeps samples in order', () => {
  const r = createRecorder(); r.push({ t: 0 }); r.push({ t: 0.1 });
  assert.deepEqual(r.samples().map((s) => s.t), [0, 0.1]);
});

test('empty/short session', () => {
  assert.equal(buildReport([], SET).tooShort, true);
  const r = buildReport(mk(5), SET);
  assert.equal(r.tooShort, true); assert.equal(r.score, null);
});

test('perfect session scores ≥ 95 with praise tips', () => {
  const r = buildReport(mk(300), SET);
  assert.ok(r.score >= 95, String(r.score)); assert.equal(r.tips.length, 3);
});

test('7s look-down at 1:37 becomes a tip', () => {
  const r = buildReport(mk(300, (s) => (s.t >= 97 && s.t < 104) ? { frontal: false, dir: 'down' } : {}), SET);
  assert.ok(r.tips.some((x) => x.t === 97 && x.text.includes('1:37') && x.text.includes('7초') && x.text.includes('아래')),
    JSON.stringify(r.tips));
  assert.equal(r.gazeEvents.length, 1);
});

test('short glances forgiven', () => {
  const r = buildReport(mk(300, (s) => (Math.floor(s.t) % 20 === 0) ? { frontal: false, dir: 'right' } : {}), SET);
  assert.equal(r.metrics.gaze.pct, 100);
});

test('quiet after 3:50 becomes top volume tip', () => {
  const r = buildReport(mk(324, (s) => s.t >= 230 ? { deltaDb: -12 } : {}), SET);
  const tip = r.tips.find((x) => x.t === 230);
  assert.ok(tip, JSON.stringify(r.tips));
  assert.ok(tip.text.includes('3:50') && tip.text.includes('작아졌어요'));
  assert.equal(r.metrics.time.text, '+0:24');
  assert.ok(r.headline.endsWith('가장 아쉬워요.'), r.headline);
});

test('silence not penalized', () => {
  const r = buildReport(mk(300, (s) => (s.t % 10 < 3) ? { speaking: false, db: -60, deltaDb: -40, hz: null, rate: null } : {}), SET);
  assert.equal(r.metrics.volume.outPct, 0);
});

test('missing gaze data renormalizes weights', () => {
  const r = buildReport(mk(300, () => ({ frontal: null, dir: 'none' })), SET);
  assert.equal(r.metrics.gaze, null); assert.ok(r.score >= 95, String(r.score));
});

test('monotone voice flagged', () => {
  const r = buildReport(mk(300, () => ({ hz: 200 })), SET);
  assert.equal(r.metrics.pitch.label, '단조');
  assert.ok(r.tips.some((x) => x.text.includes('억양')));
});

test('fast speech segment becomes a tip', () => {
  const r = buildReport(mk(300, (s) => (s.t >= 60 && s.t < 80) ? { rate: 380 } : {}), SET);
  assert.ok(r.tips.some((x) => x.t === 60 && x.text.includes('빨라졌어요')), JSON.stringify(r.tips));
});

test('a long look-away always makes the top 3 tips (gaze is the main metric)', () => {
  const r = buildReport(mk(324, (s) => ({
    ...(s.t >= 97 && s.t < 104 ? { frontal: false, dir: 'down' } : {}),
    ...(s.t >= 230 ? { deltaDb: -12 } : {}),
    rate: s.t >= 30 && s.t < 70 ? 250 : s.t >= 150 && s.t < 190 ? 360 : 300,
  })), SET);
  assert.ok(r.tips.some((x) => x.t === 97 && x.text.includes('아래')), JSON.stringify(r.tips));
});

test('report lists every out-of-range stretch with start and duration', () => {
  const r = buildReport(mk(324, (s) => ({
    ...(s.t >= 97 && s.t < 104 ? { frontal: false, dir: 'down' } : {}),
    ...(s.t >= 230 ? { deltaDb: -12 } : {}),
  })), SET);
  const gaze = r.issues.find((i) => i.metric === 'gaze');
  assert.deepEqual({ ...gaze, dur: Math.round(gaze.dur) }, { metric: 'gaze', label: '시선 아래', start: 97, dur: 7 });
  const vol = r.issues.find((i) => i.metric === 'volume');
  assert.equal(vol.label, '목소리 작음'); assert.equal(vol.start, 230); assert.ok(vol.dur > 90);
  assert.deepEqual(r.issues.map((i) => i.start), [...r.issues.map((i) => i.start)].sort((a, b) => a - b));
});
