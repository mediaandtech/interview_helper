// 홍채 위치(눈 너비 단위) → 방향별 점수. 점수 1 = 개인 경계, 2 ≈ 보정 때 그 방향을 본 위치.
import { GAZE } from '../config.js';

export const IRIS_DIRS = ['left', 'right', 'up', 'down'];

/**
 * 한쪽 눈의 모델: 정면 구역 [min,max]와 방향별 경계.
 * @typedef {{ front:{xMin:number,xMax:number,yMin:number,yMax:number}, bound:{left:number,right:number,up:number,down:number} }} EyeIrisModel
 */

/** 정밀 보정이 없을 때: 정면 한 점 ± 기본 거리 */
export function defaultIrisModel(ref, span = GAZE.irisSpanDefault) {
  if (!ref) return null;
  return {
    front: { xMin: ref.x, xMax: ref.x, yMin: ref.y, yMax: ref.y },
    bound: { left: ref.x - span.x, right: ref.x + span.x, up: ref.y - span.y, down: ref.y + span.y },
  };
}

/** 정면 구역 밖으로 경계까지 몇 배 나갔는지(0 = 정면 구역 안) */
export function irisScores(p, model) {
  const f = model.front, b = model.bound;
  const s = (beyond, dist) => (dist > 1e-6 ? Math.max(0, beyond) / dist : 0);
  return {
    left: s(f.xMin - p.x, f.xMin - b.left),
    right: s(p.x - f.xMax, b.right - f.xMax),
    up: s(f.yMin - p.y, f.yMin - b.up),
    down: s(p.y - f.yMax, b.down - f.yMax),
  };
}
