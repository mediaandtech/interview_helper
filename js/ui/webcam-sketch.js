// p5 인스턴스: 좌우 반전된 웹캠 영상 + 얼굴 점(옅게) + 고개 화살표(굵게) + 눈 방향(작게)
// 얼굴 위 그래픽은 최소한으로: 고개 방향 1개, 눈 방향 2개, 점은 1/4만.
import { STATUS_COLORS, THEME } from '../config.js';

const NOSE = 1;
const IRIS = [468, 473];
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const VIRTUAL = { w: 640, h: 480 }; // 영상이 없을 때(데모) 기준 크기

/**
 * @param {HTMLElement} parentEl
 * @param {() => {
 *   video: HTMLVideoElement|null, landmarks: {x,y}[]|null, status: string,
 *   head?: {ok:boolean, dir:string}, eye?: {ok:boolean, dir:string},
 *   grid?: {col:number,row:number}|null, demo?: boolean }} getState
 */
export function createWebcamSketch(parentEl, getState) {
  return new p5((p) => {
    const size = () => [Math.max(10, parentEl.clientWidth), Math.max(10, parentEl.clientHeight)];

    p.setup = () => {
      const [w, h] = size();
      p.createCanvas(w, h).parent(parentEl);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(30);
    };
    p.windowResized = () => { const [w, h] = size(); p.resizeCanvas(w, h); };

    function arrow(x, y, dir, len, weight, col) {
      const v = VEC[dir];
      if (!v) return;
      const tx = x + v[0] * len, ty = y + v[1] * len;
      p.stroke(col); p.strokeWeight(weight); p.line(x, y, tx, ty);
      p.push(); p.translate(tx, ty); p.rotate(Math.atan2(v[1], v[0]));
      p.noStroke(); p.fill(col); p.triangle(0, 0, -weight * 3.2, -weight * 2, -weight * 3.2, weight * 2); p.pop();
    }

    function drawGrid(cell) {
      const s = 54, x0 = p.width - s - 12, y0 = 36;
      p.noFill(); p.stroke(THEME.border); p.strokeWeight(1);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) p.rect(x0 + (i * s) / 3, y0 + (j * s) / 3, s / 3, s / 3);
      if (cell) {
        p.noStroke(); p.fill(cell.col === 0 && cell.row === 0 ? STATUS_COLORS.ok : STATUS_COLORS.bad);
        p.rect(x0 + ((cell.col + 1) * s) / 3 + 2, y0 + ((cell.row + 1) * s) / 3 + 2, s / 3 - 4, s / 3 - 4);
      }
      p.noStroke(); p.fill(THEME.muted); p.textSize(10); p.textAlign(p.CENTER, p.TOP); p.text('3×3 시선', x0 + s / 2, y0 + s + 3);
    }

    p.draw = () => {
      const st = getState();
      p.background(THEME.video);
      const v = st.video;
      const vw = v?.videoWidth || VIRTUAL.w, vh = v?.videoHeight || VIRTUAL.h;
      // 자르지 않고 전체가 보이게(contain). 꽉 채우면(cover) 넓은 칸에서 얼굴이 잘려 나감
      const sc = Math.min(p.width / vw, p.height / vh);
      const fit = { w: vw * sc, h: vh * sc };
      fit.x = (p.width - fit.w) / 2; fit.y = (p.height - fit.h) / 2;

      if (v && v.videoWidth) {
        const ctx = p.drawingContext;
        ctx.save(); ctx.translate(p.width, 0); ctx.scale(-1, 1);
        ctx.drawImage(v, fit.x, fit.y, fit.w, fit.h);
        ctx.restore();
      } else if (!st.demo) {
        p.noStroke(); p.fill(THEME.muted); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
        p.text('카메라를 사용할 수 없어요 · 시선 측정 대기', p.width / 2, p.height / 2);
      }

      const col = STATUS_COLORS[st.status] ?? STATUS_COLORS.idle;
      const lm = st.landmarks;
      if (lm) {
        const X = (pt) => p.width - (fit.x + pt.x * fit.w);
        const Y = (pt) => fit.y + pt.y * fit.h;
        const dot = p.color(col); dot.setAlpha(st.demo ? 150 : 90);
        p.noStroke(); p.fill(dot);
        for (let i = 0; i < lm.length; i += st.demo ? 1 : 4) p.circle(X(lm[i]), Y(lm[i]), st.demo ? 3 : 2);

        const L = Math.min(p.width, p.height);
        // 고개: 코에서 굵은 화살표(정면이면 작은 초록 원)
        const nx = X(lm[NOSE]), ny = Y(lm[NOSE]);
        if (st.head && !st.head.ok) arrow(nx, ny, st.head.dir, L * 0.13, 4, col);
        else { p.noFill(); p.stroke(STATUS_COLORS.ok); p.strokeWeight(2); p.circle(nx, ny, 12); }
        // 눈: 두 눈동자에서 가는 화살표(고개와 구분되는 색)
        if (st.eye && !st.eye.ok && lm[IRIS[0]] && lm[IRIS[1]]) {
          for (const i of IRIS) arrow(X(lm[i]), Y(lm[i]), st.eye.dir, L * 0.05, 2, THEME.accent);
        }
      }
      if (st.demo) {
        p.noStroke(); p.fill(THEME.accent); p.textAlign(p.CENTER, p.BOTTOM); p.textSize(16); p.textStyle(p.BOLD);
        p.text('데모 모드 · 가상 얼굴입니다', p.width / 2, p.height - 34);
        p.fill(THEME.muted); p.textSize(12); p.textStyle(p.NORMAL);
        p.text('내 얼굴로 연습하려면 위쪽 [실제 카메라로 전환]을 누르세요', p.width / 2, p.height - 14);
      }
      if (st.grid !== undefined) drawGrid(st.grid);
    };
  });
}
