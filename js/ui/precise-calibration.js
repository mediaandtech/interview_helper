import { runPreciseCalibration, CALIB_ISSUE_TEXT, CALIB_TARGETS } from '../analysis/calibration.js';

/** 취소·화면 이탈 때 대기 중인 animation frame도 해제하는 정밀 보정 창. */
export async function showPreciseCalibration(gaze, { signal, onFrame=()=>{} } = {}) {
  const controller=new AbortController();
  const dialog=document.createElement('dialog');
  dialog.className='precise-dialog';
  dialog.setAttribute('aria-labelledby','precise-heading');
  dialog.innerHTML=`<div class="calibration-board"><div class="calibration-target" aria-hidden="true"></div>
    <div class="calibration-instructions"><h2 id="precise-heading">정밀 시선 보정</h2>
    <p id="precise-say" aria-live="polite"></p><p id="precise-issue" class="hint"></p>
    <progress id="precise-progress" max="1" value="0" aria-label="현재 지점 표본 수집"></progress>
    <p class="hint">고개와 기기 위치를 유지하세요. 눈에 불편함이 있으면 취소할 수 있습니다.</p>
    <button class="btn" data-variant="outline" id="precise-cancel">보정 취소 (Esc)</button></div></div>`;
  let cancelWait=null;
  const abort=()=>{ controller.abort(); cancelWait?.(); };
  signal?.addEventListener('abort',abort,{once:true});
  dialog.addEventListener('cancel',e=>{e.preventDefault();abort();});
  dialog.querySelector('#precise-cancel').onclick=abort;
  document.body.append(dialog);
  if (signal?.aborted) abort();
  if (!controller.signal.aborted) dialog.showModal();
  const nextFrame=()=>new Promise(resolve=>{
    let id;
    const done=now=>{cancelWait=null;resolve(now);};
    cancelWait=()=>{cancelAnimationFrame(id);done(performance.now());};
    id=requestAnimationFrame(done);
    if (controller.signal.aborted) cancelWait();
  });
  try {
    return await runPreciseCalibration({
      signal:controller.signal,nextFrame,
      readFrame:now=>{const d=gaze.detect(now);onFrame(d);return d;},
      onUpdate:u=>{
        const i=CALIB_TARGETS.findIndex(t=>t.id===u.target.id);
        dialog.dataset.target=u.target.id;
        const target=dialog.querySelector('.calibration-target');
        target.style.left=`${u.target.pos.x*100}%`;
        target.style.top=`${Math.max(.025,u.target.pos.y)*100}%`;
        dialog.querySelector('#precise-heading').textContent=`${i+1} / ${CALIB_TARGETS.length} · ${u.target.title}`;
        dialog.querySelector('#precise-say').textContent=u.target.id==='lens' ? '지금은 기기의 실제 카메라 렌즈를 바라보세요. 렌즈 위치는 기기마다 다를 수 있습니다.' : u.target.say;
        dialog.querySelector('#precise-issue').textContent=u.state==='failed' ? `표본 수집 미완료 · ${CALIB_ISSUE_TEXT[u.issue]??u.issue}` : u.issue ? CALIB_ISSUE_TEXT[u.issue]??u.issue : u.state==='settling' ? '시선이 자리 잡기를 기다리는 중' : '안정적인 새 영상 표본 수집 중';
        dialog.querySelector('#precise-progress').value=u.progress;
      },
    });
  } finally {
    cancelWait?.(); signal?.removeEventListener('abort',abort);dialog.close();dialog.remove();
  }
}
