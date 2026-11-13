// 상태가 holdSec 이상 연속으로 유지될 때만 표시 상태를 바꿔 깜빡임을 막습니다.
import { UI } from '../config.js';

export function createHysteresis(holdSec = UI.hysteresisSec) {
  let shown = null;
  let pending = null;
  let pendingSince = 0;
  return {
    update(raw, tSec) {
      if (shown === null) { shown = raw; return shown; }
      if (raw === shown) { pending = null; return shown; }
      if (raw !== pending) { pending = raw; pendingSince = tSec; }
      if (tSec - pendingSince >= holdSec) { shown = raw; pending = null; }
      return shown;
    },
  };
}
