import { reportView } from './views.js';
// 스스로 분석: 로컬 재생, 관찰값, 사용자가 남긴 메모. 자동 평가 없음.
import { buildReview, nearestSample } from '../analysis/review.js';
import { GAZE_REASON_TEXT } from '../analysis/gaze-logic.js';
import { formatClock } from '../util/time.js';
import { escapeHtml as esc } from '../util/html.js';
import { createReportChart } from './report-sketch.js';
import { badge, button, card, field, statGrid, tabs, bindTabs, dataTable, emptyState } from './components.js';

let app, root, chart, current, printHandlers;
const n = (v, suffix = '', digits = 0) => v == null ? '측정 없음' : `${v.toFixed(digits)}${suffix}`;
const $ = id => root.querySelector(`#${id}`);
const stopPlayers = () => root?.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });

function release(session) {
  if (session?.url) URL.revokeObjectURL(session.url);
  if (session) { session.url = null; session.media.blob = null; }
}

function stats(r) {
  return statGrid([
    { label: '정면 범위 안', value: n(r.frontalPct, '%'), sub: `유효 측정 ${r.faceCoverageSec.toFixed(1)}초 기준` },
    { label: '속도 추정 평균', value: n(r.avgRate), sub: `음절/분 · 측정 ${r.rateCoverageSec.toFixed(1)}초` },
    { label: '기준 대비 음량', value: n(r.avgDeltaDb, ' dB', 1), sub: `발화 추정 ${r.speakingSec.toFixed(1)}초 기준` },
    { label: '음량 변화 폭', value: n(r.volumeStdDb, ' dB', 1), sub: '발화 중 음량이 달라진 폭(표준편차)' },
    { label: '음높이 변화량', value: n(r.pitchSt, ' 반음', 1), sub: '발화 중 검출한 음높이의 분산 정도' },
    { label: '모니터링 시간', value: formatClock(r.durationSec), sub: `표본 기록 ${r.sampledSec.toFixed(1)}초` },
  ]);
}

function player(session, id) {
  return session.url ? `<video id="${id}" controls playsinline preload="metadata" src="${esc(session.url)}" aria-label="${id === 'answer-player' ? '현재' : '이전'} 기록 재생"></video>`
    : emptyState({ title: '녹화가 없어요', text: session.media.message || '녹화 파일이 없습니다.' });
}

function template(session) { return reportView(session); }

/** 상단 바: 비교로 이동 · 같은 조건으로 다시 하기 */
function topActions() {
  return `${button({ label: '이전 기록과 비교', id: 'goto-compare', variant: 'outline' })}${button({ label: '같은 조건으로 다시 하기', id: 'retry' })}`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describe(t) {
  $('review-clock').textContent = formatClock(t);
  const sample = nearestSample(current.samples, t);
  const match = sample && Math.abs(sample.t - t) <= 0.2;
  const gaze=current.review.gazeTimeline.find(g=>t>=g.start && t<g.end);
  const observed=gaze && t>=gaze.start && t<=gaze.end;
  const dir={front:'정면',left:'왼쪽',right:'오른쪽',up:'위',down:'아래',closed:'감김',uncertain:'불확실',mixed:'고개·눈 충돌',none:'없음'};
  $('sample-description').textContent = `${!observed?'시선 표본 없음':
    `정면 범위 ${gaze.frontal==null?'불확실':gaze.frontal?'안':'밖'} · 고개 ${dir[gaze.head?.dir]??'—'} · 눈 ${dir[gaze.eye?.dir]??'—'}${gaze.gazeReason?' · '+(GAZE_REASON_TEXT[gaze.gazeReason]??gaze.gazeReason):''} · 원시 ${dir[gaze.raw?.dir]??'—'} / 안정화 ${dir[gaze.dir]??'—'}`} · ${!match?'음성 표본 없음':`속도 추정 ${n(sample.rate,' 음절/분')} · 음량 ${n(sample.speaking?sample.deltaDb:null,' dB',1)} · 음높이 ${n(sample.hz,' Hz')}`}`;

}
function seek(t) {
  const position = Math.max(0, Math.min(current.review.durationSec, t));
  $('review-time').value = position; describe(position);
  const video = $('answer-player');
  if (video) {
    if (video.readyState) { try { video.currentTime = position; } catch { /* metadata not seekable */ } }
    else video.addEventListener('loadedmetadata', () => { if (root?.contains(video)) video.currentTime = position; }, { once: true });
  }
}
function markers() {
  $('markers').replaceChildren();
  current.markers.forEach((m,index) => {
    const li = document.createElement('li');
    const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'btn'; jump.dataset.variant = 'ghost'; jump.dataset.size = 'sm'; jump.textContent = `${formatClock(m.t)} · ${m.text}`; jump.onclick = () => seek(m.t);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'btn'; del.dataset.variant = 'outline'; del.dataset.size = 'sm'; del.textContent = '삭제'; del.setAttribute('aria-label', `${formatClock(m.t)} 메모 삭제`);
    del.onclick = () => { current.markers.splice(index,1); markers(); };
    li.append(jump,del); $('markers').append(li);
  });
}

export function enter(appRef, payload = {}) {
  app = appRef; root = document.getElementById('screen-report');
  app.reviewSessions ??= [];
  if (payload.samples) {
    if (app.lastReview?.demo) release(app.lastReview);
    current = {
      id: crypto.randomUUID(), date: new Date().toLocaleString('ko-KR'), settings: structuredClone(app.settings),
      samples: payload.samples, demo: !!payload.demo, media: payload.media ?? { blob:null, message:'녹화하지 않은 기록입니다.' }, reflection:'', markers:[],
    };
    current.url = current.media.blob ? URL.createObjectURL(current.media.blob) : null;
    current.review = buildReview(current.samples,current.settings,payload.durationSec);
    if (!current.demo) {
      app.reviewSessions.push(current);
      while (app.reviewSessions.length > 5) release(app.reviewSessions.shift());
    }
    app.lastReview = current;
  } else current = app.lastReview;
  if (!current) { app.go('setup'); return; }
  root.innerHTML = template(current);
  bindTabs(root);
  const top = document.getElementById('topbar-right');
  top.innerHTML = topActions();
  top.querySelector('#goto-compare').onclick = () => { const details=root.querySelector('.report-details'); if(details) details.open=true; $('comparison').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('previous-answer').focus({ preventScroll: true }); };
  $('reflection').addEventListener('input', e => { current.reflection = e.target.value; $('note-state').textContent = '현재 탭에 메모를 반영했습니다.'; });
  $('add-marker').onclick = () => {
    const input = $('marker-note');
    if (!input.value.trim()) { input.focus(); return; }
    current.markers.push({ t: Number($('review-time').value), text: input.value.trim() });
    current.markers.sort((a,b)=>a.t-b.t); input.value=''; markers();
  };
  $('review-time').addEventListener('input', e => seek(Number(e.target.value)));
  $('answer-player')?.addEventListener('timeupdate', e => { if (!root?.contains(e.target)) return; const t = e.target.currentTime; $('review-time').value=t; describe(t); });
  root.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => seek(Number(b.dataset.seek)));
  $('download-media').onclick = () => download(current.media.blob, `answer-${current.id}.${current.media.blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
  $('delete-media').onclick = () => {
    const session = current;
    stopPlayers(); release(session); session.media.message = '사용자가 녹화 파일을 삭제했습니다.';
    app.go('report');
  };
  $('download-notes').onclick = () => {
    const { id,date,settings,samples,review,reflection,markers,demo } = current;
    download(new Blob([JSON.stringify({id,date,settings,samples,review,reflection,markers,demo},null,2)], {type:'application/json'}), `review-${id}.json`);
  };
  top.querySelector('#retry').onclick = () => { app.settings = structuredClone(current.settings); app.go('setup'); };
  $('setup').onclick = () => app.go('setup');
  $('print').onclick = () => window.print();
  $('clear-history').onclick = () => {
    stopPlayers();
    for (const session of new Set([...app.reviewSessions,current])) release(session);
    app.reviewSessions=[]; app.lastReview=null;
    current=null; app.go('setup');
  };
  const previous = current.demo || !current.settings.question ? [] : app.reviewSessions.filter(x => x !== current && x.settings.question === current.settings.question);
  previous.slice().reverse().forEach(session => {
    const option = document.createElement('option'); option.value=session.id; option.textContent=session.date; $('previous-answer').append(option);
  });
  $('previous-answer').disabled = !previous.length;
  if (!current.demo && !current.settings.question) $('comparison-content').innerHTML = '<p class="hint">제목을 넣고 시작하면 같은 제목의 기록끼리 비교할 수 있어요.</p>';
  $('previous-answer').onchange = e => {
    $('previous-player')?.pause();
    const session = previous.find(x=>x.id===e.target.value);
    $('comparison-content').innerHTML = session ? `<p>${esc(session.date)} · 설정 ${formatClock(session.settings.durationSec)} · 속도 참고 ${session.settings.rateMin}~${session.settings.rateMax}</p>
      <p class="hint">${session.settings.calib?.kind==='precise'?'정밀 보정':'기본 보정'} · ${session.settings.eyeMethod==='iris'?'홍채 방식(실험)':'기본 눈 방향 방식'}. 장치·보정 기준은 연습마다 달라질 수 있습니다. 수치 차이의 의미는 직접 판단하세요.</p>
      <div class="stats">${stats(session.review)}</div>${player(session,'previous-player')}
      <h3>이전 기록 메모</h3><p class="saved-note">${esc(session.reflection || '남긴 메모 없음')}</p>
      <ul>${session.markers.map(m=>`<li>${formatClock(m.t)} · ${esc(m.text)}</li>`).join('')}</ul>` : '';
    $('previous-player')?.addEventListener('play', () => root?.querySelector('#answer-player')?.pause());
  };
  $('answer-player')?.addEventListener('play', () => root?.querySelector('#previous-player')?.pause());
  chart = createReportChart($('report-chart'), current.samples,current.review,current.settings,seek);
  markers(); describe(0);
  const before = () => {
    const canvas = $('report-chart')?.querySelector('canvas');
    if (canvas && !root.querySelector('.print-chart')) { const img = new Image(); img.src=canvas.toDataURL(); img.className='print-chart'; canvas.after(img); }
    const note = document.createElement('p'); note.className='print-note'; note.textContent=current.reflection; $('reflection').after(note);
    // 숨겨진 메모 탭도 인쇄되게: Basecoat의 [hidden] 규칙은 @layer 안의 !important라 CSS로는 못 덮음
    root.querySelectorAll('[role=tabpanel][hidden]').forEach((el) => { el.hidden = false; el.dataset.printShown = '1'; });
  };
  const after = () => {
    root?.querySelectorAll('.print-chart,.print-note').forEach(el=>el.remove());
    root?.querySelectorAll('[data-print-shown]').forEach((el) => { el.hidden = true; delete el.dataset.printShown; });
  };
  window.addEventListener('beforeprint',before); window.addEventListener('afterprint',after); printHandlers={before,after};
}

export function leave() {
  stopPlayers(); chart?.remove(); chart=null;
  if (printHandlers) { window.removeEventListener('beforeprint',printHandlers.before); window.removeEventListener('afterprint',printHandlers.after); printHandlers=null; }
  if (root) root.innerHTML=''; root=null;
}
