// 시선 인식 점검 화면: 단계별 안내 → 실시간 원시값 → 결과표·진단
import { GAZE, CALIB } from '../config.js';
import { initGaze } from '../sensors/gaze.js';
import { createDemoGaze } from '../sensors/demo.js';
import { analyzeGaze, gazeGrid } from '../analysis/gaze-logic.js';
import { GAZE_TEST_STEPS, frameMatches, frameLabel, evaluateStep, diagnose, PASS_PCT } from '../analysis/gaze-test.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { button, card, createProgress, dataTable } from './components.js';

const PREP_MS = 2000;     // 안내를 읽고 자세를 잡는 시간
const MEASURE_MS = 3000;  // 측정 시간
const FRAME_MS = 1000 / 15;
const EYE_KEYS = [['down', '눈 아래'], ['up', '눈 위'], ['left', '눈 왼쪽'], ['right', '눈 오른쪽']];
const ANGLE_RANGE = 40;   // 막대 양끝 ±40°

let app, root, raf, sketch, st;
let generation = 0;

const $ = (id) => root.querySelector(`#${id}`);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function template() {
  const eyeBars = EYE_KEYS.map(([k, label]) => bar(`eye-${k}`, label)).join('');
  return `
  <div class="gtest">
    <div class="cam" id="gt-cam" data-status="idle"></div>
    <div class="gt-side">
      <div class="card gt-step"><section>
        <div class="metric-head"><span class="metric-title" id="gt-count">시선 인식 테스트</span><span class="metric-num" id="gt-phase"></span></div>
        <div class="gt-title" id="gt-title">고개와 눈 방향이 맞게 잡히는지 확인해요</div>
        <p class="gt-say" id="gt-say">약 40초 걸려요. 화면 안내에 따라 고개와 눈을 움직여 주세요. 노트북 카메라 앞에 평소처럼 앉으면 됩니다.</p>
        <div id="gt-progress"></div>
        <div class="gt-now">지금 감지: <b id="gt-now">—</b> <span id="gt-ok"></span></div>
        <p class="hint">장치가 방향을 제대로 읽는지 점검하는 화면이에요. 면접 수행 평가가 아니에요.</p>
        <div>${button({ label: '테스트 시작', id: 'gt-start' })}</div>
      </section></div>
      ${card({ className: 'gt-live', title: '실시간 원시값', description: '밝은 영역 = 정면으로 보는 범위', html: `${bar('yaw', '고개 좌우')}${bar('pitch', '고개 위아래')}${eyeBars}` })}
      <div class="card gt-result" id="gt-result" hidden></div>
    </div>
  </div>`;
}

function bar(id, label) {
  return `<div class="gt-bar" id="b-${id}"><span class="gt-bl">${label}</span>
    <div class="gt-track"><div class="gt-zone"></div><div class="gt-mark"></div></div><span class="gt-val">—</span></div>`;
}

/** 각도 막대: 가운데 0, 양쪽 ±ANGLE_RANGE, 초록 영역 = ±limit */
function setAngleBar(id, value, limit) {
  const el = $(`b-${id}`);
  const zone = el.querySelector('.gt-zone'), mark = el.querySelector('.gt-mark');
  const pct = (v) => ((Math.max(-ANGLE_RANGE, Math.min(ANGLE_RANGE, v)) + ANGLE_RANGE) / (2 * ANGLE_RANGE)) * 100;
  zone.style.left = `${pct(-limit)}%`; zone.style.width = `${pct(limit) - pct(-limit)}%`;
  mark.hidden = value == null;
  if (value != null) {
    mark.style.left = `${pct(value)}%`;
    mark.dataset.status = Math.abs(value) > limit ? 'bad' : 'ok';
  }
  el.querySelector('.gt-val').textContent = value == null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(0)}°`;
}

/** 눈 막대: 0~1, 초록 영역 = 기준값 아래 */
function setEyeBar(key, value) {
  const el = $(`b-eye-${key}`);
  const zone = el.querySelector('.gt-zone'), mark = el.querySelector('.gt-mark');
  zone.style.left = '0%'; zone.style.width = `${GAZE.eyeThreshold * 100}%`;
  mark.hidden = value == null;
  if (value != null) {
    const v = Math.max(0, Math.min(1, value));
    mark.style.left = `${v * 100}%`;
    mark.dataset.status = value > GAZE.eyeThreshold ? 'bad' : 'ok';
  }
  el.querySelector('.gt-val').textContent = value == null ? '—' : (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

/** analyzeGaze 결과 + 보정 기준 대비 눈 값 */
function makeFrame(face) {
  if (!face) return null;
  const g = analyzeGaze(face, st.calib);
  const e0 = st.calib?.eye0 ?? {};
  const eyeRaw = Object.fromEntries(EYE_KEYS.map(([k]) => [k, (face.eye?.[k] ?? 0) - (e0[k] ?? 0)]));
  return { ...g, eyeRaw };
}

function renderLive(frame, face) {
  setAngleBar('yaw', frame ? frame.head.yaw : null, GAZE.yawDeg);
  setAngleBar('pitch', frame ? frame.head.pitch : null, GAZE.pitchDeg);
  for (const [k] of EYE_KEYS) setEyeBar(k, frame ? frame.eyeRaw[k] : null);
  $('gt-now').textContent = st.phase === 'calib' && face ? '정면 기준 잡는 중' : frameLabel(frame);
}

function setStepText(i, phase) {
  const step = GAZE_TEST_STEPS[i];
  $('gt-count').textContent = `${i + 1} / ${GAZE_TEST_STEPS.length}단계`;
  $('gt-title').textContent = step.title;
  $('gt-say').textContent = step.say;
  $('gt-phase').textContent = phase === 'prep' ? '준비…' : '측정 중';
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  try { step(now); } catch (err) { console.warn('[gazetest] frame skipped:', err); }
}

function step(now) {
  if (!st.gaze || now - st.lastFrame < FRAME_MS) return;
  st.lastFrame = now;
  const d = st.gaze.detect(now);
  st.landmarks = d.landmarks;
  const frame = st.calib ? makeFrame(d.face) : null;
  st.view = frame;
  renderLive(frame, d.face);

  const elapsed = now - st.phaseStart;
  if (st.phase === 'calib') {
    if (d.face) st.calibFrames.push(d.face);
    st.progress.update(elapsed / (CALIB.faceSec * 1000), 'ok');
    if (elapsed >= CALIB.faceSec * 1000) {
      const f = st.calibFrames;
      if (f.length < 10) { failStart('얼굴이 잘 보이지 않아요. 화면 가운데에 앉아 다시 시작해 주세요.'); return; }
      const avg = (k) => f.reduce((a, x) => a + x.eye[k], 0) / f.length;
      st.calib = { yaw0: median(f.map((x) => x.yaw)), pitch0: median(f.map((x) => x.pitch)),
        eye0: { down: avg('down'), up: avg('up'), left: avg('left'), right: avg('right') } };
      next(0, now);
    }
    return;
  }
  if (st.phase === 'prep' || st.phase === 'measure') {
    const stp = GAZE_TEST_STEPS[st.i];
    const ok = frameMatches(frame, stp);
    $('gt-ok').textContent = ok ? '✓ 맞음' : '';
    $('gt-cam').dataset.status = ok ? 'ok' : st.phase === 'measure' ? 'warn' : 'idle';
    if (st.phase === 'prep') {
      st.progress.update(elapsed / PREP_MS, 'warn');
      if (elapsed >= PREP_MS) { st.phase = 'measure'; st.phaseStart = now; st.frames = []; setStepText(st.i, 'measure'); }
    } else {
      st.frames.push(frame);
      st.progress.update(elapsed / MEASURE_MS, 'ok');
      if (elapsed >= MEASURE_MS) {
        st.results.push(evaluateStep(st.frames, stp));
        if (st.i + 1 < GAZE_TEST_STEPS.length) next(st.i + 1, now); else finish();
      }
    }
  }
}

function next(i, now) {
  st.i = i; st.phase = 'prep'; st.phaseStart = now;
  setStepText(i, 'prep');
}

function failStart(msg) {
  st.phase = 'idle';
  $('gt-title').textContent = '다시 시도해 주세요';
  $('gt-say').textContent = msg;
  $('gt-phase').textContent = '';
  $('gt-start').hidden = false; $('gt-start').textContent = '다시 시작';
}

function resultText() {
  const lines = ['[시선 테스트 결과]', `기준: 고개 좌우 ±${GAZE.yawDeg}°, 위아래 ±${GAZE.pitchDeg}°, 눈 ${GAZE.eyeThreshold}, flipYaw=${GAZE.flipYaw}, flipPitch=${GAZE.flipPitch}`];
  for (const r of st.results) {
    const eye = Object.entries(r.eyeMax).map(([k, v]) => `${k}${v}`).join(' ');
    lines.push(`${r.pass ? 'O' : 'X'} ${r.title}: 감지=${r.detected} 일치=${r.matchPct}% 좌우=${r.avgYaw}° 위아래=${r.avgPitch}° 눈최대(${eye}) 얼굴없음=${r.faceMissingPct}%`);
  }
  lines.push('진단:', ...diagnose(st.results).map((t) => `- ${t}`));
  return lines.join('\n');
}

function finish() {
  st.phase = 'done';
  $('gt-cam').dataset.status = 'idle';
  $('gt-ok').textContent = '';
  const passed = st.results.filter((r) => r.pass).length;
  $('gt-count').textContent = '결과';
  $('gt-title').textContent = `${GAZE_TEST_STEPS.length}단계 중 ${passed}단계 통과`;
  $('gt-say').textContent = `단계마다 ${PASS_PCT}% 이상 맞게 잡히면 통과예요.`;
  $('gt-phase').textContent = '';
  st.progress.update(1, passed === GAZE_TEST_STEPS.length ? 'ok' : 'warn');

  const rows = st.results.map((r) => `<tr data-pass="${r.pass}"><td>${r.pass ? '✓' : '✗'}</td><td>${r.title}</td><td>${r.detected}</td>
    <td>${r.matchPct}%</td><td>${r.avgYaw ?? '—'}° / ${r.avgPitch ?? '—'}°</td></tr>`).join('');
  const tips = diagnose(st.results).map((t) => `<li>${t}</li>`).join('');
  const box = $('gt-result');
  box.hidden = false;
  box.innerHTML = `<header><h2>단계별 결과</h2></header><section class="stack">
    ${dataTable({ columns: ['', '단계', '감지', '일치', '좌우/위아래'], rowsHtml: rows.split('</tr>').filter((x) => x.trim()).map((x) => `${x}</tr>`) })}
    <div class="alert"><h2>진단</h2><section><ul class="gt-tips">${tips}</ul></section></div>
    <div class="gt-actions">${button({ label: '다시 테스트', id: 'gt-again' })}${button({ label: '결과 복사', id: 'gt-copy', variant: 'outline' })}<span class="hint" id="gt-copied"></span></div>
  </section>`;
  $('gt-again').addEventListener('click', () => begin());
  $('gt-copy').addEventListener('click', async () => {
    const txt = resultText();
    try { await navigator.clipboard.writeText(txt); $('gt-copied').textContent = '복사했어요'; }
    catch { console.log(txt); $('gt-copied').textContent = '복사가 막혔어요. 콘솔에 출력했어요.'; }
  });
  document.querySelector('.gt-live').hidden = true;
}

async function begin() {
  const token = generation;
  $('gt-start').hidden = true;
  $('gt-result').hidden = true;
  document.querySelector('.gt-live').hidden = false;
  if (!st.gaze) {
    $('gt-title').textContent = '카메라 켜는 중…';
    try {
      const acquired = app.demo ? createDemoGaze() : (app.sensors.gaze && !app.sensors.gaze.demo ? app.sensors.gaze : await initGaze());
      if (token !== generation) { acquired.stop?.(); return; }
      st.gaze = acquired;
      if (!st.gaze.demo) app.sensors.gaze = st.gaze;
    } catch (reason) {
      if (token !== generation) return;
      const msg = { denied: '카메라 권한을 허용한 뒤 다시 시작해 주세요.', busy: '다른 앱이 카메라를 쓰고 있어요. 닫고 다시 시작해 주세요.',
        nodevice: '카메라를 찾을 수 없어요.', model: '얼굴 인식 모델을 불러오지 못했어요.' }[reason] ?? '카메라를 열지 못했어요.';
      failStart(msg); return;
    }
    if (!root) return;
  }
  if (st.gaze.demo) st.gaze.reset(performance.now());
  Object.assign(st, { calib: null, calibFrames: [], results: [], frames: [], i: 0, phase: 'calib', phaseStart: performance.now() });
  $('gt-count').textContent = '0 / 정면 기준';
  $('gt-title').textContent = '정면 기준 잡기';
  $('gt-say').textContent = '카메라 렌즈를 편하게 바라보세요. 이 자세가 "정면"이 됩니다.';
  $('gt-phase').textContent = '측정 중';
}

export function enter(appRef) {
  generation++;
  app = appRef;
  root = document.getElementById('screen-gazetest');
  root.innerHTML = template();
  st = { gaze: null, calib: null, phase: 'idle', lastFrame: 0, landmarks: null, view: null, results: [] };
  st.progress = createProgress($('gt-progress'));

  const exit = document.createElement('button');
  exit.className = 'btn';
  exit.type = 'button';
  exit.dataset.variant = 'outline';
  exit.textContent = '설정으로';
  exit.addEventListener('click', () => {
    const url = new URL(location.href); url.searchParams.delete('gazetest'); history.replaceState(null, '', url);
    app.go('setup');
  });
  document.getElementById('topbar-right').append(exit);

  $('gt-start').addEventListener('click', begin);
  sketch = createWebcamSketch($('gt-cam'), () => ({
    video: st.gaze?.video ?? null,
    landmarks: st.landmarks,
    status: st.view ? (st.view.frontal ? 'ok' : 'warn') : 'idle',
    head: st.view?.head, eye: st.view?.eye,
    grid: st.view ? gazeGrid(fakeFace(st.view), null) : null,
    demo: !!st.gaze?.demo,
    demoHint: '주소에서 demo=1 을 빼면 실제 카메라로 테스트해요',
  }));
  raf = requestAnimationFrame(loop);
}

/** 그리드 표시용: 이미 보정된 값으로 다시 판정할 수 있게 face 모양으로 변환 */
function fakeFace(v) {
  return { yaw: v.head.yaw, pitch: v.head.pitch, eye: v.eyeRaw };
}

export function leave() {
  generation++;
  st?.gaze?.stop?.();
  app.sensors.gaze = null;
  cancelAnimationFrame(raf);
  sketch?.remove(); sketch = null;
  // 점검 화면을 떠나면 카메라를 해제하고, 연습 시 다시 준비 확인합니다.
  root.innerHTML = '';
  root = null;
}
