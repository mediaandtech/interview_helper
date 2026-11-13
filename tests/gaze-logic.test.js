import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headAnglesFromMatrix, analyzeGaze, gazeGrid } from '../js/analysis/gaze-logic.js';

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

test('analyzeGaze separates head and eyes', () => {
  const head = analyzeGaze({ yaw: 20, pitch: 0, eye: eye0 }, calib);
  assert.equal(head.frontal, false); assert.equal(head.head.ok, false); assert.equal(head.head.dir, 'right'); assert.equal(head.dir, 'right');
  const eyes = analyzeGaze({ yaw: 0, pitch: 0, eye: { ...eye0, down: 0.8 } }, calib);
  assert.equal(eyes.head.ok, true); assert.equal(eyes.eye.ok, false); assert.equal(eyes.eye.dir, 'down'); assert.equal(eyes.dir, 'down');
  const none = analyzeGaze(null, calib);
  assert.deepEqual([none.frontal, none.reason, none.dir, none.head.ok, none.eye.ok], [null, 'no-face', 'none', false, false]);
});

test('gazeGrid maps to a 3x3 cell', () => {
  assert.deepEqual(gazeGrid({ yaw: 0, pitch: 0, eye: eye0 }, calib), { col: 0, row: 0 });
  assert.deepEqual(gazeGrid({ yaw: -20, pitch: -15, eye: eye0 }, calib), { col: -1, row: 1 });
  assert.deepEqual(gazeGrid({ yaw: 0, pitch: 0, eye: { ...eye0, up: 0.9 } }, calib), { col: 0, row: -1 });
  assert.equal(gazeGrid(null, calib), null);
});
