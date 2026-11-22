// 네 화면의 표현 계층. 센서·기록·분석 로직과 분리한 순수 JavaScript 템플릿입니다.
import { PRESETS } from '../config.js';
import { formatClock } from '../util/time.js';
import { escapeHtml as esc } from '../util/html.js';
import { button, card, field, switchField, segmented, checklist, metricCard, tabs, dataTable, emptyState } from './components.js';

const valueText = (value, unit='', digits=0) => value == null ? '측정 없음' : `${value.toFixed(digits)}${unit}`;
const heading = (kicker,title,text,extra='') => `<header class="page-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1><p class="page-description">${esc(text)}</p></div>${extra}</header>`;

export function setupView(state) {
  const presets=segmented({name:'preset',value:state.presetKey,options:Object.entries(PRESETS).map(([value,p])=>({value,label:p.label}))});
  const settings=`<section class="setup-config card"><header><p class="section-index">01 / CONFIGURE</p><h2>어떤 연습을 해볼까요?</h2><p>목표와 연습 유형을 설정해 주세요.</p></header><section class="stack">
    ${field({label:'연습 제목',forId:'question',controlHtml:'<input class="input" id="question" type="text" maxlength="1000" placeholder="예: 자기소개 · 1차 면접">',hint:'같은 제목의 실제 기록은 현재 탭에서 비교할 수 있어요.'})}
    ${field({label:'연습 유형',controlHtml:presets})}
    <div class="row2 setup-number-fields">
      ${field({label:'목표 시간',controlHtml:'<div class="number-pair"><label><input class="input num" id="dur-m" type="number" min="1" max="30" aria-label="목표 시간 분"><span>분</span></label><label><input class="input num" id="dur-s" type="number" min="0" max="59" step="5" aria-label="목표 시간 초"><span>초</span></label></div>',hint:'목표 이후에도 측정은 계속됩니다.'})}
      ${field({label:'말하기 속도 참고 범위',controlHtml:'<div class="number-pair"><input class="input num" id="rate-min" type="number" step="10" aria-label="속도 최소"><span>–</span><input class="input num" id="rate-max" type="number" step="10" aria-label="속도 최대"></div>',hint:'음절/분 · 음량 변화 기반 추정'})}
    </div>
    <details class="disclosure setup-advanced"><summary>측정 기준 세부 설정</summary><div class="stack"><div class="row2">
      ${field({label:'고개 좌우 허용 범위 (±도)',forId:'gaze-yaw',controlHtml:'<input class="input num" id="gaze-yaw" type="number" min="1" max="90">'})}
      ${field({label:'고개 위아래 허용 범위 (±도)',forId:'gaze-pitch',controlHtml:'<input class="input num" id="gaze-pitch" type="number" min="1" max="90">'})}
    </div>${field({label:'눈 방향 계산 방식',forId:'eye-method',controlHtml:'<select class="select" id="eye-method"><option value="blendshape">기본 눈 방향 신호</option><option value="iris">홍채 방식 · 실험</option></select>',hint:'홍채 방식은 개인별 보정과 별도 점검이 필요하며 정확도를 보장하지 않습니다.'})}</div></details>
  </section></section>`;
  const options=`<section class="setup-options"><h3>나에게 맞는 연습 환경</h3><div class="options-grid">
    ${switchField({id:'record-answer',label:'영상 · 음성 녹화',hint:'끝난 뒤 내 답변을 다시 봅니다.'})}
    ${switchField({id:'focus-mode',label:'답변에만 집중',hint:'연습 중 수치는 숨기고 끝난 뒤 확인합니다.'})}
  </div></section>`;
  const preview=`<section class="setup-device"><div class="section-heading"><div><p class="section-index">02 / GET READY</p><h2>내 연습 공간</h2></div><span class="soft-tag">CAMERA PREVIEW</span></div>
    <div class="preview" id="setup-preview"></div>
    <div class="device-check-body"><h3>시작 전, 두 가지만 확인하세요.</h3>
      ${checklist([{key:'face',title:'카메라를 정면으로 바라보세요'},{key:'voice',title:'평소 목소리로 아래 문장을 읽어 주세요',html:'<p class="quote">“안녕하세요, 지금부터 발표를 시작하겠습니다.”</p>'}])}
      <div class="progress" role="progressbar" aria-label="준비 확인 진행"><span style="width:0%"></span></div>
      <details class="disclosure setup-precision"><summary>정밀 시선 보정 도구</summary><div class="stack"><div class="inline">${button({label:'정밀 보정',id:'precise-run',variant:'outline',attrs:'disabled'})}${button({label:'기본 보정으로',id:'precise-clear',variant:'ghost',attrs:'disabled'})}</div><p class="hint" id="precise-status" role="status">기본 장치 확인 뒤 렌즈와 화면의 각 방향을 추가 보정할 수 있습니다.</p></div></details>
    </div>
  </section>`;
  return `<div class="setup page">
    <section class="setup-hero"><div><p class="eyebrow">YOUR INTERVIEW, YOUR PACE</p><h1>대답은 자연스럽게.<br>피드백은 선명하게.</h1><p>목소리와 시선을 기록하고, 나만의 속도로 면접을 준비하세요.</p><div class="hero-chips"><span>실시간 셀프 모니터</span><span>기기 안에서만 처리</span></div></div><div class="hero-route" aria-label="진행 순서"><span><b>01</b> 연습 준비</span><i></i><span><b>02</b> 답변 모니터링</span><i></i><span><b>03</b> 기록 돌아보기</span></div></section>
    <div class="setup-workspace">${preview}<div class="setup-config-column">${settings}${options}</div></div>
    <div class="launch-panel"><div class="launch-copy"><span class="section-index">READY WHEN YOU ARE</span><h2>준비가 끝나면 시작하세요.</h2><p id="start-hint" class="hint" role="status">먼저 장치 확인을 진행해 주세요.</p></div><div class="launch-buttons">${button({label:'카메라 · 마이크 확인',id:'calib-run',variant:'outline'})}<button type="button" class="btn" id="start" data-size="lg" aria-describedby="start-hint" disabled>모니터링 시작</button></div></div>
    <div class="utility-line"><p>장치 없이 화면 흐름을 먼저 확인할 수도 있습니다.</p><div class="screen-actions-slot"></div></div>
    <details class="retention"><summary>기록 및 개인정보 안내</summary><p>영상·음성·메모는 현재 탭에만 보관됩니다. 실제 기록은 최근 5개까지 유지되며 새로고침이나 탭 종료 시 사라집니다. 외부 서버로 전송하지 않으니 필요한 자료는 다운로드하세요. 말하기 속도와 시선은 참고 측정값이며 답변 내용이나 합격 가능성을 평가하지 않습니다.</p></details>
  </div>`;
}

export function practiceView(settings) {
  const total=formatClock(settings.durationSec);
  return `<div class="practice answer self-review page ${settings.focusMode?'focus-mode':''}">
    ${heading('LIVE SESSION','지금은, 내 답변에 집중할 시간.','평소처럼 답변하세요. 아래 수치는 스스로 돌아보기 위한 참고값입니다.','<span class="session-tag"><i></i>모니터링 세션</span>')}
    <div class="session-question"><span class="soft-tag">이번 연습</span><h2>${esc(settings.question||'제목 없는 연습')}</h2><span id="record-state" role="status">3초 카운트다운 후 시작</span></div>
    <div class="answer-body"><div class="cam" id="cam" data-status="idle">
      <div class="gaze-head"><div class="gaze-pill" id="pill" data-status="idle"><span class="dot"></span><span id="pill-text">측정 대기</span><span class="cum" id="pill-cum" title="유효 시선 측정 시간 중 정면 참고 범위 비율">누적 —</span></div></div>
      <div class="countdown" id="countdown"></div><div class="angles" id="angles" hidden></div><div class="demo-badge" id="demo-badge" hidden>DEMO<small id="demo-scene"></small></div><span class="video-corner">INTERVIEW STUDIO / LIVE VIEW</span>
    </div></div>
    <div class="side metric-dock">
      ${metricCard({id:'p-rate',title:'01 · 말하기 속도',numId:'v-rate',stateId:'l-rate',extraHtml:`<div id="g-rate"></div><div class="metric-foot"><span>참고 ${settings.rateMin}–${settings.rateMax} 음절/분</span><span id="n-rate"></span></div>`})}
      ${metricCard({id:'p-vol',title:'02 · 목소리 크기',numId:'v-vol',stateId:'l-vol',extraHtml:'<div id="g-vol"></div><p class="metric-foot">평소 목소리 기준 대비 dB</p>'})}
      ${metricCard({id:'p-pitch',title:'03 · 음높이 변화',numId:'v-pitch',stateId:'l-pitch',extraHtml:'<div class="spark" id="spark"></div><p class="metric-foot">최근 10초의 목소리 흐름</p>'})}
      <div class="card metric gaze-metric"><div class="metric-head"><span class="metric-title">04 · 고개와 눈 방향</span></div><div class="gaze-parts"><span class="badge" id="part-head" data-ok="true">고개 <b>—</b></span><span class="badge" id="part-eye" data-ok="true">눈 <b>—</b></span></div><p id="gaze-quality" class="hint gaze-detail"></p><p class="metric-foot">판단이 어려운 구간은 미측정으로 표시합니다.</p></div>
    </div>
    <p class="focus-note">집중 모드입니다. 측정은 계속되며, 종료 후 리포트에서 확인할 수 있습니다.</p>
    <div class="session-control"><div class="clock" id="p-time" data-status="idle"><span class="clock-label" id="t-time">남은 시간</span><b id="v-time">${total}</b><span class="clock-total">/ ${total}</span></div><div class="screen-actions-slot"></div><span class="keyboard-hint"><kbd>Esc</kbd> 종료</span><div id="pb-time"></div></div>
  </div>`;
}

function videoPlayer(session) {
  return session.url?`<video id="answer-player" controls playsinline preload="metadata" src="${esc(session.url)}" aria-label="현재 연습 녹화 재생"></video>`:emptyState({title:'이번 연습은 녹화하지 않았어요.',text:session.media.message||'다음 연습에서 녹화 옵션을 켜면 영상을 함께 돌아볼 수 있습니다.'});
}

export function reportView(session) {
  const r=session.review;
  const metrics=[
    ['정면 범위 안',valueText(r.frontalPct,'%'),'유효 시선 측정 기준'],
    ['말하기 속도',valueText(r.avgRate),'음절/분 · 추정 평균'],
    ['목소리 크기',valueText(r.avgDeltaDb,' dB',1),'평소 목소리 기준 대비'],
    ['음높이 변화',valueText(r.pitchSt,' 반음',1),'발화 중 변화량'],
  ];
  const moments=r.intervals.length?r.intervals.slice(0,8).map((i,index)=>`<button type="button" class="moment-chip" data-seek="${i.start}"><span class="moment-number">${String(index+1).padStart(2,'0')}</span><b>${formatClock(i.start)}</b><span>${esc(i.label)}</span><span aria-hidden="true">↗</span></button>`).join(''):'<div class="empty-inline"><b>표시할 구간이 없습니다.</b><p>측정 표본이 부족한 경우에도 구간이 나타나지 않을 수 있습니다.</p></div>';
  const chart=`<section class="rd-panel rd-timeline-panel"><div class="section-heading"><div><p class="section-index">TIMELINE</p><h2>시간별 목소리와 시선</h2></div></div><div class="rd-chart-legend"><span><i class="legend-blue"></i>참고 범위 안</span><span><i class="legend-gray"></i>범위 밖</span><span><i class="legend-dark"></i>미측정</span></div><div class="chart" id="report-chart" role="img" aria-label="시선·고개·눈·속도·음량·음높이 그래프. 아래 슬라이더로 위치를 선택할 수 있습니다."></div><div class="scrub"><label for="review-time">확인할 위치 <output id="review-clock">00:00</output></label><input id="review-time" class="input" type="range" min="0" max="${r.durationSec}" step="0.1" value="0"></div><p class="hint sample-description" id="sample-description"></p></section>`;
  const memo=`<section class="rd-panel rd-memo-panel"><div class="section-heading"><div><p class="section-index">SELF REFLECTION</p><h2>나의 다음 답변을 위한 메모</h2></div><span class="soft-tag">현재 탭에만 유지</span></div>${tabs({id:'memo',selected:'here',items:[
    {id:'here',label:'이 구간에 메모',html:`<label class="label" for="marker-note">선택한 위치에서 발견한 점</label><div class="rd-note-input"><input class="input" type="text" id="marker-note" maxlength="500" placeholder="예: 이 부분에서 말이 빨라졌어요.">${button({label:'메모 추가',id:'add-marker'})}</div><ul id="markers" class="markers"></ul>`},
    {id:'all',label:'전체 피드백',html:`<div class="stack"><label class="label" for="reflection">잘한 점과 다음에 바꿔볼 점</label><textarea class="textarea" id="reflection" rows="5" maxlength="10000" placeholder="내 답변을 다시 보고 자유롭게 적어 보세요.">${esc(session.reflection)}</textarea><p class="hint" id="note-state" role="status">메모는 현재 탭에서 유지됩니다.</p><div>${button({label:'측정값 · 메모 다운로드',id:'download-notes',variant:'outline'})}</div></div>`}
  ]})}</section>`;
  const calibration=`<section class="rd-panel rd-calibration-panel"><p class="section-index">SESSION DETAILS</p><h2>이번 연습의 측정 기준</h2><div class="rd-info-row"><span>보정 방식</span><b>${session.settings.calib?.kind==='precise'?'개인별 정밀 보정':'기본 정면 보정'}</b></div><div class="rd-info-row"><span>눈 방향 계산</span><b>${session.settings.eyeMethod==='iris'?'홍채 방식 · 실험':'기본 눈 방향 신호'}</b></div><div class="rd-info-row"><span>좌우 / 위아래</span><b>±${session.settings.gazeLimits?.yawDeg??15}° / ±${session.settings.gazeLimits?.pitchDeg??12}°</b></div><p class="hint">시선 미측정·기록 공백 ${r.gazeUnknownSec.toFixed(1)}초. 원시값과 보정값은 다운로드에 포함됩니다.</p><div class="report-caution"><b>수치는 답변의 점수가 아닙니다.</b><p>말하기 속도는 음량 변화 기반 추정치입니다. 내용의 질이나 면접 능력을 자동 평가하지 않으니 영상과 함께 직접 판단하세요.</p></div></section>`;
  const rows=r.intervals.map(i=>`<tr><td><button type="button" class="btn" data-variant="link" data-size="sm" data-seek="${i.start}">${formatClock(i.start)}</button></td><td>${esc(i.label)}</td><td>${i.dur.toFixed(1)}초</td></tr>`);
  return `<div class="report review rd-report page">
    ${heading('SESSION REVIEW','한 번의 연습, 다음 답변의 힌트.','내 기록을 다시 보고, 다음 연습에서 바꾸고 싶은 점을 찾아보세요.','<span class="session-tag completed"><i></i>분석 완료</span>')}
    <section class="report-overview"><div class="overview-meta"><div><span class="soft-tag">${session.demo?'DEMO / 가상 데이터':'MY SESSION'}</span><h2>${esc(session.settings.question||'제목 없는 연습')}</h2><p>${esc(session.date)} · 실제 연습 ${formatClock(r.durationSec)}</p></div><div class="overview-duration"><span>총 모니터링</span><b>${formatClock(r.durationSec)}</b></div></div><div class="rd-metric-grid">${metrics.map((m,i)=>`<article class="rd-metric"><span class="metric-index">0${i+1}</span><span>${esc(m[0])}</span><strong>${esc(m[1])}</strong><small>${esc(m[2])}</small></article>`).join('')}</div><div class="rd-summary-details"><span>유효 시선 <b>${r.faceCoverageSec.toFixed(1)}초</b></span><span>속도 측정 <b>${r.rateCoverageSec.toFixed(1)}초</b></span><span>발화 추정 <b>${r.speakingSec.toFixed(1)}초</b></span></div></section>
    <div class="report-replay-grid"><section class="rd-video-panel"><div class="section-heading"><div><p class="section-index">PLAYBACK</p><h2>내 답변 다시 보기</h2></div><span class="soft-tag">${session.url?'녹화 있음':'영상 없음'}</span></div><div class="rd-video-frame">${videoPlayer(session)}</div><div class="rd-video-actions">${button({label:'녹화 다운로드',id:'download-media',variant:'outline',attrs:session.url?'':'disabled'})}${button({label:'녹화 삭제',id:'delete-media',variant:'ghost',attrs:session.url?'':'disabled'})}</div><p class="hint">녹화는 원본 카메라 방향으로 저장되어 미리보기와 좌우가 다를 수 있습니다.</p></section>${chart}</div>
    <section class="rd-panel rd-moments-panel"><div class="section-heading"><div><p class="section-index">MOMENTS TO REVISIT</p><h2>이 구간을 한 번 더 살펴보세요.</h2></div><span class="hint">선택하면 해당 위치로 이동합니다.</span></div><div class="rd-moment-list">${moments}</div></section>
    <div class="report-reflection-grid">${memo}${calibration}</div>
    <details class="report-details"><summary>측정 구간 상세와 이전 기록 비교</summary><div class="rd-bottom-area">${card({title:'측정 구간 상세',description:'참고 범위와 다른 구간입니다. 재생해 보고 직접 판단하세요.',html:r.intervals.length?`<div class="intervals">${dataTable({columns:['시작','내용','길이'],rowsHtml:rows})}</div>`:emptyState({title:'표시할 구간이 없습니다.',text:'측정 부족일 수도 있으며 수행 평가를 의미하지 않습니다.'})})}${card({id:'comparison',className:'comparison',title:'이전 연습과 비교',html:`${field({label:'같은 제목으로 기록한 세션',forId:'previous-answer',controlHtml:'<select class="select" id="previous-answer"><option value="">비교할 기록 선택</option></select>'})}<div id="comparison-content"><p class="hint">같은 제목으로 다시 연습하면 이전 실제 기록과 비교할 수 있습니다.</p></div>`})}</div></details>
    <div class="report-bottom-control"><div><p class="section-index">NEXT PRACTICE</p><h2>발견한 점을 다음 답변에 적용해 보세요.</h2></div><div class="screen-actions-slot"></div></div>
    <div class="report-actions">${button({label:'새 연습 설정',id:'setup',variant:'outline'})}${button({label:'리포트 인쇄 / PDF',id:'print',variant:'outline'})}${button({label:'기록 · 메모 모두 삭제',id:'clear-history',variant:'destructive'})}</div><p class="hint rd-retention-note">실제 기록은 최근 5개까지 현재 탭에만 보관됩니다. 새로고침하거나 탭을 닫기 전에 필요한 기록을 다운로드하세요.</p>
  </div>`;
}

export function gazeView() {
  return `<div class="gtest page">${heading('GAZE LAB','내 시선은 어떻게 읽힐까요?','장치에서 고개와 눈 방향이 어떻게 감지되는지 별도 표본으로 확인하세요.','<span class="soft-tag">약 1분 / 정확도 보장 아님</span>')}
    <div class="gaze-lab-grid"><section class="card gt-step"><header><p class="section-index">FOLLOW THE GUIDE</p><h2>시선 인식 점검</h2></header><section class="stack"><p class="hint" id="gt-count">보정과 별도의 확인 표본을 수집합니다.</p><h2 class="gt-title" id="gt-title">내 기기의 감지 결과 확인</h2><p id="gt-say">렌즈 보기, 네 방향, 눈 감김, 한쪽 눈 가림, 반복 정면 보기를 확인합니다. 두 방식이 일치해도 실제 정확도를 보장하지 않습니다.</p><div id="gt-progress"></div><p id="gt-phase" role="status"></p><div class="gt-now">현재 안정화 방향 <b id="gt-now">—</b></div><p class="hint" id="gt-raw">원시 방향: —</p><p class="hint" id="gt-source"></p><div class="gt-start-actions">${button({label:'시선 점검 시작',id:'gt-start'})}${button({label:'이 단계 건너뛰기',id:'gt-skip',variant:'outline',attrs:'hidden'})}</div></section></section><div class="cam" id="gt-cam"><span class="video-corner">GAZE LAB / CAMERA VIEW</span></div></div>
    <div class="gaze-results-grid">${card({title:'실시간 신호',className:'gt-observations',description:'측정 중 사용 가능한 신호와 원시값입니다.',html:'<pre class="gaze-values" id="gt-values">표본을 기다리고 있습니다.</pre>'})}${card({title:'두 방식의 관찰 결과',id:'gt-result',description:'같은 표본으로 기본 방식과 홍채 방식을 비교합니다.',html:'<div class="empty-inline"><b>점검이 끝나면 결과가 표시됩니다.</b><p>방향 일치율·미측정 비율·첫 일치 시간을 확인할 수 있습니다. 수행 점수나 통과 판정은 제공하지 않습니다.</p></div>'})}</div><div class="gaze-bottom-control"><p>관찰 결과를 확인한 뒤 연습 화면에서 사용할 방식을 직접 선택하세요.</p><div class="screen-actions-slot"></div></div>
  </div>`;
}
