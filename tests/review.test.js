import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReview, nearestSample, observedSegments } from '../js/analysis/review.js';
import { analyzeGaze } from '../js/analysis/gaze-logic.js';
import { escapeHtml } from '../js/util/html.js';
const settings = { rateMin:260, rateMax:320 };

test('no sensor data produces missing observations and no evaluation', () => {
  const r=buildReview([{t:59.9,frontal:null,rate:null,speaking:false}],settings,60);
  assert.equal(r.frontalPct,null); assert.equal(r.avgRate,null); assert.equal(r.pitchSt,null);
  assert.equal(r.durationSec,60);
  for (const key of ['score','headline','tips']) assert.equal(key in r,false);
});
test('silence splits isolated low-volume segments instead of spanning a minute', () => {
  const samples=Array.from({length:600},(_,i)=>({t:i/10,speaking:i<10||i>=590,deltaDb:-9}));
  const r=buildReview(samples,settings,60);
  assert.equal(r.intervals.length,2);
  assert.ok(r.intervals.every(x=>Math.abs(x.dur-1)<1e-8));
});
test('missing sampling time and missing rate break observation intervals', () => {
  assert.equal(observedSegments([{t:0},{t:10}],()=> 'outside').length,2);
  const r=buildReview([{t:0,rate:500},{t:.1,rate:null},{t:10,rate:500}],settings,11);
  assert.equal(r.intervals.length,0);
});
test('face detection loss is excluded from frontal ratio', () => {
  const r=buildReview([{t:0,frontal:true},{t:.1,frontal:false},{t:.2,frontal:null,faceMissing:true}],settings,1);
  assert.equal(r.frontalPct,50); assert.equal(r.faceCoverageSec,.2);
});
test('nearest sample uses timestamp rather than nominal 10Hz index', () => {
  const samples=[{t:1},{t:2},{t:20}];
  assert.equal(nearestSample(samples,19).t,20);
  assert.equal(nearestSample(samples,-1).t,1);
  assert.equal(nearestSample(samples,100).t,20);
  assert.equal(nearestSample([],1),null);
});
test('zero length countdown cancellation remains a valid empty review', () => {
  const r=buildReview([],settings,0);
  assert.equal(r.durationSec,0); assert.deepEqual(r.intervals,[]);
});
test('user-selected head reference range changes classification', () => {
  const face={yaw:20,pitch:0,eye:{}};
  assert.equal(analyzeGaze(face,{}).frontal,false);
  assert.equal(analyzeGaze(face,{gazeLimits:{yawDeg:25,pitchDeg:12}}).frontal,true);
});
test('questions and self-authored notes are escaped before template rendering', () => {
  assert.equal(escapeHtml('<img src="x" onerror=alert(1)>'), '&lt;img src=&quot;x&quot; onerror=alert(1)&gt;');
});
test('volume spread is weighted std of spoken deltaDb', () => {
  const alt=Array.from({length:20},(_,i)=>({t:i/10,speaking:true,deltaDb:i<10?-3:3}));
  assert.ok(Math.abs(buildReview(alt,settings,2).volumeStdDb-3)<1e-6);
  const flat=Array.from({length:10},(_,i)=>({t:i/10,speaking:true,deltaDb:-2}));
  assert.equal(buildReview(flat,settings,1).volumeStdDb,0);
});
test('volume spread is null without speech', () => {
  const r=buildReview([{t:0,speaking:false,deltaDb:-5},{t:.1,speaking:false,deltaDb:4}],settings,.2);
  assert.equal(r.volumeStdDb,null);
});
