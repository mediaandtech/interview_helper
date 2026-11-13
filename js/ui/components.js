// 재사용 화면 부품 — Basecoat UI(shadcn) 마크업을 만드는 순수 함수 + 동작형 부품(게이지·진행 막대)
// 규칙: 일반 문자열 인자는 escapeHtml 처리, 이름이 *html / *Html 인 인자는 이미 안전한 HTML로 보고 그대로 넣는다.
import { gaugePercent } from '../util/gauge.js';
import { escapeHtml as esc } from '../util/html.js';

/**
 * 범위 밴드 게이지:  왼쪽 라벨 ─── [ 참고 범위 ] ─── 오른쪽 라벨
 * @param {HTMLElement} el  비어 있는 컨테이너
 * @param {{min:number, max:number, lo:number, hi:number, left:string, right:string}} opt
 */
export function createGauge(el, opt) {
  el.classList.add('gauge');
  el.innerHTML = `
    <div class="g-track">
      <div class="g-band"></div>
      <div class="g-mark" hidden></div>
    </div>
    <div class="g-ends"><span>${opt.left}</span><span>참고</span><span>${opt.right}</span></div>`;
  const band = el.querySelector('.g-band');
  const mark = el.querySelector('.g-mark');
  const ends = el.querySelectorAll('.g-ends span');

  function setRange(o) {
    Object.assign(opt, o);
    const a = gaugePercent(opt.lo, opt.min, opt.max), b = gaugePercent(opt.hi, opt.min, opt.max);
    band.style.left = `${a}%`; band.style.width = `${b - a}%`;
    ends[1].style.left = `${(a + b) / 2}%`;
  }
  setRange({});

  return {
    setRange,
    /** value가 null이면 마커를 숨깁니다(측정 대기) */
    update(value, status) {
      const p = gaugePercent(value, opt.min, opt.max);
      if (p == null) { mark.hidden = true; return; }
      mark.hidden = false;
      mark.style.left = `${p}%`;
      if (mark.dataset.status !== status) mark.dataset.status = status;
    },
  };
}

/** 진행 막대 */
export function createProgress(el) {
  el.classList.add('progressbar');
  el.innerHTML = '<div class="pb-fill"></div>';
  const fill = el.firstElementChild;
  return {
    update(fraction, status) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`;
      if (fill.dataset.status !== status) fill.dataset.status = status;
    },
  };
}

// ---------------------------------------------------------------- 마크업 함수

const attr = (name, value) => (value == null || value === false ? '' : value === true ? ` ${name}` : ` ${name}="${esc(value)}"`);

/** Basecoat 버튼. variant: outline|secondary|ghost|destructive|link, size: sm|lg|icon */
export function button({ label, id, variant, size, attrs = '' }) {
  return `<button type="button" class="btn"${attr('id', id)}${attr('data-variant', variant)}${attr('data-size', size)}${attrs ? ` ${attrs}` : ''}>${esc(label)}</button>`;
}

export function badge({ label, variant }) {
  return `<span class="badge"${attr('data-variant', variant)}>${esc(label)}</span>`;
}

/** 카드: header(h2,p) / section / footer — 비어 있는 부분은 생략 */
export function card({ title, description, html = '', footerHtml, id, className }) {
  const head = title || description ? `<header>${title ? `<h2>${esc(title)}</h2>` : ''}${description ? `<p>${esc(description)}</p>` : ''}</header>` : '';
  return `<div class="card${className ? ` ${esc(className)}` : ''}"${attr('id', id)}>${head}<section>${html}</section>${footerHtml ? `<footer>${footerHtml}</footer>` : ''}</div>`;
}

export function field({ label, forId, controlHtml, hint }) {
  return `<div class="field"><label class="label"${attr('for', forId)}>${esc(label)}</label>${controlHtml}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}

/** 켜고 끄는 스위치 + 설명 */
export function switchField({ id, label, hint, checked = false }) {
  return `<label class="switch-row"><input class="input" type="checkbox" role="switch" id="${esc(id)}"${checked ? ' checked' : ''}> <span><b>${esc(label)}</b>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</span></label>`;
}

/** 탭 모양의 단일 선택(패널 없음). 선택이 바뀌면 bindTabs 가 change 이벤트를 보냄 */
export function segmented({ name, options, value }) {
  const btns = options.map((o) => `<button type="button" role="tab" data-value="${esc(o.value)}" aria-selected="${o.value === value}">${esc(o.label)}</button>`).join('');
  return `<div class="tabs segmented" data-name="${esc(name)}"><nav role="tablist" aria-orientation="horizontal">${btns}</nav></div>`;
}

/** 탭 + 패널. 선택 안 된 패널은 hidden(DOM은 유지) */
export function tabs({ id, items, selected }) {
  const tabBtns = items.map((it) => `<button type="button" role="tab" id="${esc(id)}-tab-${esc(it.id)}" aria-controls="${esc(id)}-panel-${esc(it.id)}" aria-selected="${it.id === selected}" tabindex="${it.id === selected ? 0 : -1}">${esc(it.label)}</button>`).join('');
  const panels = items.map((it) => `<div role="tabpanel" id="${esc(id)}-panel-${esc(it.id)}" aria-labelledby="${esc(id)}-tab-${esc(it.id)}"${it.id === selected ? '' : ' hidden'}>${it.html}</div>`).join('');
  return `<div class="tabs" id="${esc(id)}"><nav role="tablist" aria-orientation="horizontal">${tabBtns}</nav>${panels}</div>`;
}

/** root 안의 .tabs 를 동작하게 함(Basecoat JS 대신). 이미 연결된 것은 건너뜀 */
export function bindTabs(root) {
  for (const box of root.querySelectorAll('.tabs')) {
    if (box.dataset.bound) continue;
    box.dataset.bound = '1';
    const list = box.querySelector('[role=tablist]');
    const select = (tab) => {
      for (const t of list.querySelectorAll('[role=tab]')) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && box.querySelector(`#${CSS.escape(t.getAttribute('aria-controls'))}`);
        if (panel) panel.hidden = !on;
      }
      if (box.classList.contains('segmented')) box.dispatchEvent(new CustomEvent('change', { detail: { value: tab.dataset.value } }));
    };
    list.addEventListener('click', (e) => { const t = e.target.closest('[role=tab]'); if (t && list.contains(t)) select(t); });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = [...list.querySelectorAll('[role=tab]')];
      const i = all.indexOf(document.activeElement);
      if (i < 0) return;
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      next.focus(); select(next);
    });
  }
}

/** 관찰 요약 숫자 묶음 */
export function statGrid(items) {
  return `<div class="stat-grid">${items.map((it) => `<div class="stat"><span class="stat-label">${esc(it.label)}</span><b class="stat-value">${esc(it.value)}</b>${it.sub ? `<span class="stat-sub">${esc(it.sub)}</span>` : ''}</div>`).join('')}</div>`;
}

/** 답변 중 지표 카드(색 없음, 중립) */
export function metricCard({ id, title, numId, stateId, extraHtml = '' }) {
  return `<div class="card metric" id="${esc(id)}" data-status="idle"><div class="metric-head"><span class="metric-title">${esc(title)}</span><span class="metric-num" id="${esc(numId)}">—</span></div><div class="metric-state" id="${esc(stateId)}">측정 대기</div>${extraHtml}</div>`;
}

/** 준비 확인 단계 목록 (li[data-step] .mark .hint 구조) */
export function checklist(items) {
  return `<ol class="checklist">${items.map((it, i) => `<li data-step="${esc(it.key)}"><span class="mark">${i + 1}</span><div><b>${esc(it.title)}</b>${it.html ?? ''}<p class="hint"></p></div></li>`).join('')}</ol>`;
}

export function emptyState({ title, text }) {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

export function dataTable({ columns, rowsHtml }) {
  return `<div class="table-container"><table class="table"><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rowsHtml.join('')}</tbody></table></div>`;
}

const STEPS = [['setup', '질문 설정'], ['practice', '답변'], ['report', '복기']];

/** 상단 바: 앱 이름 · 단계 · 화면별 버튼 자리(#topbar-right) */
export function topBar({ step }) {
  const steps = STEPS.map(([k, label]) => `<span${k === step ? ' aria-current="step"' : ''}>${label}</span>`).join('<span class="step-sep" aria-hidden="true">›</span>');
  return `<div class="topbar"><div class="brand">답변 복기</div><nav class="steps" aria-label="진행 단계">${steps}</nav><div class="topbar-right" id="topbar-right"></div></div>`;
}
