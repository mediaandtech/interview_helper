// 개인별 다지점 정밀 보정(선택): 카메라 렌즈·화면 중앙·좌우·상하를 차례로 보며 표본을 모으고 개인 경계를 계산합니다.
// 시간이 지났다는 이유만으로 완료하지 않습니다. 유효하고 안정적인 표본이 충분해야 그 방향이 끝납니다.
import { GAZE, PRECISE } from '../config.js';
import { IRIS_DIRS } from './iris-model.js';

/** pos: 화면 안 위치(0~1). lens는 화면 위 가장자리(카메라 쪽) */
export const CALIB_TARGETS = [
  { id: 'lens',   title: '카메라 렌즈',   say: '화면 위쪽의 카메라 렌즈를 보세요', pos: { x: 0.5, y: 0 } },
  { id: 'center', title: '화면 가운데',   say: '가운데 점을 보세요', pos: { x: 0.5, y: 0.5 } },
  { id: 'left',   title: '화면 왼쪽',     say: '고개는 그대로, 왼쪽 점을 눈으로 보세요', pos: { x: 0.05, y: 0.5 } },
  { id: 'right',  title: '화면 오른쪽',   say: '고개는 그대로, 오른쪽 점을 눈으로 보세요', pos: { x: 0.95, y: 0.5 } },
  { id: 'up',     title: '화면 위쪽',     say: '고개는 그대로, 위쪽 점을 눈으로 보세요', pos: { x: 0.5, y: 0.07 } },
  { id: 'down',   title: '화면 아래쪽',   say: '고개는 그대로, 아래쪽 점을 눈으로 보세요', pos: { x: 0.5, y: 0.93 } },
];

export const CALIB_ISSUE_TEXT = {
  'no-face': '얼굴이 보이지 않아요', 'eyes-closed': '눈을 감은 것으로 보여요', 'eyes-uncertain': '눈이 잘 보이지 않아요',
  moving: '고개나 시선이 계속 움직여요', stale: '영상이 멈췄어요', 'no-video': '카메라 영상이 없어요', 'detect-error': '얼굴 인식이 불안정해요',
  'face-small':'눈 영상이 작아요. 카메라와의 거리를 확인하세요', insufficient: '유효한 표본이 부족해요',
};

const SIDES = ['L', 'R'];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) : 0; };

/** 센서 프레임 → 보정용 특징. issue가 있으면 표본으로 쓰지 않음 */
export function frameFeature(d) {
  const reason = d?.quality?.reason ?? (d?.face ? null : 'no-face');
  if (reason) return { issue: reason };
  if (d.fresh === false) return { issue: 'repeat' };
  const f = d.face;
  const eyes = f.eyes ?? null;
  if (eyes) {
    const ok = SIDES.filter((s) => eyes[s]?.state === 'ok');
    if (!ok.length) return { issue: SIDES.every((s) => eyes[s]?.state === 'closed') ? 'eyes-closed' : 'eyes-uncertain' };
  }
  return { issue: null, yaw: f.yaw, pitch: f.pitch, size: f.size ?? null, eye: f.eye, eyes };
}

const okEyes = (feat) => (feat.eyes ? SIDES.filter((s) => feat.eyes[s]?.state === 'ok') : []);
const irisMean = (feat, axis) => { const ok = okEyes(feat); return ok.length ? mean(ok.map((s) => feat.eyes[s].iris[axis])) : 0; };

/** 기본 정면 보정도 눈별 기준과 홍채 기준을 보관합니다. */
export function computeBasicCalibration(features) {
  const good=features.filter(f=>!f.issue);
  if (good.length<10) return null;
  const meanKey=k=>median(good.map(f=>f[k]).filter(Number.isFinite));
  const eye0=Object.fromEntries(IRIS_DIRS.map(k=>[k,mean(good.map(f=>f.eye?.[k]??0))]));
  const aperture={}, eyes0={}, iris0={};
  for (const side of SIDES) {
    const ok=good.filter(f=>f.eyes?.[side]?.state==='ok');
    if (ok.length<5) continue;
    aperture[side]=median(ok.map(f=>f.eyes[side].aperture));
    eyes0[side]=Object.fromEntries(IRIS_DIRS.map(k=>[k,mean(ok.map(f=>f.eyes[side].blend[k]??0))]));
    iris0[side]={x:mean(ok.map(f=>f.eyes[side].iris.x)),y:mean(ok.map(f=>f.eyes[side].iris.y))};
  }
  return {kind:'basic',yaw0:meanKey('yaw'),pitch0:meanKey('pitch'),size0:meanKey('size'),eye0,eyes0,aperture,iris0};
}

/** 한 방향의 표본 수집기 */
export function createTargetCollector(opts = PRECISE) {
  const accepted = [];
  let windowBuf = [];
  const issues = {};
  let lastIssue = null;
  return {
    push(feat, tSec) {
      if (accepted.length >= opts.minSamples) return { state: 'done', progress: 1, issue: null, t: tSec };
      if (tSec >= opts.maxSec) {
        const top = Object.entries(issues).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'insufficient';
        return { state: 'failed', progress: accepted.length / opts.minSamples, issue: top, t: tSec };
      }
      if (tSec < opts.settleSec) return { state: 'settling', progress: 0, issue: null, t: tSec };
      if (feat.issue === 'repeat') return { state: 'collecting', progress: accepted.length / opts.minSamples, issue: lastIssue, t: tSec };
      if (feat.issue) {
        windowBuf = [];
        issues[feat.issue] = (issues[feat.issue] ?? 0) + 1; lastIssue = feat.issue;
        return { state: 'collecting', progress: accepted.length / opts.minSamples, issue: feat.issue, t: tSec };
      }
      if (windowBuf.length && okEyes(windowBuf.at(-1)).join()!==okEyes(feat).join()) windowBuf=[];
      windowBuf.push(feat);
      if (windowBuf.length > opts.windowSize) windowBuf.shift();
      if (windowBuf.length === opts.windowSize) {
        const head = Math.max(sd(windowBuf.map((f) => f.yaw)), sd(windowBuf.map((f) => f.pitch)));
        const iris = Math.max(sd(windowBuf.map((f) => irisMean(f, 'x'))), sd(windowBuf.map((f) => irisMean(f, 'y'))));
        if (head <= opts.maxHeadStdDeg && iris <= opts.maxIrisStd) { accepted.push(feat); lastIssue = null; }
        else { issues.moving = (issues.moving ?? 0) + 1; lastIssue = 'moving'; }
      }
      const done = accepted.length >= opts.minSamples;
      return { state: done ? 'done' : 'collecting', progress: accepted.length / opts.minSamples, issue: done ? null : lastIssue, t: tSec };
    },
    samples() { return accepted.slice(); },
  };
}

function eyeStats(samples, side) {
  const ok = samples.filter((f) => f.eyes?.[side]?.state === 'ok');
  const xs = ok.map((f) => f.eyes[side].iris.x), ys = ok.map((f) => f.eyes[side].iris.y);
  return ok.length ? { x: mean(xs), y: mean(ys), sx: sd(xs), sy: sd(ys), n: ok.length } : null;
}

/** 표본 하나의 blendshape 값(렌즈 기준 대비, 쓸 수 있는 눈 평균) */
function blendRel(f, dir, eyes0, eye0) {
  const ok = okEyes(f);
  if (!ok.length) return (f.eye?.[dir] ?? 0) - (eye0[dir] ?? 0);
  return mean(ok.map((s) => (f.eyes[s].blend[dir] ?? 0) - (eyes0[s]?.[dir] ?? eye0[dir] ?? 0)));
}

const AXIS = { left: ['x', -1], right: ['x', 1], up: ['y', -1], down: ['y', 1] };
const SD_FLOOR = 0.005;

/**
 * 방향별 표본 → 보정값.
 * quality: 'ok' | 'partial'(일부 방향 구분 어려움) | 'insufficient'(렌즈·중앙 기준 부족: 적용하지 않음)
 * @param {Record<string, object[]>} byTarget  frameFeature 표본 배열
 */
export function computeCalibration(byTarget) {
  const enough = (id) => (byTarget?.[id]?.length ?? 0) >= PRECISE.minSamples;
  const missing = ['lens', 'center'].filter((id) => !enough(id));
  if (missing.length) return { kind: 'precise', quality: 'insufficient', missing, weak: [...IRIS_DIRS] };

  const lens = byTarget.lens, center = byTarget.center, front = [...lens, ...center];
  const eye0 = Object.fromEntries(IRIS_DIRS.map((k) => [k, mean(lens.map((f) => f.eye?.[k] ?? 0))]));
  const eyes0 = {}, aperture = {};
  for (const s of SIDES) {
    const ok = lens.filter((f) => f.eyes?.[s]?.state === 'ok');
    if (ok.length) eyes0[s] = Object.fromEntries(IRIS_DIRS.map((k) => [k, mean(ok.map((f) => f.eyes[s].blend[k] ?? 0))]));
    const ap = front.filter((f) => f.eyes?.[s]?.state === 'ok').map((f) => f.eyes[s].aperture);
    if (ap.length) aperture[s] = median(ap);
  }

  // 홍채: 눈마다 정면 구역(렌즈~중앙)과 방향별 경계
  const iris = {}, sepIris = Object.fromEntries(IRIS_DIRS.map((d) => [d, []]));
  for (const s of SIDES) {
    const l = eyeStats(lens, s), c = eyeStats(center, s);
    if (!l || !c) continue;
    const fr = { xMin: Math.min(l.x, c.x), xMax: Math.max(l.x, c.x), yMin: Math.min(l.y, c.y), yMax: Math.max(l.y, c.y) };
    const bound = {};
    for (const d of IRIS_DIRS) {
      const [ax, sign] = AXIS[d];
      const edge = sign < 0 ? fr[`${ax}Min`] : fr[`${ax}Max`];
      const st = enough(d) ? eyeStats(byTarget[d], s) : null;
      const sdF = (l[`s${ax}`] + c[`s${ax}`]) / 2;
      const dist = st ? sign * (st[ax] - edge) : 0;
      const sep = st ? dist / Math.max(SD_FLOOR, Math.sqrt((sdF ** 2 + st[`s${ax}`] ** 2) / 2)) : 0;
      sepIris[d].push(sep);
      bound[d] = sep >= PRECISE.minSeparation ? edge + (sign * dist) / 2 : edge + sign * GAZE.irisSpanDefault[ax];
    }
    iris[s] = { front: fr, bound };
  }
  const irisWeak = IRIS_DIRS.filter((d) => !sepIris[d].length || mean(sepIris[d]) < PRECISE.minSeparation);

  // blendshape: 방향별 신호 분포로 개인 경계(정면 평균과 그 방향 평균의 중간)
  const blendBounds = {}, blendWeak = [];
  for (const d of IRIS_DIRS) {
    if (!enough(d)) { blendWeak.push(d); continue; }
    const vf = front.map((f) => blendRel(f, d, eyes0, eye0)), vd = byTarget[d].map((f) => blendRel(f, d, eyes0, eye0));
    const dist = mean(vd) - mean(vf);
    const sep = dist / Math.max(0.02, Math.sqrt((sd(vf) ** 2 + sd(vd) ** 2) / 2));
    if (sep >= PRECISE.minSeparation) blendBounds[d] = Math.max(0.05, mean(vf) + dist / 2);
    else blendWeak.push(d);
  }

  const weak = IRIS_DIRS.filter((d) => irisWeak.includes(d) || blendWeak.includes(d));
  const at = (samples) => ({ yaw: median(samples.map((f) => f.yaw)), pitch: median(samples.map((f) => f.pitch)),
    iris: Object.fromEntries(SIDES.map((s) => [s, eyeStats(samples, s)]).filter(([, v]) => v).map(([s, v]) => [s, { x: v.x, y: v.y }])) });
  const sizes = front.map((f) => f.size).filter((v) => v != null);
  const lensAt = at(lens);
  return {
    kind: 'precise',
    quality: weak.length ? 'partial' : 'ok',
    weak, irisWeak, blendWeak,
    yaw0: lensAt.yaw, pitch0: lensAt.pitch, eye0, eyes0, aperture,
    size0: sizes.length ? median(sizes) : null,
    lens: lensAt, center: at(center),
    iris0: lensAt.iris,
    iris: { ...iris, weak: irisWeak },
    blendBounds,
    samples: Object.fromEntries(Object.entries(byTarget).map(([k, v]) => [k, v.length])),
  };
}

/** 자세·거리가 보정 때와 계속 다르면 재보정 안내 */
export function createDriftWatch(calib) {
  let since = null;
  return {
    update(face, tSec) {
      if (!calib?.size0 || !face?.size) { since = null; return null; }
      if (Math.abs(face.size / calib.size0 - 1) <= GAZE.recalibSizeRatio) { since = null; return null; }
      since ??= tSec;
      return tSec - since >= GAZE.recalibSec ? 'distance' : null;
    },
  };
}

/**
 * 전체 정밀 보정 진행. UI와 분리되어 있어 시계·센서를 바꿔 끼워 시험할 수 있습니다.
 * @param {{ targets?:object[], readFrame:(nowMs:number)=>object, nextFrame:()=>Promise<number>, onUpdate?:(u:object)=>void, signal?:AbortSignal }} o
 */
export async function runPreciseCalibration({ targets = CALIB_TARGETS, readFrame, nextFrame, onUpdate = () => {}, signal }) {
  const results = {};
  for (const target of targets) {
    if (signal?.aborted) return { cancelled: true, results };
    onUpdate({ target, state: 'start', progress: 0, issue: null });
    const c = createTargetCollector();
    const t0 = await nextFrame();
    let r;
    do {
      const now = await nextFrame();
      if (signal?.aborted) return { cancelled: true, results };
      r = c.push(frameFeature(readFrame(now)), (now - t0) / 1000);
      onUpdate({ target, ...r });
    } while (r.state !== 'done' && r.state !== 'failed');
    results[target.id] = { status: r.state, issue: r.issue, samples: c.samples() };
  }
  const byTarget = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.samples]));
  return { cancelled: false, results, calib: computeCalibration(byTarget) };
}

/** 재연습 때 정밀 보정을 재사용할 수 있는지 기본 렌즈 표본으로 확인합니다. */
export function calibrationCompatible(basic, precise) {
  if(!basic || precise?.kind!=='precise' || precise.quality!=='ok') return false;
  if(Math.abs(basic.yaw0-precise.yaw0)>5 || Math.abs(basic.pitch0-precise.pitch0)>5) return false;
  if(!basic.size0 || !precise.size0 || Math.abs(basic.size0/precise.size0-1)>GAZE.recalibSizeRatio) return false;
  const sides=SIDES.filter(s=>basic.iris0?.[s] && precise.iris0?.[s]);
  if(!sides.length) return false;
  return sides.every(s=>Math.hypot(basic.iris0[s].x-precise.iris0[s].x,basic.iris0[s].y-precise.iris0[s].y)<=PRECISE.maxIrisStd);
}
