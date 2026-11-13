// 모든 임계값과 프리셋을 이 파일 한 곳에서 관리합니다.
// 팀원은 코드를 몰라도 여기 숫자만 바꿔서 조정할 수 있습니다.

/** 발표 유형별 기준값 */
export const PRESETS = {
  class:     { label: '수업 발표',   rateMin: 270, rateMax: 330 },
  interview: { label: '화상 면접',   rateMin: 260, rateMax: 320 },
  pitch:     { label: '피칭·공모전', rateMin: 290, rateMax: 350 },
};

/** 시선 판정 */
export const GAZE = {
  yawDeg: 15,          // 정면 기준 대비 좌우 고개 허용 각도
  pitchDeg: 12,        // 정면 기준 대비 위아래 고개 허용 각도
  eyeThreshold: 0.5,   // 눈 방향 blendshape(기준 대비) 임계값
  flipYaw: false,      // 시선 테스트에서 좌우가 반대로 나오면 true
  flipPitch: false,    // 시선 테스트에서 위아래가 반대로 나오면 true
  flipIrisX: false,    // 홍채 좌우가 반대로 나오면 true

  // ── 측정 유효성 ──
  minEyeWidthPx: 12,   // 눈 너비가 이보다 작으면 세밀한 눈 추정을 보류
  staleMs: 500,        // 새 영상 프레임이 이만큼 없으면 '영상 정지'로 보고 판정하지 않음
  eyeClosedAbs: 0.12,  // 눈 열림(세로/가로) 이보다 좁고 감김 신호가 있으면 감김 (개인 기준이 없을 때)
  eyeClosedRatio: 0.5, // 보정 때 눈 열림의 이 비율보다 좁으면 '좁음' (개인 기준이 있을 때)
  blinkScore: 0.5,     // 눈 감김 blendshape 기준
  eyeMinWidthRatio: 0.6, // 한쪽 눈 너비가 다른 눈의 이 비율보다 작으면 가림·옆모습으로 보고 제외
  irisJitter: 0.12,    // 최근 프레임들의 홍채 위치 표준편차가 이보다 크면 불안정(눈 너비 단위)
  irisMaxOffset: 0.6,  // 홍채가 눈 중심에서 이보다 멀면(눈 밖) 검출 오류로 봄

  // ── 홍채 방식(실험) ──
  eyeMethod: 'blendshape',             // 기본 계산 방식. 'iris'는 비교 확인 후에만 선택
  irisSpanDefault: { x: 0.12, y: 0.08 }, // 정밀 보정이 없을 때 정면→경계 거리(눈 너비 단위)
  outOfRangeScale: 3,                  // 경계 거리의 이 배수를 넘으면 보정 범위 밖으로 표시

  // ── 시간 안정화 ──
  smoothTauSec: 0.15,  // 각도 평활화 시간상수
  switchHoldSec: 0.3,  // 방향이 이만큼 이어져야 표시 방향을 바꿈
  gapResetSec: 0.5,    // 측정 공백이 이보다 길면 필터 초기화

  // ── 재보정 안내 ──
  recalibSizeRatio: 0.25, // 얼굴 크기(눈 사이 거리)가 보정 때보다 이 비율 이상 달라지면
  recalibSec: 3,          // 이 시간 이상 이어질 때 재보정 안내
};

/** 정밀 보정(선택) */
export const PRECISE = {
  settleSec: 0.7,      // 점이 옮겨진 뒤 시선이 자리 잡는 시간(표본 제외)
  minSamples: 15,      // 방향마다 필요한 유효·안정 표본 수
  maxSec: 8,           // 이 시간 안에 모이지 않으면 그 방향은 실패
  windowSize: 8,       // 안정성 판정 창(표본 수)
  maxHeadStdDeg: 2,    // 창 안 고개 각도 표준편차가 이보다 크면 '움직임'
  maxIrisStd: 0.04,    // 창 안 홍채 위치 표준편차가 이보다 크면 '움직임'
  minSeparation: 2,    // 방향 간 거리/표준편차가 이보다 작으면 구분 어려움
};

/** 목소리 크기 (보정 때 잰 기준 음량 대비 dB) */
export const AUDIO = {
  okRangeDb: [-6, 8],
  silenceBelowBaseDb: 18, // 기준보다 이만큼 작으면 '말 안 함'
  fftSize: 2048,
  calibAboveNoiseDb: 10, // 보정 때 주변 소음보다 이만큼 커야 목소리로 인정
  calibMinFrames: 30,
};

/** 음성 높낮이 */
export const PITCH = {
  minHz: 75,
  maxHz: 400,
  windowSec: 10,
};

/** 말하기 속도 */
export const RATE = {
  windowSec: 10,
  minSpeakingSecForRate: 3,   // 최근 구간에 이만큼 말해야 속도 표시
};

/** 소리 크기 봉우리로 음절을 추정할 때 */
export const SYLLABLE = {
  minGapMs: 120,
  riseDb: 3,
};

/** 보정 단계 */
export const CALIB = {
  faceSec: 2,
  readSec: 4,
};

/** 화면 */
export const UI = {
  sampleHz: 10,
  countdownSec: 3,
  rateGaugePad: 90,   // 속도 게이지: 목표 범위 양옆으로 이만큼(음절/분) 더 보여 줌
  volumeGaugeDb: 15,  // 크기 게이지: 기준 대비 ±15 dB
};

/** 디자인 토큰 — css/tokens.css 의 html.dark 값과 같아야 합니다(p5 그림용). tests/tokens.test.js 가 확인 */
export const THEME = {
  bg: '#0a0a0a',
  card: '#171717',
  muted: '#262626',      // 면(배지·트랙)
  border: '#2e2e2e',
  text: '#fafafa',
  mutedText: '#a1a1a1',  // 보조 글자
  video: '#000000',
  accent: '#93c5fd',     // 눈 방향 화살표·데모 안내 (= --chart-1)
};

/** 상태색 — 시선 인식 테스트(장치 점검) 화면에서만 사용. 측정값 화면은 중립 */
export const STATUS_COLORS = {
  ok: '#4ade80',
  warn: '#fbbf24',
  bad: '#ff6467',
  idle: '#a1a1a1',
};

/** 그래프 색 (= Basecoat --chart-*) */
export const SERIES_COLORS = {
  rate: '#93c5fd',
  volume: '#3b82f6',
  pitch: '#93c5fd',
  gazeIn: '#2563eb',
  gazeOut: '#a1a1a1',
  gazeNone: '#262626',
  yaw: '#93c5fd',
  pitchAngle: '#3b82f6',
};
