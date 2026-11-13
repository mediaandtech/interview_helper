// 데모 모드: 실제 센서와 같은 모양의 가상 데이터를 만듭니다.
// 카메라·마이크 없이도 정면/이탈, 작음/큼, 느림/빠름, 단조, 쉬는 중을 모두 보여 줄 수 있습니다.
import { isSpeaking } from '../analysis/audio-math.js';

/** 시나리오(반복). sec 동안 해당 상태를 보여 줍니다. */
export const DEMO_SCENES = [
  { name: 'normal',    sec: 8, label: '정상 발표' },
  { name: 'lookDown',  sec: 6, label: '원고 보기(고개 숙임)', pitch: -22 },
  { name: 'quiet',     sec: 7, label: '목소리 작아짐', level: -11 },
  { name: 'fast',      sec: 12, label: '말이 빨라짐', rate: 6.8 },
  { name: 'eyesRight', sec: 5, label: '눈만 옆으로', eye: { right: 0.85 } },
  { name: 'monotone',  sec: 7, label: '억양 단조', pitchVar: 0.25 },
  { name: 'pause',     sec: 4, label: '잠시 쉼', silent: true },
  { name: 'headLeft',  sec: 5, label: '고개 돌림', yaw: -24 },
  { name: 'loud',      sec: 6, label: '목소리 커짐', level: 11 },
  { name: 'slow',      sec: 12, label: '말이 느려짐', rate: 3.6 },
];
const TOTAL = DEMO_SCENES.reduce((a, s) => a + s.sec, 0);
const BASE = { rate: 5, level: 0, pitchVar: 2.5, yaw: 0, pitch: 0, eye: {}, silent: false };

/** 데모용 보정값 */
export const DEMO_CALIB = { baseDb: -25, baseHz: 180, yaw0: 0, pitch0: 0, eye0: { down: 0, up: 0, left: 0, right: 0 } };

/** 시각(초) → 장면 */
export function demoScene(tSec) {
  let t = ((tSec % TOTAL) + TOTAL) % TOTAL;
  for (const s of DEMO_SCENES) {
    if (t < s.sec) return { ...BASE, ...s, at: t };
    t -= s.sec;
  }
  return { ...BASE, ...DEMO_SCENES[0], at: 0 };
}

function clockSec(clock, originMs) { return (clock() - originMs) / 1000; }

/**
 * 마이크 대신 쓰는 가상 오디오. startAudio()와 같은 모양 + reset(originMs)
 * @param {() => number} clock  ms 단위 현재 시각
 */
export function createDemoAudio(clock = () => performance.now(), originMs = 0) {
  let origin = originMs;
  return {
    demo: true,
    stream: null,
    reset(ms) { origin = ms; },
    read(baseDb) {
      const t = clockSec(clock, origin);
      const sc = demoScene(t);
      const base = baseDb ?? DEMO_CALIB.baseDb;
      if (sc.silent || t < 0) return { db: -70, speaking: false, hz: null };
      // 음절마다 한 번 솟는 음량 포락선(평균은 base + level)
      const env = 7 * Math.abs(Math.sin(Math.PI * sc.rate * t)) - 4.5;
      const db = base + sc.level + env;
      const speaking = isSpeaking(db, base);
      const st = sc.pitchVar * Math.sin(1.3 * t) + sc.pitchVar * 0.4 * Math.sin(3.1 * t);
      return { db, speaking, hz: speaking ? DEMO_CALIB.baseHz * 2 ** (st / 12) : null };
    },
    stop() {},
  };
}

// ---- 가상 얼굴 점 ----
function faceShape() {
  const pts = [];
  const ring = (cx, cy, rx, ry, n, z) => {
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a), z]); }
  };
  ring(0, 0, 1, 1.25, 40, 0);          // 얼굴 윤곽
  ring(-0.38, 0.3, 0.2, 0.09, 14, 0.25); // 눈(화면 왼쪽)
  ring(0.38, 0.3, 0.2, 0.09, 14, 0.25);  // 눈(화면 오른쪽)
  ring(0, -0.55, 0.32, 0.1, 16, 0.25);   // 입
  for (let i = 0; i < 6; i++) pts.push([0, 0.25 - i * 0.12, 0.3 + i * 0.05]); // 콧등
  return pts;
}
const SHAPE = faceShape();
const NOSE_TIP = [0, -0.3, 0.6];
const IRIS = { 468: [-0.38, 0.3, 0.28], 473: [0.38, 0.3, 0.28] };

function project([u, v, z], yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = u * cy + z * sy;
  const z1 = -u * sy + z * cy;
  const y1 = v * cp + z1 * sp;
  // 화면에서 좌우 반전되어 그려지므로 이미지 좌표는 반대로
  return { x: 0.5 - x1 * 0.13, y: 0.48 - y1 * 0.16 };
}

/**
 * 카메라 대신 쓰는 가상 얼굴. initGaze()와 같은 모양 + reset(originMs)
 */
export function createDemoGaze(clock = () => performance.now(), originMs = 0) {
  let origin = originMs;
  return {
    demo: true,
    video: null,
    reset(ms) { origin = ms; },
    detect() {
      const t = clockSec(clock, origin);
      const sc = demoScene(Math.max(0, t));
      const yaw = sc.yaw + 4 * Math.sin(0.6 * t);
      const pitch = sc.pitch + 3 * Math.sin(0.9 * t);
      const eye = { down: 0.05, up: 0, left: 0, right: 0, ...sc.eye };
      const yr = (yaw * Math.PI) / 180, pr = (pitch * Math.PI) / 180;
      const lm = new Array(478);
      for (let i = 0; i < 478; i++) lm[i] = project(SHAPE[i % SHAPE.length], yr, pr);
      lm[1] = project(NOSE_TIP, yr, pr);
      const shift = [(eye.right - eye.left) * 0.09, (eye.up - eye.down) * 0.05, 0];
      for (const [i, p] of Object.entries(IRIS)) lm[i] = project([p[0] + shift[0], p[1] + shift[1], p[2]], yr, pr);
      return { t: clock(), fresh: true, ageMs: 0, face: { yaw, pitch, eye }, landmarks: lm, quality: { reason: null, eyes: { L: 'ok', R: 'ok' } } };
    },
    setBase() {},
    stop() {},
  };
}
