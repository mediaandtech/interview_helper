import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, GAZE, AUDIO, PITCH, RATE, SCORE, TIME, UI } from '../js/config.js';

test('presets match spec', () => {
  assert.deepEqual(PRESETS.class,     { label: '수업 발표',   rateMin: 270, rateMax: 330, gazeTarget: 0.80 });
  assert.deepEqual(PRESETS.interview, { label: '면접 답변',   rateMin: 260, rateMax: 320, gazeTarget: 0.85 });
  assert.deepEqual(PRESETS.pitch,     { label: '피칭·공모전', rateMin: 290, rateMax: 350, gazeTarget: 0.80 });
});

test('score weights match spec', () => {
  assert.deepEqual(SCORE.weights, { gaze: 35, rate: 20, volume: 20, time: 15, pitch: 10 });
});

test('key thresholds', () => {
  assert.equal(GAZE.yawDeg, 15); assert.equal(GAZE.pitchDeg, 12); assert.equal(GAZE.eyeThreshold, 0.5);
  assert.equal(GAZE.forgiveSec, 1.5); assert.equal(GAZE.warnSec, 1.5); assert.equal(GAZE.badSec, 3);
  assert.equal(GAZE.recoverSec, 0.5); assert.equal(GAZE.ratioWindowSec, 30); assert.equal(GAZE.warnMargin, 0.15);
  assert.deepEqual(AUDIO.okRangeDb, [-6, 8]); assert.deepEqual(AUDIO.warnRangeDb, [-10, 12]);
  assert.deepEqual([PITCH.minHz, PITCH.maxHz, PITCH.monotoneSt, PITCH.richSt, PITCH.windowSec], [75, 400, 1.5, 4, 10]);
  assert.equal(RATE.windowSec, 10); assert.equal(RATE.correctionWindowSec, 30);
  assert.equal(TIME.warnRemainingSec, 60); assert.equal(UI.hysteresisSec, 1); assert.equal(UI.sampleHz, 10);
});
