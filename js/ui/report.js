// ③ 리포트 화면
import { PRESETS } from '../config.js';
import { formatClock } from '../util/time.js';
import { buildReport } from '../analysis/scoring.js';
import { classifyRate } from '../analysis/classify.js';
import { createReportChart } from './report-sketch.js';

let app, root, chart, printHandlers;

const scoreStatus = (v) => (v == null ? 'idle' : v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad');

function statCells(r, settings) {
  const m = r.metrics;
  const cell = (title, value, status, sub = '') =>
    `<div class="panel stat" data-status="${status}"><div class="title">${title}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  return [
    m.gaze ? cell('정면 응시', `${m.gaze.pct}%`, scoreStatus(m.gaze.score), `목표 ${Math.round(settings.gazeTarget * 100)}%`)
      : cell('정면 응시', '—', 'idle', '측정 안 됨'),
    m.rate ? cell('평균 속도', m.rate.avg, classifyRate(m.rate.avg, settings), `음절/분 · 목표 ${settings.rateMin}~${settings.rateMax}`)
      : cell('평균 속도', '—', 'idle', '측정 안 됨'),
    m.volume ? cell('크기 이탈', `${m.volume.outPct}%`, scoreStatus(m.volume.score), '말한 시간 중 기준 밖')
      : cell('크기 이탈', '—', 'idle', '측정 안 됨'),
    m.pitch ? cell('높낮이 변화', m.pitch.label, m.pitch.label === '단조' ? 'warn' : 'ok', `${m.pitch.st.toFixed(1)} 반음`)
      : cell('높낮이 변화', '—', 'idle', '측정 안 됨'),
    cell('시간', m.time.text, scoreStatus(m.time.score), `목표 ${formatClock(settings.durationSec)}`),
  ].join('');
}

function template(r, settings) {
  const date = new Date().toLocaleDateString('ko-KR');
  const meta = `${PRESETS[settings.presetKey]?.label ?? ''} · 목표 ${formatClock(settings.durationSec)} / 실제 ${formatClock(r.durationSec)} · ${date}`;
  if (r.tooShort) {
    return `<div class="report"><div class="panel hero"><div class="hero-text">
      <b>연습 시간이 너무 짧아요(10초 미만). 다시 연습해 주세요.</b><div class="sub">${meta}</div></div></div>
      <div class="report-actions"><button class="btn primary" data-act="retry">다시 연습</button>
      <button class="btn" data-act="setup">설정으로</button></div></div>`;
  }
  const tips = r.tips.map((tip) =>
    `<li>${tip.text}</li>`).join('');
  return `
  <div class="report">
    <div class="panel hero" data-status="${scoreStatus(r.score)}">
      <div class="score value">${r.score}</div>
      <div class="hero-text"><b>${r.headline}</b><div class="sub">${meta}</div></div>
    </div>
    <div class="stats">${statCells(r, settings)}</div>
    <div class="panel chart-panel">
      <div class="title">시간 흐름 <span class="sub-inline">· 그래프 위에 마우스를 올리면 그 순간의 값과 설명이 보여요</span></div>
      <div class="chart" id="report-chart"></div>
    </div>
    <div class="panel tips">
      <div class="title">다음 연습에서 고칠 것</div>
      <ol>${tips}</ol>
    </div>
    <div class="report-actions">
      <button class="btn primary" data-act="retry">다시 연습</button>
      <button class="btn" data-act="setup">설정으로</button>
      <button class="btn" data-act="print">PDF로 저장</button>
    </div>
  </div>`;
}

export function enter(appRef, payload = {}) {
  app = appRef;
  root = document.getElementById('screen-report');
  const samples = payload.samples ?? app.lastSamples ?? [];
  app.lastSamples = samples;
  const r = buildReport(samples, app.settings, { recognizedAvgRate: payload.recognizedAvgRate });
  app.lastReport = r;
  root.innerHTML = template(r, app.settings);

  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'retry') app.go('practice');
    else if (act === 'setup') app.go('setup');
    else if (act === 'print') window.print();
  }));

  if (!r.tooShort) {
    chart = createReportChart(root.querySelector('#report-chart'), samples, r, app.settings);
    // 인쇄할 때는 캔버스를 이미지로 바꿔 끼움
    let img = null;
    const before = () => {
      const c = root?.querySelector('#report-chart canvas');
      if (!c) return;
      img = new Image(); img.src = c.toDataURL('image/png'); img.className = 'print-chart';
      c.style.display = 'none'; c.after(img);
    };
    const after = () => {
      img?.remove(); img = null;
      const c = root?.querySelector('#report-chart canvas'); if (c) c.style.display = '';
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    printHandlers = { before, after };
  }
}

export function leave() {
  chart?.remove(); chart = null;
  if (printHandlers) {
    window.removeEventListener('beforeprint', printHandlers.before);
    window.removeEventListener('afterprint', printHandlers.after);
    printHandlers = null;
  }
  root.innerHTML = '';
}

