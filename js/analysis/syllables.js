// 음절 세기: 인식된 텍스트의 한글 음절 수, 그리고 음량 봉우리로 실시간 추정
import { SYLLABLE } from '../config.js';

export function countHangulSyllables(text) {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) n++;
  }
  return n;
}

/**
 * 음량 포락선에서 '오르다가 내려가기 시작하는 지점'을 음절 하나로 셉니다.
 * 직전 골짜기보다 riseDb 이상 올라야 하고, 직전 봉우리와 minGapMs 이상 떨어져야 합니다.
 */
export function createSyllableEstimator() {
  let prev = null;
  let valley = Infinity;
  let rising = false;
  let lastPeakMs = -Infinity;
  return {
    push(db, tMs, speaking) {
      if (!speaking) { prev = null; valley = Infinity; rising = false; return false; }
      let counted = false;
      if (prev !== null) {
        if (db > prev) rising = true;
        else if (db < prev && rising) {
          if (prev - valley >= SYLLABLE.riseDb && tMs - lastPeakMs >= SYLLABLE.minGapMs) {
            counted = true;
            lastPeakMs = tMs;
          }
          rising = false;
          valley = db;
        }
      }
      if (!rising) valley = Math.min(valley, db);
      prev = db;
      return counted;
    },
  };
}
