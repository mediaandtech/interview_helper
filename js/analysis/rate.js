// 말하기 속도(음절/분): 최근 구간의 음량 봉우리 수로 추정합니다.
import { RATE } from '../config.js';

export function createRateTracker() {
  const est = []; // 추정 음절 시각(초)
  return {
    addEstimated(tSec) { est.push(tSec); },

    rate(tSec, speakingSecInWindow) {
      if (speakingSecInWindow < RATE.minSpeakingSecForRate) return null;
      const span = Math.max(1, Math.min(RATE.windowSec, tSec));
      const n = est.filter((t) => t > tSec - span && t <= tSec).length;
      return (n * 60) / span;
    },
  };
}
