// 관찰값만 계산합니다. 점수·등급·행동 권고를 생성하지 않습니다.
import { AUDIO } from '../config.js';
import { summarizeGaze, timedSlices } from './gaze-timeline.js';
import { GAZE_REASON_TEXT } from './gaze-logic.js';
import { semitoneStd } from './audio-math.js';

export function nearestSample(samples, t) {
  let lo = 0, hi = samples.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (samples[mid].t < t) lo = mid + 1; else hi = mid; }
  if (!lo) return samples[0] ?? null;
  if (lo === samples.length) return samples[lo - 1];
  return t - samples[lo - 1].t <= samples[lo].t - t ? samples[lo - 1] : samples[lo];
}

export function observedSegments(samples, classify) {
  const out = [];
  let run = null;
  const close = () => { if (run) out.push({ ...run, dur: run.end - run.start }); run = null; };
  for (const sample of samples) {
    const label = classify(sample);
    if (!label || (run && (run.label !== label || sample.t - run.end > 0.05))) close();
    if (label) {
      if (!run) run = { label, start: sample.t, end: sample.t };
      run.end = sample.end ?? sample.t + 0.1;
    }
  }
  close();
  return out;
}

export function buildReview(samples, settings, elapsed) {
  const durationSec = Math.max(0, elapsed ?? (samples.at(-1)?.t ?? 0) + (samples.length ? 0.1 : 0));
  const gaze=summarizeGaze(samples,durationSec);
  const recorded=timedSlices(samples,durationSec);
  const spoken = recorded.filter(s => s.speaking && s.deltaDb != null);
  const rates = recorded.filter(s => s.rate != null);
  const seconds=xs=>xs.reduce((a,s)=>a+s.weight,0);
  const weighted=(xs,key)=>seconds(xs)?xs.reduce((a,s)=>a+s[key]*s.weight,0)/seconds(xs):null;
  const avgDeltaDb=weighted(spoken,'deltaDb');
  const volumeStdDb=avgDeltaDb==null?null:Math.sqrt(spoken.reduce((a,s)=>a+(s.deltaDb-avgDeltaDb)**2*s.weight,0)/seconds(spoken));
  const intervals = [
    ...observedSegments(gaze.slices, s => s.frontal === false ? '정면 참고 범위 밖' : null),
    ...observedSegments(gaze.slices, s => s.gazeReason ? GAZE_REASON_TEXT[s.gazeReason]??s.gazeReason : s.faceMissing ? '얼굴 검출 안 됨' : null),
    ...observedSegments(recorded, s => !s.speaking || s.deltaDb == null ? null : s.deltaDb < AUDIO.okRangeDb[0] ? '기준 대비 음량 낮음' : s.deltaDb > AUDIO.okRangeDb[1] ? '기준 대비 음량 높음' : null),
    ...observedSegments(recorded, s => s.rate == null ? null : s.rate < settings.rateMin ? '속도 참고 범위 아래' : s.rate > settings.rateMax ? '속도 참고 범위 위' : null),
  ].filter(x => x.dur + 1e-8 >= 1).sort((a,b) => a.start-b.start);
  return {
    durationSec, intervals,
    frontalPct:gaze.frontalPct,
    gazeTimeline:gaze.slices, gazeUnknownSec:gaze.unknownSec, gazeReasons:gaze.reasons, gazeComparison:gaze.comparison,
    avgRate:weighted(rates,'rate'),
    avgDeltaDb, volumeStdDb,
    pitchSt: semitoneStd(samples.filter(s=>s.speaking && s.hz).map(s=>s.hz)),
    faceCoverageSec:gaze.validSec,
    rateCoverageSec:seconds(rates),
    sampledSec:seconds(recorded),
    speakingSec:seconds(spoken),
  };
}
