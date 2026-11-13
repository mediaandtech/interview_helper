// 게이지 위치 계산 (화면 그리기와 분리된 순수 함수)
import { UI } from '../config.js';

/** 값 → 게이지 위 위치(0~100%) */
export function gaugePercent(value, min, max) {
  if (value == null || max <= min) return null;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/** 속도 게이지 전체 범위: 목표 범위 양옆으로 rateGaugePad 만큼 */
export function rateGaugeRange(settings) {
  return { min: settings.rateMin - UI.rateGaugePad, max: settings.rateMax + UI.rateGaugePad };
}
