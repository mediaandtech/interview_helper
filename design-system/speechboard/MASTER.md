# 답변 복기 디자인 시스템 — MASTER

> 화면을 만들거나 고칠 때 이 문서가 기준입니다. 화면별 규칙은 `pages/<화면>.md`가 우선합니다.
> 살아 있는 예시: `styleguide.html` (실제 컴포넌트 함수·CSS로 그려짐)

## 1. 기반

| 항목 | 내용 |
|---|---|
| 제품 | 면접 답변을 녹화·측정한 뒤 **직접** 돌아보는 도구 (점수·자동 평가 없음) |
| UI 라이브러리 | **Basecoat UI 1.1.0** (shadcn/ui 디자인 언어, React 없음) — `vendor/basecoat/basecoat.cdn.min.css` 로컬 로드 |
| 테마 | 기본 스타일 팩(Vega), 다크 무채색 — `<html class="dark">` |
| 빌드 | 없음. Tailwind 유틸리티 클래스는 쓰지 않음(CDN CSS에 없음). 배치는 `css/app.css` |
| 글꼴 | 시스템 + `Apple SD Gothic Neo` (Basecoat 기본 Geist는 불러오지 않음 — 오프라인) |

## 2. 원칙

1. **측정값은 판정하지 않는다** — 범위 밖이어도 색을 바꾸지 않음. 중립 문구(참고 범위 안/위/아래, 기준 대비 변화, ○○을 보고 있어요)만.
2. **참고 범위는 위치만** — 게이지·그래프의 옅은 띠(`--range-band`)로 어디쯤인지만.
3. **빨강(`--destructive`)은 두 곳에만** — 녹화 중 표시, 삭제·끝내기.
4. **카드 하나에 한 가지** — 제목 → 설명 → 내용 → 동작(footer).
5. **숫자는 고정폭** — `font-variant-numeric: tabular-nums`.
6. **오프라인** — 라이브러리·글꼴을 인터넷에서 불러오지 않음.
7. **키보드로도** — 모든 버튼·탭·입력에 포커스 테두리(Basecoat), 탭은 ←/→ 키.
8. **장치 점검 화면만 예외** — 시선 인식 테스트는 “맞음/아님”을 보여 주는 장치 점검이라 결과 표에 ✓/✗를 씀. 그래도 측정값 막대는 중립.

## 3. 토큰 (`css/tokens.css`)

`html.dark` 블록이 Basecoat 다크 토큰을 같은 색의 hex로 고정합니다. p5 그림용 같은 값이 `js/config.js`(`THEME`, `SERIES_COLORS`)에 있고 `tests/tokens.test.js`가 일치와 `app.css`의 hex 직접 사용 금지를 검사합니다.

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--background` | #0a0a0a | 페이지 |
| `--card` | #171717 | 카드 |
| `--muted` | #262626 | 배지·트랙·탭 바탕 |
| `--border` | #2e2e2e | 구분선 |
| `--foreground` | #fafafa | 본문·숫자·게이지 마커 |
| `--muted-foreground` | #a1a1a1 | 설명·라벨 |
| `--primary` / `--primary-foreground` | #e5e5e5 / #171717 | 주 버튼 |
| `--destructive` | #ff6467 | 녹화 중·삭제·끝내기 |
| `--chart-1` / `--chart-2` / `--chart-3` | #93c5fd / #3b82f6 / #2563eb | 속도·음높이 선 / 음량 선 / 정면 범위 안 |
| `--range-band` | foreground 22% | 참고 범위 띠 |
| `--video` | #000000 | 웹캠·영상 바탕 |
| `--scrim` | 검정 60% | 영상 위 글자 바탕 |

글자: `--fs-caption 12` · `--fs-body 14` · `--fs-lead 16` · `--fs-title 18` · `--fs-metric 24` · `--fs-stat 26` · `--fs-clock 32` (px)
간격: `--space-1..8` = 4·8·12·16·20·24·32 px · 움직임: `--dur-fast 120ms`, `--dur-base 200ms` (동작 줄이기 설정이면 0)

## 4. 컴포넌트 (`js/ui/components.js`)

문자열 인자는 자동 이스케이프, `html`/`*Html` 인자는 그대로 삽입.

| 함수 | 만드는 것 | Basecoat 마크업 |
|---|---|---|
| `topBar({ step })` | 상단 바(앱 이름·단계·`#topbar-right`) | — |
| `button({ label, id, variant, size, attrs })` | 버튼 | `.btn[data-variant][data-size]` |
| `badge({ label, variant })` | 배지 | `.badge[data-variant]` |
| `card({ title, description, html, footerHtml, id, className })` | 카드 | `.card > header / section / footer` |
| `field({ label, forId, controlHtml, hint })` | 라벨+입력 | `.field > .label` |
| `switchField({ id, label, hint, checked })` | 스위치 | `input.input[type=checkbox][role=switch]` |
| `segmented({ name, options, value })` | 탭 모양 단일 선택(`change` 이벤트) | `.tabs [role=tab]` |
| `tabs({ id, items, selected })` + `bindTabs(root)` | 탭+패널(숨겨도 DOM 유지) | `.tabs [role=tablist]/[role=tabpanel]` |
| `statGrid(items)` | 관찰 요약 숫자 | — |
| `metricCard({ id, title, numId, stateId, extraHtml })` | 답변 중 지표 카드(중립) | `.card` |
| `checklist(items)` | 준비 확인 단계 | — |
| `emptyState({ title, text })` | 빈 상태 | `.empty` |
| `dataTable({ columns, rowsHtml })` | 표 | `.table-container > .table` |
| `createGauge(el, opt)` / `createProgress(el)` | 범위 게이지 / 진행 막대(동작형) | — |

## 5. 하지 말 것

- `app.css`에서 `.btn`, `.card`, `.input` 등 Basecoat 클래스를 다시 정의 — Basecoat는 `@layer` 안에 있어 우리 규칙이 이겨 버림. 배치만 쓰고 모양은 `data-variant`로.
- 전역 `button`/`input`/`textarea` 규칙 추가(같은 이유).
- 측정값에 초록·주황·빨강.
- hex 색 직접 사용(토큰 사용).
- 이모지 아이콘.
