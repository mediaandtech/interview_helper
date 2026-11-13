// 시선(정면 응시) 판정: 고개 각도 + 눈동자 방향, 그리고 시간에 따른 상태 추적
import { GAZE } from '../config.js';
import { defaultIrisModel, irisScores } from './iris-model.js';

const DEG = 180 / Math.PI;
const z = (v) => v + 0; // -0 → 0

/** MediaPipe 얼굴 변환 행렬(열 우선 4x4) → 고개 각도(도) */
export function headAnglesFromMatrix(d, flip = { yaw: GAZE.flipYaw, pitch: GAZE.flipPitch }) {
  const s = Math.max(-1, Math.min(1, -d[2] / (Math.hypot(d[0],d[1],d[2]) || 1)));
  const yaw = Math.asin(s) * DEG * (flip.yaw ? -1 : 1);
  const pitch = Math.atan2(d[6], d[10]) * DEG * (flip.pitch ? -1 : 1);
  return { yaw: z(yaw), pitch: z(pitch) };
}

/** 눈 방향 blendshape → { down, up, left, right } (양쪽 눈 평균) */
export function eyeFromBlendshapes(categories) {
  const m = Object.fromEntries(categories.map((c) => [c.categoryName, c.score]));
  const avg = (a, b) => ((m[a] ?? 0) + (m[b] ?? 0)) / 2;
  return {
    down: avg('eyeLookDownLeft', 'eyeLookDownRight'),
    up: avg('eyeLookUpLeft', 'eyeLookUpRight'),
    left: avg('eyeLookOutLeft', 'eyeLookInRight'),
    right: avg('eyeLookInLeft', 'eyeLookOutRight'),
  };
}

const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };

/** 제외 사유 → 사람이 읽는 말 */
export const GAZE_REASON_TEXT = {
  'no-face': '얼굴 미검출', 'eyes-closed': '눈 감김', 'eyes-uncertain': '눈 검출 불안정',
  'out-of-range': '보정 범위 밖', 'no-eye-baseline': '눈 기준 없음', 'face-small': '눈 영상이 너무 작음', stale: '영상 정지', 'no-video': '영상 없음', 'detect-error': '검출 오류', conflict: '고개·눈 방향 충돌',
};

const none = (reason) => ({ frontal: null, reason, dir: 'none', conflict: false,
  head: { ok: false, dir: 'none', yaw: null, pitch: null }, eye: { ok: false, dir: 'none', source: 'none', method: null } });

function pickMax(scores, min) {
  let dir = 'front', max = min;
  for (const k of ['down', 'up', 'left', 'right']) if ((scores[k] ?? 0) > max) { max = scores[k]; dir = k; }
  return { dir, max };
}

/** blendshape 방식: 쓸 수 있는 눈마다 보정 기준을 빼고 평균 */
function eyeByBlend(face, calib, usable) {
  if(face.blendAvailable===false) return {dir:'uncertain',outOfRange:false};
  const th = calib?.eyeThreshold ?? GAZE.eyeThreshold;
  const e0 = calib?.eye0 ?? { down: 0, up: 0, left: 0, right: 0 };
  const scores = {};
  if(usable?.length===2) {
    const individual=usable.map(s=>pickMax(Object.fromEntries(['left','right','up','down'].map(k=>[k,((face.eyes[s].blend[k]??0)-((calib?.eyes0?.[s]??e0)[k]??0))/(calib?.blendBounds?.[k]??th)])),1).dir);
    if(OPP[individual[0]]===individual[1]) return {dir:'uncertain',outOfRange:false};
  }
  for (const k of ['down', 'up', 'left', 'right']) {
    if (!usable) { scores[k] = (face.eye?.[k] ?? 0) - (e0[k] ?? 0); continue; }
    scores[k] = usable.reduce((a, s) => a + (face.eyes[s].blend[k] ?? 0) - ((calib?.eyes0?.[s] ?? e0)[k] ?? 0), 0) / usable.length;
  }
  const normalized = Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,v/(calib?.blendBounds?.[k] ?? th)]));
  const r=pickMax(normalized,1);
  return { ...r, dir:calib?.blendWeak?.includes(r.dir) ? 'uncertain' : r.dir, outOfRange:false };
}

/** 홍채 방식(실험): 눈 안 홍채 위치를 개인 경계와 비교 */
function eyeByIris(face, calib, usable) {
  const models = usable.map((s) => calib?.iris?.[s] ?? defaultIrisModel(calib?.iris0?.[s])).filter(Boolean);
  if (models.length !== usable.length) return null;
  const scores = { left: 0, right: 0, up: 0, down: 0 };
  if(usable.length===2) {
    const individual=usable.map((s,i)=>pickMax(irisScores(face.eyes[s].iris,models[i]),1).dir);
    if(OPP[individual[0]]===individual[1]) return {dir:'uncertain',max:1,outOfRange:false};
  }
  usable.forEach((s, i) => { const sc = irisScores(face.eyes[s].iris, models[i]); for (const k in scores) scores[k] += sc[k] / usable.length; });
  const { dir, max } = pickMax(scores, 1);
  const weak = calib?.iris?.weak ?? [];
  return { dir: weak.includes(dir) ? 'uncertain' : dir, max, outOfRange: max > GAZE.outOfRangeScale };
}

/**
 * 고개와 눈을 따로 판정합니다.
 * - frontal: true/false, 판단할 수 없으면 null(reason에 이유)
 * - 고개가 범위 밖이면 눈 상태와 관계없이 false
 * - 눈 감김·눈 불확실·고개와 눈이 반대 방향이면 null (억지로 한 방향으로 합치지 않음)
 * @param {{method?:'blendshape'|'iris'}} opts
 */
export function analyzeGaze(face, calib, opts = {}) {
  if (!face) return none('no-face');
  const limits = { ...GAZE, ...calib?.gazeLimits };
  const dy = face.yaw - (calib?.yaw0 ?? 0);
  const dp = face.pitch - (calib?.pitch0 ?? 0);
  let headDir = 'front';
  if (Math.abs(dy) > limits.yawDeg) headDir = dy > 0 ? 'right' : 'left';
  else if (Math.abs(dp) > limits.pitchDeg) headDir = dp > 0 ? 'up' : 'down';
  const head = { ok: headDir === 'front', dir: headDir, yaw: dy, pitch: dp };

  let eye;
  if (face.eyes) {
    const sides = ['L', 'R'];
    const usable = sides.filter((s) => face.eyes[s]?.state === 'ok');
    const source = usable.length === 2 ? 'both' : usable[0] ?? 'none';
    if (!usable.length) {
      const closed = sides.every((s) => face.eyes[s]?.state === 'closed');
      eye = { ok: false, dir: closed ? 'closed' : 'uncertain', source, method: null };
    } else {
      const want = opts.method ?? calib?.eyeMethod ?? GAZE.eyeMethod;
      const byIris = want === 'iris' ? eyeByIris(face, calib, usable) : null; // 홍채 기준이 없으면 기본 방식
      const r = want === 'iris' && !byIris ? { dir:'uncertain', outOfRange:false } : byIris ?? eyeByBlend(face, calib, usable);
      eye = { ok: r.dir === 'front', dir: r.dir, source, method: byIris ? 'iris' : 'blendshape', outOfRange: r.outOfRange };
    }
  } else {
    const r = eyeByBlend(face, calib, null);
    eye = { ok: r.dir === 'front', dir: r.dir, source: 'avg', method: 'blendshape' };
  }

  if (eye.outOfRange) return { frontal:null, reason:'out-of-range', dir:'uncertain', head, eye, conflict:false };
  const conflict = !head.ok && OPP[headDir] === eye.dir;
  if (!head.ok && !conflict) return { frontal: false, reason: null, dir: headDir, head, eye, conflict };
  if (conflict) return { frontal: null, reason: 'conflict', dir: 'mixed', head, eye, conflict };
  if (eye.dir === 'closed') return { frontal: null, reason: 'eyes-closed', dir: 'closed', head, eye, conflict };
  if (eye.dir === 'uncertain') return { frontal: null, reason: 'eyes-uncertain', dir: 'uncertain', head, eye, conflict };
  return { frontal: eye.ok, reason: null, dir: eye.dir, head, eye, conflict };
}

/**
 * 센서 프레임(detect 결과) → 판정. 영상 정지·영상 없음·검출 오류는 마지막 얼굴보다 우선합니다.
 */
export function gazeSample(d, calib, opts) {
  const reason = d?.quality?.reason;
  if (reason && reason !== 'no-face') return none(reason);
  return analyzeGaze(d?.face ?? null, calib, opts);
}

/** 보정 기준 대비 정면인지 판정. 얼굴이 없으면 정면 아님 */
export function isFrontal(face, calib) {
  const g = analyzeGaze(face, calib);
  return { frontal: g.frontal === true, dir: g.dir };
}

/** 디버그용 3×3 그리드 칸: col -1(왼)~1(오), row -1(위)~1(아래) */
export function gazeGrid(face, calib) {
  if (!face) return null;
  const g = analyzeGaze(face, calib);
  const limits = { ...GAZE, ...calib?.gazeLimits };
  const pick = (d) => ({ left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[d] ?? [0, 0]);
  const [hc, hr] = [Math.sign(Math.trunc(g.head.yaw / limits.yawDeg)), -Math.sign(Math.trunc(g.head.pitch / limits.pitchDeg))];
  const [ec, er] = pick(g.eye.dir);
  return { col: hc || ec, row: hr || er };
}

/**
 * 시간에 따른 시선 상태.
 * - 연속 이탈 warnSec 이상 주황, badSec 이상 빨강
 * - 정면 복귀 후 recoverSec 동안 직전 상태 유지
 * - forgiveSec 미만 이탈은 비율 계산에서 정면으로 봐줌
 * - badSec 이상 이탈은 이벤트로 기록
 */
export function createGazeTracker(target) {
  const hist = [];          // { t, ok } 최근 ratioWindowSec
  const events = [];
  let run = null;           // 진행 중인 이탈 { start, dir, firstIdx }
  let backAt = -Infinity;
  let lastAwayStatus = 'ok';
  let totOk = 0, totN = 0;  // 세션 전체 누적

  const awayStatus = (sec) => (sec >= GAZE.badSec ? 'bad' : sec >= GAZE.warnSec ? 'warn' : 'ok');

  function closeRun(tSec) {
    const dur = tSec - run.start;
    if (dur < GAZE.forgiveSec) {
      for (const h of hist) if (h.t >= run.start) h.ok = true;
      totOk += run.count;
    }
    if (dur >= GAZE.badSec) events.push({ start: run.start, dur, dir: run.dir });
    lastAwayStatus = awayStatus(dur);
    backAt = tSec;
    run = null;
  }

  function ratio() {
    if (hist.length === 0) return null;
    return hist.filter((h) => h.ok).length / hist.length;
  }

  const cumulative = () => (totN ? totOk / totN : null);

  return {
    update(frontal, dir, tSec) {
      if (frontal === null) {
        if (run) closeRun(tSec);
        return { status: 'idle', awaySec: 0, ratio: null, cumulative: cumulative(), dir: 'none' };
      }
      totN++;
      if (frontal) totOk++;
      hist.push({ t: tSec, ok: frontal });
      while (hist.length && hist[0].t < tSec - GAZE.ratioWindowSec) hist.shift();

      let status, awaySec = 0;
      if (!frontal) {
        if (!run) run = { start: tSec, dir, count: 0 };
        run.count++;
        awaySec = tSec - run.start;
        status = awayStatus(awaySec);
        if (status === 'ok' && tSec - backAt < GAZE.recoverSec) status = lastAwayStatus;
      } else {
        if (run) closeRun(tSec);
        status = tSec - backAt < GAZE.recoverSec ? lastAwayStatus : 'ok';
      }
      return { status, awaySec, ratio: ratio(), cumulative: cumulative(), dir: frontal ? 'front' : dir };
    },
    flush(tSec) { if (run) closeRun(tSec); },
    events() { return events.map((e) => ({ ...e })); },
    ratio,
  };
}
