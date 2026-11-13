// 눈 한쪽씩: 눈꺼풀 열림, 눈 안에서 홍채의 상대 위치, 눈 방향 blendshape.
// 좌우는 '사용자 기준'(사용자의 왼쪽 = 화면을 바라볼 때 왼쪽)입니다. 랜드마크는 좌우 반전 전 이미지 좌표입니다.
import { GAZE } from '../config.js';

/** imgL/imgR: 이미지에서 왼쪽/오른쪽에 있는 눈꼬리 */
export const EYE_POINTS = {
  R: { imgL: 33, imgR: 133, top: 159, bottom: 145, iris: 468 },  // 사용자 오른쪽 눈(이미지 왼쪽)
  L: { imgL: 362, imgR: 263, top: 386, bottom: 374, iris: 473 }, // 사용자 왼쪽 눈(이미지 오른쪽)
};
export const SIDES = ['L', 'R'];

const okPt = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const z = (v) => v + 0;

/**
 * 눈 모서리를 잇는 축 기준으로 정규화(크기·기울기 제거)한 눈 모양.
 * @returns {{ width:number, aperture:number, center:{x,y}, iris:{x:number,y:number}|null }|null}
 *   iris.x: + = 사용자 오른쪽, iris.y: + = 아래 (눈 너비 단위, 눈 중심 기준)
 */
export function eyeGeometry(lm, side, flipX = GAZE.flipIrisX, aspect = 1) {
  const P = EYE_POINTS[side];
  const at = i => { const p=lm?.[i]; return p && { x:p.x*aspect, y:p.y }; };
  const a = at(P.imgL), b = at(P.imgR), top = at(P.top), bot = at(P.bottom), iris = at(P.iris);
  if (![a, b, top, bot].every(okPt)) return null;
  const ux = b.x - a.x, uy = b.y - a.y;
  const w = Math.hypot(ux, uy);
  if (!(w > 1e-4)) return null;
  const u = [ux / w, uy / w], v = [-u[1], u[0]]; // v: 이미지 아래쪽
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const proj = (p) => [((p.x - c.x) * u[0] + (p.y - c.y) * u[1]) / w, ((p.x - c.x) * v[0] + (p.y - c.y) * v[1]) / w];
  const aperture = Math.max(0, proj(bot)[1] - proj(top)[1]);
  let irisPos = null;
  if (okPt(iris)) {
    const [x, y] = proj(iris);
    // 이미지 오른쪽(+x)은 사용자의 왼쪽이므로 부호를 뒤집어 사용자 기준으로
    irisPos = { x: z((flipX ? 1 : -1) * x), y: z(y) };
  }
  return { width: w, aperture, center: c, iris: irisPos };
}

/** 눈별 blendshape → { L:{down,up,left,right,blink}, R:{...} } (사용자 기준 방향) */
export function perEyeBlendshapes(categories) {
  const m = Object.fromEntries((categories ?? []).map((c) => [c.categoryName, c.score]));
  const g = (k) => m[k] ?? 0;
  return {
    L: { down: g('eyeLookDownLeft'), up: g('eyeLookUpLeft'), left: g('eyeLookOutLeft'), right: g('eyeLookInLeft'), blink: g('eyeBlinkLeft') },
    R: { down: g('eyeLookDownRight'), up: g('eyeLookUpRight'), left: g('eyeLookInRight'), right: g('eyeLookOutRight'), blink: g('eyeBlinkRight') },
  };
}

/**
 * 한쪽 눈의 사용 가능 여부.
 * - 'closed': 눈꺼풀이 좁고 감김 신호가 있음(아래 보기 신호가 더 크면 감김으로 보지 않음), 또는 아주 좁음
 * - 'unstable': 홍채 없음·눈 밖
 * - 'missing': 눈 랜드마크 없음
 * @param base  개인 기준 { aperture } (보정 때 눈 뜬 정도), 없으면 절대 기준
 */
export function eyeState(geom, blend, base = null) {
  if (!geom) return 'missing';
  const narrowAt = base?.aperture ? base.aperture * GAZE.eyeClosedRatio : GAZE.eyeClosedAbs;
  const narrow = geom.aperture < narrowAt;
  const blink = blend?.blink ?? 0;
  if (geom.aperture < narrowAt * 0.4) return 'closed';
  if (narrow && blink >= GAZE.blinkScore && (blend?.down ?? 0) < blink) return 'closed';
  if (!geom.iris) return 'unstable';
  if (Math.abs(geom.iris.x) > GAZE.irisMaxOffset || Math.abs(geom.iris.y) > GAZE.irisMaxOffset) return 'unstable';
  return 'ok';
}
