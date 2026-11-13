import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME, STATUS_COLORS, SERIES_COLORS } from '../js/config.js';

// tokens.css 의 :root 변수 → 값 (var() 는 끝까지 풀어서)
function readTokens() {
  const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('@media'));
  const raw = Object.fromEntries([...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const resolve = (v, depth = 0) => {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m && depth < 5 ? resolve(raw[m[1]], depth + 1) : v;
  };
  return Object.fromEntries(Object.keys(raw).map((k) => [k, resolve(raw[k]).toLowerCase()]));
}

test('CSS tokens and JS config agree (p5 drawings use the same colours)', () => {
  const t = readTokens();
  const pairs = {
    '--bg': THEME.bg, '--panel': THEME.panel, '--panel-2': THEME.panel2, '--border': THEME.border,
    '--text': THEME.text, '--muted': THEME.muted, '--accent': THEME.accent, '--accent-bg': THEME.accentBg,
    '--bad-bg': THEME.badBg, '--video': THEME.video,
    '--ok': STATUS_COLORS.ok, '--warn': STATUS_COLORS.warn, '--bad': STATUS_COLORS.bad, '--idle': STATUS_COLORS.idle,
    '--series-rate': SERIES_COLORS.rate, '--series-volume': SERIES_COLORS.volume, '--series-pitch': SERIES_COLORS.pitch,
  };
  for (const [k, v] of Object.entries(pairs)) assert.equal(t[k], v.toLowerCase(), k);
});

test('style.css uses tokens, not raw hex colours', () => {
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const screenOnly = css.slice(0, css.indexOf('@media print'));   // 인쇄용 흰 배경은 예외
  const hex = screenOnly.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hex, []);
});
