import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatStamp, formatOver } from '../js/util/time.js';

test('formats', () => {
  assert.equal(formatClock(192), '03:12'); assert.equal(formatClock(0), '00:00');
  assert.equal(formatStamp(97), '1:37');   assert.equal(formatStamp(230), '3:50');
  assert.equal(formatOver(24), '+0:24');   assert.equal(formatOver(-24), '-0:24');
});
