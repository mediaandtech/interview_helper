import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EYE_POINTS, eyeGeometry, perEyeBlendshapes, eyeState } from '../js/analysis/eye-signal.js';

// 이미지 좌표의 눈 하나를 만듭니다. cx,cy 중심, w 너비, ap 세로/가로 열림, iris(눈 너비 단위, 이미지 x/y 방향 이동), rot 기울기
function eyeLm(side, { cx = 0.4, cy = 0.4, w = 0.06, ap = 0.3, iris = [0, 0], rot = 0 } = {}) {
  const P = EYE_POINTS[side];
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (u, v) => ({ x: cx + (u * c - v * s) * w, y: cy + (u * s + v * c) * w });
  const lm = [];
  lm[P.imgL] = at(-0.5, 0); lm[P.imgR] = at(0.5, 0);
  lm[P.top] = at(0, -ap / 2); lm[P.bottom] = at(0, ap / 2);
  lm[P.iris] = at(iris[0], iris[1]);
  return lm;
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('iris position is normalized by eye width and tilt', () => {
  const a = eyeGeometry(eyeLm('R', { iris: [0.1, 0.05] }), 'R');
  const b = eyeGeometry(eyeLm('R', { iris: [0.1, 0.05], w: 0.12, rot: 0.3, cx: 0.2 }), 'R');
  assert.ok(near(a.iris.x, b.iris.x) && near(a.iris.y, b.iris.y), JSON.stringify([a.iris, b.iris]));
  assert.ok(near(a.aperture, 0.3) && near(b.aperture, 0.3));
});

test('iris x is in user direction: image right (+x) means the user looks to their left (negative)', () => {
  const g = eyeGeometry(eyeLm('L', { iris: [0.1, 0] }), 'L');
  assert.ok(g.iris.x < 0, String(g.iris.x));
  const flipped = eyeGeometry(eyeLm('L', { iris: [0.1, 0] }), 'L', true);
  assert.ok(flipped.iris.x > 0);
});

test('missing or degenerate landmarks give no geometry; missing iris gives iris null', () => {
  assert.equal(eyeGeometry(null, 'L'), null);
  assert.equal(eyeGeometry(eyeLm('L', { w: 0 }), 'L'), null);
  const lm = eyeLm('L'); delete lm[EYE_POINTS.L.iris];
  assert.equal(eyeGeometry(lm, 'L').iris, null);
});

test('perEyeBlendshapes keeps each eye separate in user directions', () => {
  const cats = [['eyeLookOutLeft', 0.8], ['eyeLookInRight', 0.6], ['eyeBlinkLeft', 0.9], ['eyeLookDownRight', 0.4]]
    .map(([categoryName, score]) => ({ categoryName, score }));
  const e = perEyeBlendshapes(cats);
  assert.equal(e.L.left, 0.8); assert.equal(e.R.left, 0.6);
  assert.equal(e.L.blink, 0.9); assert.equal(e.R.blink, 0);
  assert.equal(e.R.down, 0.4); assert.equal(e.L.down, 0);
});

const geo = (ap, iris = [0, 0]) => eyeGeometry(eyeLm('L', { ap, iris }), 'L');
const bl = (o) => ({ down: 0, up: 0, left: 0, right: 0, blink: 0, ...o });

test('eyeState: a blink (narrow lids + blink signal) is closed', () => {
  assert.equal(eyeState(geo(0.08), bl({ blink: 0.8 })), 'closed');
  assert.equal(eyeState(geo(0.3), bl({ blink: 0.1 })), 'ok');
});

test('eyeState: looking down narrows the lids but is not a blink', () => {
  // 아래를 보면 눈꺼풀이 내려와도 아래 신호가 감김 신호보다 큼
  assert.equal(eyeState(geo(0.11), bl({ blink: 0.55, down: 0.8 })), 'ok');
  // 아주 좁으면 방향과 상관없이 감김
  assert.equal(eyeState(geo(0.02), bl({ blink: 0.3, down: 0.8 })), 'closed');
});

test('eyeState: personal open-eye baseline sets the closed threshold', () => {
  // 평소 눈이 가는 사람(0.18): 0.12는 감김 아님
  assert.equal(eyeState(geo(0.12), bl({ blink: 0.6 }), { aperture: 0.18 }), 'ok');
  assert.equal(eyeState(geo(0.07), bl({ blink: 0.6 }), { aperture: 0.18 }), 'closed');
});

test('eyeState: iris outside the eye or missing geometry is unusable', () => {
  assert.equal(eyeState(geo(0.3, [0.9, 0]), bl()), 'unstable');
  assert.equal(eyeState(null, bl()), 'missing');
  const lm = eyeLm('L'); delete lm[EYE_POINTS.L.iris];
  assert.equal(eyeState(eyeGeometry(lm, 'L'), bl()), 'unstable');
});

test('pixel aspect ratio is corrected before eye tilt normalization',()=>{
  const original=eyeLm('R',{rot:.4,iris:[.1,.05]});
  const aspect=16/9;
  const stretched=original.map(p=>p&&({...p,x:p.x/aspect}));
  const a=eyeGeometry(original,'R'),b=eyeGeometry(stretched,'R',false,aspect);
  assert.ok(near(a.iris.x,b.iris.x)&&near(a.iris.y,b.iris.y));
  assert.ok(near(a.aperture,b.aperture));
});
