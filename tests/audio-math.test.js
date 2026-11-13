import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmsDb, isSpeaking, detectPitch, semitoneStd } from '../js/analysis/audio-math.js';

const sine = (hz, sr = 48000, n = 2048, amp = 0.5) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr));

test('rmsDb', () => {
  assert.equal(rmsDb(new Float32Array(2048)), -100);
  assert.ok(Math.abs(rmsDb(sine(220, 48000, 2048, 1)) - (-3.01)) < 0.1);
});

test('isSpeaking', () => {
  assert.equal(isSpeaking(-30, -20), true);
  assert.equal(isSpeaking(-40, -20), false);
  assert.equal(isSpeaking(-45, null), true);
  assert.equal(isSpeaking(-55, null), false);
});

test('detectPitch finds sine within 2%', () => {
  for (const hz of [90, 150, 220, 330]) {
    const got = detectPitch(sine(hz), 48000);
    assert.ok(got && Math.abs(got - hz) / hz < 0.02, `${hz} -> ${got}`);
  }
});

test('detectPitch null for silence and noise', () => {
  assert.equal(detectPitch(new Float32Array(2048), 48000), null);
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = Float32Array.from({ length: 2048 }, () => rnd() * 2 - 1);
  assert.equal(detectPitch(noise, 48000), null);
});

test('semitoneStd', () => {
  assert.equal(semitoneStd([200, 200]), null);
  assert.ok(semitoneStd([200, 200, 200, 200, 200]) < 1e-9);
  const s = semitoneStd([200, 224.5, 200, 224.5, 200, 224.5]);
  assert.ok(s > 0.9 && s < 1.2, String(s));
});
