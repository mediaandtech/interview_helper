import * as setup from './setup.js';
import * as practice from './practice.js';
import * as report from './report.js';

const screens = { setup, practice, report };
const ORDER = ['setup', 'practice', 'report'];

/** 화면 사이에 공유하는 상태 */
export const app = {
  settings: null,      // Settings (setup이 채움)
  sensors: { audio: null, gaze: null },
  lastSamples: [],
  current: null,
  debug: new URLSearchParams(location.search).has('debug'),

  go(name, payload) {
    if (this.current) screens[this.current].leave?.();
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${name}`));
    const idx = ORDER.indexOf(name);
    document.querySelectorAll('#flow span').forEach((el) => {
      const i = ORDER.indexOf(el.dataset.step);
      el.classList.toggle('cur', i === idx);
      el.classList.toggle('done', i < idx);
    });
    document.getElementById('topbar-right').replaceChildren();
    this.current = name;
    screens[name].enter(this, payload);
  },
};

if (app.debug) document.getElementById('debug').hidden = false;

/** ?debug=1 일 때 화면 구석에 원시 값을 보여 줍니다 */
export function debugLine(obj) {
  if (!app.debug) return;
  document.getElementById('debug').textContent = Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
    .join('\n');
}

window.app = app; // 콘솔 디버깅용
app.go('setup');
