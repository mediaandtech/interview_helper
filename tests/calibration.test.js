import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRECISE } from '../js/config.js';
import { CALIB_TARGETS, createTargetCollector, computeCalibration, createDriftWatch, runPreciseCalibration, frameFeature } from '../js/analysis/calibration.js';
import { analyzeGaze } from '../js/analysis/gaze-logic.js';

// 방향별로 보고 있을 때의 '진짜' 홍채 위치(눈 너비 단위)와 blendshape
const TRUTH = {
  lens:   { iris: { x: 0, y: -0.02 }, blend: {} },
  center: { iris: { x: 0, y: 0.02 },  blend: {} },
  left:   { iris: { x: -0.12, y: 0.02 }, blend: { left: 0.6 } },
  right:  { iris: { x: 0.12, y: 0.02 },  blend: { right: 0.6 } },
  up:     { iris: { x: 0, y: -0.1 },  blend: { up: 0.5 } },
  down:   { iris: { x: 0, y: 0.12 },  blend: { down: 0.7 } },
};
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const B = (o) => ({ down: 0.05, up: 0, left: 0, right: 0, blink: 0, ...o });

function frame(target, { noise = 0.01, yaw = 0, pitch = 0, state = 'ok', reason = null, size = 0.16, fresh = true } = {}) {
  const tr = TRUTH[target];
  const eye = () => ({ state, aperture: 0.3, width: 0.06, blend: B(tr.blend),
    iris: { x: tr.iris.x + rnd() * noise, y: tr.iris.y + rnd() * noise } });
  return { fresh, quality: { reason, eyes: { L: state, R: state } },
    face: { yaw: yaw + rnd() * 0.5, pitch: pitch + rnd() * 0.5, size, eye: B(tr.blend), eyes: { L: eye(), R: eye() } } };
}

function collect(target, opts, sec = 3, hz = 30) {
  const c = createTargetCollector();
  let r;
  for (let i = 0; i <= sec * hz; i++) { r = c.push(frameFeature(frame(target, opts(i))), i / hz); if (r.state === 'done' || r.state === 'failed') break; }
  return { r, samples: c.samples() };
}

test('targets: camera lens and screen center are separate, plus 4 directions', () => {
  assert.deepEqual(CALIB_TARGETS.map((t) => t.id), ['lens', 'center', 'left', 'right', 'up', 'down']);
});

test('collector ignores the settle period, then finishes on enough stable samples (not on time)', () => {
  const { r, samples } = collect('center', () => ({}));
  assert.equal(r.state, 'done');
  assert.equal(samples.length, PRECISE.minSamples);
  assert.ok(r.t >= PRECISE.settleSec, String(r.t));
  assert.ok(r.t < 2, String(r.t));
});

test('collector does not finish while the head is moving and fails after maxSec with the reason', () => {
  const { r, samples } = collect('center', (i) => ({ yaw: (i % 10) * 2 }), PRECISE.maxSec + 1);
  assert.equal(r.state, 'failed'); assert.equal(r.issue, 'moving');
  assert.ok(samples.length < PRECISE.minSamples);
});

test('collector rejects closed eyes, missing face and stale frames', () => {
  for (const [opts, issue] of [[{ state: 'closed' }, 'eyes-closed'], [{ reason: 'no-face' }, 'no-face'], [{ reason: 'stale' }, 'stale']]) {
    const { r } = collect('center', () => opts, PRECISE.maxSec + 1);
    assert.equal(r.state, 'failed', issue); assert.equal(r.issue, issue);
  }
});

test('collector: repeated (not fresh) frames are not counted twice', () => {
  const c = createTargetCollector();
  const f = frameFeature(frame('center'));
  for (let i = 0; i <= 90; i++) c.push(i === 0 ? f : frameFeature({ ...frame('center'), fresh: false }), i / 30);
  assert.equal(c.samples().length, 0);
});

function fullRun(override = {}) {
  const res = {};
  for (const t of CALIB_TARGETS) res[t.id] = collect(override[t.id] ?? t.id, () => ({})).samples;
  return res;
}

test('computeCalibration: good data → ok, lens baseline, center kept separately, personal boundaries', () => {
  const c = computeCalibration(fullRun());
  assert.equal(c.quality, 'ok', JSON.stringify(c.weak));
  assert.ok(Math.abs(c.yaw0) < 1 && Math.abs(c.pitch0) < 1);
  assert.ok(c.lens && c.center && c.center.iris.L.y > c.lens.iris.L.y);
  const m = c.iris.L;
  assert.ok(m.bound.left < m.front.xMin && m.bound.left > TRUTH.left.iris.x, JSON.stringify(m));
  assert.ok(c.aperture.L > 0.2 && c.size0 > 0);
  // 보정값으로 방향 판정
  const look = (t) => analyzeGaze(frame(t, { noise: 0 }).face, c, { method: 'iris' }).eye.dir;
  assert.deepEqual(['lens', 'center', 'left', 'right', 'down'].map(look), ['front', 'front', 'left', 'right', 'down']);
  const blend = (t) => analyzeGaze(frame(t, { noise: 0 }).face, c, { method: 'blendshape' }).eye.dir;
  assert.deepEqual(['center', 'left', 'right', 'down'].map(blend), ['front', 'left', 'right', 'down']);
});

test('computeCalibration: a direction that looks like the center is marked weak, not successful', () => {
  const c = computeCalibration(fullRun({ left: 'center' }));
  assert.notEqual(c.quality, 'ok');
  assert.ok(c.weak.includes('left'), JSON.stringify(c.weak));
  // 구분이 안 되는 방향은 그 방향으로 단정하지 않음
  const g = analyzeGaze(frame('left', { noise: 0 }).face, c, { method: 'iris' });
  assert.notEqual(g.eye.dir, 'left');
});

test('computeCalibration: missing lens/center or too few samples → insufficient', () => {
  const run = fullRun();
  assert.equal(computeCalibration({ ...run, lens: [] }).quality, 'insufficient');
  assert.equal(computeCalibration({ ...run, center: run.center.slice(0, 3) }).quality, 'insufficient');
  assert.equal(computeCalibration({}).quality, 'insufficient');
});

test('drift watch: sustained face-size change suggests recalibration; brief change does not', () => {
  const c = computeCalibration(fullRun());
  const w = createDriftWatch(c);
  let r;
  for (let i = 0; i < 20; i++) r = w.update(frame('center', { size: c.size0 * 1.5 }).face, i * 0.1);
  assert.equal(r, null);
  for (let i = 20; i < 60; i++) r = w.update(frame('center', { size: c.size0 * 1.5 }).face, i * 0.1);
  assert.equal(r, 'distance');
  r = w.update(frame('center', { size: c.size0 }).face, 6.1);
  assert.equal(r, null);
  assert.equal(createDriftWatch(null).update(frame('center').face, 0), null);
});

test('runPreciseCalibration: cancel stops reading frames; retry runs from scratch', async () => {
  let now = 0, reads = 0;
  const ctrl = new AbortController();
  const nextFrame = async () => (now += 1000 / 30);
  const readFrame = () => { reads++; if (reads === 40) ctrl.abort(); return frame('center'); };
  const r = await runPreciseCalibration({ readFrame, nextFrame, signal: ctrl.signal });
  assert.equal(r.cancelled, true);
  assert.equal(reads, 40);

  const order = [];
  const r2 = await runPreciseCalibration({
    readFrame: () => frame(order.at(-1)), nextFrame,
    onUpdate: (u) => { if (u.state === 'start') order.push(u.target.id); },
  });
  assert.equal(r2.cancelled, false);
  assert.deepEqual(order, CALIB_TARGETS.map((t) => t.id));
  assert.equal(r2.calib.quality, 'ok');
});

test('runPreciseCalibration: a failed target does not make the calibration successful', async () => {
  let now = 0, current;
  const r = await runPreciseCalibration({
    readFrame: () => frame(current, current === 'right' ? { reason: 'no-face' } : {}),
    nextFrame: async () => (now += 1000 / 30),
    onUpdate: (u) => { if (u.state === 'start') current = u.target.id; },
  });
  assert.equal(r.results.right.status, 'failed');
  assert.notEqual(r.calib.quality, 'ok');
  assert.ok(r.calib.weak.includes('right'));
});

test('basic calibration stores per-eye aperture and iris references', async()=>{
  const {computeBasicCalibration}=await import('../js/analysis/calibration.js');
  const features=Array.from({length:20},()=>frameFeature(frame('lens')));
  const c=computeBasicCalibration(features);
  assert.equal(c.kind,'basic');assert.ok(c.aperture.L>0);assert.ok(c.iris0.R);assert.ok(c.eyes0.L);
  assert.equal(computeBasicCalibration(features.slice(0,3)),null);
});
test('saved precise calibration is reused only after a compatible lens check',async()=>{
  const {computeBasicCalibration,calibrationCompatible}=await import('../js/analysis/calibration.js');
  const precise=computeCalibration(fullRun());
  const basic=computeBasicCalibration(Array.from({length:20},()=>frameFeature(frame('lens'))));
  assert.equal(calibrationCompatible(basic,precise),true);
  assert.equal(calibrationCompatible({...basic,size0:basic.size0*1.6},precise),false);
  assert.equal(calibrationCompatible({...basic,yaw0:20},precise),false);
  assert.equal(calibrationCompatible({...basic,iris0:{L:{x:.4,y:.4},R:{x:.4,y:.4}}},precise),false);
  assert.equal(calibrationCompatible(basic,{...precise,quality:'partial'}),false);
});
