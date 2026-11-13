// 지표 값 → 상태('ok' | 'warn' | 'bad' | 'idle') 판정
import { AUDIO, PITCH, RATE, TIME, GAZE } from '../config.js';
import { formatClock, formatOver } from '../util/time.js';

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
  if (st == null) return { status: 'idle', label: '—' };
  if (st < PITCH.monotoneSt) return { status: 'warn', label: '단조' };
  if (st > PITCH.richSt) return { status: 'ok', label: '풍부' };
  return { status: 'ok', label: '적정' };
}

export function classifyTime(elapsedSec, durationSec) {
  const remaining = durationSec - elapsedSec;
  if (remaining < 0) return { status: 'bad', text: formatOver(-remaining) };
  const status = remaining <= TIME.warnRemainingSec ? 'warn' : 'ok';
  return { status, text: formatClock(remaining) };
}

export function classifyGazeRatio(ratio, target) {
  if (ratio == null) return 'idle';
  if (ratio >= target) return 'ok';
  if (ratio >= target - GAZE.warnMargin - 1e-9) return 'warn';
  return 'bad';
}
