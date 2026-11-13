// ① 설정 화면: 발표 유형, 발표 시간, 준비 확인(보정)
import { PRESETS, CALIB, GAZE } from '../config.js';
import { calibrateVoice } from '../analysis/audio-math.js';
import { startAudio } from '../sensors/audio.js';
import { initGaze } from '../sensors/gaze.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { createDemoAudio, createDemoGaze, DEMO_CALIB } from '../sensors/demo.js';
import { frameFeature, computeBasicCalibration, calibrationCompatible } from '../analysis/calibration.js';
import { showPreciseCalibration } from './precise-calibration.js';
import { debugLine } from './app.js';
import { button, card, field, switchField, segmented, checklist, bindTabs } from './components.js';

const READ_TEXT = '안녕하세요, 지금부터 발표를 시작하겠습니다.';
const MSG = {
  denied: '주소창 왼쪽 자물쇠 아이콘에서 카메라/마이크를 허용한 뒤 다시 시도해 주세요.',
  nodevice: '장치를 찾을 수 없어요. 연결 상태를 확인해 주세요.',
  busy: '다른 앱(Zoom, FaceTime 등)이나 다른 탭이 사용 중이에요. 그 앱을 닫고 다시 측정해 주세요.',
  model: '얼굴 인식 모델을 불러오지 못했어요. 페이지를 새로고침해 주세요.',
  error: '장치를 여는 중 문제가 생겼어요. 다시 시도해 주세요.',
  noFace: '얼굴이 화면 가운데 오도록 앉아 주세요.',
  noVoice: '목소리가 잘 들리지 않았어요. 조금 더 크게 다시 읽어 주세요.',
};

let root, sketch, raf, app, state;
let generation = 0;
let cancelFrames = null;
let preciseController = null;
const openingSensors = new Set();

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sleepFrames = (ms, onFrame) => new Promise((resolve) => {
  const t0 = performance.now();
  cancelFrames = () => { cancelAnimationFrame(raf); resolve(false); };
  const tick = (now) => {
    try { onFrame(now, (now - t0) / ms); } catch (err) { console.warn('[setup] frame skipped:', err); }
    if (now - t0 >= ms) { cancelFrames = null; resolve(true); } else raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
});

function template() {
  const presets = segmented({ name: 'preset', value: state.presetKey,
    options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) });
  const timeCtl = `<div class="inline"><input class="input num" id="dur-m" type="number" min="1" max="30" aria-label="분"> 분
    <input class="input num" id="dur-s" type="number" min="0" max="59" step="5" aria-label="초"> 초</div>`;
  const rateCtl = `<div class="inline"><input class="input num" id="rate-min" type="number" step="10" aria-label="속도 참고 범위 최소"> ~
    <input class="input num" id="rate-max" type="number" step="10" aria-label="속도 참고 범위 최대"> 음절/분</div>`;
  const question = card({
    title: '연습 이름표 (선택)',
    description: '화면 속 내 목소리와 시선을 보면서 스스로 분석해요. 점수나 자동 평가는 없어요.',
    html: `<div class="stack">
      ${field({ label: '이름표 (같은 이름표끼리 비교해요)', forId: 'question',
        controlHtml: '<textarea class="textarea" id="question" rows="2" maxlength="1000" placeholder="예: 지원 동기 · 1차"></textarea>' })}
      ${field({ label: '참고 범위 프리셋', controlHtml: presets, hint: '초기 참고값이에요. 인터뷰의 정답 기준이 아니며 아래에서 바꿀 수 있어요.' })}
      <div class="row2">
        ${field({ label: '목표 시간', controlHtml: timeCtl, hint: '시간이 지나도 측정은 계속돼요.' })}
        ${field({ label: '속도 참고 범위', controlHtml: rateCtl })}
      </div>
      <details class="disclosure"><summary>정면 참고 범위</summary><div class="row2">
        ${field({ label: '좌우 (±도)', forId: 'gaze-yaw', controlHtml: '<input class="input num" id="gaze-yaw" type="number" min="1" max="90">' })}
        ${field({ label: '위아래 (±도)', forId: 'gaze-pitch', controlHtml: '<input class="input num" id="gaze-pitch" type="number" min="1" max="90">' })}
      </div><p class="hint">보정한 정면 자세를 기준으로 해요. 눈 방향은 별도의 검출 기준도 함께 써요.</p></details>
      ${field({label:'눈 방향 계산 방식',forId:'eye-method',controlHtml:'<select class="select" id="eye-method"><option value="blendshape">기본 방식 · 눈 방향 신호</option><option value="iris">홍채 방식 · 실험</option></select>',hint:'홍채 방식은 개인별 보정 뒤 점검 화면에서 비교해 선택하세요. 정확도가 자동으로 보장되지는 않습니다.'})}
    </div>`,
  });
  const recording = card({
    title: '기록 방식',
    html: `<div class="stack">
      ${switchField({ id: 'record-answer', label: '화면과 목소리를 녹화·녹음해서 다시 보기', hint: '카운트다운 뒤 시작하고, 끝나면 장치를 꺼요.' })}
      ${switchField({ id: 'focus-mode', label: '말하는 동안 측정값 숨기기', hint: '끝난 뒤 분석 화면에서 확인해요.', checked: false })}
      <p class="hint">영상·음성·메모는 이 탭에만 보관돼요(최근 실제 기록 5개). 새로고침하거나 탭을 닫으면 사라지니 필요한 자료는 다운로드하세요. 외부 서비스로 보내지 않으며, 말하기 속도는 마이크 음량 변화로 추정해 실제 음절 수와 다를 수 있어요.</p>
    </div>`,
  });
  const calib = card({
    title: '준비 확인',
    description: '약 10초 · 내 정면 자세와 평소 목소리를 기준으로 잡아요.',
    className: 'calib',
    html: `<div class="stack">
      <div class="preview" id="setup-preview"></div>
      ${checklist([
        { key: 'face', title: '카메라를 정면으로 바라보세요' },
        { key: 'voice', title: '아래 문장을 평소 목소리로 읽어 주세요', html: `<p class="quote">“${READ_TEXT}”</p>` },
      ])}
      <div class="inline"><button type="button" class="btn" data-variant="outline" id="precise-run" disabled>정밀 시선 보정</button><button type="button" class="btn" data-variant="ghost" id="precise-clear" disabled>기본 보정으로</button></div>
      <p id="precise-status" class="hint" role="status">기본 준비 확인 뒤 렌즈·화면 중앙·네 방향을 추가 보정할 수 있습니다.</p>
      <div class="progress" role="progressbar" aria-label="준비 확인 진행"><span style="width:0%"></span></div>
    </div>`,
    footerHtml: `${button({ label: '준비 확인 시작', id: 'calib-run', variant: 'outline' })}
      <button type="button" class="btn" data-size="lg" id="start" disabled>모니터링 시작</button>`,
  });
  return `<div class="setup"><div class="setup-col">${question}${recording}</div><div class="setup-col">${calib}</div></div>`;
}

/** 상단 바 오른쪽: 보조 동작은 눈에 덜 띄게(ghost) */
function topActions() {
  return `${button({ label: '최근 기록 분석으로', id: 'last-review', variant: 'ghost', attrs: app.lastReview ? '' : 'hidden' })}
    ${button({ label: '시선 인식 테스트', id: 'gaze-test', variant: 'ghost', attrs: 'title="고개·눈 방향이 맞게 잡히는지 단계별로 점검합니다"' })}
    ${button({ label: '데모로 체험', id: 'demo-start', variant: 'ghost', attrs: 'title="카메라·마이크 없이 가상 데이터로 흐름을 체험합니다"' })}`;
}

function readForm() {
  const num = (sel, fallback) => {
    const v = Number(root.querySelector(sel).value);
    return root.querySelector(sel).value !== '' && Number.isFinite(v) ? v : fallback;
  };
  const p = PRESETS[state.presetKey];
  const m = num('#dur-m', 0), s = num('#dur-s', 0);
  const durationSec = Math.min(30 * 60, Math.max(60, m * 60 + s));
  let rateMin = num('#rate-min', p.rateMin), rateMax = num('#rate-max', p.rateMax);
  if (rateMin > rateMax) [rateMin, rateMax] = [rateMax, rateMin];
  const gazeLimits = { yawDeg: Math.min(90,Math.max(1,num('#gaze-yaw',GAZE.yawDeg))), pitchDeg: Math.min(90,Math.max(1,num('#gaze-pitch',GAZE.pitchDeg))) };
  rateMin = Math.max(1, Math.min(1000, rateMin)); rateMax = Math.max(rateMin, Math.min(1000, rateMax));
  return { presetKey: state.presetKey, durationSec, rateMin, rateMax, gazeLimits, eyeMethod:root.querySelector('#eye-method').value, question: root.querySelector('#question').value.trim(), recordAnswer: root.querySelector('#record-answer').checked, focusMode: root.querySelector('#focus-mode').checked };
}

function applyPreset(key) {
  state.presetKey = key;
  const p = PRESETS[key];
  root.querySelectorAll('.segmented [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.value === key)));
  root.querySelector('#rate-min').value = p.rateMin;
  root.querySelector('#rate-max').value = p.rateMax;

}

function setStep(name, cls, hint = '') {
  const li = root.querySelector(`li[data-step="${name}"]`);
  li.className = cls;
  li.querySelector('.mark').textContent = cls === 'done' ? '✓' : cls === 'fail' ? '!' : name === 'face' ? '1' : '2';
  li.querySelector('.hint').textContent = hint;
}

function setProgress(f) { root.querySelector('.progress > span').style.width = `${Math.round(f * 100)}%`; }

function updateStart() {
  const btn = root.querySelector('#start');
  const { audio, gaze } = app.sensors;
  root.querySelector('#precise-run').disabled = !gaze || state.calib.yaw0 == null || state.running || gaze.demo;
  root.querySelector('#precise-clear').disabled = !state.basicCalib || state.running || state.calib.kind !== 'precise';
  const faceOk = !gaze || state.calib.yaw0 != null;
  const voiceOk = !audio || state.calib.baseDb != null;
  const tried = state.tried;
  btn.disabled = !(tried && faceOk && voiceOk) || state.running;
  if (!tried) { btn.textContent = '모니터링 시작'; return; }
  const missing = [!gaze && '카메라', !audio && '마이크'].filter(Boolean);
  btn.textContent = missing.length ? `${missing.join('·')} 없이 모니터링 시작` : '모니터링 시작';
}

function stopDemoSensors() {
  // 데모 센서가 남아 있으면 실제 센서를 새로 엽니다
  if (app.sensors.audio?.demo) app.sensors.audio = null;
  if (app.sensors.gaze?.demo) app.sensors.gaze = null;
}

function startDemo() {
  for (const k of ['audio', 'gaze']) if (app.sensors[k] && !app.sensors[k].demo) app.sensors[k].stop();
  app.sensors = { audio: createDemoAudio(), gaze: createDemoGaze() };
  const form = readForm();
  app.settings = { ...form, calib: { ...DEMO_CALIB, gazeLimits: form.gazeLimits } };
  app.go('practice');
}

async function openSensors(token) {
  stopDemoSensors();
  const acquire = async (existing, create) => {
    const sensor = existing ?? await create();
    if (token !== generation) { sensor.stop?.(); throw 'cancelled'; }
    openingSensors.add(sensor);
    return sensor;
  };
  const [a, g] = await Promise.allSettled([
    acquire(app.sensors.audio, startAudio),
    acquire(app.sensors.gaze, initGaze),
  ]);
  for (const r of [a,g]) if (r.status === 'fulfilled') openingSensors.delete(r.value);
  if (token !== generation) {
    for (const r of [a,g]) if (r.status === 'fulfilled') r.value.stop();
    return null;
  }
  app.sensors.audio = a.status === 'fulfilled' ? a.value : null;
  app.sensors.gaze = g.status === 'fulfilled' ? g.value : null;
  return { audioErr: a.status === 'rejected' ? a.reason : null, gazeErr: g.status === 'rejected' ? g.reason : null };
}

async function runCalibration() {
  const btn = root.querySelector('#calib-run');
  state.running = true; btn.disabled = true; updateStart();
  btn.textContent = '장치 켜는 중…';
  const token = generation;
  const voice={baseDb:state.calib.baseDb,baseHz:state.calib.baseHz};
  state.calib={yaw0:null,pitch0:0,eye0:null,...voice};
  state.basicCalib=null;
  root.querySelector('#precise-status').textContent='기본 보정 기준을 다시 측정 중입니다.';
  const opened = await openSensors(token);
  if (!opened || token !== generation || !root) return;
  const { audioErr, gazeErr } = opened; // 화면을 떠남
  const { audio, gaze } = app.sensors;

  // 1단계: 정면 기준 (같은 시간 동안 주변 소음도 잼)
  gaze?.setBase?.(null);
  const noise = [];
  if (gaze) {
    setStep('face', 'active', '');
    btn.textContent = '정면 측정 중…';
    const features=[];
    await sleepFrames(CALIB.faceSec * 1000, (now, f) => {
      setProgress(f * 0.33);
      const d = gaze.detect(now);
      state.landmarks = d.landmarks;
      if (audio) { const db=audio.read(null).db; if(db!=null) noise.push(db); }
      const feature=frameFeature(d); if(!feature.issue) features.push(feature);
    });
    if (token !== generation) return;
    const basic=computeBasicCalibration(features);
    if (basic) {
      Object.assign(state.calib,basic);
      state.basicCalib=structuredClone(state.calib);
      gaze.setBase?.(state.calib);
      setStep('face', 'done', '정면 위치를 기록했어요.');
    } else {
      Object.assign(state.calib, { yaw0: null });
      setStep('face', 'fail', MSG.noFace);
    }
  } else {
    setStep('face', 'fail', MSG[gazeErr] ?? MSG.error);
    // 카메라가 없어도 주변 소음은 재야 목소리 기준이 소음에 끌려가지 않음
    if (audio) {
      btn.textContent = '주변 소음 측정 중… 잠시 조용히';
      await sleepFrames(CALIB.faceSec * 1000, (now, f) => { setProgress(f * 0.33); noise.push(audio.read(null).db); });
    }
  }

  if (token !== generation) return;
  // 2단계: 기준 음량·음높이
  if (audio) {
    setStep('voice', 'active', '');
    btn.textContent = '듣는 중… 문장을 읽어 주세요';
    const frames = [];
    await sleepFrames(CALIB.readSec * 1000, (now, f) => {
      setProgress(0.33 + f * 0.67);
      if (gaze) state.landmarks = gaze.detect(now).landmarks;
      const r = audio.read(null);
      debugLine({ db: r.db, speaking: String(r.speaking), hz: r.hz ?? 0 });
      frames.push({ db: r.db, hz: r.hz });
    });
    if (token !== generation) return;
    const v = calibrateVoice(frames, noise.length ? median(noise) : null);
    if (v) {
      state.calib.baseDb = v.baseDb;
      state.calib.baseHz = v.baseHz;
      setStep('voice', 'done', `기준 음량 ${state.calib.baseDb.toFixed(0)} dB${state.calib.baseHz ? ` · 기준 음높이 ${Math.round(state.calib.baseHz)} Hz` : ''}`);
    } else {
      state.calib.baseDb = null;
      setStep('voice', 'fail', MSG.noVoice);
    }
  } else {
    setStep('voice', 'fail', MSG[audioErr] ?? MSG.error);
  }

  setProgress(1);
  state.tried = true; state.running = false;
  if(state.calib.yaw0!=null) state.basicCalib=structuredClone(state.calib);
  const reused=calibrationCompatible(state.calib,state.savedPrecise);
  if(reused) {state.calib={...state.savedPrecise,baseDb:state.calib.baseDb,baseHz:state.calib.baseHz};gaze?.setBase?.(state.calib);}
  btn.disabled = false; btn.textContent = '다시 측정';
  if(state.calib.yaw0!=null) root.querySelector('#precise-status').textContent=reused?'렌즈 표본과 얼굴 크기를 확인해 이전 정밀 보정을 유지했습니다.':'기본 정면 기준을 기록했습니다. 필요하면 정밀 시선 보정을 진행하세요.';
  updateStart();
}

async function runPrecise() {
  if(state.running || !app.sensors.gaze) return;
  const token=generation;
  state.running=true; root.querySelector('#calib-run').disabled=true; updateStart();
  const controller=new AbortController();
  preciseController=controller;
  const oldBase=state.calib;
  app.sensors.gaze.setBase?.(null);
  try {
    const result=await showPreciseCalibration(app.sensors.gaze,{signal:controller.signal,onFrame:d=>{state.landmarks=d.landmarks;}});
    if(token!==generation) return;
    const status=root.querySelector('#precise-status');
    if(result.cancelled) status.textContent='정밀 보정을 취소했습니다. 이전 기준을 유지합니다.';
    else if(result.calib.quality!=='ok') {
      status.textContent=`보정 표본 또는 방향 구분이 부족합니다 (${(result.calib.missing??result.calib.weak).join(', ')}). 이전 기준을 유지합니다. 다시 시도할 수 있습니다.`;
    } else {
      const voice={baseDb:state.calib.baseDb,baseHz:state.calib.baseHz};
      state.calib={...result.calib,...voice};state.savedPrecise=structuredClone(state.calib);
      status.textContent='렌즈·화면 중앙·네 방향 기준을 기록했습니다. 별도의 시선 인식 테스트에서 두 방식을 비교하세요.';
    }
  } catch(err) {
    console.warn('[setup] precise calibration failed:',err);
    if(token===generation) root.querySelector('#precise-status').textContent='정밀 보정을 마치지 못했습니다. 이전 기준으로 다시 시도할 수 있습니다.';
  } finally {
    if(token===generation) {
      app.sensors.gaze?.setBase?.(state.calib??oldBase);state.running=false;
      root.querySelector('#calib-run').disabled=false;updateStart();
    }
    if(preciseController===controller) preciseController=null;
  }
}

export function enter(appRef) {
  generation++;
  app = appRef;
  root = document.getElementById('screen-setup');
  state = { presetKey: app.settings?.presetKey ?? 'interview', calib: { yaw0: null, pitch0: 0, eye0: null, baseDb: null, baseHz: null },
    tried: false, running: false, landmarks: null, savedPrecise:app.settings?.calib?.kind==='precise'?structuredClone(app.settings.calib):null };
  root.innerHTML = template();
  document.getElementById('topbar-right').innerHTML = topActions();
  bindTabs(root);

  applyPreset(state.presetKey);
  root.querySelector('#eye-method').value=app.settings?.eyeMethod??'blendshape';
  root.querySelector('#precise-run').onclick=runPrecise;
  root.querySelector('#precise-clear').onclick=()=>{state.calib=structuredClone(state.basicCalib);state.savedPrecise=null;app.sensors.gaze?.setBase?.(state.calib);root.querySelector('#precise-status').textContent='기본 보정 기준으로 돌아왔습니다.';updateStart();};
  root.querySelector('#question').value = app.settings?.question ?? '';
  root.querySelector('#record-answer').checked = app.settings?.recordAnswer ?? false;
  root.querySelector('#focus-mode').checked = app.settings?.focusMode ?? false;
  for (const [id,key] of [['rate-min','rateMin'],['rate-max','rateMax']]) if (app.settings?.[key] != null) root.querySelector('#'+id).value = app.settings[key];
  root.querySelector('#gaze-yaw').value = app.settings?.gazeLimits?.yawDeg ?? GAZE.yawDeg;
  root.querySelector('#gaze-pitch').value = app.settings?.gazeLimits?.pitchDeg ?? GAZE.pitchDeg;
  const dur = app.settings?.durationSec ?? 120;
  root.querySelector('#dur-m').value = Math.floor(dur / 60);
  root.querySelector('#dur-s').value = dur % 60;

  root.querySelector('.segmented').addEventListener('change', (e) => applyPreset(e.detail.value));
  const top = document.getElementById('topbar-right');
  top.querySelector('#last-review').onclick = () => { app.settings = { ...app.settings, ...readForm() }; app.go('report'); };
  root.querySelector('#calib-run').addEventListener('click', runCalibration);
  top.querySelector('#demo-start').addEventListener('click', startDemo);
  top.querySelector('#gaze-test').addEventListener('click', () => { app.settings = { ...readForm(), calib:state.calib.yaw0!=null?{...structuredClone(state.calib),gazeLimits:readForm().gazeLimits}:null }; app.go('gazetest'); });
  if (app.demo && !app.demoAutoStarted) { app.demoAutoStarted = true; startDemo(); return; } // ?demo=1
  root.querySelector('#start').addEventListener('click', () => {
    const c = state.calib;
    const form = readForm();
    app.settings = { ...form, calib: { ...c, gazeLimits: form.gazeLimits, eyeMethod:form.eyeMethod,
      baseDb: app.sensors.audio ? c.baseDb : null, baseHz: c.baseHz,
      yaw0: c.yaw0 ?? 0, pitch0: c.pitch0 ?? 0, eye0: c.eye0 ?? { down: 0, up: 0, left: 0, right: 0 },
    } };
    app.go('practice');
  });

  sketch = createWebcamSketch(root.querySelector('#setup-preview'), () => {
    const g = app.sensors.gaze;
    if (g && !state.running) state.landmarks = g.detect(performance.now()).landmarks;
    return { video: g?.video ?? null, landmarks: state.landmarks, status: 'idle', neutral: true, dir: 'front' };
  });
}

export function leave(next) {
  generation++;
  preciseController?.abort();
  cancelFrames?.(); cancelFrames = null;
  for (const sensor of openingSensors) sensor.stop?.();
  openingSensors.clear();
  if (next !== 'practice') {
    for (const sensor of Object.values(app.sensors)) sensor?.stop?.();
    app.sensors = { audio: null, gaze: null };
  }
  cancelAnimationFrame(raf);
  sketch?.remove(); sketch = null;
  root.innerHTML = ''; root = null;
}
