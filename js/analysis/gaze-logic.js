// 시선(정면 응시) 판정: 고개 각도 + 눈동자 방향, 그리고 시간에 따른 상태 추적
import { GAZE } from '../config.js';

const DEG = 180 / Math.PI;
const z = (v) => v + 0; // -0 → 0

/** MediaPipe 얼굴 변환 행렬(열 우선 4x4) → 고개 각도(도) */
export function headAnglesFromMatrix(d) {
  const s = Math.max(-1, Math.min(1, -d[2]));
  return { yaw: z(Math.asin(s) * DEG), pitch: z(Math.atan2(d[6], d[10]) * DEG) };
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

/** 보정 기준 대비 정면인지 판정. 얼굴이 없으면 정면 아님 */
export function isFrontal(face, calib) {
  if (!face) return { frontal: false, dir: 'none' };
  const dy = face.yaw - (calib?.yaw0 ?? 0);
  const dp = face.pitch - (calib?.pitch0 ?? 0);
  if (Math.abs(dy) > GAZE.yawDeg) return { frontal: false, dir: dy > 0 ? 'right' : 'left' };
  if (Math.abs(dp) > GAZE.pitchDeg) return { frontal: false, dir: dp > 0 ? 'up' : 'down' };

  const e0 = calib?.eye0 ?? { down: 0, up: 0, left: 0, right: 0 };
  let dir = null, max = GAZE.eyeThreshold;
  for (const k of ['down', 'up', 'left', 'right']) {
    const v = (face.eye?.[k] ?? 0) - (e0[k] ?? 0);
    if (v > max) { max = v; dir = k; }
  }
  return dir ? { frontal: false, dir } : { frontal: true, dir: 'front' };
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

  const awayStatus = (sec) => (sec >= GAZE.badSec ? 'bad' : sec >= GAZE.warnSec ? 'warn' : 'ok');

  function closeRun(tSec) {
    const dur = tSec - run.start;
    if (dur < GAZE.forgiveSec) {
      for (const h of hist) if (h.t >= run.start) h.ok = true;
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

  return {
    update(frontal, dir, tSec) {
      if (frontal === null) {
        if (run) closeRun(tSec);
        return { status: 'idle', awaySec: 0, ratio: null, dir: 'none' };
      }
      hist.push({ t: tSec, ok: frontal });
      while (hist.length && hist[0].t < tSec - GAZE.ratioWindowSec) hist.shift();

      let status, awaySec = 0;
      if (!frontal) {
        if (!run) run = { start: tSec, dir };
        awaySec = tSec - run.start;
        status = awayStatus(awaySec);
        if (status === 'ok' && tSec - backAt < GAZE.recoverSec) status = lastAwayStatus;
      } else {
        if (run) closeRun(tSec);
        status = tSec - backAt < GAZE.recoverSec ? lastAwayStatus : 'ok';
      }
      return { status, awaySec, ratio: ratio(), dir: frontal ? 'front' : dir };
    },
    flush(tSec) { if (run) closeRun(tSec); },
    events() { return events.map((e) => ({ ...e })); },
    ratio,
  };
}
