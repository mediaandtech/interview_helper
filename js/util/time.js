const pad = (n) => String(n).padStart(2, '0');

function split(sec) {
  const s = Math.round(Math.abs(sec));
  return { m: Math.floor(s / 60), s: s % 60 };
}

/** 192 -> '03:12' (카운트다운 표시) */
export function formatClock(sec) {
  const { m, s } = split(sec);
  return `${pad(m)}:${pad(s)}`;
}

/** 97 -> '1:37' (리포트 타임스탬프) */
export function formatStamp(sec) {
  const { m, s } = split(sec);
  return `${m}:${pad(s)}`;
}
