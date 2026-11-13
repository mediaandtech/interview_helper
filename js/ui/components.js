// 재사용 화면 부품 (HTML/CSS, 캔버스 없음)
import { gaugePercent } from '../util/gauge.js';

/**
 * 범위 밴드 게이지:  왼쪽 라벨 ─── [ 참고 범위 ] ─── 오른쪽 라벨
 * @param {HTMLElement} el  비어 있는 컨테이너
 * @param {{min:number, max:number, lo:number, hi:number, left:string, right:string}} opt
 */
export function createGauge(el, opt) {
  el.classList.add('gauge');
  el.innerHTML = `
    <div class="g-track">
      <div class="g-band"></div>
      <div class="g-mark" hidden></div>
    </div>
    <div class="g-ends"><span>${opt.left}</span><span>참고</span><span>${opt.right}</span></div>`;
  const band = el.querySelector('.g-band');
  const mark = el.querySelector('.g-mark');
  const ends = el.querySelectorAll('.g-ends span');

  function setRange(o) {
    Object.assign(opt, o);
    const a = gaugePercent(opt.lo, opt.min, opt.max), b = gaugePercent(opt.hi, opt.min, opt.max);
    band.style.left = `${a}%`; band.style.width = `${b - a}%`;
    ends[1].style.left = `${(a + b) / 2}%`;
  }
  setRange({});

  return {
    setRange,
    /** value가 null이면 마커를 숨깁니다(측정 대기) */
    update(value, status) {
      const p = gaugePercent(value, opt.min, opt.max);
      if (p == null) { mark.hidden = true; return; }
      mark.hidden = false;
      mark.style.left = `${p}%`;
      if (mark.dataset.status !== status) mark.dataset.status = status;
    },
  };
}

/** 진행 막대 */
export function createProgress(el) {
  el.classList.add('progressbar');
  el.innerHTML = '<div class="pb-fill"></div>';
  const fill = el.firstElementChild;
  return {
    update(fraction, status) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%`;
      if (fill.dataset.status !== status) fill.dataset.status = status;
    },
  };
}
