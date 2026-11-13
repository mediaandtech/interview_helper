import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGazePipeline} from '../js/analysis/gaze-pipeline.js';
import {summarizeGaze,timedSlices} from '../js/analysis/gaze-timeline.js';
import {analyzeGaze,headAnglesFromMatrix} from '../js/analysis/gaze-logic.js';
import {buildReview} from '../js/analysis/review.js';
import {evaluateObservationStep,frameMatches,GAZE_TEST_STEPS} from '../js/analysis/gaze-test.js';
const frame=(yaw=0,extra={})=>({fresh:true,face:{yaw,pitch:0,eye:{}},quality:{reason:null},...extra});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('pipeline ignores repeated video frames and immediately excludes stale results',()=>{
 const p=createGazePipeline();assert.equal(p.update(frame(),0).stable.frontal,true);
 assert.equal(p.update(frame(0,{fresh:false}),100),null);
 const stale=p.update(frame(0,{fresh:false,quality:{reason:'stale'}}),600);
 assert.equal(stale.stable.frontal,null);assert.equal(stale.stable.reason,'stale');
});
test('a direction must persist before stable view changes; raw value remains available',()=>{
 const p=createGazePipeline();p.update(frame(),0);
 const first=p.update(frame(35),33);assert.equal(first.raw.dir,'right');assert.equal(first.stable.dir,'front');
 let last;for(let t=66;t<1100;t+=33)last=p.update(frame(35),t);
 assert.equal(last.stable.dir,'right');
});
test('measurement gap resets direction and smoothing history',()=>{
 const p=createGazePipeline();p.update(frame(),0);
 const next=p.update(frame(35),1000);assert.equal(next.stable.dir,'right');
});
test('closed eyes immediately remove frontal status instead of holding the previous label',()=>{
 const p=createGazePipeline();p.update(frame(),0);
 const eyes={L:{state:'closed',blend:{},iris:null},R:{state:'closed',blend:{},iris:null}};
 const r=p.update(frame(0,{face:{yaw:0,pitch:0,eye:{down:.9},eyes}}),33);
 assert.equal(r.stable.frontal,null);assert.equal(r.stable.reason,'eyes-closed');
});
test('iris method without a personal iris reference remains uncertain',()=>{
 const eyes=Object.fromEntries(['L','R'].map(s=>[s,{state:'ok',iris:{x:0,y:0},blend:{}}]));
 const r=analyzeGaze({yaw:0,pitch:0,eye:{},eyes},{},{method:'iris'});
 assert.equal(r.frontal,null);assert.equal(r.eye.dir,'uncertain');
});
test('personal blend boundaries are actually used',()=>{
 const face={yaw:0,pitch:0,eye:{left:.3}};
 assert.equal(analyzeGaze(face,{}).eye.dir,'front');
 assert.equal(analyzeGaze(face,{blendBounds:{left:.2}}).eye.dir,'left');
});
test('iris outside calibrated envelope is excluded',()=>{
 const eyes=Object.fromEntries(['L','R'].map(s=>[s,{state:'ok',iris:{x:.5,y:0},blend:{}}]));
 const r=analyzeGaze({yaw:0,pitch:0,eye:{},eyes},{iris0:{L:{x:0,y:0},R:{x:0,y:0}}},{method:'iris'});
 assert.equal(r.frontal,null);assert.equal(r.reason,'out-of-range');
});
test('head matrix removes uniform scale before computing yaw',()=>{
 const a=.35,c=Math.cos(a),s=Math.sin(a);
 const matrix=[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];
 near(headAnglesFromMatrix(matrix.map((v,i)=>i<12?v*.9:v)).yaw,headAnglesFromMatrix(matrix).yaw);
});
test('duration weighting is independent of 10Hz versus 30Hz sampling',()=>{
 const run=hz=>summarizeGaze(Array.from({length:hz*2},(_,i)=>({t:i/hz,frontal:i<hz,dir:i<hz?'front':'left'})),2);
 const a=run(10),b=run(30);near(a.frontalPct,50);near(a.frontalPct,b.frontalPct);near(a.validSec,b.validSec);
});
test('sparse/frozen frames cannot fill a long gap with the last observation',()=>{
 const r=summarizeGaze([{t:0,frontal:true},{t:3,frontal:false}],4);
 near(r.validSec,.3);near(r.unknownSec,3.7);
});
test('recorded fresh observations override the 10Hz UI sampling fields',()=>{
 const samples=[{t:0,frontal:true,gazeFrames:[{t:0,frontal:false},{t:.1,frontal:null,gazeReason:'eyes-closed'}]},{t:.2,frontal:true,gazeFrames:[]}];
 const r=summarizeGaze(samples,.3);near(r.frontalPct,0);near(r.validSec,.1);near(r.reasons['eyes-closed'],.15);
});
test('no fresh observation is not converted into a valid measurement',()=>{
 const r=summarizeGaze([{t:0,frontal:true,gazeFrames:[]}],10);assert.equal(r.frontalPct,null);near(r.unknownSec,10);
});
test('same-frame method agreement uses only time when both methods can measure',()=>{
 const r=summarizeGaze([{t:0,frontal:true,blend:{frontal:true,dir:'front'},iris:{frontal:null,dir:'uncertain'}},{t:.1,frontal:true,blend:{frontal:true,dir:'front'},iris:{frontal:true,dir:'front'}}],.2);
 near(r.comparison.seconds,.1);near(r.comparison.agreementPct,100);
});
test('review keeps eye-closed intervals distinct from looking down',()=>{
 const samples=Array.from({length:20},(_,i)=>({t:i/10,frontal:null,gazeReason:'eyes-closed'}));
 const r=buildReview(samples,{rateMin:260,rateMax:320},2);
 assert.equal(r.frontalPct,null);assert.ok(r.intervals.some(i=>i.label==='눈 감김'));
 assert.ok(!r.intervals.some(i=>i.label==='정면 참고 범위 밖'));
});
test('held-out check summaries contain observations and no pass/score verdict',()=>{
 const step=GAZE_TEST_STEPS.find(s=>s.id==='front');
 const frames=Array.from({length:20},(_,i)=>({t:i/10,frontal:i<10,head:{ok:i<10,dir:i<10?'front':'right'},eye:{ok:true,dir:'front'}}));
 const r=evaluateObservationStep(frames,step,2);near(r.matchPct,50);assert.equal(r.firstMatchSec,0);
 assert.equal('pass' in r,false);assert.equal('score' in r,false);
});
test('closed eyes and one-eye source are explicit check targets',()=>{
 const closed=GAZE_TEST_STEPS.find(s=>s.kind==='closed'),single=GAZE_TEST_STEPS.find(s=>s.id==='cover-left');
 assert.equal(frameMatches({eye:{dir:'closed'}},closed),true);
 assert.equal(frameMatches({eye:{source:'R'}},single),true);
});

test('opposite signals from the two eyes remain uncertain instead of averaging to front',()=>{
 const eyes={L:{state:'ok',iris:{x:-.2,y:0},blend:{left:.9}},R:{state:'ok',iris:{x:.2,y:0},blend:{right:.9}}};
 const face={yaw:0,pitch:0,eye:{},eyes},calib={iris0:{L:{x:0,y:0},R:{x:0,y:0}}};
 for(const method of ['blendshape','iris'])assert.equal(analyzeGaze(face,calib,{method}).frontal,null);
});

test('an empty check window reports no measured direction and 100 percent unmeasured',()=>{
 const r=evaluateObservationStep([],GAZE_TEST_STEPS[0],3);
 assert.equal(r.matchPct,0);assert.equal(r.unknownPct,100);
 assert.equal(r.blend.unknownPct,100);assert.equal(r.iris.unknownPct,100);
});
