// 자기 복기: 로컬 재생, 관찰값, 사용자가 남긴 메모. 자동 평가 없음.
import { buildReview, nearestSample } from '../analysis/review.js';
import { formatClock } from '../util/time.js';
import { escapeHtml as esc } from '../util/html.js';
import { createReportChart } from './report-sketch.js';

let app, root, chart, current, printHandlers;
const n = (v, suffix = '', digits = 0) => v == null ? '측정 없음' : `${v.toFixed(digits)}${suffix}`;
const $ = id => root.querySelector(`#${id}`);
const stopPlayers = () => root?.querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });

function release(session) {
  if (session?.url) URL.revokeObjectURL(session.url);
  if (session) { session.url = null; session.media.blob = null; }
}

function stats(r) {
  const values = [
    ['정면 범위 안', n(r.frontalPct, '%'), `얼굴 검출 표본 ${r.faceCoverageSec.toFixed(1)}초 기준`],
    ['속도 추정 평균', n(r.avgRate), `음절/분 · 측정 ${r.rateCoverageSec.toFixed(1)}초`],
    ['기준 대비 음량', n(r.avgDeltaDb, ' dB', 1), `발화 추정 ${r.speakingSec.toFixed(1)}초 기준`],
    ['음높이 변화량', n(r.pitchSt, ' 반음', 1), '발화 중 검출한 음높이의 분산 정도'],
    ['답변 시간', formatClock(r.durationSec), `표본 기록 ${r.sampledSec.toFixed(1)}초`],
  ];
  return values.map(([label,value,sub]) => `<div class="panel stat"><div class="title">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`).join('');
}

function player(session, id) {
  return session.url ? `<video id="${id}" controls playsinline preload="metadata" src="${esc(session.url)}" aria-label="${id === 'answer-player' ? '현재' : '이전'} 답변 재생"></video>`
    : `<p class="sub">${esc(session.media.message || '녹화 파일이 없습니다.')}</p>`;
}

function template(session) {
  const r = session.review;
  return `<div class="report self-review">
    <div class="panel hero"><div class="hero-text"><b>${session.demo ? '데모 데이터 살펴보기' : '내 답변 돌아보기'}</b>
      <p class="question">${esc(session.settings.question || '자유 답변')}</p>
      <div class="sub">${esc(session.date)} · 설정 ${formatClock(session.settings.durationSec)} / 답변 ${formatClock(r.durationSec)} · 자동 점수·평가 없음</div></div></div>
    <div class="stats">${stats(r)}</div>
    <p class="review-help">측정값은 관찰을 돕는 참고 정보입니다. 속도는 음량 변화 기반 추정이며, 정면 비율은 얼굴이 검출된 표본만 사용합니다. 검출 실패·기록 공백은 행동 평가에 사용하지 않습니다.</p>
    <div class="review-grid">
      <div class="panel playback"><h2>답변 다시 보기</h2>${player(session,'answer-player')}
        <div class="report-actions"><button class="btn" id="download-media" ${session.url ? '' : 'disabled'}>녹화 파일 다운로드</button>
        <button class="btn" id="delete-media" ${session.url ? '' : 'disabled'}>이 녹화 삭제</button></div>
        <p class="sub">녹화는 원본 카메라 방향이며 미리보기와 좌우가 다를 수 있습니다.</p>
      </div>
      <div class="panel"><h2>직접 남기는 복기</h2>
        <label for="reflection">전달한 핵심, 다시 볼 부분, 다음에 바꾸고 싶은 점</label>
        <textarea id="reflection" rows="6" maxlength="10000" placeholder="영상과 측정값을 보고 내 생각을 적어 보세요.">${esc(session.reflection)}</textarea>
        <p class="sub" id="note-state" role="status">메모는 현재 탭에서 유지됩니다. 필요한 내용은 다운로드하세요.</p>
        <button class="btn" id="download-notes">측정값·메모 다운로드</button>
      </div>
    </div>
    <div class="panel chart-panel"><h2>시간에 따른 관찰값</h2>
      <p class="sub">그래프 클릭 또는 아래 시간 선택으로 해당 위치를 확인하세요. 정면 띠: 파랑 = 참고 범위 안, 회색 = 범위 밖, 어두운색 = 검출 없음. 속도 음영은 설정한 참고 범위입니다.</p>
      <div class="chart" id="report-chart" role="img" aria-label="정면 범위·속도·음량·음높이 시간 그래프. 아래 시간 선택으로 값을 읽을 수 있습니다."></div>
      <label for="review-time">확인할 위치 <output id="review-clock">00:00</output></label>
      <input id="review-time" type="range" min="0" max="${r.durationSec}" step="0.1" value="0">
      <p id="sample-description" class="sample-description"></p>
      <div class="marker-form"><label for="marker-note">이 위치에 메모</label><input id="marker-note" type="text" maxlength="500" placeholder="직접 발견한 부분을 적어 주세요."><button class="btn" id="add-marker">메모 추가</button></div>
      <ul id="markers" class="markers"></ul>
    </div>
    <div class="panel observations"><h2>참고 범위와 다른 구간</h2>
      <p class="sub">1초 이상 이어진 구간입니다. 개선할 부분인지는 재생한 뒤 직접 판단하세요. 얼굴 미검출은 따로 표시합니다.</p>
      <div class="intervals">${r.intervals.length ? r.intervals.map(i => `<button class="btn" data-seek="${i.start}">${formatClock(i.start)} · ${esc(i.label)} · ${i.dur.toFixed(1)}초</button>`).join('') : '<p>표시할 연속 구간이 없습니다. 측정 부족일 수도 있으며 수행 평가를 의미하지 않습니다.</p>'}</div>
    </div>
    <div class="panel comparison"><h2>같은 질문의 이전 답변과 비교</h2>
      <label for="previous-answer">현재 탭에서 연습한 답변 선택</label><select id="previous-answer"><option value="">비교할 답변 선택</option></select>
      <div id="comparison-content"><p class="sub">같은 질문으로 다시 연습하면 이전 답변을 함께 확인할 수 있습니다. 데모는 비교 기록에 포함하지 않습니다.</p></div>
    </div>
    <p class="review-help">실제 답변은 최근 5개까지 현재 탭에만 보관합니다. 새로고침·탭 닫기 시 영상과 메모가 사라집니다.</p>
    <div class="report-actions"><button class="btn primary" id="retry">같은 질문 다시 연습</button><button class="btn" id="setup">질문·설정 변경</button><button class="btn" id="print">복기 인쇄 / PDF</button><button class="btn" id="clear-history">보관한 답변·메모 모두 삭제</button></div>
  </div>`;
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
  $('sample-description').textContent = !match ? '이 위치에는 측정 표본이 없습니다.' :
    `정면 범위: ${sample.frontal == null ? '검출 없음' : sample.frontal ? '안' : '밖'} · 속도 추정 ${n(sample.rate, ' 음절/분')} · 음량 ${n(sample.speaking ? sample.deltaDb : null, ' dB', 1)} · 음높이 ${n(sample.hz, ' Hz')}`;
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
    const jump = document.createElement('button'); jump.className = 'btn'; jump.textContent = `${formatClock(m.t)} · ${m.text}`; jump.onclick = () => seek(m.t);
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = '삭제'; del.setAttribute('aria-label', `${formatClock(m.t)} 메모 삭제`);
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
  $('retry').onclick = () => { app.settings = structuredClone(current.settings); app.go('setup'); };
  $('setup').onclick = () => app.go('setup');
  $('print').onclick = () => window.print();
  $('clear-history').onclick = () => {
    stopPlayers();
    for (const session of new Set([...app.reviewSessions,current])) release(session);
    app.reviewSessions=[]; app.lastReview=null; app.lastSamples=[]; app.lastReport=null;
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
      <p class="sub">장치·보정 기준은 연습마다 달라질 수 있습니다. 수치 차이의 의미는 직접 판단하세요.</p>
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
  };
  const after = () => root?.querySelectorAll('.print-chart,.print-note').forEach(el=>el.remove());
  window.addEventListener('beforeprint',before); window.addEventListener('afterprint',after); printHandlers={before,after};
}

export function leave() {
  stopPlayers(); chart?.remove(); chart=null;
  if (printHandlers) { window.removeEventListener('beforeprint',printHandlers.before); window.removeEventListener('afterprint',printHandlers.after); printHandlers=null; }
  if (root) root.innerHTML=''; root=null;
}
