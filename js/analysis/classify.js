/** 발표 시간 진행률 0~1 */
export function timeProgress(elapsedSec, durationSec) {
  return Math.max(0, Math.min(1, elapsedSec / durationSec));
}
