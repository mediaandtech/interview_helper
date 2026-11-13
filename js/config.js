// 모든 임계값과 프리셋을 이 파일 한 곳에서 관리합니다.
// 팀원은 코드를 몰라도 여기 숫자만 바꿔서 조정할 수 있습니다.

/** 발표 유형별 기준값 */
export const PRESETS = {
  class:     { label: '수업 발표',   rateMin: 270, rateMax: 330, gazeTarget: 0.80 },
  interview: { label: '면접 답변',   rateMin: 260, rateMax: 320, gazeTarget: 0.85 },
  pitch:     { label: '피칭·공모전', rateMin: 290, rateMax: 350, gazeTarget: 0.80 },
};

export const DEFAULT_DURATION_SEC = 300;

/** 시선 판정 */
export const GAZE = {
  yawDeg: 15,          // 정면 기준 대비 좌우 고개 허용 각도
  pitchDeg: 12,        // 정면 기준 대비 위아래 고개 허용 각도
  eyeThreshold: 0.5,   // 눈 방향 blendshape(기준 대비) 임계값
  forgiveSec: 1.5,     // 이보다 짧은 이탈은 점수에서 봐줌
  warnSec: 1.5,        // 연속 이탈이 이만큼이면 주황
  badSec: 3,           // 연속 이탈이 이만큼이면 빨강 + 이벤트 기록
  recoverSec: 0.5,     // 정면 복귀 후 초록으로 돌아오기까지
  ratioWindowSec: 30,  // "정면 87%" 계산 구간
  warnMargin: 0.15,    // 목표보다 이만큼 낮을 때까지 주황
  flipYaw: false,      // 시선 테스트에서 좌우가 반대로 나오면 true
  flipPitch: false,    // 시선 테스트에서 위아래가 반대로 나오면 true
};

/** 목소리 크기 (보정 때 잰 기준 음량 대비 dB) */
export const AUDIO = {
  okRangeDb: [-6, 8],
  warnRangeDb: [-10, 12],
  silenceBelowBaseDb: 18, // 기준보다 이만큼 작으면 '말 안 함'
  fftSize: 2048,
  calibAboveNoiseDb: 10, // 보정 때 주변 소음보다 이만큼 커야 목소리로 인정
  calibMinFrames: 30,
};

/** 음성 높낮이 */
export const PITCH = {
  minHz: 75,
  maxHz: 400,
  monotoneSt: 1.5, // 반음 표준편차가 이보다 작으면 '단조'
  richSt: 4,       // 이보다 크면 '풍부'
  windowSec: 10,
};

/** 말하기 속도 */
export const RATE = {
  windowSec: 10,
  correctionWindowSec: 30,
  warnMarginSpm: 30,          // 목표 범위 밖 이 정도까지는 주황
  minSpeakingSecForRate: 3,   // 최근 구간에 이만큼 말해야 속도 표시
  correctionClamp: [0.5, 2.0],
  recognitionCoverageSec: 20, // 마지막 인식이 끝나기 이만큼 전 이내여야 리포트 평균에 인식값 사용
};

/** 소리 크기 봉우리로 음절을 추정할 때 */
export const SYLLABLE = {
  minGapMs: 120,
  riseDb: 3,
};

/** 발표 시간 */
export const TIME = {
  warnRemainingSec: 60,
};

/** 종합 점수 */
export const SCORE = {
  weights: { gaze: 35, rate: 20, volume: 20, time: 15, pitch: 10 },
};

/** 리포트 */
export const REPORT = {
  minSessionSec: 10,
  quietSegmentSec: 5,
  rateSegmentSec: 10,
};

/** 보정 단계 */
export const CALIB = {
  faceSec: 2,
  readSec: 4,
};

/** 화면 */
export const UI = {
  hysteresisSec: 1,
  sampleHz: 10,
  countdownSec: 3,
  rateGaugePad: 90,   // 속도 게이지: 목표 범위 양옆으로 이만큼(음절/분) 더 보여 줌
  volumeGaugeDb: 15,  // 크기 게이지: 기준 대비 ±15 dB
};

/** 디자인 토큰 — css/tokens.css 와 같은 값이어야 합니다(p5 그림용). tests/tokens.test.js 가 확인 */
export const THEME = {
  bg: '#111820',
  panel: '#1d2935',
  panel2: '#243241',
  border: '#2c3b4a',
  text: '#d8dee9',
  muted: '#9aa5b4',   // 보조 글자: 모든 면 위에서 4.5:1 이상
  accent: '#5794f2',
  accentBg: '#16304f',
  badBg: '#3a1d26',
  video: '#0a0f14',
};

/** 상태색: 장식이 아니라 의미 */
export const STATUS_COLORS = {
  ok: '#73bf69',
  warn: '#ff9830',
  bad: '#f2495c',
  idle: '#9aa5b4',
};

/** 그래프 보조색 */
export const SERIES_COLORS = {
  rate: '#73bf69',
  volume: '#5794f2',
  pitch: '#b877d9',
  yaw: '#5794f2',
  pitchAngle: '#fade2a',
};
