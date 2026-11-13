import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder } from '../js/recorder.js';

test('recorder keeps samples in order', () => {
  const r = createRecorder(); r.push({ t: 0 }); r.push({ t: 0.1 });
  assert.deepEqual(r.samples().map((s) => s.t), [0, 0.1]);
});
