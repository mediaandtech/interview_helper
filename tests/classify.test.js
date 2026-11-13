import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRate, classifyVolume, classifyPitchVar, classifyTime, classifyGazeRatio } from '../js/analysis/classify.js';

const S = { rateMin: 270, rateMax: 330 };

test('classifyRate', () => {
  assert.equal(classifyRate(null, S), 'idle');
  assert.equal(classifyRate(300, S), 'ok');  assert.equal(classifyRate(270, S), 'ok');
  assert.equal(classifyRate(355, S), 'warn'); assert.equal(classifyRate(245, S), 'warn');
  assert.equal(classifyRate(361, S), 'bad');  assert.equal(classifyRate(239, S), 'bad');
});

test('classifyVolume', () => {
  assert.equal(classifyVolume(-20, false), 'idle');
  assert.equal(classifyVolume(null, true), 'idle');
  assert.equal(classifyVolume(0, true), 'ok'); assert.equal(classifyVolume(-6, true), 'ok'); assert.equal(classifyVolume(8, true), 'ok');
  assert.equal(classifyVolume(-8, true), 'warn'); assert.equal(classifyVolume(10, true), 'warn');
  assert.equal(classifyVolume(-11, true), 'bad'); assert.equal(classifyVolume(13, true), 'bad');
});

test('classifyPitchVar', () => {
  assert.deepEqual(classifyPitchVar(null), { status: 'idle', label: '—' });
  assert.deepEqual(classifyPitchVar(1.0), { status: 'warn', label: '단조' });
  assert.deepEqual(classifyPitchVar(2.5), { status: 'ok', label: '적정' });
  assert.deepEqual(classifyPitchVar(5),   { status: 'ok', label: '풍부' });
});

test('classifyTime', () => {
  assert.deepEqual(classifyTime(108, 300), { status: 'ok',   text: '03:12' });
  assert.deepEqual(classifyTime(250, 300), { status: 'warn', text: '00:50' });
  assert.deepEqual(classifyTime(324, 300), { status: 'bad',  text: '+0:24' });
});

test('classifyGazeRatio', () => {
  assert.equal(classifyGazeRatio(null, 0.8), 'idle');
  assert.equal(classifyGazeRatio(0.8, 0.8), 'ok'); assert.equal(classifyGazeRatio(0.7, 0.8), 'warn');
  assert.equal(classifyGazeRatio(0.64, 0.8), 'bad');
});
