// 사용자가 보정에 사용하지 않은 별도 표본으로 두 계산 방식을 직접 비교합니다.
import { CALIB } from '../config.js';
import { initGaze } from '../sensors/gaze.js';
import { createDemoGaze } from '../sensors/demo.js';
import { GAZE_REASON_TEXT } from '../analysis/gaze-logic.js';
import { createGazePipeline } from '../analysis/gaze-pipeline.js';
import { frameFeature, computeBasicCalibration } from '../analysis/calibration.js';
import { GAZE_TEST_STEPS, frameLabel, evaluateObservationStep } from '../analysis/gaze-test.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { button, card, createProgress, dataTable } from './components.js';
import { escapeHtml as esc } from '../util/html.js';

const PREP_MS=2000, MEASURE_MS=3000, FRAME_MS=1000/30;
let app,root,raf,sketch,st,generation=0;
const $=id=>root.querySelector(`#${id}`);
const pct=v=>`${v.toFixed(1)}%`;
function template() {
  return `<div class="gtest"><div class="cam" id="gt-cam"></div><div class="gt-side">
    ${card({className:'gt-step',title:'시선 인식 점검',html:`<div class="stack">
      <p class="hint" id="gt-count">보정과 별도의 확인 표본을 수집합니다.</p>
      <h2 class="gt-title" id="gt-title">내 기기의 감지 결과 확인</h2>
      <p id="gt-say">렌즈 보기, 네 방향, 눈 감김, 한쪽 눈 가림, 반복 정면 보기를 약 1분간 확인합니다. 두 방식이 일치해도 실제 정확도를 보장하지는 않습니다.</p>
      <div id="gt-progress"></div><p id="gt-phase" role="status"></p>
      <div class="gt-now">안정화: <b id="gt-now">—</b></div><p class="hint" id="gt-raw">원시: —</p>
      <p class="hint" id="gt-source"></p>
      <div class="inline">${button({label:'점검 시작',id:'gt-start'})}${button({label:'이 단계 건너뛰기',id:'gt-skip',variant:'outline',attrs:'hidden'})}</div>
    </div>`})}
    ${card({title:'실시간 관찰',html:'<pre class="gaze-values" id="gt-values">표본 대기</pre>'})}
    ${card({title:'같은 표본으로 두 방식 비교',id:'gt-result',html:'<p class="hint">점검 후 방향 일치 비율, 시선 미측정 비율, 첫 일치까지 걸린 시간을 표시합니다. 수행 점수·통과 판정은 제공하지 않습니다.</p>'})}
  </div></div>`;
}
function next(i,now) {
  st.i=i;st.phase='prep';st.phaseStart=now;st.frames=[];
  const step=GAZE_TEST_STEPS[i];
  $('gt-count').textContent=`${i+1} / ${GAZE_TEST_STEPS.length}`;
  $('gt-title').textContent=step.title;$('gt-say').textContent=step.say;
  $('gt-skip').hidden=false;
}
function finishStep(now,skipped=false) {
  const step=GAZE_TEST_STEPS[st.i];
  st.results.push({...evaluateObservationStep(st.frames,step,MEASURE_MS/1000),skipped});
  if(st.i+1<GAZE_TEST_STEPS.length) next(st.i+1,now);else finish();
}
function finish() {
  st.phase='done';$('gt-skip').hidden=true;
  $('gt-title').textContent='관찰 결과';$('gt-say').textContent='안내한 동작과 기록을 대조해 사용할 계산 방식을 직접 선택하세요.';
  $('gt-phase').textContent='확인용 표본 수집 완료';$('gt-start').hidden=false;$('gt-start').textContent='다시 점검';
  st.progress.update(1,'idle');
  const rows=st.results.map(r=>`<tr><td>${esc(r.title)}${r.skipped?' (건너뜀)':''}</td><td>${r.skipped?'—':pct(r.blend.matchPct)}</td><td>${r.skipped?'—':r.iris.usedIris?pct(r.iris.matchPct):'홍채 기준 없음'}</td><td>${r.skipped?'—':pct(r.unknownPct)}</td><td>${r.firstMatchSec==null?'—':r.firstMatchSec.toFixed(2)+'초'}</td></tr>`);
  $('gt-result').innerHTML=`<header><h2>같은 표본으로 두 방식 비교</h2><p>일치 비율은 측정 시간 전체를 분모로 사용합니다. 첫 일치 시간에는 사용자 반응과 평활화 지연이 포함됩니다.</p></header><section class="stack">
    <div class="intervals">${dataTable({columns:['안내 동작','기본 일치','홍채 일치','선택 방식 미측정','시작→첫 일치'],rowsHtml:rows})}</div>
    <p class="hint">눈 감김·가림 확인은 시선 미측정 비율이 높을 수 있습니다. 보정값을 이 표본으로 다시 학습하거나 계산 방식을 자동 선택하지 않습니다. 손 가림은 영상 추정이라 확정적으로 감지되지 않을 수 있습니다.</p>
    <div class="inline">${button({label:'기본 방식 사용',id:'gt-use-blend',variant:'outline'})}${button({label:'홍채 방식 사용 · 실험',id:'gt-use-iris',variant:'outline',attrs:Object.keys(st.calib?.iris0??{}).length?'':'disabled'})}${button({label:'결과 다운로드',id:'gt-export',variant:'outline'})}</div><p id="gt-selected" class="hint" role="status"></p></section>`;
  const choose=method=>{app.settings={...app.settings,eyeMethod:method};$('gt-selected').textContent=`다음 모니터링의 계산 방식: ${method==='iris'?'홍채 방식(실험)':'기본 방식'}. 시작 전 준비 확인을 다시 진행하세요.`;};
  $('gt-use-blend').onclick=()=>choose('blendshape');$('gt-use-iris').onclick=()=>choose('iris');
  $('gt-export').onclick=()=>{
    const blob=new Blob([JSON.stringify({calibration:st.calib,method:app.settings?.eyeMethod??'blendshape',results:st.results,observations:st.recorded},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='gaze-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}
function showObservation(processed) {
  const g=processed.stable,raw=processed.raw;
  st.view=g;st.raw=raw;
  $('gt-now').textContent=frameLabel(g);$('gt-raw').textContent=`원시: ${frameLabel(raw)}${g.pending?' · 방향 전환 확인 중':''}`;
  const source={both:'양쪽 눈',L:'왼쪽 눈만',R:'오른쪽 눈만',avg:'평균 신호',none:'사용 가능한 눈 없음'};
  $('gt-source').textContent=`${source[g.eye.source]??'—'} · ${g.eye.method==='iris'?'홍채 방식(실험)':'기본 방식'}${g.reason?' · '+(GAZE_REASON_TEXT[g.reason]??g.reason):''}`;
  const face=processed.frame?.face;
  $('gt-values').textContent=face ? `고개 좌우 ${face.yaw.toFixed(1)}° · 위아래 ${face.pitch.toFixed(1)}°\n`+['L','R'].map(side=>{
    const e=face.eyes?.[side];return `${side==='L'?'왼쪽':'오른쪽'} 눈: ${e?.state??'정보 없음'} · 홍채 ${e?.iris?e.iris.x.toFixed(3)+', '+e.iris.y.toFixed(3):'—'}`;
  }).join('\n'):'유효한 얼굴 표본 없음';
}
function step(now) {
  if(!st.gaze || now-st.lastFrame<FRAME_MS) return;
  st.lastFrame=now;const d=st.gaze.detect(now);st.landmarks=d.landmarks;
  if(st.phase==='calib') {
    const feature=frameFeature(d);if(!feature.issue) st.calibFrames.push(feature);
    const elapsed=now-st.phaseStart;st.progress.update(elapsed/(CALIB.faceSec*1000),'idle');
    if(elapsed>=CALIB.faceSec*1000) {
      const basic=computeBasicCalibration(st.calibFrames);
      if(!basic) {st.phase='idle';$('gt-title').textContent='정면 기준 표본 부족';$('gt-say').textContent='눈을 뜬 상태로 렌즈를 보고 다시 시작하세요.';$('gt-start').hidden=false;return;}
      st.calib=st.existingCalib??basic;st.gaze.setBase?.(st.calib);st.pipeline=createGazePipeline(st.calib,app.settings?.eyeMethod??'blendshape');next(0,now);
    }
    return;
  }
  const processed=st.pipeline?.update(d,now);
  if(processed) showObservation(processed);
  const elapsed=now-st.phaseStart;
  if(st.phase==='prep') {
    $('gt-phase').textContent='자세 준비 중';st.progress.update(elapsed/PREP_MS,'idle');
    if(elapsed>=PREP_MS) {st.phase='measure';st.phaseStart=now;st.frames=[];}
  } else if(st.phase==='measure') {
    $('gt-phase').textContent='확인 표본 수집 중';st.progress.update(elapsed/MEASURE_MS,'idle');
    if(processed) {
      const observation={...processed.stable,t:elapsed/1000,blend:processed.blend,iris:processed.iris,raw:processed.raw};
      st.frames.push(observation);st.recorded.push({step:GAZE_TEST_STEPS[st.i].id,...observation});
    }
    if(elapsed>=MEASURE_MS) finishStep(now);
  }
}
function loop(now) {raf=requestAnimationFrame(loop);try{step(now);}catch(err){console.warn('[gazetest] frame skipped:',err);}}
async function begin() {
  const token=generation;$('gt-start').hidden=true;
  st.results=[];st.recorded=[];st.calibFrames=[];st.existingCalib=app.settings?.calib?.yaw0!=null?structuredClone(app.settings.calib):null;
  try {
    if(!st.gaze) {
      const gaze=app.demo?createDemoGaze():await initGaze();
      if(token!==generation){gaze.stop();return;}st.gaze=gaze;
    }
    st.gaze.setBase?.(null);st.phase='calib';st.phaseStart=performance.now();
$('gt-title').textContent='렌즈 기준 확인';
    $('gt-say').textContent=st.existingCalib?'렌즈를 보고 잠시 기다리세요. 설정에서 만든 보정값으로 별도 표본을 확인합니다.':'렌즈를 보고 기본 정면 기준을 잡습니다. 이후 별도 확인 표본을 수집합니다.';
  } catch {
    if(token!==generation)return;st.phase='idle';$('gt-start').hidden=false;$('gt-title').textContent='카메라를 열지 못했습니다';$('gt-say').textContent='카메라 권한과 연결 상태를 확인한 뒤 다시 시도하세요.';
  }
}
export function enter(appRef) {
  generation++;app=appRef;root=document.getElementById('screen-gazetest');root.innerHTML=template();
  st={gaze:null,calib:null,phase:'idle',lastFrame:0,landmarks:null,view:null,results:[],recorded:[]};st.progress=createProgress($('gt-progress'));
  document.getElementById('topbar-right').innerHTML=button({label:'설정으로',id:'gt-exit',variant:'outline'});
  document.getElementById('gt-exit').onclick=()=>{const url=new URL(location.href);url.searchParams.delete('gazetest');history.replaceState(null,'',url);app.go('setup');};
  $('gt-start').onclick=begin;$('gt-skip').onclick=()=>{if(['prep','measure'].includes(st.phase))finishStep(performance.now(),true);};
  sketch=createWebcamSketch($('gt-cam'),()=>({video:st.gaze?.video??null,landmarks:st.landmarks,status:'idle',neutral:true,head:st.view?.head,eye:st.view?.eye,demo:!!st.gaze?.demo}));
  raf=requestAnimationFrame(loop);
}
export function leave() {generation++;cancelAnimationFrame(raf);st?.gaze?.stop?.();app.sensors.gaze=null;sketch?.remove();sketch=null;if(root)root.innerHTML='';root=null;}
