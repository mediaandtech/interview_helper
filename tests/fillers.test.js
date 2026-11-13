import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countFillers } from '../js/analysis/fillers.js';
import { buildReport } from '../js/analysis/scoring.js';

test('countFillers counts standalone filler words only', () => {
  assert.equal(countFillers('음 그 저는 어 발표를 그러니까'), 3);
  assert.equal(countFillers('음… 어... 저 그게'), 3);
  assert.equal(countFillers(''), 0);
});

test('report adds a filler tip when used 5+ times', () => {
  const samples = Array.from({ length: 600 }, (_, i) => ({ t: i / 10, frontal: true, dir: 'front', speaking: true,
    db: -20, deltaDb: 0, hz: 200 * 2 ** (3 * Math.sin(i / 10) / 12), rate: 300 }));
  const set = { presetKey: 'class', durationSec: 60, rateMin: 270, rateMax: 330, gazeTarget: 0.8, calib: { baseDb: -20 } };
  const r = buildReport(samples, set, { fillerCount: 7 });
  assert.ok(r.tips.some((x) => x.text === "'음', '어'를 7번 사용했어요. 잠깐 멈추는 것으로 바꿔 보세요."), JSON.stringify(r.tips));
  assert.equal(r.fillerCount, 7);
  const r2 = buildReport(samples, set, { fillerCount: 2 });
  assert.ok(!r2.tips.some((x) => x.text.includes("'음'")));
});
