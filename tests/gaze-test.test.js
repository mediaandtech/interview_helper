import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAZE_TEST_STEPS, frameMatches } from '../js/analysis/gaze-test.js';
import { headAnglesFromMatrix } from '../js/analysis/gaze-logic.js';

const F = (headDir, eyeDir = 'front', yaw = 0, pitch = 0, eye = {}) => ({
  frontal: headDir === 'front' && eyeDir === 'front',
  head: { ok: headDir === 'front', dir: headDir, yaw, pitch },
  eye: { ok: eyeDir === 'front', dir: eyeDir },
  eyeRaw: { down: 0, up: 0, left: 0, right: 0, ...eye },
});

test('test plan covers front, 4 head directions and 4 eye directions', () => {
  const ids = GAZE_TEST_STEPS.map((s) => s.id);
  for (const id of ['front', 'head-left', 'head-right', 'head-down', 'head-up', 'eye-down', 'eye-left', 'eye-right', 'eye-up', 'front-again'])
    assert.ok(ids.includes(id), id);
});

test('frameMatches: head steps check head, eye steps need a still head', () => {
  const step = (id) => GAZE_TEST_STEPS.find((s) => s.id === id);
  assert.equal(frameMatches(F('front'), step('front')), true);
  assert.equal(frameMatches(F('left'), step('head-left')), true);
  assert.equal(frameMatches(F('front', 'down'), step('eye-down')), true);
  assert.equal(frameMatches(F('down', 'down'), step('eye-down')), false); // 고개까지 숙이면 '눈만'이 아님
  assert.equal(frameMatches(null, step('front')), false);                 // 얼굴 없음
});

test('headAnglesFromMatrix can flip signs', () => {
  const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; };
  const m = ry(20 * Math.PI / 180);
  assert.ok(Math.abs(headAnglesFromMatrix(m, { yaw: true, pitch: false }).yaw + 20) < 0.01);
});
