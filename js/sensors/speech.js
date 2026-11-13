// Chrome 음성 인식(ko-KR) → 확정된 문장의 한글 음절 수
import { countHangulSyllables } from '../analysis/syllables.js';

const RESTART_MS = 300;
const ERROR_BACKOFF_MS = 5000;

/**
 * @param {{ onSyllables(count:number, tSec:number):void, onText?(text:string):void, now():number }} cb
 *   now(): 연습 시작 기준 경과 초
 * @returns {{ supported: boolean, stop(): void, status(): 'on'|'off'|'error' }}
 */
export function startSpeech({ onSyllables, onText, now }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return { supported: false, stop() {}, status: () => 'off' };

  let stopped = false;
  let state = 'on';
  let timer = null;
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    state = 'on';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r.isFinal) continue;
      const text = r[0].transcript;
      const n = countHangulSyllables(text);
      if (n > 0) onSyllables(n, now());
      onText?.(text);
    }
  };

  let delay = RESTART_MS;
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    state = 'error';
    if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'service-not-allowed') delay = ERROR_BACKOFF_MS;
  };
  rec.onend = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      try { rec.start(); delay = RESTART_MS; } catch { /* 이미 시작됨 */ }
    }, delay);
  };

  try { rec.start(); } catch { state = 'error'; }

  return {
    supported: true,
    status: () => state,
    stop() {
      stopped = true;
      clearTimeout(timer);
      try { rec.abort(); } catch { /* noop */ }
    },
  };
}
