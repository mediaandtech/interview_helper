import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, GAZE, AUDIO, PITCH, RATE, UI } from '../js/config.js';

test('presets provide editable speed references', () => {
  assert.deepEqual(PRESETS.class,     { label: '수업 발표',   rateMin: 270, rateMax: 330 });
  assert.deepEqual(PRESETS.interview, { label: '면접 답변',   rateMin: 260, rateMax: 320 });
  assert.deepEqual(PRESETS.pitch,     { label: '피칭·공모전', rateMin: 290, rateMax: 350 });
});

test('key thresholds', () => {
  assert.equal(GAZE.yawDeg, 15); assert.equal(GAZE.pitchDeg, 12); assert.equal(GAZE.eyeThreshold, 0.5);
  assert.deepEqual(AUDIO.okRangeDb, [-6, 8]);
  assert.deepEqual([PITCH.minHz, PITCH.maxHz, PITCH.windowSec], [75, 400, 10]);
  assert.equal(RATE.windowSec, 10);
  assert.equal(UI.sampleHz, 10);
});
