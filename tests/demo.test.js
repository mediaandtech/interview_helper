import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_SCENES, demoScene, createDemoAudio, createDemoGaze, DEMO_CALIB } from '../js/sensors/demo.js';
import { createSyllableEstimator } from '../js/analysis/syllables.js';
import { analyzeGaze } from '../js/analysis/gaze-logic.js';

test('demo scenario cycles through every state', () => {
  const names = DEMO_SCENES.map((s) => s.name);
  for (const n of ['normal', 'lookDown', 'quiet', 'fast', 'eyesRight', 'monotone', 'pause', 'headLeft', 'loud', 'slow']) assert.ok(names.includes(n), n);
  const total = DEMO_SCENES.reduce((a, s) => a + s.sec, 0);
  assert.equal(demoScene(0).name, 'normal');
  assert.equal(demoScene(total + 0.5).name, 'normal'); // 반복
});

function runAudio(fromSec, sec) {
  let now = fromSec * 1000;
  const audio = createDemoAudio(() => now);
  const est = createSyllableEstimator();
  let peaks = 0, speak = 0, n = 0;
  for (let i = 0; i < sec * 60; i++) {
    now = fromSec * 1000 + i * (1000 / 60);
    const r = audio.read(DEMO_CALIB.baseDb);
    if (est.push(r.db, now, r.speaking)) peaks++;
    if (r.speaking) speak++; n++;
  }
  return { spm: peaks * 60 / sec, speakRatio: speak / n };
}

test('demo audio: normal speech ≈ 300 syllables/min, fast is faster, pause is silent', () => {
  const start = (name) => { let t = 0; for (const s of DEMO_SCENES) { if (s.name === name) return t; t += s.sec; } };
  const normal = runAudio(start('normal') + 0.5, 6);
  assert.ok(normal.spm > 250 && normal.spm < 350, String(normal.spm));
  assert.ok(normal.speakRatio > 0.9);
  const fast = runAudio(start('fast') + 0.5, 5);
  assert.ok(fast.spm > 360, String(fast.spm));
  const pause = runAudio(start('pause') + 0.5, 2);
  assert.ok(pause.speakRatio < 0.1);
});

test('demo gaze: lookDown is a head-down, eyesRight is eyes only', () => {
  const at = (name) => { let t = 0; for (const s of DEMO_SCENES) { if (s.name === name) return t + s.sec / 2; t += s.sec; } };
  let now = 0;
  const gaze = createDemoGaze(() => now);
  now = at('lookDown') * 1000;
  const d1 = gaze.detect(now);
  assert.equal(analyzeGaze(d1.face, DEMO_CALIB).head.dir, 'down');
  assert.equal(d1.landmarks.length, 478);
  now = at('eyesRight') * 1000;
  const g2 = analyzeGaze(gaze.detect(now).face, DEMO_CALIB);
  assert.deepEqual([g2.head.ok, g2.eye.dir], [true, 'right']);
});
