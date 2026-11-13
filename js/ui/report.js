// ③ 리포트 화면
import { PRESETS } from '../config.js';
import { formatClock, formatStamp } from '../util/time.js';
import { buildReport } from '../analysis/scoring.js';
import { classifyRate, classifyGazeRatio } from '../analysis/classify.js';
import { createReportChart } from './report-sketch.js';

let app, root, chart, printHandlers;

const HISTORY_KEY = 'pcoach.history';
const HISTORY_MAX = 20;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? []; } catch { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-HISTORY_MAX))); } catch { /* 저장 불가 무시 */ }
}

function historyTable(prev, r) {
  if (!prev.length) return '';
  const rows = [...prev.slice(-3)].reverse().map((h) => `<tr><td>${h.date}</td><td>${PRESETS[h.preset]?.label ?? ''}</td>
    <td>${h.score}</td><td>${h.gazePct ?? '—'}%</td><td>${h.avgRate ?? '—'}</td></tr>`).join('');
  const last = prev[prev.length - 1];
  const diff = r.score - last.score;
  const trend = diff > 0 ? `지난번보다 <b class="up">${diff}점</b> 올랐어요.` : diff < 0 ? `지난번보다 <b class="down">${-diff}점</b> 낮아요.` : '지난번과 점수가 같아요.';
  return `<div class="panel history"><div class="title">지난 기록과 비교</div><p>${trend}</p>
    <table><thead><tr><th>날짜</th><th>유형</th><th>점수</th><th>정면 응시</th><th>평균 속도</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const scoreStatus = (v) => (v == null ? 'idle' : v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad');

function statCells(r, settings) {
  const m = r.metrics;
  const cell = (title, value, status, sub = '') =>
    `<div class="panel stat" data-status="${status}"><div class="title">${title}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  return [
    m.gaze ? cell('정면 응시', `${m.gaze.pct}%`, classifyGazeRatio(m.gaze.pct / 100, settings.gazeTarget), `목표 ${Math.round(settings.gazeTarget * 100)}%`)
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


function issuesTable(issues) {
  if (!issues.length) return `<div class="panel issues"><div class="title">이탈 구간</div><p class="sub">기준을 벗어난 구간이 없어요.</p></div>`;
  const rows = issues.map((i) => `<tr data-metric="${i.metric}"><td>${formatStamp(i.start)}</td><td>${i.label}</td><td>${Math.round(i.dur)}초</td></tr>`).join('');
  return `<div class="panel issues"><div class="title">이탈 구간 <span class="sub-inline">· 시작 시각과 지속 시간</span></div>
    <table><thead><tr><th>시작</th><th>내용</th><th>지속</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function template(r, settings, prev = []) {
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
    ${historyTable(prev, r)}
    <div class="report-row">
    ${issuesTable(r.issues)}
    <div class="panel tips">
      <div class="title">다음 연습에서 고칠 것</div>
      <ol>${tips}</ol>
    </div>
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
  const r = buildReport(samples, app.settings, { recognizedAvgRate: payload.recognizedAvgRate, fillerCount: payload.fillerCount });
  app.lastReport = r;
  let prev = [];
  if (!r.tooShort) {
    const history = loadHistory();
    // 연습을 마치고 들어온 경우(payload.samples 있음)에만 기록을 저장
    prev = history;
    if (payload.samples) {
      saveHistory([...history, { date: new Date().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        preset: app.settings.presetKey, score: r.score, gazePct: r.metrics.gaze?.pct ?? null, avgRate: r.metrics.rate?.avg ?? null }]);
    }
  }
  root.innerHTML = template(r, app.settings, prev);

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

