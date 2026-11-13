// 지표 값 → 상태('ok' | 'warn' | 'bad' | 'idle') 판정
import { AUDIO, PITCH, RATE, TIME, GAZE } from '../config.js';
import { formatClock, formatOverClock } from '../util/time.js';

const within = (v, [lo, hi]) => v >= lo && v <= hi;

export function classifyRate(spm, settings) {
  if (spm == null) return 'idle';
  const { rateMin, rateMax } = settings;
  if (within(spm, [rateMin, rateMax])) return 'ok';
  const m = RATE.warnMarginSpm;
  if (within(spm, [rateMin - m, rateMax + m])) return 'warn';
  return 'bad';
}

export function classifyVolume(deltaDb, speaking) {
  if (!speaking || deltaDb == null) return 'idle';
  if (within(deltaDb, AUDIO.okRangeDb)) return 'ok';
  if (within(deltaDb, AUDIO.warnRangeDb)) return 'warn';
  return 'bad';
}

export function classifyPitchVar(st) {
  if (st == null) return { status: 'idle', label: '측정 대기' };
  if (st < PITCH.monotoneSt) return { status: 'warn', label: '단조' };
  if (st > PITCH.richSt) return { status: 'ok', label: '풍부' };
  return { status: 'ok', label: '적정' };
}

export function classifyTime(elapsedSec, durationSec) {
  const remaining = durationSec - elapsedSec;
  if (remaining < 0) return { status: 'bad', text: formatOverClock(-remaining) };
  const status = remaining <= TIME.warnRemainingSec ? 'warn' : 'ok';
  return { status, text: formatClock(remaining) };
}

export function classifyGazeRatio(ratio, target) {
  if (ratio == null) return 'idle';
  if (ratio >= target) return 'ok';
  if (ratio >= target - GAZE.warnMargin - 1e-9) return 'warn';
  return 'bad';
}

/** 속도 상태 단어(숫자보다 먼저 읽히는 라벨) */
export function rateLabel(spm, settings) {
  if (spm == null) return '측정 대기';
  if (spm < settings.rateMin) return '느림';
  if (spm > settings.rateMax) return '빠름';
  return '적정';
}

/** 크기 상태 단어. 말하지 않는 동안은 '쉬는 중'(작음으로 보지 않음) */
export function volumeLabel(deltaDb, speaking, active) {
  if (!active) return '측정 대기';
  if (!speaking || deltaDb == null) return '쉬는 중';
  if (deltaDb < AUDIO.okRangeDb[0]) return '작음';
  if (deltaDb > AUDIO.okRangeDb[1]) return '큼';
  return '적정';
}

/** 발표 시간 진행률 0~1 */
export function timeProgress(elapsedSec, durationSec) {
  return Math.max(0, Math.min(1, elapsedSec / durationSec));
}
