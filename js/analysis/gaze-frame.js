// MediaPipe 원시 결과 → 측정 프레임. 영상 시각·새 프레임 여부·눈별 사용 가능 여부·제외 사유를 함께 담습니다.
import { GAZE } from '../config.js';
import { headAnglesFromMatrix } from './gaze-logic.js';
import { SIDES, eyeGeometry, perEyeBlendshapes, eyeState } from './eye-signal.js';

const ZERO = { down: 0, up: 0, left: 0, right: 0 };
const DIRS = ['down', 'up', 'left', 'right'];

/** 영상 프레임이 새것인지, 오래되어 판정에 쓰면 안 되는지 */
export function frameFreshness({ videoTime, lastVideoTime, nowMs, lastFreshMs, staleMs = GAZE.staleMs }) {
  if (videoTime !== lastVideoTime) return { fresh: true, stale: false, ageMs: 0 };
  const ageMs = Math.max(0, nowMs - lastFreshMs);
  return { fresh: false, stale: ageMs > staleMs, ageMs };
}

const std = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

/**
 * 프레임 해석기. 눈별 홍채 흔들림을 보려고 최근 프레임 몇 개를 기억합니다.
 * @param {() => object|null} getBase  개인 기준 { aperture:{L,R} } (보정 후에 생김)
 */
export function createGazeFrameBuilder(getBase = () => null) {
  const hist = { L: [], R: [] };
  const JITTER_N = 5;

  function remember(side, iris, t) {
    const h = hist[side];
    if (h.length && t - h[h.length - 1].t > GAZE.gapResetSec * 1000) h.length = 0;
    if (iris) h.push({ t, x: iris.x, y: iris.y });
    while (h.length > JITTER_N) h.shift();
    return h.length >= JITTER_N && Math.max(std(h.map((p) => p.x)), std(h.map((p) => p.y))) > GAZE.irisJitter;
  }

  return {
    reset() { hist.L.length = 0; hist.R.length = 0; },
    /**
     * @param {{ landmarks?:object[]|null, matrix?:number[]|null, blendshapes?:object[]|null, nowMs:number, fresh?:boolean, error?:boolean }} raw
     */
    build(raw) {
      const t = raw.nowMs;
      const frame = { t, fresh: raw.fresh !== false, ageMs: 0 };
      if (raw.error) return { ...frame, face: null, landmarks: null, quality: { reason: 'detect-error', eyes: { L: 'missing', R: 'missing' } } };
      const lm = raw.landmarks;
      if (!lm || !raw.matrix) {
        this.reset();
        return { ...frame, face: null, landmarks: null, quality: { reason: 'no-face', eyes: { L: 'missing', R: 'missing' } } };
      }
      if (raw.matrix.length<16 || Array.from(raw.matrix).some(v=>!Number.isFinite(v)) || Math.hypot(raw.matrix[0],raw.matrix[1],raw.matrix[2])<1e-6) return {...frame,face:null,landmarks:null,quality:{reason:'detect-error',eyes:{L:'missing',R:'missing'}}};
      const { yaw, pitch } = headAnglesFromMatrix(Array.from(raw.matrix));
      const blend = perEyeBlendshapes(raw.blendshapes);
      const base = getBase();
      const eyes = {}, states = {};
      for (const side of SIDES) {
        const geom = eyeGeometry(lm, side, GAZE.flipIrisX, raw.aspect ?? 1);
        let state = eyeState(geom, blend[side], base?.aperture ? { aperture: base.aperture[side] } : null);
        const jitter = remember(side, state === 'ok' ? geom.iris : null, t);
        if (state === 'ok' && jitter) state = 'unstable';
        eyes[side] = { blend: blend[side], aperture: geom?.aperture ?? null, width: geom?.width ?? null, iris: geom?.iris ?? null, center: geom?.center ?? null, state };
        states[side] = state;
      }
      if(raw.imageHeight && Math.max(eyes.L.width??0,eyes.R.width??0)*raw.imageHeight<GAZE.minEyeWidthPx) return {...frame,face:null,landmarks:lm,quality:{reason:'face-small',eyes:states}};
      // 한쪽 눈이 훨씬 작게 보이면(손 가림·옆모습) 그 눈은 믿기 어려움
      const [wl, wr] = [eyes.L.width, eyes.R.width];
      if (wl && wr) {
        if (wl < wr * GAZE.eyeMinWidthRatio && states.L === 'ok') states.L = eyes.L.state = 'unstable';
        if (wr < wl * GAZE.eyeMinWidthRatio && states.R === 'ok') states.R = eyes.R.state = 'unstable';
      }
      const usable = SIDES.filter((s) => states[s] === 'ok');
      const pick = usable.length ? usable : SIDES; // 모두 불확실하면 이전 형식 값만 평균(판정에는 쓰지 않음)
      const eye = Object.fromEntries(DIRS.map((k) => [k, pick.reduce((a, s) => a + (eyes[s].blend[k] ?? 0), 0) / pick.length]));
      const cL = eyes.L.center, cR = eyes.R.center;
      const size = cL && cR ? Math.hypot(cL.x - cR.x, cL.y - cR.y) : null;
      return { ...frame, face: { yaw, pitch, eye: raw.blendshapes ? eye : { ...ZERO }, eyes, size, blendAvailable:!!raw.blendshapes?.length }, landmarks: lm,
        quality: { reason: null, eyes: states } };
    },
  };
}
