# Basecoat UI 재디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네 화면(질문 설정·답변·복기·시선 테스트)과 스타일 가이드를 Basecoat UI(시안 A, 다크 무채색)로 다시 그리고, 화면 부품을 재사용 함수로 정리한다. 기능·측정 동작은 바꾸지 않는다.

**Architecture:** 라이브러리 CSS(`vendor/basecoat/`) 위에 앱 토큰(`css/tokens.css`)과 배치 CSS(`css/app.css`)를 얹는다. 마크업은 `js/ui/components.js`의 순수 함수(HTML 문자열 반환)로 만들고, 각 화면 JS는 그 함수로 템플릿을 조립한다. 기존 DOM id·이벤트 연결·계산 로직은 그대로 둔다.

**Tech Stack:** Basecoat UI 1.1.0 (`basecoat.cdn.min.css`, Vega, `html.dark`), 빌드 없는 ES 모듈, p5.js 1.11.1, Node 20 `node --test`, Playwright(스모크 스크립트).

**Spec:** `docs/superpowers/specs/2026-11-13-basecoat-redesign-design.md`

## Global Constraints

- 기능·측정·저장 동작 변경 금지. 측정값은 **중립**: `data-status`는 지금처럼 항상 `idle`, 범위 밖 강조색(주황·빨강) 금지. 빨강(`--destructive`)은 녹화 중 표시·삭제·끝내기 버튼에만.
- Basecoat는 `vendor/basecoat/basecoat.cdn.min.css` 로컬 로드. 실행 중 외부 네트워크 요청 금지. Tailwind 유틸리티 클래스 사용 금지(CDN CSS에 없음).
- Basecoat JS(`all.min.js`)는 **쓰지 않는다**: 탭 전환은 `bindTabs()`(Task 2)로 직접. 스펙의 "JS 필요 시 로드"에 대한 결정: 필요 부품이 탭뿐이라 자체 구현이 더 단순.
- 마크업 규칙: 변형 `data-variant="outline|secondary|ghost|destructive"`, 크기 `data-size="sm|lg"`, 카드 `.card>header(h2,p)/section/footer`, 입력 `.input` `.textarea` `select.select` `.label` `.field`, 스위치 `input.input[type=checkbox][role=switch]`, 슬라이더 `input.input[type=range]`, 표 `.table`, 배지 `.badge`, 진행 `.progress>span`, 탭 `.tabs>[role=tablist][aria-orientation=horizontal]>[role=tab]` + `[role=tabpanel]`.
- 화면 CSS(`css/app.css`, 인쇄 블록 제외)에 hex 색 직접 금지. 토큰만.
- `docs/superpowers/specs/...redesign-design.md` §3의 DOM id 목록을 모두 보존(각 화면 JS가 `$('id')`로 찾는 것 전부).
- 글꼴: `--font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", system-ui, sans-serif`. 숫자 `tabular-nums`. 본문 최소 12px.
- 1280×720에서 가로 스크롤 없음. Tab 포커스 테두리 보임.
- 문구는 현재 화면의 중립 문구 유지(“자동 점수·평가 없음”, “참고 범위 안/위/아래” 등). 버튼 이름 변경은 `종료 (Esc)` → `답변 끝내기 (Esc)` 하나.

## Review Focus

1. **화면을 다시 그린 뒤 이벤트가 끊김** — `innerHTML` 재작성 후 리스너가 붙어야 할 요소(id)가 사라지거나 바뀌면 버튼이 무반응. 보존 id 목록을 Task 3~6에서 그대로 사용하고, 스모크로 확인.
2. **숨겨진 탭 안의 입력** — 메모 탭 전환 후에도 `#reflection`·`#marker-note` 값이 유지되고 저장됨(탭은 `hidden`만 바꾸고 DOM을 지우지 않음). Task 2 `bindTabs` 테스트.
3. **사용자 입력 문자열의 HTML 주입** — 질문·메모가 `<script>`를 포함해도 그대로 글자로 보임. Task 2 컴포넌트 이스케이프 테스트 + 스모크(질문에 `<script>`).
4. **오프라인** — 인터넷이 끊긴 시연장에서 Basecoat 스타일이 빠지면 화면 붕괴. Task 8에서 네트워크 차단 확인.
5. **녹화 없음·카메라 없음** — 영상 자리에 빈 상태 카드가 보이고 다운로드/삭제 버튼은 비활성(지금 동작 유지). Task 5에서 데모(녹화 없음) 스크린샷 확인.

---

## 파일 구조

```
vendor/basecoat/basecoat.cdn.min.css   라이브러리 (새로 받음)
css/tokens.css      (다시 씀) Basecoat 다크 토큰을 hex로 고정 + 앱 토큰
css/app.css         (style.css 이름 변경 후 화면별로 다시 씀) 배치·앱 고유 부품·인쇄
js/config.js        (수정) THEME / STATUS_COLORS / SERIES_COLORS 값을 새 토큰과 일치
js/ui/components.js (확장) 마크업 함수 + bindTabs + 기존 createGauge/createProgress
js/ui/app.js        (수정) 상단 바를 topBar()로, 화면 전환 시 버튼 영역 갱신
js/ui/setup.js, practice.js, report.js, gazetest.js  (템플릿만 교체)
js/ui/webcam-sketch.js, sparkline-sketch.js, report-sketch.js  (색만 config에서)
index.html          (수정) html.dark, CSS 링크 3개
styleguide.html     (다시 씀)
scripts/browser-review-smoke.cjs (선택자 2곳 수정)
tests/components.test.js (새로), tests/tokens.test.js (수정)
design-system/speechboard/MASTER.md (다시 씀)
```

---

### Task 1: Basecoat 기반과 토큰

**Files:**
- Create: `vendor/basecoat/basecoat.cdn.min.css`
- Rename: `css/style.css` → `css/app.css` (`git mv`)
- Modify: `css/tokens.css`, `js/config.js`, `index.html`, `styleguide.html`(링크만), `tests/tokens.test.js`

**Interfaces:**
- Produces: CSS 변수 `--background #0a0a0a`, `--card #171717`, `--popover #171717`, `--muted #262626`, `--secondary #262626`, `--accent #404040`, `--border #2e2e2e`, `--input #333333`, `--foreground #fafafa`, `--card-foreground #fafafa`, `--muted-foreground #a1a1a1`, `--primary #e5e5e5`, `--primary-foreground #171717`, `--ring #737373`, `--destructive #ff6467`, `--chart-1 #93c5fd`, `--chart-2 #3b82f6`, `--chart-3 #2563eb`, `--chart-4 #1d4ed8`, `--chart-5 #1e40af`; 앱 토큰 `--rec: var(--destructive)`, `--video #000000`, `--fs-caption 12px`, `--fs-body 14px`, `--fs-lead 16px`, `--fs-title 18px`, `--fs-metric 24px`, `--fs-clock 32px`, `--fs-stat 26px`, `--space-1..8`(4·8·12·16·20·24·32), `--font-sans`(Global Constraints 값).
- Produces (`js/config.js`): `THEME = { bg:'#0a0a0a', card:'#171717', muted:'#262626', border:'#2e2e2e', text:'#fafafa', mutedText:'#a1a1a1', video:'#000000' }`, `STATUS_COLORS = { ok:'#4ade80', warn:'#fbbf24', bad:'#ff6467', idle:'#a1a1a1' }` (시선 테스트 화면 전용), `SERIES_COLORS = { rate:'#93c5fd', volume:'#3b82f6', pitch:'#93c5fd', gazeIn:'#2563eb', gazeOut:'#a1a1a1', gazeNone:'#262626', yaw:'#93c5fd', pitchAngle:'#3b82f6' }`.

- [ ] **Step 1:** `curl -sSfL -o vendor/basecoat/basecoat.cdn.min.css https://cdn.jsdelivr.net/npm/basecoat-css@1.1.0/dist/basecoat.cdn.min.css` → 파일 약 236KB, 첫 줄에 `tailwindcss v4` 주석.
- [ ] **Step 2: 실패 테스트** — `tests/tokens.test.js`를 다음으로 교체: `html.dark` 블록(또는 `:root, html.dark`)의 변수를 읽어 위 hex와 `THEME/SERIES_COLORS`가 같은지(`--background`↔`bg`, `--card`↔`card`, `--muted`↔`muted`, `--border`↔`border`, `--foreground`↔`text`, `--muted-foreground`↔`mutedText`, `--chart-1`↔`rate`, `--chart-2`↔`volume`, `--chart-3`↔`gazeIn`), 그리고 `css/app.css`의 `@media print` 앞부분에 hex가 없는지.
- [ ] **Step 3:** `npm test` → tokens 테스트 FAIL.
- [ ] **Step 4:** `css/tokens.css`를 위 Interfaces 값으로 다시 씀(기존 그라파나 팔레트 제거, `prefers-reduced-motion` 규칙 유지). `js/config.js` 값 교체(기존 키 `panel/panel2/accent/accentBg/badBg`를 쓰는 곳은 `card/muted/…`로 바꿈: `grep -rn "THEME\.\|SERIES_COLORS\.\|STATUS_COLORS\." js` 결과 전부). `index.html`: `<html lang="ko" class="dark">`, `<link>` 순서 `vendor/basecoat/basecoat.cdn.min.css` → `css/tokens.css` → `css/app.css`. `git mv css/style.css css/app.css` 후 `app.css`의 hex를 토큰으로 바꿔 테스트 통과(화면 모양 정리는 이후 태스크).
- [ ] **Step 5:** `npm test` → 전부 PASS.
- [ ] **Step 6:** `npm start` 후 Chrome에서 열어 콘솔 오류 0, `getComputedStyle(document.body).backgroundColor === 'rgb(10, 10, 10)'`.
- [ ] **Step 7:** 커밋 `feat(ui): add Basecoat base, dark tokens`

### Task 2: 재사용 컴포넌트

**Files:**
- Modify: `js/ui/components.js`
- Test: `tests/components.test.js`

**Interfaces:**
- Consumes: `escapeHtml` (`js/util/html.js`)
- Produces (모두 문자열 인자는 이스케이프, `html` 이름의 인자는 이미 안전한 HTML로 보고 그대로 삽입):
  - `button({ label, id?, variant?, size?, attrs? }) -> string` — `<button type="button" class="btn" data-variant=… data-size=…>`
  - `badge({ label, variant? }) -> string` — `<span class="badge" data-variant=…>`
  - `card({ title?, description?, html, footerHtml?, id?, className? }) -> string` — `<div class="card …"><header><h2>…</h2><p>…</p></header><section>…</section><footer>…</footer></div>`(빈 부분 생략)
  - `field({ label, forId, controlHtml, hint? }) -> string` — `<div class="field"><label class="label" for=…>…</label>…<p class="hint">…</p></div>`
  - `switchField({ id, label, hint?, checked? }) -> string` — `<label class="switch-row"><input class="input" type="checkbox" role="switch" id=…> <span><b>label</b><span class="hint">hint</span></span></label>`
  - `segmented({ name, options:[{value,label}], value }) -> string` — 탭 모양 선택: `<div class="tabs segmented" data-name=…><nav role="tablist" aria-orientation="horizontal"><button type="button" role="tab" data-value=… aria-selected=…>`
  - `tabs({ id, items:[{ id, label, html }], selected }) -> string` — 탭 버튼 `id="${id}-tab-${item.id}"`, 패널 `id="${id}-panel-${item.id}"`, 선택 안 된 패널 `hidden`
  - `bindTabs(root: Element) -> void` — `root` 안의 `.tabs`마다 탭 클릭 시 `aria-selected` 전환, 대응 패널 `hidden` 토글(DOM은 지우지 않음). `.segmented`는 패널 없이 `aria-selected`만 바꾸고 `change` CustomEvent(`detail.value`)를 `.segmented`에서 발생
  - `statGrid(items:[{ label, value, sub? }]) -> string` — `<div class="stat-grid"><div class="stat"><span class="stat-label">…</span><b class="stat-value">…</b><span class="stat-sub">…</span></div>…`
  - `metricCard({ id, title, numId, stateId, extraHtml? }) -> string` — `<div class="card metric" id=… data-status="idle">` + 제목/보조 숫자(`numId`)/상태 문구(`stateId`)
  - `checklist(items:[{ key, title, html? }]) -> string` — `<ol class="checklist"><li data-step=key><span class="mark">n</span><div><b>title</b>…<p class="hint"></p></div></li>`(기존 `li[data-step] .mark .hint` 구조 유지)
  - `emptyState({ title, text }) -> string` — `<div class="empty"><h3>…</h3><p>…</p></div>`
  - `dataTable({ columns:string[], rowsHtml:string[] }) -> string` — `<div class="table-container"><table class="table">…`
  - `topBar({ step: 'setup'|'practice'|'report'|null }) -> string` — 앱 이름 `답변 복기`, 단계 `질문 설정 › 답변 › 복기`(현재 `aria-current="step"`), 오른쪽 `<div class="topbar-right" id="topbar-right"></div>`
  - 기존 `createGauge`, `createProgress` 시그니처 유지(마크업 클래스는 Task 4에서 CSS로 맞춤)

- [ ] **Step 1: 실패 테스트** (`tests/components.test.js`, Node 테스트 — `bindTabs`는 최소 가짜 DOM 대신 문자열 함수만 테스트하고 `bindTabs`는 Task 5 브라우저 확인)
```js
test('button variants and escaping', () => {
  const h = button({ label: '<b>끝</b>', id: 'x', variant: 'destructive', size: 'sm' });
  assert.match(h, /class="btn"/); assert.match(h, /data-variant="destructive"/); assert.match(h, /data-size="sm"/);
  assert.match(h, /id="x"/); assert.ok(h.includes('&lt;b&gt;끝&lt;/b&gt;')); assert.match(h, /type="button"/);
});
test('card omits empty header/footer and keeps html body raw', () => {
  const h = card({ html: '<p id="raw">본문</p>' });
  assert.ok(!h.includes('<header>')); assert.ok(!h.includes('<footer>')); assert.ok(h.includes('<p id="raw">'));
  assert.match(card({ title: 'T', description: '<i>', html: '' }), /<header><h2>T<\/h2><p>&lt;i&gt;<\/p><\/header>/);
});
test('switchField is a Basecoat switch', () => {
  const h = switchField({ id: 'record-answer', label: '녹화', checked: true });
  assert.match(h, /class="input" type="checkbox" role="switch" id="record-answer" checked/);
});
test('tabs: only the selected panel is visible', () => {
  const h = tabs({ id: 'memo', selected: 'here', items: [{ id: 'here', label: '현재 위치', html: 'A' }, { id: 'all', label: '전체 복기', html: 'B' }] });
  assert.match(h, /id="memo-tab-here"[^>]*aria-selected="true"/); assert.match(h, /id="memo-tab-all"[^>]*aria-selected="false"/);
  assert.match(h, /id="memo-panel-all"[^>]*hidden/); assert.ok(!/id="memo-panel-here"[^>]*hidden/.test(h));
});
test('segmented marks the chosen value', () => {
  const h = segmented({ name: 'preset', value: 'interview', options: [{ value: 'class', label: '수업' }, { value: 'interview', label: '면접' }] });
  assert.match(h, /data-value="interview"[^>]*aria-selected="true"/); assert.match(h, /data-value="class"[^>]*aria-selected="false"/);
});
test('topBar marks current step and keeps the actions slot', () => {
  const h = topBar({ step: 'report' });
  assert.match(h, /aria-current="step">복기</); assert.match(h, /id="topbar-right"/);
});
test('metricCard is neutral and keeps ids', () => {
  const h = metricCard({ id: 'p-rate', title: '말하기 속도', numId: 'v-rate', stateId: 'l-rate' });
  assert.match(h, /id="p-rate"[^>]*data-status="idle"|data-status="idle"[^>]*id="p-rate"/); assert.match(h, /id="v-rate"/); assert.match(h, /id="l-rate"/);
});
test('statGrid / dataTable / emptyState / checklist escape text', () => {
  assert.ok(statGrid([{ label: '<x>', value: '82%' }]).includes('&lt;x&gt;'));
  assert.match(dataTable({ columns: ['시작'], rowsHtml: ['<tr><td>0:34</td></tr>'] }), /<table class="table">/);
  assert.ok(emptyState({ title: '녹화 없음', text: '<a>' }).includes('&lt;a&gt;'));
  assert.match(checklist([{ key: 'face', title: '정면' }]), /<li data-step="face">/);
});
```
- [ ] **Step 2:** `node --test tests/components.test.js` → FAIL(함수 없음).
- [ ] **Step 3:** 위 시그니처대로 구현. `bindTabs`도 함께 작성.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat(ui): reusable Basecoat component helpers`

### Task 3: 질문 설정 + 준비 확인 화면

**Files:** Modify `js/ui/setup.js`(템플릿 함수와 프리셋 선택 처리만), `js/ui/app.js`(상단 바), `css/app.css`(설정 섹션)

**Interfaces:**
- Consumes: Task 2의 `topBar, card, field, switchField, segmented, checklist, button, bindTabs`
- Produces: 상단 바 오른쪽 버튼 영역 `#topbar-right`(화면마다 채움), 설정 화면에서 `#gaze-test #demo-start #last-review`를 상단 바 ghost 버튼으로

- [ ] **Step 1:** `app.js`의 헤더를 `topBar({ step })`로 렌더(화면 전환마다 `step` 갱신, `#topbar-right` 비움). `index.html`의 기존 `<header class="topbar">`는 `<header id="app-top"></header>` 하나로.
- [ ] **Step 2:** `setup.js` 템플릿을 스펙 §5-①대로 재구성: 왼쪽 `card('연습할 질문')`(`#question` textarea·`segmented({name:'preset'})`·`#dur-m #dur-s`·`#rate-min #rate-max`·`<details>` 안 `#gaze-yaw #gaze-pitch`), 왼쪽 `card('기록 방식')`(`switchField('record-answer')`, `switchField('focus-mode', checked)`, 보관 안내), 오른쪽 `card('준비 확인')`(`#setup-preview`, `checklist([face, voice])`, `.progress`, footer `#calib-run`(outline) + `#start`(lg)). 프리셋: 기존 `.chip[data-preset]` 클릭 처리 → `.segmented`의 `change` 이벤트로 `applyPreset(value)`.
- [ ] **Step 3:** `app.css` 설정 섹션: 2열 그리드(최대 1180px, 간격 16px), 카드 내부 `.stack` 간격 14px, 미리보기 높이 220px·`--video` 배경, 체크리스트 상태(`li.active/.done/.fail` 표시는 `--foreground`/`--muted-foreground`만 사용, 실패 안내 문구 색은 `--muted-foreground`+굵게).
- [ ] **Step 4: 확인** `npm test` PASS. 브라우저 1280×720: 설정 화면 스크린샷이 시안 ①과 같은 구성, 가로 스크롤 없음, 프리셋 탭 클릭 시 `#rate-min` 값이 `PRESETS` 값으로 바뀜, 콘솔 오류 0.
- [ ] **Step 5:** 커밋 `feat(ui): Basecoat setup screen`

### Task 4: 답변 화면

**Files:** Modify `js/ui/practice.js`(템플릿·버튼만), `css/app.css`(답변 섹션), `scripts/browser-review-smoke.cjs`(버튼 이름 3곳)

**Interfaces:**
- Consumes: `metricCard, badge, button`, 기존 `createGauge/createProgress`
- Produces: 버튼 `답변 끝내기 (Esc)`(destructive, 기존 종료 핸들러), `#toggle-metrics`(outline), 녹화 배지(녹화 시에만, `--rec`)

- [ ] **Step 1:** 템플릿을 스펙 §5-②대로: 질문 줄(질문 배지 + `#record-state` + 오른쪽 큰 타이머 `#v-time`/`#t-time` + `#pb-time` 진행 막대), 본문 `.answer`(왼쪽 `#cam`, 오른쪽 340px 열에 `metricCard` ×3(`p-rate/v-rate/l-rate/g-rate/n-rate`, `p-vol/v-vol/l-vol/g-vol`, `p-pitch/v-pitch/l-pitch/spark`) + 고개·눈 카드(`#part-head #part-eye`)), `#cam` 안 `#pill`(+`#pill-text #pill-cum`) · `#countdown #angles #demo-badge #demo-scene`. `#p-time` id는 질문 줄의 타이머 묶음에 부여(기존 `setStatus($('p-time'))` 호출 유지).
- [ ] **Step 2:** 상단 바 오른쪽에 녹화 배지·`#toggle-metrics`·`답변 끝내기 (Esc)`. 집중 모드(`.focus-mode`)면 오른쪽 열을 숨기고 웹캠 전체 폭 + 안내 한 줄(“측정값은 숨겨져 있어요. 답변이 끝나면 복기 화면에서 영상과 함께 볼 수 있어요.”).
- [ ] **Step 3:** `app.css` 답변 섹션: 그리드 `1fr 340px`, 높이 `calc(100vh - 상단바 - 질문줄 - 여백)`, 시선 알약은 웹캠 위 가운데 반투명 배경·`--border`, 게이지는 트랙 `--muted`·참고 띠 `color-mix(in oklab, var(--foreground) 22%, transparent)`·마커 `--foreground`(상태 무관 동일색), 상태 문구 `--fs-metric` 굵게.
- [ ] **Step 4:** `webcam-sketch.js`·`sparkline-sketch.js`의 색을 `THEME/SERIES_COLORS`에서(상태색 대신 `THEME.text`·`THEME.mutedText`; 시선 테스트가 넘기는 `status`가 있을 때만 `STATUS_COLORS`).
- [ ] **Step 5:** 스모크 스크립트의 `{name:'종료 (Esc)'}` 3곳 → `{name:'답변 끝내기 (Esc)'}`.
- [ ] **Step 6: 확인** `npm test` PASS. `?demo=1`: 측정값 보기 켬/끔 두 상태 스크린샷이 시안 ②③과 같은 구성, 콘솔 오류 0, Esc로 복기 이동.
- [ ] **Step 7:** 커밋 `feat(ui): Basecoat answer screen`

### Task 5: 복기 화면

**Files:** Modify `js/ui/report.js`(템플릿·탭 바인딩·“이전 답변과 비교” 스크롤만), `js/ui/report-sketch.js`(색), `css/app.css`(복기 섹션·인쇄), `scripts/browser-review-smoke.cjs`(탭 전환)

**Interfaces:**
- Consumes: `card, statGrid, tabs, bindTabs, dataTable, emptyState, button, badge`
- Produces: 메모 탭 `tabs({ id:'memo', selected:'here', items:[{id:'here',label:'현재 위치'},{id:'all',label:'전체 복기'}] })` — `here` 패널: `#marker-note #add-marker #markers`, `all` 패널: `#reflection #note-state #download-notes`

- [ ] **Step 1:** 템플릿을 스펙 §5-③대로: 질문 줄 + 메타, 상단 바 오른쪽 `이전 답변과 비교`(outline, `#comparison` 카드로 `scrollIntoView` 후 `#previous-answer`에 포커스) · `#retry`(primary, 라벨 “같은 질문 다시 답변”). 본문 2열(`1.55fr 1fr`): 왼쪽 영상 카드(녹화 없으면 `emptyState({title:'녹화가 없어요', text: 기존 안내 문구})`, footer `#download-media #delete-media`) + “시간 흐름” 카드(`#report-chart`, `#review-time`(`input.input[type=range]`), `#review-clock`, `#sample-description`); 오른쪽 “관찰 요약”(`statGrid`, 기존 stats 값), “메모”(위 `tabs`), “참고 범위와 다른 구간”(`dataTable`, 행 버튼 `data-seek` 유지). 아래 “이전 답변과 비교” 카드(`id="comparison"`, `#previous-answer`(select.select) `#comparison-content`), 보관 안내, 하단 `#setup #print #clear-history`(destructive).
- [ ] **Step 2:** 렌더 직후 `bindTabs(root)` 호출.
- [ ] **Step 3:** `report-sketch.js` 색: 정면 띠 `SERIES_COLORS.gazeIn/gazeOut/gazeNone`, 선 `rate/volume/pitch`, 격자·글자 `THEME.border/mutedText`, 배경 `THEME.card`.
- [ ] **Step 4:** `app.css` 복기 섹션 + `@media print`(흰 배경·버튼·상단 바 숨김·탭 패널 모두 표시 `[role=tabpanel][hidden]{display:block!important}`).
- [ ] **Step 5:** 스모크: `#reflection` 채우기 전 `page.getByRole('tab',{name:'전체 복기'}).click()`, `#marker-note` 채우기 전 `page.getByRole('tab',{name:'현재 위치'}).click()` (스크립트 내 모든 해당 위치).
- [ ] **Step 6: 확인** `npm test` PASS. `?demo=1` 한 번 답변 후 복기 스크린샷이 시안 A와 같은 구성, 녹화 없음 빈 상태 카드 표시·다운로드/삭제 비활성, 탭 전환 후 두 메모 값 유지, “이전 답변과 비교” 버튼이 비교 카드로 이동, 질문에 `<script>` 넣어도 글자로 보임, 콘솔 오류 0.
- [ ] **Step 7:** 커밋 `feat(ui): Basecoat review screen`

### Task 6: 시선 인식 테스트 화면

**Files:** Modify `js/ui/gazetest.js`(템플릿만), `css/app.css`(시선 테스트 섹션)

**Interfaces:**
- Consumes: `card, dataTable, button, badge`
- Produces: 모든 `gt-*`·`b-*` id 유지

- [ ] **Step 1:** 2열(웹캠 / 오른쪽 카드 3개: 단계 카드(`#gt-count #gt-phase #gt-title #gt-say #gt-progress #gt-now #gt-ok #gt-start`), 실시간 원시값 카드(막대 6개), 결과 카드(`#gt-result`, 표는 `dataTable`, 진단은 `.alert` 목록)). “장치 점검이며 평가가 아님” 문구를 단계 카드 설명에.
- [ ] **Step 2:** 막대: 트랙 `--muted`, 기준 영역 `color-mix(in oklab, var(--foreground) 22%, transparent)`, 마커 `--foreground`(일치 여부는 `#gt-ok` 글자로만).
- [ ] **Step 3: 확인** `?gazetest=1&demo=1`로 9단계 끝까지 진행, 결과표·진단 표시, 콘솔 오류 0, 스크린샷.
- [ ] **Step 4:** 커밋 `feat(ui): Basecoat gaze test screen`

### Task 7: 스타일 가이드와 문서, 남은 CSS 정리

**Files:** Rewrite `styleguide.html`, `design-system/speechboard/MASTER.md`; Modify `README.md`(디자인 항목), `css/app.css`(사용하지 않는 규칙 삭제)

- [ ] **Step 1:** `styleguide.html`: Basecoat CSS + tokens + app.css 로드, `components.js` 함수로 토큰(색 스와치·글자·간격), 버튼(4 변형·2 크기·비활성), 배지, 카드, 필드·스위치·셀렉트·슬라이더, 탭·segmented(`bindTabs`), 표, 빈 상태, 지표 카드(측정 대기/값 있음), 게이지, 진행 막대, 시선 알약을 렌더. 원칙 7줄(중립 측정값·빨강은 녹화/삭제만 포함).
- [ ] **Step 2:** `MASTER.md`를 Basecoat 기준으로 다시 씀(토큰 표 = Task 1 값, 컴포넌트 표 = Task 2 함수, 색의 의미 = 중립 원칙, 하지 말 것). `pages/practice.md`·`report.md`도 새 배치로 갱신.
- [ ] **Step 3:** `app.css`에서 더 이상 쓰지 않는 선택자 삭제: `grep -o '^\.[a-z-]*' css/app.css | sort -u`의 각 클래스를 `grep -rl` 로 `js/ index.html styleguide.html`에서 찾아 0건이면 삭제.
- [ ] **Step 4: 확인** `npm test` PASS, `styleguide.html` 콘솔 오류 0, 스크린샷.
- [ ] **Step 5:** 커밋 `docs(ui): Basecoat styleguide and design-system docs`

### Task 8: 전체 확인

- [ ] **Step 1:** `npm test` → 전부 PASS.
- [ ] **Step 2:** `npm start`(포트 확인) 후 `REVIEW_URL=http://127.0.0.1:<port> PLAYWRIGHT_MODULE=/Users/seodaun/.npm/_npx/9833c18b2d85bc59/node_modules/playwright node scripts/browser-review-smoke.cjs` → 성공 출력, 오류 0.
- [ ] **Step 3:** 오프라인: Playwright에서 `page.route('**', r => r.request().url().startsWith('http://127.0.0.1') || r.request().url().startsWith('http://localhost') ? r.continue() : r.abort())` 후 `?demo=1` 전체 흐름 → 스타일 적용(`body` 배경 `rgb(10, 10, 10)`), 외부 요청 0.
- [ ] **Step 4:** 1280×720에서 네 화면 + 스타일 가이드 `scrollWidth <= 1280`, Tab 키로 첫 버튼 포커스 테두리 확인.
- [ ] **Step 5:** 수정이 있었다면 커밋 `chore(ui): verification fixes`
