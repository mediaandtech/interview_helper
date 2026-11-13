import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFrames, calibrateVoice } from '../js/analysis/audio-math.js';

test('summarizeFrames averages dB over speaking frames only', () => {
  const frames = [
    { db: -30, speaking: true, hz: 200 }, { db: -30, speaking: true, hz: 210 }, { db: -30, speaking: true, hz: null },
    { db: -30, speaking: true, hz: 190 }, { db: -60, speaking: false, hz: null }, { db: -60, speaking: false, hz: null },
  ];
  assert.deepEqual(summarizeFrames(frames), { speaking: true, db: -30, hz: 200 });
});

test('summarizeFrames: silent sample keeps the overall mean and no pitch', () => {
  const s = summarizeFrames([{ db: -60, speaking: false, hz: null }, { db: -62, speaking: false, hz: null }, { db: -30, speaking: true, hz: 150 }]);
  assert.equal(s.speaking, false); assert.equal(s.hz, null); assert.ok(Math.abs(s.db - (-50.667)) < 0.01);
});

test('summarizeFrames: empty', () => {
  assert.deepEqual(summarizeFrames([]), { speaking: false, db: null, hz: null });
});

test('calibrateVoice ignores frames near the noise floor', () => {
  const noise = Array.from({ length: 60 }, () => ({ db: -47, hz: null }));
  const voice = Array.from({ length: 60 }, (_, i) => ({ db: -30 + (i % 3), hz: 180 }));
  assert.deepEqual(calibrateVoice([...noise, ...voice], -48), { baseDb: -29, baseHz: 180 });
});

test('calibrateVoice returns null when only noise was heard', () => {
  const noise = Array.from({ length: 120 }, () => ({ db: -46, hz: null }));
  assert.equal(calibrateVoice(noise, -48), null);
});

test('calibrateVoice without a noise floor falls back to -50 dBFS', () => {
  const voice = Array.from({ length: 40 }, () => ({ db: -35, hz: null }));
  assert.deepEqual(calibrateVoice(voice, null), { baseDb: -35, baseHz: null });
});
