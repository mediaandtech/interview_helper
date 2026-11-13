import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAZE_TEST_STEPS, frameMatches, evaluateStep, diagnose } from '../js/analysis/gaze-test.js';
import { headAnglesFromMatrix } from '../js/analysis/gaze-logic.js';

const F = (headDir, eyeDir = 'front', yaw = 0, pitch = 0, eye = {}) => ({
  frontal: headDir === 'front' && eyeDir === 'front',
  head: { ok: headDir === 'front', dir: headDir, yaw, pitch },
  eye: { ok: eyeDir === 'front', dir: eyeDir },
  eyeRaw: { down: 0, up: 0, left: 0, right: 0, ...eye },
});

test('test plan covers front, 4 head directions and 3 eye directions', () => {
  const ids = GAZE_TEST_STEPS.map((s) => s.id);
  for (const id of ['front', 'head-left', 'head-right', 'head-down', 'head-up', 'eye-down', 'eye-left', 'eye-right', 'front-again'])
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

test('evaluateStep: majority, match rate, pass at 60%', () => {
  const step = GAZE_TEST_STEPS.find((s) => s.id === 'head-left');
  const frames = [...Array(7)].map(() => F('left', 'front', -22, 1)).concat([...Array(3)].map(() => F('front', 'front', -10, 1)));
  const r = evaluateStep(frames, step);
  assert.equal(r.detected, '고개 왼쪽'); assert.equal(r.matchPct, 70); assert.equal(r.pass, true);
  assert.equal(r.avgYaw, -18.4); assert.equal(r.faceMissingPct, 0);
  const none = evaluateStep([null, null], step);
  assert.deepEqual([none.pass, none.detected, none.faceMissingPct], [false, '얼굴 없음', 100]);
});

const result = (id, detected, pass, extra = {}) => ({ id, detected, pass, matchPct: pass ? 90 : 0, avgYaw: 0, avgPitch: 0, eyeMax: {}, faceMissingPct: 0, ...extra });

test('diagnose: swapped up/down suggests flipping pitch', () => {
  const tips = diagnose([result('head-down', '고개 위', false), result('head-up', '고개 아래', false)]);
  assert.ok(tips.some((t) => t.includes('GAZE.flipPitch')), JSON.stringify(tips));
});

test('diagnose: swapped left/right suggests flipping yaw', () => {
  const tips = diagnose([result('head-left', '고개 오른쪽', false), result('head-right', '고개 왼쪽', false)]);
  assert.ok(tips.some((t) => t.includes('GAZE.flipYaw')));
});

test('diagnose: eyes moved but under threshold suggests lowering eyeThreshold', () => {
  const tips = diagnose([result('eye-down', '정면', false, { eyeMax: { down: 0.35 } })]);
  assert.ok(tips.some((t) => t.includes('GAZE.eyeThreshold') && t.includes('0.3')), JSON.stringify(tips));
});

test('diagnose: all passed', () => {
  assert.deepEqual(diagnose([result('front', '정면', true)]), ['모든 단계를 통과했어요. 지금 기준값 그대로 써도 됩니다.']);
});

test('headAnglesFromMatrix can flip signs', () => {
  const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; };
  const m = ry(20 * Math.PI / 180);
  assert.ok(Math.abs(headAnglesFromMatrix(m, { yaw: true, pitch: false }).yaw + 20) < 0.01);
});
