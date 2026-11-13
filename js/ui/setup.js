// ① 설정 화면: 발표 유형, 발표 시간, 준비 확인(보정)
import { PRESETS, DEFAULT_DURATION_SEC, CALIB } from '../config.js';
import { startAudio } from '../sensors/audio.js';
import { initGaze } from '../sensors/gaze.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { debugLine } from './app.js';

const READ_TEXT = '안녕하세요, 지금부터 발표를 시작하겠습니다.';
const MSG = {
  denied: '주소창 왼쪽 자물쇠 아이콘에서 카메라/마이크를 허용한 뒤 다시 시도해 주세요.',
  nodevice: '장치를 찾을 수 없어요. 연결 상태를 확인해 주세요.',
  model: '얼굴 인식 모델을 불러오지 못했어요. 페이지를 새로고침해 주세요.',
  error: '장치를 여는 중 문제가 생겼어요. 다시 시도해 주세요.',
  noFace: '얼굴이 화면 가운데 오도록 앉아 주세요.',
  noVoice: '목소리가 잘 들리지 않았어요. 조금 더 크게 다시 읽어 주세요.',
};

let root, sketch, raf, app, state;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sleepFrames = (ms, onFrame) => new Promise((resolve) => {
  const t0 = performance.now();
  const tick = (now) => {
    onFrame(now, (now - t0) / ms);
    if (now - t0 >= ms) resolve(); else raf = requestAnimationFrame(tick);
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
        <div class="title">1. 발표 유형</div>
        <div class="chips">${chips}</div>
        <div class="sub">유형에 따라 아래 기준값이 자동으로 채워져요.</div>
      </div>
      <div class="panel card">
        <div class="title">2. 발표 시간</div>
        <div class="time-input">
          <input id="dur-m" type="number" min="1" max="30" aria-label="분"><span>분</span>
          <input id="dur-s" type="number" min="0" max="59" step="5" aria-label="초"><span>초</span>
        </div>
        <div class="sub">남은 1분부터 주황, 시간을 넘기면 빨강이에요. 시간이 지나도 측정은 계속돼요.</div>
      </div>
      <details class="panel card advanced">
        <summary class="title">고급 설정</summary>
        <label>적정 속도 (음절/분) <span><input id="rate-min" type="number" step="10"> ~ <input id="rate-max" type="number" step="10"></span></label>
        <label>정면 응시 목표 (%) <span><input id="gaze-target" type="number" min="50" max="100" step="5"></span></label>
      </details>
      <p class="privacy">말하기 속도 측정을 위해 Chrome 음성 인식(구글)을 사용합니다. 영상은 어디에도 전송되지 않아요.</p>
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
    </div>
  </div>`;
}

function readForm() {
  const m = Number(root.querySelector('#dur-m').value) || 0;
  const s = Number(root.querySelector('#dur-s').value) || 0;
  const durationSec = Math.min(30 * 60, Math.max(60, m * 60 + s));
  return {
    presetKey: state.presetKey,
    durationSec,
    rateMin: Number(root.querySelector('#rate-min').value),
    rateMax: Number(root.querySelector('#rate-max').value),
    gazeTarget: Math.min(1, Math.max(0.5, Number(root.querySelector('#gaze-target').value) / 100)),
  };
}

function applyPreset(key) {
  state.presetKey = key;
  const p = PRESETS[key];
  root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.preset === key));
  root.querySelector('#rate-min').value = p.rateMin;
  root.querySelector('#rate-max').value = p.rateMax;
  root.querySelector('#gaze-target').value = Math.round(p.gazeTarget * 100);
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

async function openSensors() {
  const [a, g] = await Promise.allSettled([
    app.sensors.audio ? Promise.resolve(app.sensors.audio) : startAudio(),
    app.sensors.gaze ? Promise.resolve(app.sensors.gaze) : initGaze(),
  ]);
  app.sensors.audio = a.status === 'fulfilled' ? a.value : null;
  app.sensors.gaze = g.status === 'fulfilled' ? g.value : null;
  return { audioErr: a.status === 'rejected' ? a.reason : null, gazeErr: g.status === 'rejected' ? g.reason : null };
}

async function runCalibration() {
  const btn = root.querySelector('#calib-run');
  state.running = true; btn.disabled = true; updateStart();
  btn.textContent = '장치 켜는 중…';
  const { audioErr, gazeErr } = await openSensors();
  if (!root) return; // 화면을 떠남
  const { audio, gaze } = app.sensors;

  // 1단계: 정면 기준
  if (gaze) {
    setStep('face', 'active', '');
    btn.textContent = '정면 측정 중…';
    const yaws = [], pitches = [], eyes = [];
    await sleepFrames(CALIB.faceSec * 1000, (now, f) => {
      setProgress(f * 0.33);
      const d = gaze.detect(now);
      state.landmarks = d.landmarks;
      if (d.face) { yaws.push(d.face.yaw); pitches.push(d.face.pitch); eyes.push(d.face.eye); }
    });
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
  }

  // 2단계: 기준 음량·음높이
  if (audio) {
    setStep('voice', 'active', '');
    btn.textContent = '듣는 중… 문장을 읽어 주세요';
    const dbs = [], hzs = [];
    await sleepFrames(CALIB.readSec * 1000, (now, f) => {
      setProgress(0.33 + f * 0.67);
      if (gaze) state.landmarks = gaze.detect(now).landmarks;
      const r = audio.read(null);
      debugLine({ db: r.db, speaking: String(r.speaking), hz: r.hz ?? 0 });
      if (r.speaking) { dbs.push(r.db); if (r.hz) hzs.push(r.hz); }
    });
    if (dbs.length >= 30) {
      state.calib.baseDb = median(dbs);
      state.calib.baseHz = hzs.length ? median(hzs) : null;
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
  app = appRef;
  root = document.getElementById('screen-setup');
  root.innerHTML = template();
  state = { presetKey: app.settings?.presetKey ?? 'class', calib: { yaw0: null, pitch0: 0, eye0: null, baseDb: null, baseHz: null },
    tried: false, running: false, landmarks: null };

  applyPreset(state.presetKey);
  const dur = app.settings?.durationSec ?? DEFAULT_DURATION_SEC;
  root.querySelector('#dur-m').value = Math.floor(dur / 60);
  root.querySelector('#dur-s').value = dur % 60;

  root.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => applyPreset(c.dataset.preset)));
  root.querySelector('#calib-run').addEventListener('click', runCalibration);
  root.querySelector('#start').addEventListener('click', () => {
    const c = state.calib;
    app.settings = { ...readForm(), calib: {
      baseDb: app.sensors.audio ? c.baseDb : null, baseHz: c.baseHz,
      yaw0: c.yaw0 ?? 0, pitch0: c.pitch0 ?? 0, eye0: c.eye0 ?? { down: 0, up: 0, left: 0, right: 0 },
    } };
    app.go('practice');
  });

  sketch = createWebcamSketch(root.querySelector('#setup-preview'), () => {
    const g = app.sensors.gaze;
    if (g && !state.running) state.landmarks = g.detect(performance.now()).landmarks;
    return { video: g?.video ?? null, landmarks: state.landmarks, status: 'ok', dir: 'front' };
  });
}

export function leave() {
  cancelAnimationFrame(raf);
  sketch?.remove(); sketch = null;
  root.innerHTML = ''; root = null;
}
