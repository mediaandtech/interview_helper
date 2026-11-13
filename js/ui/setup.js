// ① 설정 화면: 발표 유형, 발표 시간, 준비 확인(보정)
import { PRESETS, CALIB, GAZE } from '../config.js';
import { calibrateVoice } from '../analysis/audio-math.js';
import { startAudio } from '../sensors/audio.js';
import { initGaze } from '../sensors/gaze.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { createDemoAudio, createDemoGaze, DEMO_CALIB } from '../sensors/demo.js';
import { debugLine } from './app.js';

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
  const chips = Object.entries(PRESETS)
    .map(([k, p]) => `<button class="chip" data-preset="${k}">${p.label}</button>`).join('');
  return `
  <div class="setup">
    <div class="setup-col">
      <div class="panel card">
        <div class="title">1. 연습할 질문</div>
        <label for="question">질문 또는 답변 주제</label>
        <textarea id="question" rows="2" maxlength="1000" placeholder="예: 지원 동기를 말씀해 주세요."></textarea>
        <p class="sub">답변을 기록하고 직접 돌아보는 도구입니다. 점수나 자동 평가는 제공하지 않습니다.</p>
        <div class="title">참고 범위 프리셋</div>
        <div class="chips">${chips}</div>
        <div class="sub">초기 참고값입니다. 면접의 정답 기준이 아니며 아래에서 바꿀 수 있습니다.</div>
      </div>
      <div class="panel card">
        <div class="title">2. 답변 시간</div>
        <div class="time-input">
          <input id="dur-m" type="number" min="1" max="30" aria-label="분"><span>분</span>
          <input id="dur-s" type="number" min="0" max="59" step="5" aria-label="초"><span>초</span>
        </div>
        <div class="sub">스스로 정한 시간과 비교합니다. 시간이 지나도 측정은 계속됩니다.</div>
      </div>
      <details class="panel card advanced">
        <summary class="title">고급 설정</summary>
        <label>속도 참고 범위 (음절/분) <span><input id="rate-min" type="number" step="10"> ~ <input id="rate-max" type="number" step="10"></span></label>
        <label for="gaze-yaw">정면 참고 범위 · 좌우 (±도)<input id="gaze-yaw" type="number" min="1" max="90"></label>
        <label for="gaze-pitch">정면 참고 범위 · 위아래 (±도)<input id="gaze-pitch" type="number" min="1" max="90"></label>
        <p class="sub">보정한 정면 자세를 기준으로 합니다. 눈 방향은 별도의 검출 기준도 함께 사용합니다.</p>
      </details>
      <div class="panel card">
        <label class="check"><input id="record-answer" type="checkbox"> 답변을 녹화·녹음하여 직접 다시 보기</label>
        <label class="check"><input id="focus-mode" type="checkbox" checked> 답변 중 실시간 지표 숨기기</label>
        <p class="sub">녹화는 카운트다운 뒤 시작하며 종료 시 장치를 끕니다. 영상·음성·메모는 현재 탭에만 보관됩니다. 최근 실제 답변 5개를 유지하며 탭을 닫거나 새로고침하면 사라집니다. 필요한 자료는 다운로드하세요.</p>
      </div>
      <p class="privacy">음성·영상을 외부 서비스에 전송하지 않습니다. 말하기 속도는 마이크 음량 변화로 추정하므로 실제 음절 수와 다를 수 있습니다.</p>
    </div>

    <div class="setup-col">
      <div class="panel card calib">
        <div class="title">3. 준비 확인 (약 10초)</div>
        <div class="preview" id="setup-preview"></div>
        <ol class="steps">
          <li data-step="face"><span class="mark">1</span><div><b>카메라를 정면으로 바라보세요</b><div class="hint"></div></div></li>
          <li data-step="voice"><span class="mark">2</span><div><b>아래 문장을 평소 목소리로 읽어 주세요</b>
            <div class="read-text">“${READ_TEXT}”</div><div class="hint"></div></div></li>
        </ol>
        <div class="progress"><div></div></div>
        <div class="calib-actions">
          <button class="btn" id="calib-run">준비 확인 시작</button>
        </div>
      </div>
      <button class="btn primary start" id="start" disabled>연습 시작</button>
      <button class="btn demo-start" id="demo-start" title="카메라·마이크 없이 가상 데이터로 모든 상태를 보여 줍니다">데모 데이터로 체험하기</button>
      <button class="btn" id="last-review" ${app.lastReview ? '' : 'hidden'}>최근 답변 복기로 돌아가기</button>
      <button class="btn demo-start" id="gaze-test" title="고개·눈 방향이 맞게 잡히는지 단계별로 점검합니다">시선 인식 테스트</button>
    </div>
  </div>`;
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
  const gazeTarget = p.gazeTarget;
  const gazeLimits = { yawDeg: Math.min(90,Math.max(1,num('#gaze-yaw',GAZE.yawDeg))), pitchDeg: Math.min(90,Math.max(1,num('#gaze-pitch',GAZE.pitchDeg))) };
  rateMin = Math.max(1, Math.min(1000, rateMin)); rateMax = Math.max(rateMin, Math.min(1000, rateMax));
  return { presetKey: state.presetKey, durationSec, rateMin, rateMax, gazeTarget, gazeLimits, question: root.querySelector('#question').value.trim(), recordAnswer: root.querySelector('#record-answer').checked, focusMode: root.querySelector('#focus-mode').checked };
}

function applyPreset(key) {
  state.presetKey = key;
  const p = PRESETS[key];
  root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.preset === key));
  root.querySelector('#rate-min').value = p.rateMin;
  root.querySelector('#rate-max').value = p.rateMax;

}

function setStep(name, cls, hint = '') {
  const li = root.querySelector(`li[data-step="${name}"]`);
  li.className = cls;
  li.querySelector('.mark').textContent = cls === 'done' ? '✓' : cls === 'fail' ? '!' : name === 'face' ? '1' : '2';
  li.querySelector('.hint').textContent = hint;
}

function setProgress(f) { root.querySelector('.progress > div').style.width = `${Math.round(f * 100)}%`; }

function updateStart() {
  const btn = root.querySelector('#start');
  const { audio, gaze } = app.sensors;
  const faceOk = !gaze || state.calib.yaw0 != null;
  const voiceOk = !audio || state.calib.baseDb != null;
  const tried = state.tried;
  btn.disabled = !(tried && faceOk && voiceOk) || state.running;
  if (!tried) { btn.textContent = '연습 시작'; return; }
  const missing = [!gaze && '카메라', !audio && '마이크'].filter(Boolean);
  btn.textContent = missing.length ? `${missing.join('·')} 없이 연습 시작` : '연습 시작';
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
  const opened = await openSensors(token);
  if (!opened || token !== generation || !root) return;
  const { audioErr, gazeErr } = opened; // 화면을 떠남
  const { audio, gaze } = app.sensors;

  // 1단계: 정면 기준 (같은 시간 동안 주변 소음도 잼)
  const noise = [];
  if (gaze) {
    setStep('face', 'active', '');
    btn.textContent = '정면 측정 중…';
    const yaws = [], pitches = [], eyes = [];
    await sleepFrames(CALIB.faceSec * 1000, (now, f) => {
      setProgress(f * 0.33);
      const d = gaze.detect(now);
      state.landmarks = d.landmarks;
      if (audio) noise.push(audio.read(null).db);
      if (d.face) { yaws.push(d.face.yaw); pitches.push(d.face.pitch); eyes.push(d.face.eye); }
    });
    if (token !== generation) return;
    if (yaws.length >= 10) {
      const avgEye = (k) => eyes.reduce((a, e) => a + e[k], 0) / eyes.length;
      Object.assign(state.calib, { yaw0: median(yaws), pitch0: median(pitches),
        eye0: { down: avgEye('down'), up: avgEye('up'), left: avgEye('left'), right: avgEye('right') } });
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
  btn.disabled = false; btn.textContent = '다시 측정';
  updateStart();
}

export function enter(appRef) {
  generation++;
  app = appRef;
  root = document.getElementById('screen-setup');
  root.innerHTML = template();
  state = { presetKey: app.settings?.presetKey ?? 'interview', calib: { yaw0: null, pitch0: 0, eye0: null, baseDb: null, baseHz: null },
    tried: false, running: false, landmarks: null };

  applyPreset(state.presetKey);
  root.querySelector('#question').value = app.settings?.question ?? '';
  root.querySelector('#record-answer').checked = app.settings?.recordAnswer ?? false;
  root.querySelector('#focus-mode').checked = app.settings?.focusMode ?? true;
  for (const [id,key] of [['rate-min','rateMin'],['rate-max','rateMax']]) if (app.settings?.[key] != null) root.querySelector('#'+id).value = app.settings[key];
  root.querySelector('#gaze-yaw').value = app.settings?.gazeLimits?.yawDeg ?? GAZE.yawDeg;
  root.querySelector('#gaze-pitch').value = app.settings?.gazeLimits?.pitchDeg ?? GAZE.pitchDeg;
  const dur = app.settings?.durationSec ?? 120;
  root.querySelector('#dur-m').value = Math.floor(dur / 60);
  root.querySelector('#dur-s').value = dur % 60;

  root.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => applyPreset(c.dataset.preset)));
  root.querySelector('#last-review').onclick = () => { app.settings = { ...app.settings, ...readForm() }; app.go('report'); };
  root.querySelector('#calib-run').addEventListener('click', runCalibration);
  root.querySelector('#demo-start').addEventListener('click', startDemo);
  root.querySelector('#gaze-test').addEventListener('click', () => { app.settings = { ...readForm() }; app.go('gazetest'); });
  if (app.demo && !app.demoAutoStarted) { app.demoAutoStarted = true; startDemo(); return; } // ?demo=1
  root.querySelector('#start').addEventListener('click', () => {
    const c = state.calib;
    const form = readForm();
    app.settings = { ...form, calib: { gazeLimits: form.gazeLimits,
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
