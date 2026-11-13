import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaErrorReason } from '../js/sensors/audio.js';

test('camera/mic busy in another app is reported as busy, not missing', () => {
  assert.equal(mediaErrorReason({ name: 'NotReadableError' }), 'busy');
  assert.equal(mediaErrorReason({ name: 'AbortError' }), 'busy');
  assert.equal(mediaErrorReason({ name: 'NotAllowedError' }), 'denied');
  assert.equal(mediaErrorReason({ name: 'NotFoundError' }), 'nodevice');
  assert.equal(mediaErrorReason({ name: 'Weird' }), 'error');
});
