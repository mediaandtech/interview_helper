import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headAnglesFromMatrix, eyeFromBlendshapes, isFrontal, createGazeTracker } from '../js/analysis/gaze-logic.js';

const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; };
const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; };
const rad = (d) => d * Math.PI / 180;
const eye0 = { down: 0.1, up: 0, left: 0, right: 0 };
const calib = { yaw0: 0, pitch0: 0, eye0 };

test('head angles', () => {
  assert.deepEqual(headAnglesFromMatrix(I), { yaw: 0, pitch: 0 });
  assert.ok(Math.abs(headAnglesFromMatrix(ry(rad(20))).yaw - 20) < 0.01);
  assert.ok(Math.abs(headAnglesFromMatrix(rx(rad(10))).pitch - 10) < 0.01);
});

test('eyeFromBlendshapes averages both eyes', () => {
  const cats = [
    ['eyeLookDownLeft', 0.6], ['eyeLookDownRight', 0.4], ['eyeLookUpLeft', 0], ['eyeLookUpRight', 0.2],
    ['eyeLookOutLeft', 0.8], ['eyeLookInRight', 0.6], ['eyeLookInLeft', 0], ['eyeLookOutRight', 0.1],
  ].map(([categoryName, score]) => ({ categoryName, score }));
  const e = eyeFromBlendshapes(cats);
  assert.ok(Math.abs(e.down - 0.5) < 1e-9); assert.ok(Math.abs(e.up - 0.1) < 1e-9);
  assert.ok(Math.abs(e.left - 0.7) < 1e-9); assert.ok(Math.abs(e.right - 0.05) < 1e-9);
});

test('isFrontal null face', () => {
  assert.deepEqual(isFrontal(null, calib), { frontal: false, dir: 'none' });
});

test('isFrontal', () => {
  assert.equal(isFrontal({ yaw: 10, pitch: -8, eye: eye0 }, calib).frontal, true);
  assert.deepEqual(isFrontal({ yaw: 20, pitch: 0, eye: eye0 }, calib), { frontal: false, dir: 'right' });
  assert.deepEqual(isFrontal({ yaw: -20, pitch: 0, eye: eye0 }, calib), { frontal: false, dir: 'left' });
  assert.deepEqual(isFrontal({ yaw: 0, pitch: 0, eye: { ...eye0, down: 0.7 } }, calib), { frontal: false, dir: 'down' });
  assert.equal(isFrontal({ yaw: 18, pitch: 0, eye: eye0 }, { ...calib, yaw0: 10 }).frontal, true);
});

test('tracker: warn at 1.5s, bad at 3s, recover after 0.5s, event logged', () => {
  const g = createGazeTracker(0.8); let o;
  for (let i = 0; i <= 99; i++) o = g.update(true, 'front', i / 10);
  assert.equal(o.status, 'ok');
  o = g.update(false, 'down', 10.0); o = g.update(false, 'down', 11.4); assert.equal(o.status, 'ok');
  o = g.update(false, 'down', 11.5); assert.equal(o.status, 'warn');
  o = g.update(false, 'down', 13.0); assert.equal(o.status, 'bad');
  o = g.update(true, 'front', 14.0); assert.equal(o.status, 'bad');
  o = g.update(true, 'front', 14.5); assert.equal(o.status, 'ok');
  assert.deepEqual(g.events().map((e) => ({ ...e, dur: Math.round(e.dur) })), [{ start: 10, dur: 4, dir: 'down' }]);
});

test('tracker: short glance forgiven in ratio', () => {
  const g = createGazeTracker(0.8); let o;
  for (let i = 0; i < 300; i++) { const t = i / 10; const away = t >= 5 && t < 6; o = g.update(!away, away ? 'right' : 'front', t); }
  assert.ok(o.ratio > 0.99, String(o.ratio));
  assert.equal(g.events().length, 0);
});

test('tracker: null frontal → idle', () => {
  assert.equal(createGazeTracker(0.8).update(null, 'none', 0).status, 'idle');
});

test('tracker: flush closes an ongoing long look-away', () => {
  const g = createGazeTracker(0.8);
  g.update(true, 'front', 0); g.update(false, 'left', 1); g.update(false, 'left', 5);
  g.flush(6);
  assert.deepEqual(g.events(), [{ start: 1, dur: 5, dir: 'left' }]);
});

import { analyzeGaze, gazeGrid } from '../js/analysis/gaze-logic.js';

test('analyzeGaze separates head and eyes', () => {
  const head = analyzeGaze({ yaw: 20, pitch: 0, eye: eye0 }, calib);
  assert.equal(head.frontal, false); assert.equal(head.head.ok, false); assert.equal(head.head.dir, 'right'); assert.equal(head.dir, 'right');
  const eyes = analyzeGaze({ yaw: 0, pitch: 0, eye: { ...eye0, down: 0.8 } }, calib);
  assert.equal(eyes.head.ok, true); assert.equal(eyes.eye.ok, false); assert.equal(eyes.eye.dir, 'down'); assert.equal(eyes.dir, 'down');
  const none = analyzeGaze(null, calib);
  assert.deepEqual([none.frontal, none.dir, none.head.ok, none.eye.ok], [false, 'none', false, false]);
});

test('gazeGrid maps to a 3x3 cell', () => {
  assert.deepEqual(gazeGrid({ yaw: 0, pitch: 0, eye: eye0 }, calib), { col: 0, row: 0 });
  assert.deepEqual(gazeGrid({ yaw: -20, pitch: -15, eye: eye0 }, calib), { col: -1, row: 1 });
  assert.deepEqual(gazeGrid({ yaw: 0, pitch: 0, eye: { ...eye0, up: 0.9 } }, calib), { col: 0, row: -1 });
  assert.equal(gazeGrid(null, calib), null);
});

test('tracker: cumulative ratio covers the whole session and forgives short glances', () => {
  const g = createGazeTracker(0.8); let o;
  for (let i = 0; i < 1000; i++) {           // 100초
    const t = i / 10;
    const away = (t >= 10 && t < 11) || (t >= 50 && t < 60);   // 1초(봐줌) + 10초(이탈)
    o = g.update(!away, away ? 'down' : 'front', t);
  }
  assert.ok(Math.abs(o.cumulative - 0.9) < 0.01, String(o.cumulative));
});
