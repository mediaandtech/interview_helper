// 기록된 샘플 → 종합 점수, 지표 요약, 한 줄 결론, 피드백 3개
import { GAZE, PITCH, REPORT, SCORE } from '../config.js';
import { formatStamp, formatOver } from '../util/time.js';
import { createGazeTracker } from './gaze-logic.js';
import { semitoneStd } from './audio-math.js';
import { classifyVolume, classifyRate, classifyPitchVar } from './classify.js';

const DIR_TEXT = { down: '아래로', up: '위로', left: '왼쪽으로', right: '오른쪽으로', none: '화면 밖으로' };
const BEST = {
  gaze: '시선 처리는 안정적이에요', rate: '말하기 속도가 적절해요', volume: '목소리 크기가 안정적이에요',
  pitch: '억양 변화가 살아 있어요', time: '시간 배분이 정확해요',
};
const WORST = {
  gaze: '시선이 자주 벗어난 게', rate: '속도가 기준을 벗어난 게', volume: '목소리 크기가 흔들린 게',
  pitch: '억양이 단조로운 게', time: '시간을 맞추지 못한 게',
};
const PRAISE = {
  gaze: '시선 처리가 안정적이었어요.', rate: '말하기 속도가 목표 범위 안에 있었어요.',
  volume: '목소리 크기가 고르게 유지됐어요.', pitch: '억양에 변화가 살아 있었어요.', time: '시간 배분이 정확했어요.',
};
const ORDER = ['gaze', 'rate', 'volume', 'time', 'pitch'];
const FALLBACK_TIP = '꾸준히 연습하면 더 좋아질 거예요.';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 조건을 만족하는 샘플이 이어진 구간들. skip(s)가 참인 샘플은 구간을 끊지도 늘리지도 않음 */
function segments(samples, match, skip = () => false) {
  const out = [];
  let cur = null;
  for (const s of samples) {
    if (skip(s)) continue;
    if (match(s)) {
      if (!cur) cur = { start: s.t, end: s.t, items: [] };
      cur.end = s.t; cur.items.push(s);
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((g) => ({ ...g, len: g.end - g.start + 0.1 }));
}

function gazeMetric(samples, target) {
  const g = samples.filter((s) => s.frontal !== null && s.frontal !== undefined);
  if (g.length === 0) return { metric: null, events: [] };
  const tracker = createGazeTracker(target);
  for (const s of g) tracker.update(s.frontal, s.dir, s.t);
  tracker.flush(g[g.length - 1].t + 0.1);

  // 짧은 이탈(forgiveSec 미만)은 정면으로 봐줌
  let ok = 0, i = 0;
  while (i < g.length) {
    if (g[i].frontal) { ok++; i++; continue; }
    let j = i;
    while (j < g.length && !g[j].frontal) j++;
    const end = j < g.length ? g[j].t : g[j - 1].t + 0.1;
    if (end - g[i].t < GAZE.forgiveSec) ok += j - i;
    i = j;
  }
  const ratio = ok / g.length;
  return {
    metric: { pct: Math.round(ratio * 100), score: clamp01(ratio / target) * 100 },
    events: tracker.events(),
  };
}

export function buildReport(samples, settings, extras = {}) {
  const durationSec = samples.length ? samples[samples.length - 1].t + 0.1 : 0;
  if (durationSec < REPORT.minSessionSec) {
    return { tooShort: true, durationSec, score: null, metrics: null, headline: '', tips: [], gazeEvents: [] };
  }

  const { metric: gaze, events: gazeEvents } = gazeMetric(samples, settings.gazeTarget);

  const rated = samples.filter((s) => s.rate != null);
  const rate = rated.length
    ? {
        avg: Math.round(extras.recognizedAvgRate ?? mean(rated.map((s) => s.rate))),
        score: (rated.filter((s) => classifyRate(s.rate, settings) === 'ok').length / rated.length) * 100,
      }
    : null;

  const spoken = samples.filter((s) => s.speaking && s.deltaDb != null);
  let volume = null;
  if (spoken.length) {
    const out = spoken.filter((s) => classifyVolume(s.deltaDb, true) !== 'ok').length / spoken.length;
    volume = { outPct: Math.round(out * 100), score: (1 - out) * 100 };
  }

  const st = semitoneStd(samples.filter((s) => s.speaking && s.hz).map((s) => s.hz));
  const pitch = st == null ? null
    : { st, label: classifyPitchVar(st).label, score: clamp01(st / PITCH.monotoneSt) * 100 };

  const diffSec = durationSec - settings.durationSec;
  const rel = Math.abs(diffSec) / settings.durationSec;
  const time = { diffSec, text: formatOver(diffSec), score: rel <= 0.1 ? 100 : clamp01(1 - (rel - 0.1) / 0.4) * 100 };

  const metrics = { gaze, rate, volume, pitch, time };
  const present = ORDER.filter((k) => metrics[k]);
  const wsum = present.reduce((a, k) => a + SCORE.weights[k], 0);
  const score = Math.round(present.reduce((a, k) => a + metrics[k].score * SCORE.weights[k], 0) / wsum);

  // ---- 피드백 후보 ----
  const cands = [];
  for (const e of gazeEvents) {
    cands.push({ key: 'gaze', t: e.start, sev: e.dur * 2,
      text: `${formatStamp(e.start)}에 ${Math.round(e.dur)}초 동안 시선이 ${DIR_TEXT[e.dir] ?? '다른 곳으로'} 향했어요. 원고를 보는 시간을 3초 이내로 줄여 보세요.` });
  }
  const skipSilent = (s) => !s.speaking || s.deltaDb == null;
  for (const seg of segments(samples, (s) => s.deltaDb < -6, skipSilent)) {
    if (seg.len < REPORT.quietSegmentSec) continue;
    const d = mean(seg.items.map((s) => s.deltaDb));
    const p = Math.round((1 - 10 ** (d / 20)) * 100);
    cands.push({ key: 'volume', t: seg.start, sev: seg.len * Math.abs(d) / 6,
      text: `${formatStamp(seg.start)} 이후 목소리가 기준보다 ${p}% 작아졌어요. 결론 부분일수록 크게 말해 보세요.` });
  }
  for (const seg of segments(samples, (s) => s.deltaDb > 8, skipSilent)) {
    if (seg.len < REPORT.quietSegmentSec) continue;
    cands.push({ key: 'volume', t: seg.start, sev: seg.len,
      text: `${formatStamp(seg.start)}부터 목소리가 기준보다 커졌어요. 힘을 조금 빼 보세요.` });
  }
  for (const [fast, word] of [[true, '빨라졌어요'], [false, '느려졌어요']]) {
    const out = (s) => (fast ? s.rate > settings.rateMax : s.rate < settings.rateMin);
    for (const seg of segments(samples, out, (s) => s.rate == null)) {
      if (seg.len < REPORT.rateSegmentSec) continue;
      const r = Math.round(mean(seg.items.map((s) => s.rate)));
      cands.push({ key: 'rate', t: seg.start, sev: seg.len,
        text: `${formatStamp(seg.start)}부터 말이 ${word}(평균 ${r}음절/분). 목표는 ${settings.rateMin}~${settings.rateMax}음절/분이에요.` });
    }
  }
  if (pitch?.label === '단조') {
    cands.push({ key: 'pitch', t: null, sev: 20, text: '억양 변화가 적어요. 핵심 단어에서 목소리를 조금 올려 보세요.' });
  }
  if (rel > 0.1) {
    cands.push({ key: 'time', t: null, sev: Math.abs(diffSec) / 3,
      text: `목표보다 ${formatStamp(Math.abs(diffSec))} ${diffSec > 0 ? '길게' : '짧게'} 발표했어요.` });
  }

  cands.sort((a, b) => b.sev - a.sev);
  const tips = cands.slice(0, 3).map(({ t, text }) => ({ t, text }));
  const mentioned = new Set(cands.slice(0, 3).map((c) => c.key));
  const byScore = [...present].sort((a, b) => metrics[b].score - metrics[a].score);
  for (const k of byScore) {
    if (tips.length >= 3) break;
    if (!mentioned.has(k)) tips.push({ t: null, text: PRAISE[k] });
  }
  while (tips.length < 3) tips.push({ t: null, text: FALLBACK_TIP });

  const best = byScore[0];
  const worst = byScore[byScore.length - 1];
  const headline = metrics[worst].score >= 90
    ? `${BEST[best]}. 전반적으로 훌륭한 발표였어요.`
    : `${BEST[best]}. ${WORST[worst]} 가장 아쉬워요.`;

  return { tooShort: false, durationSec, score, metrics, headline, tips, gazeEvents };
}
