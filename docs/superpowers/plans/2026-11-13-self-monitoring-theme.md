# 화상 인터뷰 셀프 모니터링 테마 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** '면접 답변 복기 도구'를 '화상 인터뷰에서 내 목소리·시선을 모니터링하고 스스로 분석하는 도구'로 전환한다. 측정값 기본 표시, 음량 변화 폭 수치 추가, 화면·문서 문구 교체.

**Architecture:** 동작 변경은 두 곳(`setup.js` 숨기기 기본값, `review.js`에 `volumeStdDb` 추가). 나머지는 사용자에게 보이는 문구만 바꾸고 내부 키(`settings.question`, `focusMode`, DOM id, 프리셋 키 `interview`)는 그대로 둔다.

**Tech Stack:** 브라우저 ES 모듈, `node:test`(`npm test`), Playwright 로컬 검증(`npm run test:browser`).

**Spec:** `docs/superpowers/specs/2026-11-13-self-monitoring-theme-design.md`

## Global Constraints

- 점수·등급·판정·행동 권고 문구를 새로 만들지 않는다. 새 수치는 숫자와 설명만 보여 준다.
- 내부 식별자(`settings.question`, `#question`, `focusMode`, `#focus-mode`, `PRESETS.interview` 키, `answer-player` id)는 바꾸지 않는다.
- `docs/superpowers/specs|plans/`의 기존 문서와 `plan.md`는 수정하지 않는다.
- 문구 표는 스펙의 '화면 문구' 표를 따른다. 단계: `준비 › 모니터링 › 분석`, brand `셀프 모니터`, title `화상 인터뷰 셀프 모니터`, 프리셋 라벨 `화상 면접`.
- 작업 브랜치: `feat/self-monitoring-theme` (현재 detached HEAD이므로 시작 전에 `git switch -c feat/self-monitoring-theme`).

## Review Focus

1. 이름표(질문)를 비워 두고 시작 → 연습·분석 화면에서 대체 문구가 자연스럽게 보이고 비교 카드는 "이름표를 넣으면 비교할 수 있다"는 안내를 보여야 한다. (Task 2 Step 5에서 확인)
2. 버튼 문구가 길어진 상단 바(`모니터링 끝내기 (Esc)`)가 375px 폭에서 가로 스크롤 없이 줄바꿈되어야 한다. (Task 2 Step 5)
3. 측정값이 기본 표시인 상태에서 연습 화면 첫 진입 시 `측정값 숨기기` 버튼의 `aria-pressed`와 실제 표시 상태가 일치해야 한다. (Task 2 Step 5)
4. 발화 구간이 전혀 없는 기록에서 '음량 변화 폭'은 `–`(null)로 보여야 하고 0으로 보이면 안 된다. (Task 1 테스트)
5. 인쇄/PDF에서 바뀐 탭 이름(`전체 메모`)의 패널이 계속 인쇄되어야 한다. (Task 2 Step 4 `print` 검증)

---

### Task 1: 음량 변화 폭(목소리 일정함) 수치

**Files:**
- Modify: `js/analysis/review.js` (`buildReview` 반환값)
- Modify: `js/ui/report.js:19-27` (`stats`)
- Test: `tests/review.test.js`

**Interfaces:**
- Produces: `buildReview(...)` 반환 객체에 `volumeStdDb: number|null` — 발화 중(`speaking && deltaDb != null`) 슬라이스의 `weight` 가중 표준편차(dB, 모분산). 발화 슬라이스가 없으면 `null`.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/review.test.js`에 추가)

```js
test('volume spread is weighted std of spoken deltaDb', () => {
  const alt=Array.from({length:20},(_,i)=>({t:i/10,speaking:true,deltaDb:i<10?-3:3}));
  assert.ok(Math.abs(buildReview(alt,settings,2).volumeStdDb-3)<1e-6);
  const flat=Array.from({length:10},(_,i)=>({t:i/10,speaking:true,deltaDb:-2}));
  assert.equal(buildReview(flat,settings,1).volumeStdDb,0);
});
test('volume spread is null without speech', () => {
  const r=buildReview([{t:0,speaking:false,deltaDb:-5},{t:.1,speaking:false,deltaDb:4}],settings,.2);
  assert.equal(r.volumeStdDb,null);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/review.test.js` → 새 테스트 2개 FAIL (`undefined`).
- [ ] **Step 3: 구현** — `buildReview`에서 기존 `spoken`, `seconds`, `weighted`를 재사용해 `volumeStdDb`를 반환에 추가.
- [ ] **Step 4: 화면 표시** — `stats(r)`의 '기준 대비 음량' 다음에 `{ label: '음량 변화 폭', value: n(r.volumeStdDb, ' dB', 1), sub: '발화 중 음량이 흔들린 정도(표준편차)' }` 추가.
- [ ] **Step 5: 통과 확인** — `npm test` → 전부 PASS.
- [ ] **Step 6: Commit**

```bash
git add js/analysis/review.js js/ui/report.js tests/review.test.js
git commit -m "feat(review): add spoken volume spread metric"
```

### Task 2: 화면 동작·문구 전환

**Files:**
- Modify: `index.html:6`, `js/config.js:7`, `js/ui/components.js:131,149,154`, `js/ui/setup.js` (48–71, 89, 96, 143, 145, 317), `js/ui/practice.js` (36, 37, 64, 73, 238, 282), `js/ui/report.js` (1, 25, 30, 53, 61, 76–97, 144, 200), `js/ui/gazetest.js:54`, `js/media-recorder.js:4`
- Modify tests: `tests/components.test.js:44`, `tests/config.test.js:7`
- Modify browser checks: `scripts/browser-review-smoke.cjs`, `scripts/print-check.cjs`, `scripts/browser-gaze-smoke.cjs:28`

**Interfaces:**
- Consumes: Task 1의 `volumeStdDb` (문구 변경 시 건드리지 않음)
- Produces: 버튼/탭 접근 이름 `모니터링 시작`, `모니터링 끝내기 (Esc)`, `같은 조건으로 다시 하기`, `이전 기록과 비교`, 탭 `전체 메모` — 브라우저 검증 스크립트가 이 이름으로 찾는다.

- [ ] **Step 1: 단위 테스트 기대값 갱신** — `components.test.js:44`의 `aria-current="step">복기<` → `>분석<`; `config.test.js:7` 라벨 `'면접 답변'` → `'화상 면접'`. `npm test` → 이 2개 FAIL 확인.
- [ ] **Step 2: 동작 변경** — `setup.js` `#focus-mode` 스위치를 `checked: false`로, `app.settings?.focusMode ?? true` → `?? false`. 라벨 `말하는 동안 측정값 숨기기`, 힌트 `끝난 뒤 분석 화면에서 확인해요.`
- [ ] **Step 3: 문구 교체** — 스펙 '화면 문구' 표대로. 표에 없는 "답변"은 맥락에 따라 "기록"(저장된 것) 또는 "모니터링"(진행 중)으로, "복기"는 "분석"으로. 이름표 placeholder는 `예: 지원 동기 · 1차`. 빈 이름표 대체 문구 `'자유 답변'` → `'이름표 없음'`. 비교 카드 안내: `같은 이름표로 다시 하면 이전 기록을 함께 볼 수 있어요. 데모는 비교 기록에 넣지 않아요.` 남은 문구 점검: `grep -n "복기\|답변\|면접" index.html js/*.js js/ui/*.js` 결과가 주석·`화상 면접`뿐이어야 한다.
- [ ] **Step 4: 브라우저 검증 스크립트 셀렉터 갱신 후 실행** — 위 Produces 이름으로 교체. `npm test` → PASS, `npm run test:browser` → review/gaze/print 모두 통과.
- [ ] **Step 5: Review Focus 수동 확인** (`npm start`, `?demo=1`) — ① 이름표 비우고 시작→종료: 화면에 `이름표 없음`, 비교 카드 안내 문구. ② 375px 폭에서 연습 화면 상단 바 가로 스크롤 없음(`document.documentElement.scrollWidth <= innerWidth`). ③ 연습 화면 진입 직후 측정값이 보이고 `#toggle-metrics`가 `측정값 숨기기`, `aria-pressed="true"`.
- [ ] **Step 6: Commit**

```bash
git add index.html js tests scripts
git commit -m "feat(ui): reframe as video interview self-monitoring tool"
```

### Task 3: 문서 갱신

**Files:**
- Modify: `README.md`, `design-system/speechboard/MASTER.md`, `design-system/speechboard/pages/practice.md`, `design-system/speechboard/pages/report.md`, `CONTRIBUTING.md:58`, `styleguide.html`, `package.json` (`description`)

- [ ] **Step 1: README** — 제목 `# SpeechBoard: 화상 인터뷰 셀프 모니터링 도구`. 소개: 화상 인터뷰 화면 속 자신의 목소리(크기·일정함·높낮이·속도)와 시선을 실시간으로 보고, 끝난 뒤 시간 흐름으로 스스로 분석한다. 점수·평가 없음 문장은 유지. '사용 흐름' 6단계를 준비 → 모니터링(측정값 기본 표시, 숨기기 선택) → 분석(음량 변화 폭 포함) → 같은 이름표 비교 흐름으로 다시 쓴다. `test:browser` 설명의 "복기"→"분석".
- [ ] **Step 2: 디자인 시스템 문서** — MASTER 제목 `셀프 모니터 디자인 시스템 — MASTER`, 제품 정의 `화상 인터뷰 화면 속 내 목소리·시선을 모니터링하고 스스로 분석하는 도구 (점수·자동 평가 없음)`, `metricCard` 설명 `모니터링 중 지표 카드(중립)`. pages 문서는 화면 이름(`모니터링 화면`, `분석 화면`)과 Task 2의 버튼·탭 이름에 맞춘다.
- [ ] **Step 3: 나머지** — `CONTRIBUTING.md:58` `화면 흐름·기록·분석`; `styleguide.html` 예시 문구를 Task 2 문구로; `package.json` description `브라우저에서 화상 인터뷰 속 내 목소리와 시선을 모니터링하고 스스로 분석하는 도구`.
- [ ] **Step 4: 확인** — `grep -n "복기\|면접 답변" README.md CONTRIBUTING.md styleguide.html design-system -r` 결과 없음. `npm test` PASS.
- [ ] **Step 5: Commit**

```bash
git add README.md CONTRIBUTING.md styleguide.html package.json design-system
git commit -m "docs: describe self-monitoring theme"
```
