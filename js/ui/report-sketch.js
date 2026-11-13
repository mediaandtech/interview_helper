// p5 인스턴스: 같은 시간축에 쌓은 4줄 그래프(시선 / 속도 / 크기 / 높낮이) + 마우스 툴팁
import { THEME, SERIES_COLORS } from '../config.js';
import { GAZE_REASON_TEXT } from '../analysis/gaze-logic.js';
import { nearestSample } from '../analysis/review.js';
import { formatStamp } from '../util/time.js';

const C = { grid: THEME.border, muted: THEME.mutedText, text: THEME.text, panel: THEME.card,
  rate: SERIES_COLORS.rate, volume: SERIES_COLORS.volume, pitch: SERIES_COLORS.pitch,
  gazeIn: SERIES_COLORS.gazeIn, gazeOut: SERIES_COLORS.gazeOut, gazeNone: SERIES_COLORS.gazeNone,
  band: 'rgba(250,250,250,0.08)' }; // 참고 범위 음영: 위치만 보여 주는 중립 회색
const LANES = [
  { key: 'gaze', label: '시선', h: 0.6 },
  { key: 'head', label: '고개', h: 0.4 },
  { key: 'eye', label: '눈', h: 0.4 },
  { key: 'rate', label: '속도', h: 1 },
  { key: 'vol', label: '크기', h: 1 },
  { key: 'pitch', label: '높낮이', h: 1 },
];
const LEFT = 64, RIGHT = 12, TOP = 8, BOTTOM = 26, GAP = 8;
const DIR = { down: '아래', up: '위', left: '왼쪽', right: '오른쪽', none: '얼굴 없음', front: '정면' };

/**
 * @param {HTMLElement} parentEl
 * @param {object[]} samples
 * @param {object} report  buildReview 결과
 * @param {object} settings
 */
export function createReportChart(parentEl, samples, report, settings, onSeek = () => {}) {
  const dur = Math.max(0.1, report.durationSec);
  const speakHz = samples.filter((s) => s.hz).map((s) => s.hz).sort((a, b) => a - b);
  const refHz = speakHz.length ? speakHz[Math.floor(speakHz.length / 2)] : 200;
  const rates = samples.map((s) => s.rate).filter((r) => r != null);
  const rateMax = Math.max(settings.rateMax + 80, ...rates);

  const ranges = report.intervals.map(e => ({ a: e.start, b: e.start + e.dur, text: e.label }));

  return new p5((p) => {
    const size = () => [Math.max(10, parentEl.clientWidth), Math.max(160, parentEl.clientHeight)];
    let lanes = [];

    function layout() {
      const total = LANES.reduce((a, l) => a + l.h, 0);
      const avail = p.height - TOP - BOTTOM - GAP * (LANES.length - 1);
      let y = TOP;
      lanes = LANES.map((l) => { const h = (avail * l.h) / total; const o = { ...l, y, h }; y += h + GAP; return o; });
    }
    const X = (t) => LEFT + (t / dur) * (p.width - LEFT - RIGHT);
    const lane = (k) => lanes.find((l) => l.key === k);

    function series(key, value, lo, hi, color) {
      const l = lane(key);
      p.noFill(); p.stroke(color); p.strokeWeight(1.5);
      let prev = null;
      for (const s of samples) {
        const v = value(s);
        if (v == null) { prev = null; continue; }
        const y = p.map(Math.max(lo, Math.min(hi, v)), lo, hi, l.y + l.h - 2, l.y + 2);
        const x = X(s.t);
        if (prev && s.t - prev.t < 0.35) p.line(prev.x, prev.y, x, y);
        prev = { t: s.t, x, y };
      }
    }
    function band(key, a, b, lo, hi) {
      const l = lane(key);
      const y1 = p.map(b, lo, hi, l.y + l.h, l.y), y2 = p.map(a, lo, hi, l.y + l.h, l.y);
      p.noStroke(); p.fill(C.band); p.rect(LEFT, y1, p.width - LEFT - RIGHT, y2 - y1);
    }

    function drawStatic() {
      p.background(C.panel);
      p.textFont('sans-serif');
      for (const l of lanes) {
        p.noStroke(); p.fill(C.muted); p.textSize(11); p.textAlign(p.RIGHT, p.CENTER);
        p.text(l.label, LEFT - 10, l.y + l.h / 2);
        p.stroke(C.grid); p.strokeWeight(1); p.noFill(); p.rect(LEFT, l.y, p.width - LEFT - RIGHT, l.h);
      }
      // 유효 시간만 칠하고 프레임 공백을 다음 표본까지 늘리지 않습니다.
      for(const [key,read] of [['gaze',s=>s.frontal],['head',s=>s.head?.yaw==null?null:s.head.ok],['eye',s=>['closed','uncertain','none'].includes(s.eye?.dir)||!s.eye?null:s.eye.ok]]) {
        const g=lane(key); p.noStroke();
        for(const s of report.gazeTimeline??[]) {
          const value=read(s),x=X(s.start),w=Math.max(.5,X(s.end)-x);
          p.fill(value==null?C.gazeNone:value?C.gazeIn:C.gazeOut);
          p.rect(x,g.y+1,w,g.h-2);
        }
      }
      // 속도
      band('rate', settings.rateMin, settings.rateMax, 0, rateMax);
      series('rate', (s) => s.rate, 0, rateMax, C.rate);
      // 크기

      series('vol', (s) => (s.speaking ? s.deltaDb : null), -20, 20, C.volume);
      // 높낮이
      series('pitch', (s) => (s.hz ? 12 * Math.log2(s.hz / refHz) : null), -8, 8, C.pitch);
      // 시간축
      const step = dur > 600 ? 120 : dur > 240 ? 60 : dur > 90 ? 30 : 10;
      p.fill(C.muted); p.noStroke(); p.textSize(10); p.textAlign(p.CENTER, p.TOP);
      for (let t = 0; t <= dur; t += step) {
        p.text(formatStamp(t), X(t), p.height - BOTTOM + 6);
        p.stroke(C.grid); p.line(X(t), TOP, X(t), p.height - BOTTOM); p.noStroke();
      }
    }

    let staticImg = null;
    function rebuild() { layout(); drawStatic(); staticImg = p.get(); }

    p.setup = () => {
      const [w, h] = size();
      p.createCanvas(w, h).parent(parentEl);
      p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
      p.frameRate(30);
      rebuild();
    };
    p.windowResized = () => { const [w, h] = size(); p.resizeCanvas(w, h); rebuild(); };

    p.mousePressed = () => {
      if (p.mouseX >= LEFT && p.mouseX <= p.width - RIGHT && p.mouseY >= 0 && p.mouseY <= p.height) onSeek((p.mouseX - LEFT) / (p.width - LEFT - RIGHT) * dur);
    };
    p.draw = () => {
      p.image(staticImg, 0, 0, p.width, p.height);
      const inside = p.mouseX >= LEFT && p.mouseX <= p.width - RIGHT && p.mouseY >= 0 && p.mouseY <= p.height;
      if (!inside || !samples.length) return;
      const t = ((p.mouseX - LEFT) / (p.width - LEFT - RIGHT)) * dur;
      const found=nearestSample(samples,t);
      const s=found && Math.abs(found.t-t)<=.2?found:{};
      const g=report.gazeTimeline?.find(g=>t>=g.start&&t<g.end);
      p.stroke(C.text); p.strokeWeight(1); p.line(p.mouseX, TOP, p.mouseX, p.height - BOTTOM);

      const lines = [
        `${formatStamp(t)} · 시선 ${g?.gazeReason?GAZE_REASON_TEXT[g.gazeReason]??g.gazeReason:g?.frontal == null ? '측정 불확실' : DIR[g.dir] ?? g.dir}`,
        `속도 ${s.rate == null ? '—' : Math.round(s.rate)} · 크기 ${s.speaking && s.deltaDb != null ? `${s.deltaDb >= 0 ? '+' : ''}${s.deltaDb.toFixed(0)}dB` : '쉼'} · ${s.hz ? `${Math.round(s.hz)}Hz` : '—'}`,
      ];
      const hit = ranges.find((r) => t >= r.a && t <= r.b);
      if (hit) lines.push(hit.text);

      p.textSize(12); p.textAlign(p.LEFT, p.TOP);
      const w = Math.min(p.width - 20, Math.max(...lines.map((l) => p.textWidth(l))) + 16);
      const h = lines.length * 17 + 10;
      let x = p.mouseX + 12; if (x + w > p.width - 4) x = p.mouseX - 12 - w;
      const y = Math.min(p.height - h - 4, Math.max(4, p.mouseY - h / 2));
      p.noStroke(); p.fill(0, 0, 0, 220); p.rect(x, y, w, h, 3);
      lines.forEach((l, i) => { p.fill(i === 2 ? C.muted : C.text); p.text(l, x + 8, y + 6 + i * 17, w - 16); });
    };
  });
}
