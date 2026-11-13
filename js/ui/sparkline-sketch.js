// p5 인스턴스: 최근 10초 음높이 흐름(반음 단위)
const COLORS = { ok: '#73bf69', warn: '#ff9830', bad: '#f2495c', idle: '#8e8e9e' };
const RANGE_ST = 8; // 위아래 ±8반음까지 표시

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
      p.stroke('#2a2d35'); p.strokeWeight(1);
      p.line(0, p.height / 2, p.width, p.height / 2);
      if (!points.length) return;
      const ref = refHz ?? points.map((x) => x.hz).sort((a, b) => a - b)[Math.floor(points.length / 2)];
      p.noFill(); p.stroke(COLORS[status] ?? COLORS.idle); p.strokeWeight(2);
      let prev = null;
      for (const pt of points) {
        const x = p.map(pt.t, now - windowSec, now, 0, p.width);
        const st = Math.max(-RANGE_ST, Math.min(RANGE_ST, 12 * Math.log2(pt.hz / ref)));
        const y = p.map(st, -RANGE_ST, RANGE_ST, p.height - 2, 2);
        if (prev && pt.t - prev.t < 0.35) p.line(prev.x, prev.y, x, y);
        else p.point(x, y);
        prev = { t: pt.t, x, y };
      }
    };
  });
}
