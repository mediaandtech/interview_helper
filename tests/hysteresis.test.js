import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHysteresis } from '../js/analysis/hysteresis.js';

test('hysteresis holds 1s and resets on flicker', () => {
  const h = createHysteresis(1);
  assert.equal(h.update('ok', 0), 'ok');
  assert.equal(h.update('bad', 0.25), 'ok'); assert.equal(h.update('ok', 0.375), 'ok');
  assert.equal(h.update('bad', 0.5), 'ok'); assert.equal(h.update('bad', 1.4375), 'ok');
  assert.equal(h.update('bad', 1.5), 'bad');
});
