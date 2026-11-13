# Basecoat UI 재디자인 설계

작성일: 2026-11-13 · 상태: 사용자 승인(추천안 채택)
표기: **[사용자 결정]** 대화에서 정한 것 / **[설계자 판단]** 문서 작성 중 정한 것(바꿔도 됨) / **[구현자 재량]**

## 1. 무엇을, 왜

현재 화면(그라파나 풍 직접 CSS)이 색·글자·배치·부품 모양 모두 완성도가 낮다는 평가 **[사용자 결정]**. shadcn/ui 계열의 검증된 디자인 언어로 바꾸고, 화면 부품을 재사용 가능한 컴포넌트로 정리한다.

대상 제품은 다른 세션이 바꾼 **"면접 답변을 직접 돌아보는 도구"** 방향이다 **[사용자 결정: 사용자가 직접 지시한 방향]**. 점수·등급·자동 조언 없이, 질문에 답하고 → 녹화·측정값을 보며 → 직접 메모로 복기한다. 현재 동작 기준 문서는 README.md(커밋 전 작업 트리)다.

## 2. 목표 / 비목표 / 반(反)목표

**목표**
- 모든 화면(질문 설정·준비 확인, 답변, 복기, 시선 인식 테스트)과 `styleguide.html`을 Basecoat UI로 다시 그린다.
- 화면 부품을 `js/ui/components.js`의 재사용 함수로 만든다(같은 부품은 한 곳에서만 정의).
- 시안 A(다크·무채색) 그대로 구현한다.

**비목표**
- 기능·측정 로직·저장 방식 변경(README의 동작을 그대로 유지). 새 기능 추가 없음.
- React·Tailwind 빌드 도입, 라이트 모드 전환 버튼.
- 리포트 인쇄 레이아웃 재설계(깨지지 않게만 유지).

**반목표 (이러면 실패)**
- 다른 세션의 커밋 안 된 작업(녹화·복기·비교·메모 기능)이 사라지거나 동작이 바뀜.
- `npm test` 또는 `scripts/browser-review-smoke.cjs`가 깨짐.
- 실행 중 인터넷이 필요해짐(오프라인 시연 조건).
- 1280×720에서 가로 스크롤, 12px 미만 본문 글자.
- 측정값을 "평가"처럼 보이게 하는 색 사용(주황·빨강 등 범위 밖 강조 포함).

## 3. 제약

- 빌드 없음, 정적 파일만. p5.js 1.11.1·MediaPipe는 그대로.
- Basecoat UI **1.1.0**, 기본 스타일 팩(Vega), `<html class="dark">` **[사용자 결정: 시안 A]**.
- Basecoat 파일은 `vendor/basecoat/`에 받아 로컬에서 로드(CDN 런타임 의존 금지) **[설계자 판단: 오프라인 조건]**.
  - `basecoat.cdn.min.css` (Tailwind 없이 쓰는 미리 컴파일된 CSS, 약 240KB)
  - `js/all.min.js` (탭·셀렉트 등 동작이 필요한 부품용, 약 44KB)
- Basecoat 마크업 규칙: 변형은 `data-variant`(`outline`/`secondary`/`ghost`/`destructive`/`link`), 크기는 `data-size`(`sm`/`lg`/`icon`), 카드는 `.card > header(h2,p) / section / footer`, 탭은 `.tabs > [role=tablist] > [role=tab]` + 패널, 입력은 `.input`/`.textarea`/`.select`/`.label`/`.field`, 표는 `.table`, 배지는 `.badge`, 진행은 `.progress`.
- Tailwind 유틸리티 클래스는 쓰지 않는다(CDN CSS에 없음). 배치 CSS는 직접 작성하되 **Basecoat 토큰만** 사용: `--background --foreground --card --muted --muted-foreground --border --primary --primary-foreground --destructive --ring --radius --chart-1..5`.
- 글꼴: Basecoat 기본 `Geist`는 로드하지 않음 → `--font-sans` 앞에 시스템 글꼴과 `Apple SD Gothic Neo`를 둔다. 숫자는 `tabular-nums`.
- **보존해야 하는 DOM id** (JS·스모크 테스트가 사용): `#question #calib-run #start #demo-start #gaze-test #last-review #record-answer #focus-mode #dur-m #dur-s #rate-min #rate-max #gaze-yaw #gaze-pitch #toggle-metrics #record-state #pill #pill-text #pill-cum #part-head #part-eye #cam #countdown #angles #demo-badge #demo-scene #p-rate #v-rate #l-rate #g-rate #n-rate #p-vol #v-vol #l-vol #g-vol #p-pitch #v-pitch #l-pitch #spark #p-time #t-time #v-time #pb-time #answer-player #previous-player #download-media #delete-media #reflection #note-state #download-notes #report-chart #review-time #review-clock #sample-description #marker-note #add-marker #markers #previous-answer #comparison-content #retry #setup #print #clear-history` 및 시선 테스트의 `gt-*` id. 구현자는 각 화면 JS를 읽어 빠진 id가 없는지 확인한다.

## 4. 접근 방식 (검토한 것)

| 방식 | 장점 | 단점 | 결정 |
|---|---|---|---|
| A. **Basecoat UI (CDN CSS 로컬 보관) + 직접 배치 CSS** | 빌드 없음, shadcn 모양 그대로, 지금 구조·p5 유지 | 배치 유틸리티가 없어 레이아웃 CSS는 직접 | **채택 [사용자 결정]** |
| B. React + Vite + Tailwind + 진짜 shadcn/ui | 컴포넌트 생태계 최대 | 앱 전체 재작성, 빌드 도입, 남은 기간 대비 위험 큼 | 제외 |
| C. 웹 컴포넌트 라이브러리(Shoelace 등) | 빌드 없음 | shadcn 모양과 다름, 사용자 요청과 거리 | 제외 |

## 5. 디자인 (시안 A 확정)

### 공통
- 상단 바: 왼쪽 앱 이름 "답변 복기", 단계 표시 `질문 설정 › 답변 › 복기`(현재 단계만 굵게), 오른쪽 화면별 동작 버튼.
- 카드 중심 배치, 간격 16px, 화면 여백 20px, 최대 폭 1180px(답변 화면은 전체 폭).
- **색의 의미: 측정값은 중립 [사용자 결정: 추천안 '중립 유지']**
  - 측정값 패널·게이지·시선 알약은 상태에 따라 색을 바꾸지 않는다(현재 코드가 `data-status`를 항상 `idle`로 두는 동작을 그대로 유지). 상태 표현은 현재 코드의 중립 문구(`참고 범위 안/위/아래`, `기준 대비 변화`, `○○을 보고 있어요`)로만.
  - 참고 범위는 게이지의 옅은 띠·그래프의 회색 띠로 **위치만** 보여 준다.
  - 측정 없음 = `--muted-foreground`.
  - 빨강(`--destructive`)은 **녹화 중 표시와 삭제·끝내기 버튼에만**.
  - 그래프 선은 Basecoat `--chart-1..5`.
- 이모지 아이콘 금지. 필요하면 글자 또는 인라인 SVG.

### ① 질문 설정 + 준비 확인 (2열)
- 왼쪽 카드 "연습할 질문": 질문 `.textarea`, 참고 범위 프리셋(탭 모양 토글, 라벨은 `config.js PRESETS` 값), 답변 시간(분·초 `.input`), 속도 참고 범위, 정면 참고 범위(접힘 `<details>`).
- 왼쪽 카드 "기록 방식": 녹화 여부·측정값 숨기기 두 개를 **스위치**(`input[type=checkbox][role=switch]`)와 설명으로. 보관·개인정보 안내는 카드 설명으로.
- 오른쪽 카드 "준비 확인": 카메라 미리보기, 2단계 체크리스트(완료 ✓/진행 중 번호/실패 안내), `.progress`, 카드 footer에 `다시 측정`(outline) · **`답변 시작`**(primary, lg).
- 상단 바 오른쪽: `시선 인식 테스트`, `데모로 체험`, (있으면) `최근 답변 복기로`를 ghost 버튼으로.

### ② 답변 중
- 질문 줄: 질문 배지 + 질문, 오른쪽에 큰 타이머 `00:39 / 02:00`(설정 시간 이후는 현재 코드처럼 `+00:24`와 '설정 시간 이후' 문구, 색 변화 없음).
- 상단 바 오른쪽: 녹화 중 배지(빨강 점, 녹화 시에만), `측정값 보기/숨기기`(outline), `답변 끝내기 (Esc)`(destructive).
- **집중 모드(기본)**: 큰 웹캠 + 진행 막대 + 안내 한 줄만.
- **측정값 보기**: 웹캠(왼쪽, 넓게) 위 가운데에 시선 알약(`● 정면 · 누적 84%`), 오른쪽 340px 열에 카드 4개(속도·크기 게이지, 음높이 스파크라인, 고개·눈 배지). 카드마다 현재 코드의 중립 문구를 22~26px로, 숫자는 보조로.
- 카운트다운·데모 배지·각도 표시는 지금 기능 유지, 모양만 Basecoat 톤.

### ③ 복기 (시안 A 그대로)
- 질문 줄 + 메타(날짜·설정 시간·답변 시간·"자동 점수·평가 없음").
- 상단 바 오른쪽: `이전 답변과 비교`(outline, 누르면 아래 비교 카드로 스크롤·포커스), `같은 질문 다시 답변`(primary). **답변 전환 선택 상자는 두지 않는다**(새 기능이 되므로). 비교 대상 선택 `#previous-answer`는 비교 카드 안에 그대로 둔다. **[설계자 판단]**
- 왼쪽(넓게): 영상 카드(녹화 없으면 빈 상태 안내 카드) + 다운로드/녹화 삭제 버튼, 그 아래 "시간 흐름" 카드(p5 4줄 그래프 + 시간 슬라이더 + 현재 위치 설명).
- 오른쪽: "관찰 요약" 카드(2×2 숫자, 판정 아님 안내), "메모" 카드(탭: `현재 위치` / `전체 복기`; 위치 메모 목록 포함), "참고 범위와 다른 구간" 카드(표, 행 누르면 그 위치로 이동).
- 아래: "이전 답변과 비교" 카드(선택 시 두 영상·측정값 나란히), 보관 안내, 하단 동작(`질문·설정 변경`, `인쇄/PDF`, `보관한 답변·메모 모두 삭제` destructive).

### ④ 시선 인식 테스트
- 같은 2열(웹캠 / 단계 카드·실시간 원시값 카드·결과 카드). 결과는 `.table`, 진단은 Basecoat alert 스타일 목록. "평가가 아님" 문구 유지.

### styleguide.html
- Basecoat 기반으로 다시: 토큰(색·글자·간격), 버튼·배지·카드·필드·스위치·탭·표·진행·게이지·시선 알약·지표 카드의 모든 상태를 실제 컴포넌트 함수로 렌더.

## 6. 컴포넌트 구조

`js/ui/components.js` — 모두 HTML 문자열을 돌려주는 순수 함수(문자열 인자는 `escapeHtml`로 처리) + 기존 동작형 부품.
- 레이아웃: `topBar({ step, actionsHtml })`, `card({ title, description, body, footer, id, className })`, `questionLine({ question, metaHtml })`
- 입력: `button({ label, variant, size, id, attrs })`, `badge({ label, variant })`, `field({ label, forId, control, hint })`, `switchField({ id, label, hint, checked })`, `segmented({ name, options, value })`(프리셋 탭 모양)
- 표시: `statGrid(items)`, `metricCard({ id, title, numId, stateId, extra })`, `gazePill()`, `checklist(items)`, `emptyState({ title, text })`, `dataTable({ columns, rows })`
- 동작형(기존 유지·스타일만 교체): `createGauge`, `createProgress`
- 순수 함수는 Node 테스트로 마크업 핵심(클래스·data-variant·이스케이프)을 검증한다 **[설계자 판단]**.

CSS 파일 구성 **[설계자 판단]**
- `vendor/basecoat/basecoat.cdn.min.css` — 라이브러리
- `css/tokens.css` — Basecoat 토큰 위에 앱 토큰(`--rec` 녹화 표시, 차트 매핑, 글자 크기·간격)만 추가. 기존 그라파나 원시 팔레트는 제거.
- `css/app.css` — 화면 배치(그리드·열·크기)와 앱 고유 부품(시선 알약, 게이지, 웹캠 오버레이)만. 기존 `style.css`를 대체.
- p5 그림 색은 `js/config.js`가 같은 값을 갖고 `tests/tokens.test.js`가 일치를 검사(현 구조 유지, 대상 토큰만 갱신).

## 7. 완료 기준

- 네 화면과 스타일 가이드가 시안 A와 같은 모양(브라우저 스크린샷으로 확인), 1280×720에서 가로 스크롤 없음.
- `npm test` 전부 통과, `scripts/browser-review-smoke.cjs` 통과. 스모크 스크립트는 **바뀐 버튼 이름(`답변 끝내기 (Esc)`)과 메모 탭 전환**에 맞춰 선택자만 고칠 수 있다(검증 내용은 줄이지 않음). **[설계자 판단]**
- 데모(`?demo=1`)로 설정 → 답변(측정값 보기/숨기기) → 복기(그래프 클릭·메모·비교) → 재연습 흐름이 콘솔 오류 없이 동작.
- 네트워크 차단 상태에서도 스타일이 적용됨(Basecoat 로컬 로드).
- 키보드 Tab 이동 시 포커스 테두리 보임.

## 8. 구현자 재량

- 화면별 세부 간격·카드 높이, 시선 테스트 결과 카드의 세부 배치.
- Basecoat 토큰(oklch)과 `config.js`/`tokens.test.js`의 hex 값 맞추는 방식, 남은 시간 표시를 질문 줄로 옮길 때 기존 `#p-time` 카드 처리.
- 기존 `style.css` 규칙 중 인쇄용 규칙을 `app.css`로 옮기는 방식.
- 게이지·스파크라인의 정확한 굵기·투명도.
