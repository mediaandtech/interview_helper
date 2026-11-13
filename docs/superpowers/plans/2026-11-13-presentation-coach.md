# 발표 연습 도구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹캠·마이크로 시선/속도/크기/높낮이/시간을 실시간 표시하고 종료 후 리포트를 주는, 서버 없는 p5.js 기반 발표 연습 웹앱을 만든다.

**Architecture:** 계산 로직(분류·히스테리시스·음높이·음절·속도·시선 판정·점수)은 DOM에 의존하지 않는 순수 ES 모듈로 만들고 Node 내장 테스트로 검증한다. 브라우저 전용 모듈(센서: MediaPipe·Web Audio·Web Speech, 화면: DOM + p5 인스턴스 모드 캔버스)은 이 순수 모듈을 호출만 한다. 한 페이지에서 `setup → practice → report` 세 화면을 전환한다.

**Tech Stack:** HTML/CSS/ES modules(빌드 없음), p5.js 1.11.1(vendor), @mediapipe/tasks-vision 0.10.14(vendor, wasm + face_landmarker.task), Web Audio API, Web Speech API(ko-KR), Node 20 `node --test`(테스트 전용, 의존성 0개).

**Spec:** `docs/superpowers/specs/2026-11-13-presentation-coach-design.md`

## Global Constraints

- Chrome 데스크톱(Mac)만 지원. 서버 코드 없음, 정적 파일만. `file://` 대신 `python3 -m http.server 8000`으로 연다.
- 모든 외부 라이브러리·모델 파일은 `vendor/`에 복사해 로컬에서 로드(인터넷 없이도 시선·크기·높낮이·시간 동작).
- 영상·음성은 저장·전송하지 않음(Web Speech 예외, 설정 화면에 안내 문구: "말하기 속도 측정을 위해 Chrome 음성 인식(구글)을 사용합니다. 영상은 어디에도 전송되지 않아요.").
- 모든 임계값·프리셋은 `js/config.js` 한 곳에만 둔다. 다른 파일에 숫자 하드코딩 금지.
- 상태 값은 `'ok' | 'warn' | 'bad' | 'idle'` 네 가지. 색: ok `#73bf69`, warn `#ff9830`, bad `#f2495c`, idle `#8e8e9e`.
- 그라파나 테마: 배경 `#111217`, 패널 `#181b1f`, 테두리 `#2a2d35`, 본문 `#ccccdc`, 보조 `#8e8e9e`, 강조 `#5794f2`. 패널 숫자 최소 32px.
- 레이아웃은 1280×720 ~ 1920×1080에서 가로 스크롤 없이 동작.
- 순수 모듈(`js/config.js`, `js/util/`, `js/analysis/`, `js/recorder.js`)은 `window`/`document` 참조 금지.

## Review Focus

1. **카메라 또는 마이크 권한 거부·장치 없음** → 앱이 멈추지 않고 가능한 지표만으로 진행, 해당 패널은 `idle` + 안내. 리포트는 없는 지표를 "측정 안 됨"으로 표시하고 가중치를 재분배. (Task 7 테스트 `missing gaze data`, Task 12)
2. **말하지 않는 구간(시작 직후·숨 쉬는 중·쉬는 시간)** → 크기/속도/높낮이 패널은 빨강이 아니라 `idle`, 리포트도 침묵 구간을 "작은 목소리"로 집계하지 않음. (Task 3 `classifyRate idle`, Task 7 `silence not penalized`)
3. **아주 짧은 연습(시작 직후 종료, 샘플 0~수십 개)** → 리포트가 크래시 없이 "연습 시간이 너무 짧아요(10초 미만)" 표시. (Task 7 `empty/short session`)
4. **얼굴이 화면 밖으로 나감·여러 번 인식 실패** → 정면 아님(`dir:'none'`)으로 처리, 알약에 "얼굴이 보이지 않아요". (Task 6 `isFrontal null face`)
5. **음성 인식 중단·미지원·네트워크 끊김** → 속도는 추정값만으로 계속 표시, 보정계수는 1.0으로 복귀하고 0.5~2.0으로 제한. (Task 5 `no recognition`, `correction clamp`)

---

## 파일 구조

```
index.html                    세 화면 섹션, 스크립트 로드
package.json                  {"type":"module","scripts":{"test":"node --test tests/"}}
css/style.css                 테마 토큰, 레이아웃, 패널 상태, @media print
js/config.js                  PRESETS, GAZE, AUDIO, PITCH, RATE, SCORE, TIME, UI 상수
js/util/time.js               formatClock, formatStamp, formatOver
js/analysis/hysteresis.js     createHysteresis
js/analysis/classify.js       classifyRate/Volume/PitchVar/Time/GazeRatio
js/analysis/audio-math.js     rmsDb, isSpeaking, detectPitch, semitoneStd
js/analysis/syllables.js      countHangulSyllables, createSyllableEstimator
js/analysis/rate.js           createRateTracker
js/analysis/gaze-logic.js     headAnglesFromMatrix, eyeFromBlendshapes, isFrontal, createGazeTracker
js/analysis/scoring.js        buildReport
js/recorder.js                createRecorder
js/sensors/audio.js           startAudio (브라우저)
js/sensors/speech.js          startSpeech (브라우저)
js/sensors/gaze.js            initGaze (브라우저)
js/ui/app.js                  화면 전환, 공유 상태
js/ui/setup.js                설정 화면 + 보정
js/ui/practice.js             연습 화면 루프
js/ui/webcam-sketch.js        p5: 웹캠 + 얼굴 점
js/ui/sparkline-sketch.js     p5: 높낮이 10초 그래프
js/ui/report.js               리포트 화면
js/ui/report-sketch.js        p5: 시간축 그래프 4줄
vendor/p5.min.js
vendor/mediapipe/vision_bundle.mjs, vendor/mediapipe/wasm/*, vendor/mediapipe/face_landmarker.task
tests/*.test.js
README.md                     실행법, config 조정법, 시연 체크리스트
```

## 공유 데이터 형태 (모든 태스크 공통)

```js
// Settings (app.js가 보관, setup이 채움)
{ presetKey: 'class'|'interview'|'pitch', durationSec: number,
  rateMin: number, rateMax: number, gazeTarget: number /*0~1*/,
  calib: { baseDb: number|null, baseHz: number|null,
           yaw0: number, pitch0: number, eye0: {down,up,left,right} } | null }

// Sample (recorder가 10Hz로 쌓음)
{ t: number /*초, 연습 시작 기준*/, frontal: boolean|null /*null=시선 측정 불가*/,
  dir: 'front'|'down'|'up'|'left'|'right'|'none',
  speaking: boolean, db: number|null, deltaDb: number|null /*기준 대비*/,
  hz: number|null, rate: number|null /*표시 중인 음절/분*/ }
```

---

### Task 1: 프로젝트 뼈대, 설정값, 시간 포맷

**Files:**
- Create: `package.json`, `.gitignore`, `js/config.js`, `js/util/time.js`
- Test: `tests/config.test.js`, `tests/time.test.js`

**Interfaces:**
- Produces: `PRESETS`, `GAZE`, `AUDIO`, `PITCH`, `RATE`, `SCORE`, `TIME`, `UI` (named exports, 아래 값), `formatClock(sec) -> 'MM:SS'`, `formatStamp(sec) -> 'M:SS'`, `formatOver(sec) -> '+M:SS'`

- [ ] **Step 1:** `git init`, `.gitignore`에 `.superpowers/`, `node_modules/`, `.DS_Store`. `package.json` 작성(의존성 없음).
- [ ] **Step 2: 실패 테스트 작성**

```js
// tests/config.test.js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { PRESETS, GAZE, AUDIO, PITCH, RATE, SCORE, TIME, UI } from '../js/config.js';
test('presets match spec', () => {
  assert.deepEqual(PRESETS.class,     { label:'수업 발표',   rateMin:270, rateMax:330, gazeTarget:0.80 });
  assert.deepEqual(PRESETS.interview, { label:'면접 답변',   rateMin:260, rateMax:320, gazeTarget:0.85 });
  assert.deepEqual(PRESETS.pitch,     { label:'피칭·공모전', rateMin:290, rateMax:350, gazeTarget:0.80 });
});
test('score weights sum to 100', () => {
  const w = SCORE.weights; assert.deepEqual(w, { gaze:35, rate:20, volume:20, time:15, pitch:10 });
});
test('key thresholds', () => {
  assert.equal(GAZE.yawDeg, 15); assert.equal(GAZE.pitchDeg, 12); assert.equal(GAZE.eyeThreshold, 0.5);
  assert.equal(GAZE.forgiveSec, 1.5); assert.equal(GAZE.warnSec, 1.5); assert.equal(GAZE.badSec, 3);
  assert.equal(GAZE.recoverSec, 0.5); assert.equal(GAZE.ratioWindowSec, 30); assert.equal(GAZE.warnMargin, 0.15);
  assert.deepEqual(AUDIO.okRangeDb, [-6, 8]); assert.deepEqual(AUDIO.warnRangeDb, [-10, 12]);
  assert.deepEqual([PITCH.minHz, PITCH.maxHz, PITCH.monotoneSt, PITCH.richSt, PITCH.windowSec], [75, 400, 1.5, 4, 10]);
  assert.equal(RATE.windowSec, 10); assert.equal(RATE.correctionWindowSec, 30);
  assert.equal(TIME.warnRemainingSec, 60); assert.equal(UI.hysteresisSec, 1); assert.equal(UI.sampleHz, 10);
});
```

```js
// tests/time.test.js
test('formats', () => {
  assert.equal(formatClock(192), '03:12'); assert.equal(formatClock(0), '00:00');
  assert.equal(formatStamp(97), '1:37');   assert.equal(formatStamp(230), '3:50');
  assert.equal(formatOver(24), '+0:24');   assert.equal(formatOver(-24), '-0:24');
});
```

- [ ] **Step 3:** `npm test` → FAIL(모듈 없음).
- [ ] **Step 4:** `js/config.js`에 위 값 + 다음 값 추가(테스트 대상 아님, 후속 태스크에서 사용): `AUDIO.silenceBelowBaseDb = 18`, `AUDIO.fftSize = 2048`, `RATE.warnMarginSpm = 30`, `RATE.minSpeakingSecForRate = 3`, `RATE.correctionClamp = [0.5, 2.0]`, `SYLLABLE.minGapMs = 120`, `SYLLABLE.riseDb = 3`, `REPORT.minSessionSec = 10`, `REPORT.quietSegmentSec = 5`, `REPORT.rateSegmentSec = 10`, `CALIB.readSec = 4`, `CALIB.faceSec = 2`, `UI.countdownSec = 3`, `DEFAULT_DURATION_SEC = 300`. `js/util/time.js` 구현(음수는 `-` 부호, 분은 패딩 없음).
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** 커밋 `chore: scaffold project, config, time utils`

### Task 2: vendor 파일, 테마, 화면 셸

**Files:**
- Create: `vendor/…`, `index.html`, `css/style.css`, `js/ui/app.js`

**Interfaces:**
- Produces: `app.go(screen: 'setup'|'practice'|'report', payload?)`, `app.settings`(Settings), `app.lastSamples`(Sample[]). 각 화면 모듈은 `{ enter(app, payload), leave() }`를 export하고 app.js가 등록한다(이 태스크에서는 빈 스텁).
- DOM: `<section id="screen-setup|screen-practice|screen-report">`, 상단 `<nav id="flow">`에 `① 설정 ② 연습 ③ 리포트`, 현재 단계에 `.cur`.

- [ ] **Step 1:** vendor 다운로드:
  - `curl -L -o vendor/p5.min.js https://cdn.jsdelivr.net/npm/p5@1.11.1/lib/p5.min.js`
  - `curl -L -o vendor/mediapipe/vision_bundle.mjs https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`
  - wasm: 같은 패키지의 `wasm/vision_wasm_internal.js`, `vision_wasm_internal.wasm`, `vision_wasm_nosimd_internal.js`, `vision_wasm_nosimd_internal.wasm` → `vendor/mediapipe/wasm/`
  - `curl -L -o vendor/mediapipe/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
  - 확인: `ls -la vendor vendor/mediapipe vendor/mediapipe/wasm` 모두 0바이트 아님, `.task`는 약 3.5MB.
- [ ] **Step 2:** `css/style.css`: Global Constraints의 색을 `:root` 토큰으로, `.panel`, `.panel[data-status=ok|warn|bad|idle]`(왼쪽 3px 테두리 + 숫자 색, bad는 배경 `#2a1418`), `.panel .title`(11px 대문자 보조색), `.panel .value`(≥32px, `font-variant-numeric: tabular-nums`). 화면 섹션은 `.active`만 보임. 폰트: 시스템 산세리프(`Inter`가 설치돼 있으면 우선).
- [ ] **Step 3:** `index.html` + `js/ui/app.js` (type=module). 초기 화면 setup.
- [ ] **Step 4: 확인** `python3 -m http.server 8000` 후 Playwright로 `http://localhost:8000` 열기 → 콘솔 에러 0, 상단 흐름 표시에 "① 설정"이 `.cur`. 1280×720로 리사이즈해 가로 스크롤 없음(`document.documentElement.scrollWidth <= 1280`).
- [ ] **Step 5:** 커밋 `feat: vendor libs, grafana theme, screen shell`

### Task 3: 상태 분류와 깜빡임 방지

**Files:**
- Create: `js/analysis/classify.js`, `js/analysis/hysteresis.js`
- Test: `tests/classify.test.js`, `tests/hysteresis.test.js`

**Interfaces:**
- Consumes: `config.js`
- Produces:
  - `classifyRate(spm: number|null, settings) -> Status` (null → idle)
  - `classifyVolume(deltaDb: number|null, speaking: boolean) -> Status` (말 안 하면 idle)
  - `classifyPitchVar(st: number|null) -> { status, label: '단조'|'적정'|'풍부'|'—' }`
  - `classifyTime(elapsedSec, durationSec) -> { status, text }` (text: 남은 `formatClock` 또는 초과 `formatOver`)
  - `classifyGazeRatio(ratio: number|null, target) -> Status`
  - `createHysteresis(holdSec = UI.hysteresisSec) -> { update(raw: Status, tSec) -> Status }`

- [ ] **Step 1: 실패 테스트**

```js
const S = { rateMin:270, rateMax:330 };
test('classifyRate', () => {
  assert.equal(classifyRate(null, S), 'idle');
  assert.equal(classifyRate(300, S), 'ok');  assert.equal(classifyRate(270, S), 'ok');
  assert.equal(classifyRate(355, S), 'warn'); assert.equal(classifyRate(245, S), 'warn');
  assert.equal(classifyRate(361, S), 'bad');  assert.equal(classifyRate(239, S), 'bad');
});
test('classifyVolume', () => {
  assert.equal(classifyVolume(-20, false), 'idle');
  assert.equal(classifyVolume(0, true), 'ok'); assert.equal(classifyVolume(-6, true), 'ok'); assert.equal(classifyVolume(8, true), 'ok');
  assert.equal(classifyVolume(-8, true), 'warn'); assert.equal(classifyVolume(10, true), 'warn');
  assert.equal(classifyVolume(-11, true), 'bad'); assert.equal(classifyVolume(13, true), 'bad');
});
test('classifyPitchVar', () => {
  assert.deepEqual(classifyPitchVar(null), { status:'idle', label:'—' });
  assert.deepEqual(classifyPitchVar(1.0), { status:'warn', label:'단조' });
  assert.deepEqual(classifyPitchVar(2.5), { status:'ok', label:'적정' });
  assert.deepEqual(classifyPitchVar(5),   { status:'ok', label:'풍부' });
});
test('classifyTime', () => {
  assert.deepEqual(classifyTime(108, 300), { status:'ok',   text:'03:12' });
  assert.deepEqual(classifyTime(250, 300), { status:'warn', text:'00:50' });
  assert.deepEqual(classifyTime(324, 300), { status:'bad',  text:'+0:24' });
});
test('classifyGazeRatio', () => {
  assert.equal(classifyGazeRatio(null, 0.8), 'idle');
  assert.equal(classifyGazeRatio(0.8, 0.8), 'ok'); assert.equal(classifyGazeRatio(0.7, 0.8), 'warn');
  assert.equal(classifyGazeRatio(0.64, 0.8), 'bad');
});
test('hysteresis holds 1s and resets on flicker', () => {
  const h = createHysteresis(1);
  assert.equal(h.update('ok', 0), 'ok');
  assert.equal(h.update('bad', 0.25), 'ok'); assert.equal(h.update('ok', 0.375), 'ok');
  assert.equal(h.update('bad', 0.5), 'ok'); assert.equal(h.update('bad', 1.4375), 'ok');
  assert.equal(h.update('bad', 1.5), 'bad');   // 부동소수점 오차 없는 값만 사용
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** 구현. 경계: 범위 끝값 포함 ok, warn은 범위에서 `RATE.warnMarginSpm`(30) 이내, 크기 warn은 `warnRangeDb` 안쪽. 시간: 남은 시간 ≤ `TIME.warnRemainingSec`이면 warn, 초과면 bad. 히스테리시스는 첫 입력을 즉시 채택, 이후 새 값이 `holdSec` 이상 연속 유지돼야 전환.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** 커밋 `feat: status classification and hysteresis`

### Task 4: 음량·음성 구간·음높이 계산

**Files:**
- Create: `js/analysis/audio-math.js`
- Test: `tests/audio-math.test.js`

**Interfaces:**
- Produces: `rmsDb(buf: Float32Array) -> number` (dBFS, 무음은 -100), `isSpeaking(db, baseDb) -> boolean` (`db > baseDb - AUDIO.silenceBelowBaseDb`; baseDb null이면 `db > -50`), `detectPitch(buf, sampleRate) -> number|null`, `semitoneStd(hzList: number[]) -> number|null` (값 5개 미만이면 null)

- [ ] **Step 1: 실패 테스트** (사인파 생성 헬퍼 `sine(hz, sr=48000, n=2048, amp=0.5)`)

```js
test('rmsDb', () => {
  assert.equal(rmsDb(new Float32Array(2048)), -100);
  assert.ok(Math.abs(rmsDb(sine(220, 48000, 2048, 1)) - (-3.01)) < 0.1);
});
test('isSpeaking', () => { assert.equal(isSpeaking(-30, -20), true); assert.equal(isSpeaking(-40, -20), false); });
test('detectPitch finds sine within 2%', () => {
  for (const hz of [90, 150, 220, 330]) {
    const got = detectPitch(sine(hz), 48000); assert.ok(Math.abs(got - hz) / hz < 0.02, `${hz} -> ${got}`);
  }
});
test('detectPitch null for silence and noise', () => {
  assert.equal(detectPitch(new Float32Array(2048), 48000), null);
  const noise = Float32Array.from({ length: 2048 }, () => Math.random() * 2 - 1);
  assert.equal(detectPitch(noise, 48000), null);
});
test('semitoneStd', () => {
  assert.equal(semitoneStd([200, 200]), null);
  assert.ok(semitoneStd([200,200,200,200,200]) < 1e-9);
  const s = semitoneStd([200, 224.5, 200, 224.5, 200, 224.5]); // ±1 semitone 근처
  assert.ok(s > 0.9 && s < 1.2);
});
```

- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** `detectPitch`: 정규화 자기상관. RMS < 0.01이면 null. 지연 범위 `sr/PITCH.maxHz ~ sr/PITCH.minHz`에서 첫 번째 강한 봉우리(정규화 상관 ≥ 0.6)를 찾고 포물선 보간. 봉우리가 없으면 null. `semitoneStd`: `12*log2(hz/median)` 변환 후 표본 표준편차.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: audio math (rms, vad, pitch, semitone std)`

### Task 5: 음절 세기와 속도 추적

**Files:**
- Create: `js/analysis/syllables.js`, `js/analysis/rate.js`
- Test: `tests/syllables.test.js`, `tests/rate.test.js`

**Interfaces:**
- Produces:
  - `countHangulSyllables(text) -> number` (U+AC00–U+D7A3만 셈)
  - `createSyllableEstimator() -> { push(db, tMs, speaking) -> boolean }` (이번 프레임에 음절 봉우리를 셌으면 true)
  - `createRateTracker() -> { addEstimated(tSec), addRecognized(count, tSec), rate(tSec, speakingSecInWindow) -> number|null, correction() -> number, recognizedAverage(totalSec) -> number|null }`

- [ ] **Step 1: 실패 테스트**

```js
test('countHangulSyllables', () => {
  assert.equal(countHangulSyllables('안녕하세요, 발표를 시작하겠습니다'), 14);
  assert.equal(countHangulSyllables('AI 3개'), 1); assert.equal(countHangulSyllables(''), 0);
});
test('estimator counts envelope peaks with min gap', () => {
  const e = createSyllableEstimator(); let n = 0;
  // 200ms마다 -40→-25→-40 dB 봉우리 10개, 16ms 프레임
  for (let t = 0; t < 2000; t += 16) { const ph = (t % 200) / 200; const db = -40 + 15 * Math.sin(Math.PI * ph); if (e.push(db, t, true)) n++; }
  assert.ok(n >= 9 && n <= 11, `got ${n}`);
});
test('estimator ignores non-speaking frames', () => {
  const e = createSyllableEstimator(); let n = 0;
  for (let t = 0; t < 2000; t += 16) { const ph = (t % 200) / 200; if (e.push(-40 + 15*Math.sin(Math.PI*ph), t, false)) n++; }
  assert.equal(n, 0);
});
test('rate: estimate only, correction 1.0', () => {
  const r = createRateTracker();
  for (let i = 0; i < 50; i++) r.addEstimated(i * 0.2);   // 10초에 50음절 = 300/분
  assert.equal(r.correction(), 1); assert.ok(Math.abs(r.rate(10, 10) - 300) < 10);
});
test('rate: null when speaking too little', () => { assert.equal(createRateTracker().rate(5, 1), null); });
test('rate: recognized corrects estimate', () => {
  const r = createRateTracker();
  for (let i = 0; i < 50; i++) r.addEstimated(i * 0.2);
  r.addRecognized(60, 10);                                 // 실제 60음절
  assert.ok(Math.abs(r.correction() - 1.2) < 0.01); assert.ok(Math.abs(r.rate(10, 10) - 360) < 12);
});
test('rate: correction clamped to [0.5, 2.0]', () => {
  const r = createRateTracker(); for (let i = 0; i < 10; i++) r.addEstimated(i);
  r.addRecognized(100, 10); assert.equal(r.correction(), 2.0);
});
```

- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 추정기: 말하는 프레임에서 지역 최소값 대비 `SYLLABLE.riseDb` 이상 오른 뒤 내려가기 시작하는 지점을 봉우리로 셈. 직전 봉우리와 `minGapMs` 이상 떨어져야 함. 속도: 최근 `RATE.windowSec` 추정 음절 수 × 60 / windowSec × correction. `speakingSecInWindow < RATE.minSpeakingSecForRate`이면 null. correction = 최근 `correctionWindowSec`의 인식 음절 합 / 추정 음절 합(추정 0이거나 인식 없으면 1), clamp 적용.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: syllable estimator and hybrid rate tracker`

### Task 6: 시선 판정 로직

**Files:**
- Create: `js/analysis/gaze-logic.js`
- Test: `tests/gaze-logic.test.js`

**Interfaces:**
- Produces:
  - `headAnglesFromMatrix(d: number[16] /*열 우선*/) -> { yaw, pitch }` (도 단위; `yaw = asin(-d[2])`, `pitch = atan2(d[6], d[10])`)
  - `eyeFromBlendshapes(categories: {categoryName, score}[]) -> { down, up, left, right }` (좌우 눈 평균. left = avg(eyeLookOutLeft, eyeLookInRight), right = avg(eyeLookInLeft, eyeLookOutRight); 화면 좌우 반전은 UI에서 처리)
  - `isFrontal(face: {yaw,pitch,eye}|null, calib) -> { frontal: boolean, dir }` (null → `{frontal:false, dir:'none'}`)
  - `createGazeTracker(target) -> { update(frontal: boolean|null, dir, tSec) -> { status, awaySec, ratio, dir }, events() -> {start, dur, dir}[] }`

- [ ] **Step 1: 실패 테스트**

```js
const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const ry = a => { const c=Math.cos(a), s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; };
const rx = a => { const c=Math.cos(a), s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; };
const rad = d => d * Math.PI / 180;
const calib = { yaw0: 0, pitch0: 0, eye0: { down:0.1, up:0, left:0, right:0 } };
const eye0 = { down:0.1, up:0, left:0, right:0 };
test('head angles', () => {
  assert.deepEqual(headAnglesFromMatrix(I), { yaw:0, pitch:0 });
  assert.ok(Math.abs(headAnglesFromMatrix(ry(rad(20))).yaw - 20) < 0.01);
  assert.ok(Math.abs(headAnglesFromMatrix(rx(rad(10))).pitch - 10) < 0.01);
});
test('isFrontal', () => {
  assert.deepEqual(isFrontal(null, calib), { frontal:false, dir:'none' });
  assert.equal(isFrontal({ yaw:10, pitch:-8, eye: eye0 }, calib).frontal, true);
  assert.deepEqual(isFrontal({ yaw:20, pitch:0, eye: eye0 }, calib), { frontal:false, dir:'right' });
  assert.deepEqual(isFrontal({ yaw:-20, pitch:0, eye: eye0 }, calib), { frontal:false, dir:'left' });
  assert.deepEqual(isFrontal({ yaw:0, pitch:0, eye:{ ...eye0, down:0.7 } }, calib), { frontal:false, dir:'down' });
  // 보정 기준 기준으로 판정: 카메라가 비스듬해도 기준 자세면 정면
  assert.equal(isFrontal({ yaw:18, pitch:0, eye: eye0 }, { ...calib, yaw0: 10 }).frontal, true);
});
test('tracker: warn at 1.5s, bad at 3s, recover after 0.5s, event logged', () => {
  const g = createGazeTracker(0.8); let o;
  for (let t = 0; t <= 10; t += 0.1) o = g.update(true, 'front', t);
  assert.equal(o.status, 'ok');
  o = g.update(false, 'down', 10.0); o = g.update(false, 'down', 11.4); assert.equal(o.status, 'ok');
  o = g.update(false, 'down', 11.5); assert.equal(o.status, 'warn');
  o = g.update(false, 'down', 13.0); assert.equal(o.status, 'bad');
  o = g.update(true, 'front', 14.0); assert.equal(o.status, 'bad');
  o = g.update(true, 'front', 14.5); assert.equal(o.status, 'ok');
  assert.deepEqual(g.events().map(e => ({ ...e, dur: Math.round(e.dur) })), [{ start:10, dur:4, dir:'down' }]);
});
test('tracker: short glance forgiven in ratio', () => {
  const g = createGazeTracker(0.8); let o;
  for (let t = 0; t < 30; t += 0.1) o = g.update(!(t >= 5 && t < 6), (t>=5&&t<6)?'right':'front', t);
  assert.ok(o.ratio > 0.99); assert.equal(g.events().length, 0);
});
test('tracker: null frontal → idle', () => { assert.equal(createGazeTracker(0.8).update(null, 'none', 0).status, 'idle'); });
```

- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** isFrontal: `dy = yaw - yaw0`, `dp = pitch - pitch0`, 눈 값은 `eye - eye0`. 고개 우선: |dy| > `GAZE.yawDeg` → right/left(부호 +는 right), |dp| > `GAZE.pitchDeg` → down/up(+는 up). 그다음 눈: 최대 보정값 > `GAZE.eyeThreshold`이면 그 방향. tracker: 연속 이탈 시간 `awaySec`로 상태(≥warnSec warn, ≥badSec bad), 정면 복귀 후 `recoverSec` 동안 이전 상태 유지. ratio는 최근 `ratioWindowSec` 동안 "정면이거나 forgiveSec 미만으로 끝난 이탈" 비율. 이탈 중인 구간은 확정 전까지 정면으로 간주하지 않는다. `badSec` 이상이면 이벤트로 기록.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: gaze frontal logic and tracker`

### Task 7: 기록과 리포트 계산

**Files:**
- Create: `js/recorder.js`, `js/analysis/scoring.js`
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: Sample, Settings, `formatStamp`, `formatOver`, `semitoneStd`, `classify*`
- Produces:
  - `createRecorder() -> { push(sample), samples() -> Sample[] }`
  - `buildReport(samples: Sample[], settings, extras?: { recognizedAvgRate?: number|null }) -> Report`

```js
// Report
{ tooShort: boolean, durationSec, score: number|null /*0~100 정수*/,
  metrics: { gaze: {pct, score}|null, rate: {avg, score}|null, volume: {outPct, score}|null,
             pitch: {st, label, score}|null, time: {diffSec, text, score} },
  headline: string, tips: { t: number|null, text: string }[] /*정확히 3개*/,
  gazeEvents: {start, dur, dir}[] }
```

- [ ] **Step 1: 실패 테스트** — 헬퍼 `mk(sec, fn)`는 10Hz 샘플 배열을 만든다(t = i/10, 기본값 `{frontal:true, dir:'front', speaking:true, db:-20, deltaDb:0, hz: 200*2**(3*Math.sin(t)/12), rate:300}`, `fn(s)`가 돌려준 필드로 덮어씀).

```js
const SET = { presetKey:'class', durationSec:300, rateMin:270, rateMax:330, gazeTarget:0.8, calib:{ baseDb:-20 } };
test('empty/short session', () => {
  assert.equal(buildReport([], SET).tooShort, true);
  const r = buildReport(mk(5), SET); assert.equal(r.tooShort, true); assert.equal(r.score, null);
});
test('perfect session scores ≥ 95 with praise tips', () => {
  const r = buildReport(mk(300), SET); assert.ok(r.score >= 95); assert.equal(r.tips.length, 3);
});
test('7s look-down at 1:37 becomes a tip', () => {
  const r = buildReport(mk(300, (s) => (s.t >= 97 && s.t < 104) ? { frontal:false, dir:'down' } : {}), SET);
  assert.ok(r.tips.some(x => x.t === 97 && x.text.includes('1:37') && x.text.includes('7초') && x.text.includes('아래')));
  assert.equal(r.gazeEvents.length, 1);
});
test('short glances forgiven', () => {
  const r = buildReport(mk(300, (s) => (Math.floor(s.t) % 20 === 0) ? { frontal:false, dir:'right' } : {}), SET);
  assert.equal(r.metrics.gaze.pct, 100);
});
test('quiet after 3:50 becomes top volume tip', () => {
  const r = buildReport(mk(324, (s) => s.t >= 230 ? { deltaDb:-12 } : {}), SET);
  const tip = r.tips.find(x => x.t === 230); assert.ok(tip); assert.ok(tip.text.includes('3:50') && tip.text.includes('작아졌어요'));
  assert.equal(r.metrics.time.text, '+0:24'); assert.ok(r.headline.endsWith('가장 아쉬워요.'));
});
test('silence not penalized', () => {
  const r = buildReport(mk(300, (s) => (s.t % 10 < 3) ? { speaking:false, db:-60, deltaDb:-40, hz:null, rate:null } : {}), SET);
  assert.equal(r.metrics.volume.outPct, 0);
});
test('missing gaze data renormalizes weights', () => {
  const r = buildReport(mk(300, () => ({ frontal:null, dir:'none' })), SET);
  assert.equal(r.metrics.gaze, null); assert.ok(r.score >= 95);
});
test('monotone voice flagged', () => {
  const r = buildReport(mk(300, () => ({ hz:200 })), SET);
  assert.equal(r.metrics.pitch.label, '단조'); assert.ok(r.tips.some(x => x.text.includes('억양')));
});
```

- [ ] **Step 2:** FAIL 확인.
- [ ] **Step 3:** 구현 규칙
  - `tooShort`: 마지막 t < `REPORT.minSessionSec`.
  - gaze: frontal≠null인 샘플로 `createGazeTracker`를 다시 돌려서 이벤트와 봐주기 적용 비율을 구한다. score = min(1, pct/target)×100.
  - rate: rate≠null 샘플의 ok 비율×100. avg = `extras.recognizedAvgRate ?? 평균(rate)`.
  - volume: speaking 샘플만. outPct = 그중 `classifyVolume`이 ok가 아닌 비율. score = 100 − outPct.
  - pitch: speaking hz 전체의 `semitoneStd`. score = min(1, st/PITCH.monotoneSt)×100.
  - time: diff = 실제 − 목표. |diff| ≤ 10%면 100점, 50%에서 0점이 되도록 선형 감소.
  - 총점: null이 아닌 지표 가중 평균, 반올림.
  - 팁 후보와 심각도(내림차순 상위 3개, 부족하면 칭찬으로 채움). 문구 확정:
    - 시선 이벤트: `"{M:SS}에 {N}초 동안 시선이 {아래로|위로|왼쪽으로|오른쪽으로|화면 밖으로} 향했어요. 원고를 보는 시간을 3초 이내로 줄여 보세요."` 심각도 = dur × 2
    - 작은 목소리(연속 ≥ `REPORT.quietSegmentSec`, deltaDb < −6): `"{M:SS} 이후 목소리가 기준보다 {P}% 작아졌어요. 결론 부분일수록 크게 말해 보세요."` P = round((1 − 10^(평균Δ/20))×100). 심각도 = 길이 × |평균Δ|/6
    - 큰 목소리(deltaDb > 8): `"{M:SS}부터 목소리가 기준보다 커졌어요. 힘을 조금 빼 보세요."`
    - 속도(연속 ≥ `REPORT.rateSegmentSec` 범위 밖): `"{M:SS}부터 말이 {빨라졌어요|느려졌어요}(평균 {R}음절/분). 목표는 {min}~{max}음절/분이에요."`
    - 단조(pitch label 단조): t=null, `"억양 변화가 적어요. 핵심 단어에서 목소리를 조금 올려 보세요."` 심각도 20
    - 시간 초과/부족(|diff| > 10%): t=null, `"목표보다 {M:SS} {길게|짧게} 발표했어요."` 심각도 = |diff|/3
    - 칭찬 채우기(점수 높은 지표 순): `"시선 처리가 안정적이었어요."`, `"말하기 속도가 목표 범위 안에 있었어요."`, `"목소리 크기가 고르게 유지됐어요."`, `"억양에 변화가 살아 있었어요."`, `"시간 배분이 정확했어요."`
  - headline: `"{best}. {worst} 가장 아쉬워요."`. best 문구: gaze `시선 처리는 안정적이에요`, rate `말하기 속도가 적절해요`, volume `목소리 크기가 안정적이에요`, pitch `억양 변화가 살아 있어요`, time `시간 배분이 정확해요`. worst 문구: gaze `시선이 자주 벗어난 게`, rate `속도가 기준을 벗어난 게`, volume `목소리 크기가 흔들린 게`, pitch `억양이 단조로운 게`, time `시간을 맞추지 못한 게`. 모든 지표가 90점 이상이면 `"{best}. 전반적으로 훌륭한 발표였어요."`(이 경우 '가장 아쉬워요.' 테스트는 3:50 케이스에서만 검증).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: recorder and report builder`

### Task 8: 오디오·음성 인식 센서

**Files:**
- Create: `js/sensors/audio.js`, `js/sensors/speech.js`

**Interfaces:**
- Consumes: `rmsDb`, `isSpeaking`, `detectPitch`, `countHangulSyllables`
- Produces:
  - `startAudio() -> Promise<{ read(baseDb) -> { db, speaking, hz }, stop(), stream }>` (`getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}})`, AnalyserNode fftSize `AUDIO.fftSize`, `getFloatTimeDomainData`). 실패하면 이유 문자열을 담아 reject: `'denied'|'nodevice'|'error'`.
  - `startSpeech({ onSyllables(count, tSec), onText(text) }) -> { supported: boolean, stop() }` (`webkitSpeechRecognition`, ko-KR, continuous, interimResults. **final 결과에서만** 음절 수를 보고. `onend`면 정지 요청이 없는 한 300ms 뒤 재시작. `onerror` 'network'/'not-allowed'면 재시도를 5초 간격으로 제한)

- [ ] **Step 1:** 구현.
- [ ] **Step 2:** `index.html?debug=1`일 때 화면 구석에 `db / speaking / hz / 인식 음절 누계`를 보여 주는 디버그 오버레이를 추가(app.js).
- [ ] **Step 3: 확인** Playwright로 Chrome을 `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` 옵션으로 띄워(가짜 마이크는 440Hz 비프음) `?debug=1`에서 hz가 약 440(±10)으로 표시되는지, 콘솔 에러가 없는지 확인. 옵션을 줄 수 없으면 사람이 직접 확인한다: 말하면 db가 오르고 speaking이 true가 되는지.
- [ ] **Step 4:** 커밋 `feat: audio and speech sensors`

### Task 9: 시선 센서와 웹캠 스케치

**Files:**
- Create: `js/sensors/gaze.js`, `js/ui/webcam-sketch.js`

**Interfaces:**
- Consumes: `headAnglesFromMatrix`, `eyeFromBlendshapes`
- Produces:
  - `initGaze() -> Promise<{ video: HTMLVideoElement, detect(nowMs) -> { face: {yaw,pitch,eye}|null, landmarks: {x,y}[]|null }, stop() }>` (`FaceLandmarker.createFromOptions(fileset('vendor/mediapipe/wasm'), { baseOptions:{ modelAssetPath:'vendor/mediapipe/face_landmarker.task', delegate:'GPU' }, runningMode:'VIDEO', numFaces:1, outputFaceBlendshapes:true, outputFacialTransformationMatrixes:true })`, 영상 640×480. GPU 실패 시 CPU로 재시도). reject 이유: `'denied'|'nodevice'|'model'`.
  - `createWebcamSketch(parentEl, getState) -> p5` (p5 인스턴스 모드. 영상 좌우 반전, `getState()`가 주는 `{landmarks, status, dir}`로 얼굴 점을 반투명 1px 점으로 그림. 코에서 dir 방향으로 짧은 화살표, 테두리 3px 상태색).

- [ ] **Step 1:** 구현.
- [ ] **Step 2:** 디버그 오버레이에 yaw/pitch/eye.down 추가.
- [ ] **Step 3: 확인** 실제 웹캠으로 yaw/pitch 부호를 확인한다(화면 기준 오른쪽을 보면 dir='right', 위를 보면 'up'). 반대면 `headAnglesFromMatrix`에 부호 상수를 두어 맞추고, Task 6 테스트의 기대값도 같이 고친다. 가짜 카메라 Chrome에서 모델 로딩 성공(콘솔 에러 0, `detect`가 예외 없이 동작. 가짜 영상에는 얼굴이 없으므로 face=null 기대). 실제 웹캠 확인은 사람이 한다: 고개를 20° 돌리면 dir이 바뀌는지.
- [ ] **Step 4:** 커밋 `feat: mediapipe gaze sensor and webcam sketch`

### Task 10: 설정 화면과 보정

**Files:**
- Create: `js/ui/setup.js`. Modify: `index.html`, `css/style.css`

**Interfaces:**
- Consumes: `PRESETS`, `DEFAULT_DURATION_SEC`, `CALIB`, `startAudio`, `initGaze`, `isFrontal` 입력 형태
- Produces: `app.settings` 완성, `app.sensors = { audio|null, gaze|null }`(이후 화면에서 재사용, 다시 만들지 않음). `app.go('practice')`.

- [ ] **Step 1:** 화면 구성(스펙 4.1)
  - 유형 칩 3개(기본 '수업 발표').
  - 시간 입력(분·초 두 칸, 1:00~30:00).
  - 준비 확인 카드 2단계: ① 정면 보기 `CALIB.faceSec` 동안 yaw/pitch/eye 평균 → yaw0/pitch0/eye0 ② 안내 문장을 `CALIB.readSec` 동안 읽기 → 말하는 프레임의 db 중앙값 = baseDb, hz 중앙값 = baseHz.
  - 각 단계에 ✓ 또는 안내: 얼굴 없음 "얼굴이 화면 가운데 오도록 앉아 주세요", 권한 거부 "주소창 왼쪽 자물쇠에서 카메라/마이크를 허용해 주세요", 말 감지 실패 "조금 더 크게 다시 읽어 주세요".
  - "다시 측정" 버튼, 접힌 고급 설정(`<details>`: rateMin/rateMax/gazeTarget 수정), 음성 인식 안내 문구(Global Constraints).
  - **연습 시작**: 보정 2단계가 끝나면 활성화. 센서 하나가 권한 거부면 "○○ 없이 시작" 버튼으로 대체(calib 해당 값 null).
- [ ] **Step 2: 확인** 가짜 장치 Chrome에서 칩 선택 → 고급 설정 값이 프리셋으로 바뀌는지, 시간 입력이 반영되는지, 권한 거부 모드(`--deny-permission-prompts` 또는 Playwright 권한 미부여)에서 안내 문구와 "없이 시작" 버튼이 보이는지. 1280×720 가로 스크롤 없음.
- [ ] **Step 3:** 커밋 `feat: setup screen with calibration`

### Task 11: 실시간 연습 화면

**Files:**
- Create: `js/ui/practice.js`, `js/ui/sparkline-sketch.js`. Modify: `index.html`, `css/style.css`

**Interfaces:**
- Consumes: `app.settings`, `app.sensors`, `startSpeech`, `createSyllableEstimator`, `createRateTracker`, `createGazeTracker`, `isFrontal`, `classify*`, `createHysteresis`, `semitoneStd`, `createRecorder`, `createWebcamSketch`
- Produces: 종료 시 `app.go('report', { samples, recognizedAvgRate })`
- `createSparkline(parentEl, getSeries) -> p5` (최근 10초 hz, 반음 스케일, 상태색 선)

- [ ] **Step 1:** 레이아웃(스펙 4.2, C안): 위쪽 가운데 시선 알약(`● 정면 {ratio}%`, 이탈 중이면 `● {아래|왼쪽|…}를 보고 있어요`, 얼굴 없으면 `● 얼굴이 보이지 않아요`). 왼쪽 60% 웹캠 스케치. 오른쪽 패널 4개(속도 `음절/분`, 크기 `작음/적정/큼` + 기준 대비 막대, 높낮이 스파크라인 + 라벨, 남은 시간). 오른쪽 위 [종료] 버튼. 시작 시 `UI.countdownSec` 카운트다운.
- [ ] **Step 2:** 루프: `requestAnimationFrame`마다 audio.read → estimator/rate, gaze.detect(최대 30fps) → isFrontal → gazeTracker. 패널 상태는 시선을 빼고 모두 `createHysteresis`를 거친다(시선은 tracker 상태를 그대로 사용). 100ms마다 recorder.push(Sample). 최근 10초 말하는 시간(speakingSecInWindow)은 샘플로 계산.
- [ ] **Step 3:** 종료: 버튼·Space·Esc. 시간이 초과돼도 계속 측정. speech.stop(), 스케치 `remove()`. recognizedAvgRate = rateTracker.recognizedAverage(총시간).
- [ ] **Step 4: 확인** 가짜 장치 Chrome에서 10초 연습 → 콘솔 에러 0. 시간 패널이 내려가는지, 가짜 비프음에서 높낮이가 '단조'(주황)인지, Esc로 리포트 화면에 가는지. 1280×720에서 패널 숫자 ≥32px(`getComputedStyle`), 가로 스크롤 없음. 실제 사람 확인: 고개를 돌리면 1.5초 뒤 알약·테두리가 주황, 3초 뒤 빨강, 정면 0.5초 뒤 초록.
- [ ] **Step 5:** 커밋 `feat: live practice screen`

### Task 12: 리포트 화면

**Files:**
- Create: `js/ui/report.js`, `js/ui/report-sketch.js`. Modify: `index.html`, `css/style.css`

**Interfaces:**
- Consumes: `buildReport`, `formatStamp`, payload `{ samples, recognizedAvgRate }`
- Produces: `createReportChart(parentEl, samples, report, settings) -> p5`; 버튼 → `app.go('practice')`(같은 설정·보정 재사용) / `window.print()`

- [ ] **Step 1:** 스펙 4.3 순서: 점수 + headline + 메타(유형·목표/실제 시간·날짜) → 요약 5칸(null 지표는 "측정 안 됨" idle) → 4줄 시간축 그래프(시선 띠: 정면 어두운 초록·이탈 빨강 / 속도 선 + 목표 범위 음영 / 크기 deltaDb 선 + 허용 범위 음영 / 높낮이 반음 선. 공통 x축 `M:SS` 눈금. 마우스를 올리면 세로선과 그 시각의 값, 빨간 구간 위에서는 해당 팁 문장 툴팁) → 팁 3개(t가 있으면 `M:SS` 배지) → 버튼.
- [ ] **Step 2:** `tooShort`이면 요약 대신 "연습 시간이 너무 짧아요(10초 미만). 다시 연습해 주세요." + 다시 연습 버튼.
- [ ] **Step 3:** `@media print`: 흰 배경·검정 글자, 버튼·흐름 표시 숨김, p5 캔버스는 인쇄 전에 `beforeprint`에서 이미지로 바꿔 한 페이지에 들어가게.
- [ ] **Step 4: 확인** 가짜 장치로 20초 연습 → 리포트에 점수, 팁 3개, 그래프 4줄이 그려지고 콘솔 에러 0. 3초 연습은 tooShort 메시지. Playwright `page.pdf()` 또는 인쇄 미리보기에서 1페이지.
- [ ] **Step 5:** 커밋 `feat: report screen with timeline and print`

### Task 13: 견고성 마무리, README, 시연 체크리스트

**Files:**
- Modify: 필요한 UI 파일. Create: `README.md`

- [ ] **Step 1:** 실패 경로 점검 및 보완(Review Focus 1, 4, 5): 마이크만 거부, 카메라만 거부, 연습 중 음성 인식 끊김(`onerror` 강제) → 앱 동작 유지, 해당 패널 idle + 툴팁 안내. 탭이 숨겨졌다 돌아오면(`visibilitychange`) 루프가 이어지는지.
- [ ] **Step 2:** README: 실행(`python3 -m http.server 8000` → Chrome `http://localhost:8000`), `?debug=1`, `js/config.js` 값 조정 가이드(어떤 숫자가 무엇을 바꾸는지), GitHub Pages 배포 방법, **시연 체크리스트**(전날 강의실 노트북·프로젝터로 리허설, 미러링 해상도 확인, Chrome 권한 미리 허용, 인터넷 끊김 시에도 동작 확인, 보정은 시연 직전에 다시, 불안정 기능은 config로 끄기).
- [ ] **Step 3: 확인** `npm test` 전부 PASS. 가짜 장치로 설정 → 연습 30초 → 리포트 → 다시 연습 → 리포트를 콘솔 에러 없이 2회 반복.
- [ ] **Step 4:** 커밋 `chore: robustness pass, readme, demo checklist`

### Task 14 (선택, 시간이 남으면): 군말 세기와 지난 기록 비교

**Files:**
- Create: `js/analysis/fillers.js`, `tests/fillers.test.js`. Modify: `practice.js`, `report.js`

**Interfaces:**
- Produces: `countFillers(text) -> number` (어절 단위로 `음`, `어`, `그`, `음…`, `어…`, `저` 단독 어절만), localStorage 키 `pcoach.history`(요약 `{date, preset, score, gazePct, avgRate}` 최대 20개, try/catch)

- [ ] **Step 1: 실패 테스트** `countFillers('음 그 저는 어 발표를 그러니까')` → 3 (`그러니까`, `저는`은 제외).
- [ ] **Step 2:** FAIL → 구현 → PASS. 리포트 팁 후보에 `"'음', '어'를 {N}번 사용했어요."`(N ≥ 5, 심각도 N) 추가, 요약 아래 "지난 기록과 비교" 작은 표.
- [ ] **Step 3:** 커밋 `feat: filler count and history (optional)`
