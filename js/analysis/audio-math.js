// 마이크 신호 계산: 음량(dB), 말하는 중 여부, 음높이(F0), 높낮이 변화량
import { AUDIO, PITCH } from '../config.js';

const MIN_RMS = 0.01;       // 이보다 작은 신호는 음높이를 찾지 않음
const MIN_CORR = 0.6;       // 정규화 자기상관이 이보다 작으면 '음높이 없음'
const PEAK_RATIO = 0.9;     // 최대값의 90% 이상인 첫 봉우리를 채택(옥타브 오류 방지)

/** dBFS. 완전 무음은 -100 */
export function rmsDb(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

/** 기준 음량보다 크게 작으면 침묵. 기준이 없으면 -50 dBFS를 문턱으로 */
export function isSpeaking(db, baseDb) {
  if (baseDb == null) return db > -50;
  return db > baseDb - AUDIO.silenceBelowBaseDb;
}

/** 정규화 자기상관으로 기본 주파수 추정. 못 찾으면 null */
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / n) < MIN_RMS) return null;

  const minLag = Math.floor(sampleRate / PITCH.maxHz);
  const maxLag = Math.min(Math.ceil(sampleRate / PITCH.minHz), n - 2);
  const r = new Float32Array(maxLag + 2);
  let best = -1;
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i + lag < n; i++) {
      const a = buf[i], b = buf[i + lag];
      xy += a * b; xx += a * a; yy += b * b;
    }
    r[lag] = xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
    if (lag >= minLag && lag <= maxLag && r[lag] > best) best = r[lag];
  }
  if (best < MIN_CORR) return null;

  for (let lag = minLag; lag <= maxLag; lag++) {
    if (r[lag] >= best * PEAK_RATIO && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      const a = r[lag - 1], b = r[lag], c = r[lag + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? 0.5 * (a - c) / denom : 0;
      return sampleRate / (lag + shift);
    }
  }
  return null;
}

/** 음높이 목록 → 반음 단위 표본 표준편차. 5개 미만이면 null */
export function semitoneStd(hzList) {
  const v = hzList.filter((h) => h > 0);
  if (v.length < 5) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const st = v.map((h) => 12 * Math.log2(h / median));
  const mean = st.reduce((a, b) => a + b, 0) / st.length;
  const varc = st.reduce((a, b) => a + (b - mean) ** 2, 0) / (st.length - 1);
  return Math.sqrt(varc);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/**
 * 100ms 동안 모은 프레임 → 샘플 하나.
 * 말하는 샘플의 음량은 말한 프레임만 평균(단어 끝 침묵이 '작은 목소리'로 섞이지 않게).
 */
export function summarizeFrames(frames) {
  if (!frames.length) return { speaking: false, db: null, hz: null };
  const spoken = frames.filter((f) => f.speaking);
  const speaking = spoken.length / frames.length >= 0.5;
  const pool = speaking ? spoken : frames;
  const db = pool.reduce((a, f) => a + f.db, 0) / pool.length;
  const hzs = spoken.map((f) => f.hz).filter((h) => h);
  return { speaking, db, hz: speaking && hzs.length ? median(hzs) : null };
}

/**
 * 보정: 주변 소음보다 calibAboveNoiseDb 이상 큰 프레임만 목소리로 보고 기준값을 정합니다.
 * @param {{db:number, hz:number|null}[]} frames  문장을 읽는 동안의 프레임
 * @param {number|null} noiseDb  정면 측정 동안 잰 주변 소음(중앙값)
 * @returns {{baseDb:number, baseHz:number|null}|null}
 */
export function calibrateVoice(frames, noiseDb) {
  const floor = noiseDb == null ? -50 : Math.max(-50, noiseDb + AUDIO.calibAboveNoiseDb);
  const voiced = frames.filter((f) => f.db > floor);
  if (voiced.length < AUDIO.calibMinFrames) return null;
  const hzs = voiced.map((f) => f.hz).filter((h) => h);
  return { baseDb: median(voiced.map((f) => f.db)), baseHz: hzs.length ? median(hzs) : null };
}

/**
 * 그래프용 음높이 정리: 앞뒤 2개씩과 비교해 7반음 넘게 튀는 단발 값(옥타브 오류)을 뺍니다.
 * 실제로 이어지는 움직임은 그대로 둡니다.
 */
export function cleanPitch(points) {
  const JUMP_ST = 7;
  return points.filter((p, i) => {
    const nb = points.slice(Math.max(0, i - 2), i).concat(points.slice(i + 1, i + 3)).map((q) => q.hz);
    if (nb.length < 2) return true;
    return Math.abs(12 * Math.log2(p.hz / median(nb))) <= JUMP_ST;
  });
}
