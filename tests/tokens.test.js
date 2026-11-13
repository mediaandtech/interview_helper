import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME, SERIES_COLORS } from '../js/config.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// tokens.css 의 다크 토큰 블록 → { 변수: 값 } (var() 는 끝까지 풀기)
function darkTokens() {
  const css = read('../css/tokens.css');
  const start = css.indexOf('html.dark');
  assert.ok(start >= 0, 'tokens.css 에 html.dark 블록이 있어야 함');
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const raw = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const resolve = (v, d = 0) => { const m = /^var\((--[\w-]+)\)$/.exec(v); return m && d < 5 ? resolve(raw[m[1]], d + 1) : v; };
  return Object.fromEntries(Object.keys(raw).map((k) => [k, resolve(raw[k]).toLowerCase()]));
}

test('dark tokens match the JS config used by p5 drawings', () => {
  const t = darkTokens();
  const pairs = {
    '--background': THEME.bg, '--card': THEME.card, '--muted': THEME.muted, '--border': THEME.border,
    '--foreground': THEME.text, '--muted-foreground': THEME.mutedText,
    '--chart-1': SERIES_COLORS.rate, '--chart-2': SERIES_COLORS.volume, '--chart-3': SERIES_COLORS.gazeIn,
  };
  for (const [k, v] of Object.entries(pairs)) assert.equal(t[k], String(v).toLowerCase(), k);
});

test('app.css uses tokens, not raw hex colours', () => {
  const css = read('../css/app.css');
  const screenOnly = css.slice(0, css.indexOf('@media print'));
  assert.deepEqual(screenOnly.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], []);
});
