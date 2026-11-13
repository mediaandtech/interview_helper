// ② 실시간 연습 화면
import { UI, PITCH, RATE } from '../config.js';
import { formatClock } from '../util/time.js';
import { classifyRate, classifyVolume, classifyPitchVar, classifyTime, classifyGazeRatio } from '../analysis/classify.js';
import { createHysteresis } from '../analysis/hysteresis.js';
import { semitoneStd } from '../analysis/audio-math.js';
import { createSyllableEstimator } from '../analysis/syllables.js';
import { createRateTracker } from '../analysis/rate.js';
import { isFrontal, createGazeTracker } from '../analysis/gaze-logic.js';
import { createRecorder } from '../recorder.js';
import { startSpeech } from '../sensors/speech.js';
import { createWebcamSketch } from './webcam-sketch.js';
import { createSparkline } from './sparkline-sketch.js';
import { debugLine } from './app.js';

const DIR_LABEL = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽' };
const TICK_MS = 1000 / UI.sampleHz;
const GAZE_MIN_MS = 1000 / 30;
const VOLUME_BAR_DB = 15;

let app, root, raf, s, keyHandler;

function template(settings) {
  return `
  <div class="practice">
    <div class="gaze-pill" id="pill" data-status="idle"><span class="dot"></span><span id="pill-text">준비 중</span></div>
    <div class="cam" id="cam" data-status="idle">
      <div class="countdown" id="countdown"></div>
    </div>
    <div class="side">
      <div class="panel metric" id="p-rate" data-status="idle">
        <div class="title">말하기 속도</div>
        <div class="value"><span id="v-rate">—</span><span class="unit">음절/분</span></div>
        <div class="sub">목표 ${settings.rateMin}~${settings.rateMax}<span class="note" id="n-rate"></span></div>
      </div>
      <div class="panel metric" id="p-vol" data-status="idle">
        <div class="title">목소리 크기</div>
        <div class="value"><span id="v-vol">—</span></div>
        <div class="vbar"><div class="vbar-ok"></div><div class="vbar-mark" id="vbar-mark"></div></div>
        <div class="sub" id="s-vol">기준 대비</div>
      </div>
      <div class="panel metric" id="p-pitch" data-status="idle">
        <div class="title">높낮이 변화 <span class="sub-inline" id="s-pitch"></span></div>
        <div class="value small"><span id="v-pitch">—</span></div>
        <div class="spark" id="spark"></div>
      </div>
      <div class="panel metric" id="p-time" data-status="ok">
        <div class="title">남은 시간</div>
        <div class="value"><span id="v-time">${formatClock(settings.durationSec)}</span></div>
        <div class="sub">목표 ${formatClock(settings.durationSec)}</div>
      </div>
    </div>
  </div>`;
}

const $ = (id) => root.querySelector(`#${id}`);
const setStatus = (el, st) => { if (el.dataset.status !== st) el.dataset.status = st; };

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
    gazeTracker: createGazeTracker(settings.gazeTarget),
    gazeOut: { status: 'idle', ratio: null, dir: 'none', frontal: null },
    landmarks: null,
    recorder: createRecorder(),
    hyst: { rate: createHysteresis(), vol: createHysteresis(), pitch: createHysteresis() },
    frame: { dbs: [], speak: 0, n: 0, hzs: [] },
    hzHist: [],
    speakHist: [],
    pitchStatus: 'idle',
    speech: null,
    sketches: [],
  };
}

function t() { return (performance.now() - s.startMs) / 1000; }

function readSensors(now) {
  const { audio, gaze } = app.sensors;
  const { calib } = s.settings;
  if (audio) {
    const r = audio.read(calib.baseDb);
    s.frame.dbs.push(r.db); s.frame.n++;
    if (r.speaking) s.frame.speak++;
    if (r.hz) s.frame.hzs.push(r.hz);
    if (s.phase === 'live' && s.estimator.push(r.db, now, r.speaking)) s.rate.addEstimated(t());
  }
  if (gaze && now - s.lastGaze >= GAZE_MIN_MS) {
    s.lastGaze = now;
    const d = gaze.detect(now);
    s.landmarks = d.landmarks;
    if (s.phase === 'live') {
      const f = isFrontal(d.face, calib);
      const o = s.gazeTracker.update(f.frontal, f.dir, t());
      s.gazeOut = { ...o, frontal: f.frontal, faceMissing: !d.face };
    }
  }
}

function tick() {
  const tt = t();
  const { settings } = s;
  const { audio, gaze } = app.sensors;
  const baseDb = settings.calib.baseDb;

  // 이번 100ms 동안 모은 프레임을 하나의 샘플로
  const fr = s.frame;
  const speaking = fr.n > 0 && fr.speak / fr.n >= 0.5;
  const db = fr.n ? fr.dbs.reduce((a, b) => a + b, 0) / fr.n : null;
  const hz = fr.hzs.length ? fr.hzs.sort((a, b) => a - b)[Math.floor(fr.hzs.length / 2)] : null;
  s.frame = { dbs: [], speak: 0, n: 0, hzs: [] };

  s.speakHist.push({ t: tt, speaking });
  while (s.speakHist.length && s.speakHist[0].t < tt - RATE.windowSec) s.speakHist.shift();
  if (hz && speaking) s.hzHist.push({ t: tt, hz });
  while (s.hzHist.length && s.hzHist[0].t < tt - PITCH.windowSec) s.hzHist.shift();

  const speakingSec = s.speakHist.filter((x) => x.speaking).length / UI.sampleHz;
  const rate = audio ? s.rate.rate(tt, speakingSec) : null;
  const deltaDb = audio && baseDb != null && db != null ? db - baseDb : null;

  // 크기는 최근 1초 말한 구간 평균으로 판정
  const recent = s.recorder.samples().slice(-(UI.sampleHz - 1)).concat([{ speaking, deltaDb }])
    .filter((x) => x.speaking && x.deltaDb != null);
  const volDelta = recent.length ? recent.reduce((a, x) => a + x.deltaDb, 0) / recent.length : null;
  const st = semitoneStd(s.hzHist.map((x) => x.hz));

  const g = s.gazeOut;
  s.recorder.push({
    t: tt,
    frontal: gaze ? g.frontal : null,
    dir: gaze ? (g.frontal ? 'front' : g.dir) : 'none',
    speaking, db, deltaDb, hz: speaking ? hz : null, rate,
  });

  // ---- 화면 갱신 ----
  const rateSt = s.hyst.rate.update(classifyRate(rate, settings), tt);
  setStatus($('p-rate'), audio ? rateSt : 'idle');
  $('v-rate').textContent = rate == null ? '—' : Math.round(rate);
  $('n-rate').textContent = audio ? (s.speech?.status() === 'error' ? ' · 추정값' : '') : ' · 마이크 없음';

  const volRaw = classifyVolume(volDelta, volDelta != null);
  const volSt = s.hyst.vol.update(volRaw, tt);
  setStatus($('p-vol'), volSt);
  $('v-vol').textContent = volDelta == null ? (audio ? '—' : '마이크 없음')
    : volDelta < -6 ? '작음' : volDelta > 8 ? '큼' : '적정';
  if (volDelta != null) {
    const pos = Math.max(-VOLUME_BAR_DB, Math.min(VOLUME_BAR_DB, volDelta));
    $('vbar-mark').style.left = `${((pos + VOLUME_BAR_DB) / (2 * VOLUME_BAR_DB)) * 100}%`;
    $('s-vol').textContent = `기준 대비 ${volDelta >= 0 ? '+' : ''}${volDelta.toFixed(0)} dB`;
  }

  const pv = classifyPitchVar(st);
  s.pitchStatus = s.hyst.pitch.update(pv.status, tt);
  setStatus($('p-pitch'), s.pitchStatus);
  $('v-pitch').textContent = pv.label;
  $('s-pitch').textContent = st == null ? '' : `· ${st.toFixed(1)} 반음`;

  const tm = classifyTime(tt, settings.durationSec);
  setStatus($('p-time'), tm.status);
  $('v-time').textContent = tm.text;
  root.querySelector('#p-time .title').textContent = tm.status === 'bad' ? '시간 초과' : '남은 시간';

  updatePill();
  debugLine({ t: tt, db: db ?? 0, deltaDb: deltaDb ?? 0, speaking: String(speaking), hz: hz ?? 0,
    rate: rate ?? 0, corr: s.rate.correction(), gaze: `${g.status} ${g.dir}`, ratio: g.ratio ?? 0, st: st ?? 0 });
}

function updatePill() {
  const pill = $('pill');
  const g = s.gazeOut;
  if (!app.sensors.gaze) {
    setStatus(pill, 'idle'); $('pill-text').textContent = '시선 측정 안 됨'; setStatus($('cam'), 'idle'); return;
  }
  setStatus(pill, g.status);
  setStatus($('cam'), g.status);
  let text;
  if (g.faceMissing && !g.frontal) text = '얼굴이 보이지 않아요';
  else if (!g.frontal && g.dir in DIR_LABEL) text = `${DIR_LABEL[g.dir]}을 보고 있어요`;
  else {
    const pct = g.ratio == null ? '—' : `${Math.round(g.ratio * 100)}%`;
    const rs = classifyGazeRatio(g.ratio, s.settings.gazeTarget);
    text = `정면 <b class="ratio" data-status="${rs}">${pct}</b>`;
  }
  $('pill-text').innerHTML = text;
}

function loop(now) {
  readSensors(now);
  if (s.phase === 'countdown') {
    const left = Math.ceil((s.countdownEnd - now) / 1000);
    $('countdown').textContent = left > 0 ? left : '';
    if (left <= 0) {
      s.phase = 'live';
      s.startMs = now;
      s.lastTick = now;
      $('countdown').remove();
      s.speech = app.sensors.audio
        ? startSpeech({ onSyllables: (n, tSec) => s.rate.addRecognized(n, tSec), now: () => t() })
        : null;
    }
  } else if (now - s.lastTick >= TICK_MS) {
    s.lastTick += TICK_MS * Math.floor((now - s.lastTick) / TICK_MS);
    tick();
  }
  raf = requestAnimationFrame(loop);
}

function finish() {
  if (!s || s.phase === 'done') return;
  const live = s.phase === 'live';
  s.phase = 'done';
  const total = live ? t() : 0;
  const recognizedAvgRate = s.rate.recognizedAverage(total);
  const samples = s.recorder.samples();
  app.go('report', { samples, recognizedAvgRate });
}

export function enter(appRef) {
  app = appRef;
  root = document.getElementById('screen-practice');
  root.innerHTML = template(app.settings);
  s = newState(app.settings);

  const stop = document.createElement('button');
  stop.className = 'btn danger';
  stop.textContent = '종료 (Esc)';
  stop.addEventListener('click', finish);
  document.getElementById('topbar-right').append(stop);

  keyHandler = (e) => {
    if (e.key === 'Escape' || e.code === 'Space') { e.preventDefault(); finish(); }
  };
  window.addEventListener('keydown', keyHandler);

  s.sketches.push(createWebcamSketch($('cam'), () => ({
    video: app.sensors.gaze?.video ?? null, landmarks: s.landmarks,
    status: s.gazeOut.status === 'idle' ? 'ok' : s.gazeOut.status, dir: s.gazeOut.frontal ? 'front' : s.gazeOut.dir,
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
  s?.speech?.stop();
  s?.sketches.forEach((sk) => sk.remove());
  root.innerHTML = '';
  s = null;
}
