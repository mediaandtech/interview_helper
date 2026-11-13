// 자기 복기: 로컬 재생, 관찰값, 사용자가 남긴 메모. 자동 평가 없음.
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
    { label: '음량 변화 폭', value: n(r.volumeStdDb, ' dB', 1), sub: '발화 중 음량이 흔들린 정도(표준편차)' },
    { label: '음높이 변화량', value: n(r.pitchSt, ' 반음', 1), sub: '발화 중 검출한 음높이의 분산 정도' },
    { label: '답변 시간', value: formatClock(r.durationSec), sub: `표본 기록 ${r.sampledSec.toFixed(1)}초` },
  ]);
}

function player(session, id) {
  return session.url ? `<video id="${id}" controls playsinline preload="metadata" src="${esc(session.url)}" aria-label="${id === 'answer-player' ? '현재' : '이전'} 답변 재생"></video>`
    : emptyState({ title: '녹화가 없어요', text: session.media.message || '녹화 파일이 없습니다.' });
}

function template(session) {
  const r = session.review;
  const video = card({
    className: 'video-card',
    html: player(session, 'answer-player'),
    footerHtml: `${button({ label: '녹화 파일 다운로드', id: 'download-media', variant: 'outline', size: 'sm', attrs: session.url ? '' : 'disabled' })}
      ${button({ label: '이 녹화 삭제', id: 'delete-media', variant: 'ghost', size: 'sm', attrs: session.url ? '' : 'disabled' })}
      <span class="hint">녹화는 원본 카메라 방향이라 미리보기와 좌우가 다를 수 있어요.</span>`,
  });
  const timeline = card({
    title: '시간 흐름',
    description: '그래프를 누르거나 아래 슬라이더로 위치를 고르면 영상이 그 위치로 이동해요. 시선·고개·눈 띠: 파랑 = 참고 범위 안, 회색 = 범위 밖, 어두운색 = 측정 불확실. 회색 음영은 내가 정한 참고 범위예요.',
    html: `<div class="chart" id="report-chart" role="img" aria-label="정면 범위·속도·음량·음높이 시간 그래프. 아래 시간 선택으로 값을 읽을 수 있습니다."></div>
      <div class="scrub"><label class="label" for="review-time">확인할 위치 <output id="review-clock">00:00</output></label>
      <input class="input" id="review-time" type="range" min="0" max="${r.durationSec}" step="0.1" value="0"></div>
      <p id="sample-description" class="hint sample-description"></p>`,
  });
  const summary = card({ title: '관찰 요약', description: '판정이 아닌 측정값이에요. 속도는 음량 변화 기반 추정이고, 정면 비율은 눈·고개 상태를 함께 측정할 수 있었던 시간만 써요.', html: `${stats(r)}<p class="hint gaze-detail">시선 측정 불확실·기록 공백 ${r.gazeUnknownSec.toFixed(1)}초</p>
      <p class="hint">${Object.entries(r.gazeReasons).map(([reason,sec])=>`${esc(GAZE_REASON_TEXT[reason]??reason)} ${sec.toFixed(2)}초`).join(' · ')||'기록된 제외 사유 없음'}</p>
      <p class="hint">동일 표본의 두 방식 방향 일치 ${n(r.gazeComparison.agreementPct,'%')} · 함께 측정 가능 ${r.gazeComparison.seconds.toFixed(1)}초. 일치율은 정확도나 면접 평가를 의미하지 않습니다.</p>` });
  const calibrationInfo=card({title:'사용한 시선 기준',html:`<p>${session.settings.calib?.kind==='precise'?'개인별 정밀 보정':'기본 정면 보정'} · ${session.settings.eyeMethod==='iris'?'홍채 방식(실험)':'기본 눈 방향 방식'}</p><p class="hint">고개 좌우 ±${session.settings.gazeLimits?.yawDeg??15}°, 위아래 ±${session.settings.gazeLimits?.pitchDeg??12}°. 렌즈와 화면 중앙은 정밀 보정에서 각각 기록합니다. 원시값·안정화값·눈별 상태·보정값은 측정값 다운로드에 함께 포함됩니다.</p>`});
  const memo = card({
    title: '메모',
    html: tabs({ id: 'memo', selected: 'here', items: [
      { id: 'here', label: '현재 위치', html: `<div class="stack">
          ${field({ label: '이 위치에 메모', forId: 'marker-note', controlHtml: `<div class="inline"><input class="input" id="marker-note" type="text" maxlength="500" placeholder="직접 발견한 부분을 적어 주세요.">${button({ label: '메모 추가', id: 'add-marker', size: 'sm' })}</div>` })}
          <ul id="markers" class="markers"></ul></div>` },
      { id: 'all', label: '전체 복기', html: `<div class="stack">
          ${field({ label: '전달한 핵심, 다시 볼 부분, 다음에 바꾸고 싶은 점', forId: 'reflection', controlHtml: `<textarea class="textarea" id="reflection" rows="5" maxlength="10000" placeholder="영상과 측정값을 보고 내 생각을 적어 보세요.">${esc(session.reflection)}</textarea>` })}
          <p class="hint" id="note-state" role="status">메모는 현재 탭에서 유지돼요. 필요한 내용은 다운로드하세요.</p>
          <div>${button({ label: '측정값·메모 다운로드', id: 'download-notes', variant: 'outline', size: 'sm' })}</div></div>` },
    ] }),
  });
  const rows = r.intervals.map((i) => `<tr><td><button type="button" class="btn" data-variant="link" data-size="sm" data-seek="${i.start}">${formatClock(i.start)}</button></td><td>${esc(i.label)}</td><td>${i.dur.toFixed(1)}초</td></tr>`);
  const intervals = card({
    title: '참고 범위와 다른 구간',
    description: '1초 이상 이어진 구간이에요. 개선할 부분인지는 재생해 보고 직접 판단하세요.',
    html: r.intervals.length ? `<div class="intervals">${dataTable({ columns: ['시작', '내용', '길이'], rowsHtml: rows })}</div>`
      : emptyState({ title: '표시할 구간이 없어요', text: '측정 부족일 수도 있으며 수행 평가를 의미하지 않아요.' }),
  });
  const comparison = card({
    id: 'comparison', className: 'comparison',
    title: '같은 질문의 이전 답변과 비교',
    html: `${field({ label: '현재 탭에서 연습한 답변 선택', forId: 'previous-answer', controlHtml: '<select class="select" id="previous-answer"><option value="">비교할 답변 선택</option></select>' })}
      <div id="comparison-content"><p class="hint">같은 질문으로 다시 연습하면 이전 답변을 함께 볼 수 있어요. 데모는 비교 기록에 넣지 않아요.</p></div>`,
  });
  return `<div class="report review">
    <div class="qline">${badge({ label: '질문', variant: 'secondary' })}<b class="q">${esc(session.settings.question || '자유 답변')}</b>
      <span class="hint">${session.demo ? '데모 데이터 · ' : ''}${esc(session.date)} · 설정 ${formatClock(session.settings.durationSec)} / 답변 ${formatClock(r.durationSec)} · 자동 점수·평가 없음</span></div>
    <div class="review-grid">
      <section class="review-main">${video}${timeline}</section>
      <aside class="review-side">${summary}${calibrationInfo}${memo}${intervals}</aside>
    </div>
    ${comparison}
    <p class="hint">실제 답변은 최근 5개까지 현재 탭에만 보관해요. 새로고침하거나 탭을 닫으면 영상과 메모가 사라져요.</p>
    <div class="report-actions">${button({ label: '질문·설정 변경', id: 'setup', variant: 'outline' })}
      ${button({ label: '복기 인쇄 / PDF', id: 'print', variant: 'outline' })}
      ${button({ label: '보관한 답변·메모 모두 삭제', id: 'clear-history', variant: 'destructive' })}</div>
  </div>`;
}

/** 상단 바: 비교로 이동 · 같은 질문 다시 답변 */
function topActions() {
  return `${button({ label: '이전 답변과 비교', id: 'goto-compare', variant: 'outline' })}${button({ label: '같은 질문 다시 답변', id: 'retry' })}`;
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
      samples: payload.samples, demo: !!payload.demo, media: payload.media ?? { blob:null, message:'녹화하지 않은 답변입니다.' }, reflection:'', markers:[],
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
  top.querySelector('#goto-compare').onclick = () => { $('comparison').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('previous-answer').focus({ preventScroll: true }); };
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
    leave(); release(session); session.media.message = '사용자가 녹화 파일을 삭제했습니다.';
    enter(app);
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
  $('previous-answer').onchange = e => {
    $('previous-player')?.pause();
    const session = previous.find(x=>x.id===e.target.value);
    $('comparison-content').innerHTML = session ? `<p>${esc(session.date)} · 설정 ${formatClock(session.settings.durationSec)} · 속도 참고 ${session.settings.rateMin}~${session.settings.rateMax}</p>
      <p class="hint">${session.settings.calib?.kind==='precise'?'정밀 보정':'기본 보정'} · ${session.settings.eyeMethod==='iris'?'홍채 방식(실험)':'기본 눈 방향 방식'}. 장치·보정 기준은 연습마다 달라질 수 있습니다. 수치 차이의 의미는 직접 판단하세요.</p>
      <div class="stats">${stats(session.review)}</div>${player(session,'previous-player')}
      <h3>이전 복기 메모</h3><p class="saved-note">${esc(session.reflection || '남긴 메모 없음')}</p>
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
