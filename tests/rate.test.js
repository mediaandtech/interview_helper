import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateTracker } from '../js/analysis/rate.js';

test('rate: estimate only, correction 1.0', () => {
  const r = createRateTracker();
  for (let i = 0; i < 50; i++) r.addEstimated(i * 0.2);
  assert.equal(r.correction(), 1);
  assert.ok(Math.abs(r.rate(10, 10) - 300) < 10, String(r.rate(10, 10)));
});

test('rate: null when speaking too little', () => {
  assert.equal(createRateTracker().rate(5, 1), null);
});

test('rate: recognized corrects estimate', () => {
  const r = createRateTracker();
  for (let i = 0; i < 50; i++) r.addEstimated(i * 0.2);
  r.addRecognized(60, 10);
  assert.ok(Math.abs(r.correction() - 1.2) < 0.01, String(r.correction()));
  assert.ok(Math.abs(r.rate(10, 10) - 360) < 12);
});

test('rate: correction clamped to [0.5, 2.0]', () => {
  const r = createRateTracker();
  for (let i = 0; i < 10; i++) r.addEstimated(i);
  r.addRecognized(100, 10);
  assert.equal(r.correction(), 2.0);
});

test('rate: recognizedAverage', () => {
  const r = createRateTracker();
  assert.equal(r.recognizedAverage(60), null);
  r.addRecognized(150, 20); r.addRecognized(150, 50);
  assert.equal(r.recognizedAverage(60), 300);
});

test('rate: early in the session divides by elapsed time, not the full window', () => {
  const r = createRateTracker();
  for (let i = 0; i < 15; i++) r.addEstimated(i * 0.2);   // 3초에 15음절 = 300/분
  assert.ok(Math.abs(r.rate(3, 3) - 300) < 25, String(r.rate(3, 3)));
});

test('rate: recognizedAverage is null when recognition stopped early', () => {
  const r = createRateTracker();
  for (let t = 5; t <= 60; t += 5) r.addRecognized(25, t);  // 1분에서 끊김
  assert.equal(r.recognizedAverage(300), null);
  for (let t = 65; t <= 300; t += 5) r.addRecognized(25, t);
  assert.equal(r.recognizedAverage(300), 300);
});
