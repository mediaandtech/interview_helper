// p5 인스턴스: 좌우 반전된 웹캠 영상 + 얼굴 점 + 시선 방향 화살표
const COLORS = { ok: '#73bf69', warn: '#ff9830', bad: '#f2495c', idle: '#8e8e9e' };
const NOSE = 1;
const ARROW = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/**
 * @param {HTMLElement} parentEl
 * @param {() => { video: HTMLVideoElement|null, landmarks: {x,y}[]|null, status: string, dir: string }} getState
 */
export function createWebcamSketch(parentEl, getState) {
  return new p5((p) => {
    let fit = { x: 0, y: 0, w: 0, h: 0 };

    const size = () => [Math.max(10, parentEl.clientWidth), Math.max(10, parentEl.clientHeight)];

    p.setup = () => {
      const [w, h] = size();
      p.createCanvas(w, h).parent(parentEl);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(30);
    };

    p.windowResized = () => { const [w, h] = size(); p.resizeCanvas(w, h); };

    p.draw = () => {
      const st = getState();
      p.background('#0b0c0e');
      const v = st.video;
      if (v && v.videoWidth) {
        // 영역을 꽉 채우도록(cover) 맞춘 뒤 좌우 반전해서 그림
        const s = Math.max(p.width / v.videoWidth, p.height / v.videoHeight);
        fit = { w: v.videoWidth * s, h: v.videoHeight * s };
        fit.x = (p.width - fit.w) / 2; fit.y = (p.height - fit.h) / 2;
        const ctx = p.drawingContext;
        ctx.save();
        ctx.translate(p.width, 0); ctx.scale(-1, 1);
        ctx.drawImage(v, fit.x, fit.y, fit.w, fit.h);
        ctx.restore();
      } else {
        p.noStroke(); p.fill('#8e8e9e'); p.textAlign(p.CENTER, p.CENTER); p.textSize(14);
        p.text('카메라를 사용할 수 없어요', p.width / 2, p.height / 2);
      }

      const col = COLORS[st.status] ?? COLORS.idle;
      if (st.landmarks) {
        const X = (pt) => p.width - (fit.x + pt.x * fit.w); // 반전
        const Y = (pt) => fit.y + pt.y * fit.h;
        p.noStroke();
        const c = p.color(col); c.setAlpha(110); p.fill(c);
        for (let i = 0; i < st.landmarks.length; i += 2) p.circle(X(st.landmarks[i]), Y(st.landmarks[i]), 2);

        const a = ARROW[st.dir];
        if (a) {
          const nx = X(st.landmarks[NOSE]), ny = Y(st.landmarks[NOSE]);
          const L = Math.min(p.width, p.height) * 0.12;
          const tx = nx + a[0] * L, ty = ny + a[1] * L;
          p.stroke(col); p.strokeWeight(3);
          p.line(nx, ny, tx, ty);
          p.push(); p.translate(tx, ty); p.rotate(Math.atan2(a[1], a[0]));
          p.noStroke(); p.fill(col); p.triangle(0, 0, -10, -6, -10, 6); p.pop();
        }
      }
    };
  });
}
