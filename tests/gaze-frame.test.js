import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGazeFrameBuilder, frameFreshness } from '../js/analysis/gaze-frame.js';
import { EYE_POINTS } from '../js/analysis/eye-signal.js';
import { analyzeGaze, gazeSample } from '../js/analysis/gaze-logic.js';

const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function landmarks({ apL = 0.3, apR = 0.3, irisL = [0, 0], irisR = [0, 0], wL = 0.06, wR = 0.06 } = {}) {
  const lm = [];
  const put = (side, cx, w, ap, iris) => {
    const P = EYE_POINTS[side];
    lm[P.imgL] = { x: cx - w / 2, y: 0.4 }; lm[P.imgR] = { x: cx + w / 2, y: 0.4 };
    lm[P.top] = { x: cx, y: 0.4 - (ap * w) / 2 }; lm[P.bottom] = { x: cx, y: 0.4 + (ap * w) / 2 };
    lm[P.iris] = { x: cx + iris[0] * w, y: 0.4 + iris[1] * w };
  };
  put('R', 0.42, wR, apR, irisR); put('L', 0.58, wL, apL, irisL);
  return lm;
}
const cats = (o = {}) => Object.entries(o).map(([categoryName, score]) => ({ categoryName, score }));
const raw = (o = {}) => ({ landmarks: landmarks(o.lm), matrix: I, blendshapes: cats(o.bs), nowMs: o.t ?? 0, fresh: true, ...o.extra });

test('frameFreshness: new video time is fresh; frozen video becomes stale after staleMs', () => {
  assert.deepEqual(frameFreshness({ videoTime: 1, lastVideoTime: 0.9, nowMs: 1000, lastFreshMs: 990, staleMs: 500 }), { fresh: true, stale: false, ageMs: 0 });
  assert.deepEqual(frameFreshness({ videoTime: 1, lastVideoTime: 1, nowMs: 1200, lastFreshMs: 1000, staleMs: 500 }), { fresh: false, stale: false, ageMs: 200 });
  assert.deepEqual(frameFreshness({ videoTime: 1, lastVideoTime: 1, nowMs: 1600, lastFreshMs: 1000, staleMs: 500 }), { fresh: false, stale: true, ageMs: 600 });
});

test('builder: both eyes open → both used, legacy average eye kept', () => {
  const b = createGazeFrameBuilder();
  const f = b.build(raw({ bs: { eyeLookDownLeft: 0.6, eyeLookDownRight: 0.4 } }));
  assert.equal(f.quality.reason, null);
  assert.deepEqual([f.quality.eyes.L, f.quality.eyes.R], ['ok', 'ok']);
  assert.ok(Math.abs(f.face.eye.down - 0.5) < 1e-9);
  assert.ok(f.face.size > 0);
});

test('builder: no face → reason no-face; detector error → detect-error', () => {
  const b = createGazeFrameBuilder();
  assert.equal(b.build({ landmarks: null, matrix: null, nowMs: 0, fresh: true }).quality.reason, 'no-face');
  assert.equal(b.build({ error: true, nowMs: 0, fresh: true }).quality.reason, 'detect-error');
});

test('builder: one eye covered (closed) → only the other eye feeds the average', () => {
  const b = createGazeFrameBuilder();
  const f = b.build(raw({ lm: { apL: 0.05 }, bs: { eyeBlinkLeft: 0.9, eyeLookOutRight: 0.7 } }));
  assert.deepEqual([f.quality.eyes.L, f.quality.eyes.R], ['closed', 'ok']);
  assert.equal(f.face.eye.right, 0.7); // 오른쪽 눈 값만
});

test('builder: a much smaller eye (occluded/foreshortened) is excluded as unstable', () => {
  const b = createGazeFrameBuilder();
  const f = b.build(raw({ lm: { wL: 0.025 } }));
  assert.equal(f.quality.eyes.L, 'unstable'); assert.equal(f.quality.eyes.R, 'ok');
});

test('builder: jittery iris across frames marks the eye unstable', () => {
  const b = createGazeFrameBuilder();
  let f;
  for (let i = 0; i < 6; i++) f = b.build(raw({ t: i * 33, lm: { irisL: [i % 2 ? 0.25 : -0.25, 0] } }));
  assert.equal(f.quality.eyes.L, 'unstable'); assert.equal(f.quality.eyes.R, 'ok');
});

const calib = { yaw0: 0, pitch0: 0, eye0: { down: 0, up: 0, left: 0, right: 0 } };

test('analyzeGaze: both eyes closed is excluded (frontal null, eyes-closed), not "down"', () => {
  const f = createGazeFrameBuilder().build(raw({ lm: { apL: 0.04, apR: 0.04 }, bs: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9, eyeLookDownLeft: 0.6, eyeLookDownRight: 0.6 } }));
  const g = analyzeGaze(f.face, calib);
  assert.equal(g.frontal, null); assert.equal(g.reason, 'eyes-closed'); assert.equal(g.eye.dir, 'closed');
  assert.equal(g.head.ok, true);
});

test('analyzeGaze: eyes unusable → no direction guessed', () => {
  const f = createGazeFrameBuilder().build(raw({ lm: { irisL: [0.9, 0], irisR: [0.9, 0] } }));
  const g = analyzeGaze(f.face, calib);
  assert.equal(g.frontal, null); assert.equal(g.reason, 'eyes-uncertain'); assert.equal(g.eye.source, 'none');
});

test('analyzeGaze: head turned away is known even with eyes closed', () => {
  const f = createGazeFrameBuilder().build(raw({ lm: { apL: 0.04, apR: 0.04 }, bs: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.9 } }));
  const g = analyzeGaze({ ...f.face, yaw: 30 }, calib);
  assert.equal(g.frontal, false); assert.equal(g.dir, 'right');
});

test('analyzeGaze: single eye is reported as the source', () => {
  const f = createGazeFrameBuilder().build(raw({ lm: { apL: 0.05 }, bs: { eyeBlinkLeft: 0.9, eyeLookOutRight: 0.8 } }));
  const g = analyzeGaze(f.face, calib);
  assert.equal(g.eye.source, 'R'); assert.equal(g.eye.dir, 'right'); assert.equal(g.frontal, false);
});

test('analyzeGaze: no face → frontal null with reason, not a frontal judgment', () => {
  const g = analyzeGaze(null, calib);
  assert.equal(g.frontal, null); assert.equal(g.reason, 'no-face');
});

test('gazeSample: stale or missing video wins over the last face', () => {
  const f = createGazeFrameBuilder().build(raw({bs:{eyeBlinkLeft:0,eyeBlinkRight:0}}));
  const fresh = gazeSample(f, calib);
  assert.equal(fresh.frontal, true); assert.equal(fresh.reason, null);
  const stale = gazeSample({ ...f, quality: { ...f.quality, reason: 'stale' } }, calib);
  assert.equal(stale.frontal, null); assert.equal(stale.reason, 'stale');
  const none = gazeSample({ face: null, landmarks: null, quality: { reason: 'no-video' } }, calib);
  assert.equal(none.frontal, null); assert.equal(none.reason, 'no-video');
  // 이전 형식(quality 없음)도 받음
  assert.equal(gazeSample({ face: null, landmarks: null }, calib).reason, 'no-face');
});

test('builder excludes eyes too small in source pixels and malformed head matrices',()=>{
  const b=createGazeFrameBuilder();
  assert.equal(b.build(raw({extra:{imageHeight:100}})).quality.reason,'face-small');
  assert.equal(b.build({...raw(),matrix:[NaN]}).quality.reason,'detect-error');
});

test('missing blendshape output is uncertain rather than four zero signals meaning front',()=>{
  const f=createGazeFrameBuilder().build(raw());
  assert.equal(analyzeGaze(f.face,{}).frontal,null);
});
