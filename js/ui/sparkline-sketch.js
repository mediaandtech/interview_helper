// p5 인스턴스: 최근 10초 음높이 흐름(반음 단위). 튀는 값은 빼고, 침묵 구간은 끊어서 그립니다.
import { SERIES_COLORS, THEME } from '../config.js';
import { cleanPitch } from '../analysis/audio-math.js';

const RANGE_ST = 8; // 기준 음높이에서 위아래 ±8반음까지 표시
const GAP_SEC = 0.35;

/**
 * @param {HTMLElement} parentEl
 * @param {() => { points: {t:number, hz:number}[], now: number, windowSec: number, refHz: number|null, status: string }} getSeries
 */
export function createSparkline(parentEl, getSeries) {
  return new p5((p) => {
    const size = () => [Math.max(10, parentEl.clientWidth), Math.max(10, parentEl.clientHeight)];
    p.setup = () => {
      const [w, h] = size();
      p.createCanvas(w, h).parent(parentEl);
      p.frameRate(20);
    };
    p.windowResized = () => { const [w, h] = size(); p.resizeCanvas(w, h); };
    p.draw = () => {
      p.clear();
      const { points, now, windowSec, refHz, status } = getSeries();
      // 기준선(내 평소 음높이)
      p.stroke(THEME.border); p.strokeWeight(1);
      p.drawingContext.setLineDash([3, 4]); p.line(0, p.height / 2, p.width, p.height / 2); p.drawingContext.setLineDash([]);
      const pts = cleanPitch(points);
      if (!pts.length) {
        p.noStroke(); p.fill(THEME.mutedText); p.textSize(11); p.textAlign(p.CENTER, p.CENTER);
        p.text('말하면 억양이 그려져요', p.width / 2, p.height / 2 - 10);
        return;
      }
      const ref = refHz ?? pts.map((x) => x.hz).sort((a, b) => a - b)[Math.floor(pts.length / 2)];
      p.noFill(); p.stroke(SERIES_COLORS.pitch); p.strokeWeight(2.2); // 중립: 상태와 무관하게 같은 색
      let prev = null;
      for (const pt of pts) {
        const x = p.map(pt.t, now - windowSec, now, 0, p.width);
        const st = Math.max(-RANGE_ST, Math.min(RANGE_ST, 12 * Math.log2(pt.hz / ref)));
        const y = p.map(st, -RANGE_ST, RANGE_ST, p.height - 3, 3);
        if (prev && pt.t - prev.t < GAP_SEC) p.line(prev.x, prev.y, x, y);
        else p.point(x, y);
        prev = { t: pt.t, x, y };
      }
    };
  });
}
