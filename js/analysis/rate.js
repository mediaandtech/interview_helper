// 말하기 속도(음절/분): 음량 기반 추정값을 음성 인식 결과로 보정하는 하이브리드
import { RATE } from '../config.js';

export function createRateTracker() {
  const est = [];  // 추정 음절 시각(초)
  const rec = [];  // { t, count } 인식된 음절
  let latest = 0;
  let recTotal = 0;
  let lastRecT = -Infinity;

  const sumSince = (from) => ({
    est: est.filter((t) => t > from).length,
    rec: rec.filter((r) => r.t > from).reduce((a, r) => a + r.count, 0),
  });

  const api = {
    addEstimated(tSec) { est.push(tSec); latest = Math.max(latest, tSec); },
    addRecognized(count, tSec) { rec.push({ t: tSec, count }); recTotal += count; lastRecT = Math.max(lastRecT, tSec); latest = Math.max(latest, tSec); },

    correction() {
      const s = sumSince(latest - RATE.correctionWindowSec);
      if (s.est === 0 || s.rec === 0) return 1;
      const [lo, hi] = RATE.correctionClamp;
      return Math.min(hi, Math.max(lo, s.rec / s.est));
    },

    rate(tSec, speakingSecInWindow) {
      if (speakingSecInWindow < RATE.minSpeakingSecForRate) return null;
      const span = Math.max(1, Math.min(RATE.windowSec, tSec)); // 시작 직후에는 지난 시간만큼만
      const n = est.filter((t) => t > tSec - span && t <= tSec).length;
      return (n * 60) / span * api.correction();
    },

    recognizedAverage(totalSec) {
      if (recTotal === 0 || totalSec <= 0) return null;
      if (lastRecT < totalSec - RATE.recognitionCoverageSec) return null; // 중간에 끊긴 인식은 믿지 않음
      return (recTotal * 60) / totalSec;
    },
  };
  return api;
}
