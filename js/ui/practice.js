// ② 실시간 연습 화면
// 센서 읽기(매 프레임) → 계산·기록(10Hz) → 화면 갱신(10Hz, 바뀐 것만) 순서로 분리되어 있습니다.
import { UI, PITCH, RATE, AUDIO } from '../config.js';
import { formatClock } from '../util/time.js';
import { rateGaugeRange } from '../util/gauge.js';
import { timeProgress } from '../analysis/classify.js';
import { semitoneStd, summarizeFrames } from '../analysis/audio-math.js';
import { createSyllableEstimator } from '../analysis/syllables.js';
import { createRateTracker } from '../analysis/rate.js';
import { analyzeGaze, gazeGrid } from '../analysis/gaze-logic.js';
import { createRecorder } from '../recorder.js';
import { startRecording } from '../media-recorder.js';
import { escapeHtml } from '../util/html.js';
import { demoScene } from '../sensors/demo.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { createSparkline } from './sparkline-sketch.js';
import { createGauge, createProgress } from './components.js';
import { debugLine } from './app.js';

const DIR_WORD = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽', front: '정면', none: '—' };
const TICK_MS = 1000 / UI.sampleHz;
const GAZE_MIN_MS = 1000 / 30;
const WAIT = '측정 대기';

let app, root, raf, s, keyHandler;

function template(settings) {
  return `
  <div class="practice self-review ${settings.focusMode ? 'focus-mode' : ''}">
    <div class="answer-context"><b>${escapeHtml(settings.question || '자유 답변')}</b><span id="record-state" role="status">카운트다운 후 답변 시작</span><button class="btn" id="toggle-metrics" aria-pressed="${!settings.focusMode}">${settings.focusMode ? '측정값 보기' : '측정값 숨기기'}</button></div>
    <div class="gaze-head">
      <div class="gaze-pill" id="pill" data-status="idle">
        <span class="dot"></span><span id="pill-text">${WAIT}</span>
        <span class="cum" id="pill-cum" title="얼굴이 검출된 표본 중 정면 참고 범위 안의 비율">누적 —</span>
      </div>
      <div class="gaze-parts">
        <span id="part-head" data-ok="true">고개 <b>—</b></span>
        <span id="part-eye" data-ok="true">눈 <b>—</b></span>
      </div>
    </div>

    <div class="cam" id="cam" data-status="idle">
      <div class="countdown" id="countdown"></div>
      <div class="angles" id="angles" hidden></div>
      <div class="demo-badge" id="demo-badge" hidden>DEMO<small id="demo-scene"></small></div>
    </div>

    <div class="side">
      <div class="panel metric" id="p-rate" data-status="idle">
        <div class="head"><div class="title">말하기 속도 · 추정</div><div class="num"><b id="v-rate">—</b> 음절/분</div></div>
        <div class="state" id="l-rate">${WAIT}</div>
        <div id="g-rate"></div>
        <div class="foot"><span>참고 ${settings.rateMin}~${settings.rateMax}</span><span class="note" id="n-rate"></span></div>
      </div>
      <div class="panel metric" id="p-vol" data-status="idle">
        <div class="head"><div class="title">목소리 크기</div><div class="num" id="v-vol">기준 대비 —</div></div>
        <div class="state" id="l-vol">${WAIT}</div>
        <div id="g-vol"></div>
      </div>
      <div class="panel metric" id="p-pitch" data-status="idle">
        <div class="head"><div class="title">음높이 변화 · 최근 10초</div><div class="num" id="v-pitch"></div></div>
        <div class="state" id="l-pitch">${WAIT}</div>
        <div class="spark" id="spark"></div>
      </div>
      <div class="panel metric time" id="p-time" data-status="idle">
        <div class="head"><div class="title" id="t-time">남은 시간</div><div class="num">목표 ${formatClock(settings.durationSec)}</div></div>
        <div class="state" id="v-time">${formatClock(settings.durationSec)}</div>
        <div id="pb-time"></div>
      </div>
    </div>
  </div>`;
}

const $ = (id) => root.querySelector(`#${id}`);
const setStatus = (el, st) => { if (el.dataset.status !== st) el.dataset.status = st; };
const setText = (el, txt) => { if (el.textContent !== txt) el.textContent = txt; };

function newState(settings) {
  return {
    settings,
    phase: 'countdown',
    startMs: 0,
    countdownEnd: performance.now() + UI.countdownSec * 1000,
    lastTick: 0,
    lastGaze: 0,
    estimator: createSyllableEstimator(),
    rate: createRateTracker(),
    gazeOut: { status: 'idle', ratio: null, cumulative: null, dir: 'none', frontal: null },
    gazeView: null,      // { head, eye, grid, faceMissing }
    landmarks: null,
    recorder: createRecorder(),
    frames: [],
    hzHist: [],          // 최근 10초 { t, hz }
    speakHist: [],       // 최근 10초 { t, speaking }
    volHist: [],         // 최근 1초 말한 샘플의 기준 대비 dB
    pitchStatus: 'idle',
    recording: null,
    faceKnown: 0, faceFront: 0,
    sketches: [],
    ui: {},
  };
}

function t() { return (performance.now() - s.startMs) / 1000; }

/** 매 프레임: 센서 읽기만 */
function readSensors(now) {
  const { audio, gaze } = app.sensors;
  const { calib } = s.settings;
  if (audio) {
    const r = audio.read(calib.baseDb);
    if (r.db != null) s.frames.push(r);
    if (r.db != null && s.phase === 'live' && s.estimator.push(r.db, now, r.speaking)) s.rate.addEstimated(t());
  }
  if (gaze && now - s.lastGaze >= GAZE_MIN_MS) {
    s.lastGaze = now;
    const d = gaze.detect(now);
    s.landmarks = d.landmarks;
    const g = analyzeGaze(d.face, calib);
    s.gazeView = { head: g.head, eye: g.eye, grid: gazeGrid(d.face, calib), faceMissing: !d.face };
    if (s.phase === 'live') {
      const o = { status: 'idle', dir: d.face ? g.dir : 'none' };
      s.gazeOut = { ...o, frontal: d.face ? g.frontal : null };
    }
  }
}

/** 10Hz: 샘플 만들기 + 기록 + 화면 갱신 */
function tick() {
  const tt = t();
  const { settings } = s;
  const { audio, gaze } = app.sensors;
  const baseDb = settings.calib.baseDb;

  const { speaking, db, hz } = summarizeFrames(s.frames);
  s.frames = [];

  s.speakHist.push({ t: tt, speaking });
  while (s.speakHist.length && s.speakHist[0].t < tt - RATE.windowSec) s.speakHist.shift();
  if (hz && speaking) s.hzHist.push({ t: tt, hz });
  while (s.hzHist.length && s.hzHist[0].t < tt - PITCH.windowSec) s.hzHist.shift();

  const speakingSec = s.speakHist.filter((x) => x.speaking).length / UI.sampleHz;
  const rate = audio ? s.rate.rate(tt, speakingSec) : null;
  const deltaDb = audio && baseDb != null && db != null ? db - baseDb : null;

  // 크기: 최근 1초 동안 말한 샘플의 평균 (침묵은 빼고)
  s.volHist.push({ t: tt, d: speaking ? deltaDb : null });
  while (s.volHist.length && s.volHist[0].t <= tt - 1) s.volHist.shift();
  const said = s.volHist.filter((x) => x.d != null);
  const volDelta = said.length ? said.reduce((a, x) => a + x.d, 0) / said.length : null;
  const st = semitoneStd(s.hzHist.map((x) => x.hz));

  const g = s.gazeOut;
  if (g.frontal != null) { s.faceKnown++; if (g.frontal) s.faceFront++; }
  g.cumulative = s.faceKnown ? s.faceFront / s.faceKnown : null;
  s.recorder.push({
    t: tt,
    frontal: gaze ? g.frontal : null,
    dir: gaze ? (g.frontal ? 'front' : g.dir) : 'none',
    faceMissing: !!gaze && !!s.gazeView?.faceMissing,
    speaking, db, deltaDb, hz: speaking ? hz : null, rate,
  });

  render({ tt, rate, volDelta, speaking, st });
  debugLine({ t: tt, db: db ?? 0, deltaDb: deltaDb ?? 0, speaking: String(speaking), hz: hz ?? 0,
    rate: rate ?? 0, corr: s.rate.correction(), gaze: `${g.status} ${g.dir}`, cum: g.cumulative ?? 0, st: st ?? 0 });
}

function render({ tt, rate, volDelta, speaking, st }) {
  const settings = s.settings;
  const rateWord = rate == null ? WAIT : rate < settings.rateMin ? '참고 범위 아래' : rate > settings.rateMax ? '참고 범위 위' : '참고 범위 안';
  setText($('l-rate'), rateWord);
  setText($('v-rate'), rate == null ? '—' : String(Math.round(rate)));
  setText($('n-rate'), '음량 변화 기반 추정');
  s.ui.rate.update(rate, 'idle');
  setText($('l-vol'), !app.sensors.audio ? WAIT : volDelta == null ? '발화 미검출' : '기준 대비 변화');
  setText($('v-vol'), volDelta == null ? '기준 대비 —' : `${volDelta >= 0 ? '+' : ''}${volDelta.toFixed(1)} dB`);
  s.ui.vol.update(volDelta, 'idle');
  s.pitchStatus = 'idle';
  setText($('l-pitch'), st == null ? WAIT : `${st.toFixed(1)} 반음`);
  setText($('v-pitch'), st == null ? '' : '음높이 변화량');
  const diff = settings.durationSec - tt;
  setText($('t-time'), diff < 0 ? '설정 시간 이후' : '남은 시간');
  setText($('v-time'), `${diff < 0 ? '+' : ''}${formatClock(Math.abs(diff))}`);
  s.ui.time.update(timeProgress(tt, settings.durationSec), 'idle');
  for (const id of ['p-rate','p-vol','p-pitch','p-time']) setStatus($(id),'idle');
  renderGaze();
  if (app.sensors.audio?.demo) setText($('demo-scene'), demoScene(tt).label);
}

function renderGaze() {
  const pill = $('pill'), cam = $('cam');
  const g = s.gazeOut, v = s.gazeView;
  if (!app.sensors.gaze) {
    setStatus(pill, 'idle'); setStatus(cam, 'idle');
    setText($('pill-text'), '시선 측정 대기');
    return;
  }
  setStatus(pill, 'idle');
  setStatus(cam, 'idle');
  let text = '정면';
  if (v?.faceMissing) text = '얼굴이 보이지 않아요';
  else if (!g.frontal && DIR_WORD[g.dir] && g.dir !== 'front') text = `${DIR_WORD[g.dir]}을 보고 있어요`;
  setText($('pill-text'), text);

  const cum = $('pill-cum');
  setText(cum, g.cumulative == null ? '누적 —' : `검출 중 ${Math.round(g.cumulative * 100)}%`);
  setStatus(cum, 'idle');

  if (v) {
    const part = (el, label, ok, dir) => {
      el.dataset.ok = String(ok);
      const html = `${label} <b>${v.faceMissing ? '—' : ok ? '정면' : DIR_WORD[dir]}</b>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    };
    part($('part-head'), '고개', v.head.ok || v.faceMissing, v.head.dir);
    part($('part-eye'), '눈', v.eye.ok || v.faceMissing, v.eye.dir);
    const ang = $('angles');
    ang.hidden = v.faceMissing;
    if (!v.faceMissing) {
      const sgn = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))}°`;
      setText(ang, `고개 좌우 ${sgn(v.head.yaw)} · 위아래 ${sgn(v.head.pitch)}`);
    }
  }
}

function loop(now) {
  raf = requestAnimationFrame(loop); // 먼저 예약: 한 프레임에서 오류가 나도 화면이 멈추지 않게
  try { step(now); } catch (err) { console.warn('[practice] frame skipped:', err); }
}

function step(now) {
  readSensors(now);
  if (s.phase === 'countdown') {
    const left = Math.ceil((s.countdownEnd - now) / 1000);
    setText($('countdown'), left > 0 ? String(left) : '');
    if (left <= 0) {
      s.phase = 'live';
      s.startMs = now;
      s.lastTick = now;
      $('countdown').remove();
      s.frames = []; // 카운트다운 동안 모인 소리는 버림
      s.recording = startRecording(app.sensors, s.settings.recordAnswer);
      setText($('record-state'), s.recording.message);
    }
  } else if (now - s.lastTick >= TICK_MS) {
    s.lastTick += TICK_MS * Math.floor((now - s.lastTick) / TICK_MS);
    tick();
  }
}

async function finish() {
  if (!s || s.phase === 'done') return;
  const session = s;
  const total = s.phase === 'live' ? t() : 0;
  session.phase = 'done';
  cancelAnimationFrame(raf);
  setText($('record-state'), '답변을 정리하는 중…');
  const media = await (session.recording?.stop() ?? Promise.resolve({ blob: null, message: '녹화가 시작되지 않았습니다.' }));
  if (s !== session) return;
  const demo = !!app.sensors.audio?.demo || !!app.sensors.gaze?.demo;
  for (const sensor of Object.values(app.sensors)) sensor?.stop?.();
  app.sensors = { audio: null, gaze: null };
  app.go('report', { samples: session.recorder.samples(), durationSec: total, media, demo });
}

export function enter(appRef) {
  app = appRef;
  root = document.getElementById('screen-practice');
  root.innerHTML = template(app.settings);
  s = newState(app.settings);
  $('toggle-metrics').addEventListener('click', () => {
    const hidden = root.querySelector('.practice').classList.toggle('focus-mode');
    $('toggle-metrics').setAttribute('aria-pressed', String(!hidden));
    $('toggle-metrics').textContent = hidden ? '측정값 보기' : '측정값 숨기기';
    window.dispatchEvent(new Event('resize'));
  });

  // 데모 센서는 연습 시작(카운트다운 끝) 시각에 맞춰 시나리오를 처음부터
  for (const sensor of [app.sensors.audio, app.sensors.gaze]) if (sensor?.demo) sensor.reset(s.countdownEnd);
  if (app.sensors.audio?.demo || app.sensors.gaze?.demo) $('demo-badge').hidden = false;

  const r = rateGaugeRange(app.settings);
  s.ui.rate = createGauge($('g-rate'), { ...r, lo: app.settings.rateMin, hi: app.settings.rateMax, left: '느림', right: '빠름' });
  s.ui.vol = createGauge($('g-vol'), { min: -UI.volumeGaugeDb, max: UI.volumeGaugeDb,
    lo: AUDIO.okRangeDb[0], hi: AUDIO.okRangeDb[1], left: '작음', right: '큼' });
  s.ui.time = createProgress($('pb-time'));

  const stop = document.createElement('button');
  stop.className = 'btn danger';
  stop.textContent = '종료 (Esc)';
  stop.addEventListener('click', finish);
  document.getElementById('topbar-right').append(stop);

  // 데모 중에는 실제 카메라로 바로 넘어갈 수 있게
  if (app.sensors.audio?.demo || app.sensors.gaze?.demo) {
    const real = document.createElement('button');
    real.className = 'btn';
    real.textContent = '실제 카메라로 전환';
    real.addEventListener('click', () => {
      app.demo = false;
      app.sensors = { audio: null, gaze: null };
      const url = new URL(location.href); url.searchParams.delete('demo'); history.replaceState(null, '', url);
      if (s) s.phase = 'done';
      app.go('setup');
    });
    stop.before(real);
  }

  keyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(); }
  };
  window.addEventListener('keydown', keyHandler);

  s.sketches.push(createWebcamSketch($('cam'), () => ({
    video: app.sensors.gaze?.video ?? null,
    landmarks: s.landmarks,
    status: 'idle', neutral: true, hideOverlay: root.querySelector('.practice').classList.contains('focus-mode'),
    head: s.gazeView?.head, eye: s.gazeView?.eye,
    grid: app.debug ? (s.gazeView?.grid ?? null) : undefined,
    demo: !!app.sensors.gaze?.demo,
  })));
  s.sketches.push(createSparkline($('spark'), () => ({
    points: s.hzHist, now: s.phase === 'live' ? t() : 0, windowSec: PITCH.windowSec,
    refHz: s.settings.calib.baseHz, status: s.pitchStatus,
  })));

  raf = requestAnimationFrame(loop);
}

export function leave() {
  cancelAnimationFrame(raf);
  window.removeEventListener('keydown', keyHandler);
  s?.recording?.stop();
  s?.sketches.forEach((sk) => sk.remove());
  root.innerHTML = '';
  s = null;
}
