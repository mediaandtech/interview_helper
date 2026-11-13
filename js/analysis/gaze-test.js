// 시선 인식 점검: 단계별로 정해진 방향을 보게 하고, 감지 결과가 맞는지 채점·진단합니다.
import { GAZE } from '../config.js';

const WORD = { left: '왼쪽', right: '오른쪽', up: '위', down: '아래', none: '—' };

/** 점검 순서. 화면 기준 방향(거울처럼 보이는 내 모습 기준) */
export const GAZE_TEST_STEPS = [
  { id: 'front',       kind: 'front',            title: '정면 보기',       say: '카메라 렌즈를 똑바로 보세요' },
  { id: 'head-left',   kind: 'head', dir: 'left',  title: '고개 왼쪽',     say: '고개를 화면 왼쪽으로 크게 돌리세요' },
  { id: 'head-right',  kind: 'head', dir: 'right', title: '고개 오른쪽',   say: '고개를 화면 오른쪽으로 크게 돌리세요' },
  { id: 'head-down',   kind: 'head', dir: 'down',  title: '고개 숙이기',   say: '원고를 보듯 고개를 아래로 숙이세요' },
  { id: 'head-up',     kind: 'head', dir: 'up',    title: '고개 들기',     say: '천장을 보듯 고개를 위로 드세요' },
  { id: 'eye-down',    kind: 'eye',  dir: 'down',  title: '눈만 아래',     say: '고개는 그대로, 눈만 아래(키보드)를 보세요' },
  { id: 'eye-left',    kind: 'eye',  dir: 'left',  title: '눈만 왼쪽',     say: '고개는 그대로, 눈만 화면 왼쪽 끝을 보세요' },
  { id: 'eye-right',   kind: 'eye',  dir: 'right', title: '눈만 오른쪽',   say: '고개는 그대로, 눈만 화면 오른쪽 끝을 보세요' },
  { id: 'front-again', kind: 'front',            title: '다시 정면',       say: '다시 카메라 렌즈를 보세요' },
];

export const PASS_PCT = 60;

/** 한 프레임(analyzeGaze 결과 + eyeRaw)이 이 단계의 기대와 맞는지. 얼굴이 없으면 null */
export function frameMatches(frame, step) {
  if (!frame) return false;
  if (step.kind === 'front') return frame.frontal;
  if (step.kind === 'head') return frame.head.dir === step.dir;
  return frame.head.ok && frame.eye.dir === step.dir; // 눈만: 고개는 정면이어야
}

/** 프레임 → 사람이 읽는 판정 */
export function frameLabel(frame) {
  if (!frame) return '얼굴 없음';
  if (!frame.head.ok) return `고개 ${WORD[frame.head.dir]}`;
  if (!frame.eye.ok) return `눈 ${WORD[frame.eye.dir]}`;
  return '정면';
}

const round1 = (v) => Math.round(v * 10) / 10;

/** 한 단계의 프레임들을 채점 */
export function evaluateStep(frames, step) {
  const n = frames.length || 1;
  const counts = {};
  for (const f of frames) { const l = frameLabel(f); counts[l] = (counts[l] ?? 0) + 1; }
  const detected = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '얼굴 없음';
  const seen = frames.filter(Boolean);
  const avg = (fn) => (seen.length ? round1(seen.reduce((a, f) => a + fn(f), 0) / seen.length) : null);
  const eyeMax = {};
  for (const k of ['down', 'up', 'left', 'right']) eyeMax[k] = seen.length ? round1(Math.max(...seen.map((f) => f.eyeRaw?.[k] ?? 0)) * 100) / 100 : 0;
  const matchPct = Math.round((frames.filter((f) => frameMatches(f, step)).length / n) * 100);
  return {
    id: step.id, title: step.title, detected, matchPct, pass: matchPct >= PASS_PCT,
    avgYaw: avg((f) => f.head.yaw), avgPitch: avg((f) => f.head.pitch), eyeMax,
    faceMissingPct: Math.round(((frames.length - seen.length) / n) * 100),
  };
}

/** 결과 전체 → 고칠 점 제안(설정 파일 값 이름 포함) */
export function diagnose(results) {
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  const tips = [];
  const swapped = (a, b, la, lb) => by[a] && by[b] && !by[a].pass && !by[b].pass && by[a].detected === la && by[b].detected === lb;

  if (swapped('head-down', 'head-up', '고개 위', '고개 아래'))
    tips.push('고개 위/아래가 반대로 잡혀요 → js/config.js 에서 GAZE.flipPitch 를 true 로 바꾸세요.');
  if (swapped('head-left', 'head-right', '고개 오른쪽', '고개 왼쪽'))
    tips.push('고개 왼쪽/오른쪽이 반대로 잡혀요 → js/config.js 에서 GAZE.flipYaw 를 true 로 바꾸세요.');

  for (const r of results) {
    if (r.pass) continue;
    if (r.faceMissingPct > 30) { tips.push(`${r.title}: 얼굴이 자주 사라져요(${r.faceMissingPct}%). 얼굴 앞쪽을 밝게 하고 화면 가운데에 앉아 주세요.`); continue; }
    const step = { id: r.id, kind: r.id.startsWith('eye') ? 'eye' : r.id.startsWith('head') ? 'head' : 'front', dir: r.id.split('-')[1] };
    if (step.kind === 'eye') {
      const m = r.eyeMax?.[step.dir] ?? 0;
      if (r.detected.startsWith('고개')) tips.push(`${r.title}: 고개까지 같이 움직였어요. 고개는 고정하고 눈만 움직여 다시 해 보세요.`);
      else if (m >= 0.15 && m < GAZE.eyeThreshold)
        tips.push(`${r.title}: 눈은 움직였지만(최대 ${m}) 기준 ${GAZE.eyeThreshold}에 못 미쳐요 → GAZE.eyeThreshold 를 ${Math.round(m * 0.8 * 10) / 10} 정도로 낮춰 보세요.`);
      else if (m < 0.15) tips.push(`${r.title}: 눈 방향 신호가 약해요(최대 ${m}). 카메라와 조금 더 가까이, 조명을 밝게 해 보세요.`);
    } else if (step.kind === 'head' && r.detected === '정면') {
      const ang = step.dir === 'left' || step.dir === 'right' ? `좌우 평균 ${r.avgYaw}° (기준 ±${GAZE.yawDeg}°) → GAZE.yawDeg` : `위아래 평균 ${r.avgPitch}° (기준 ±${GAZE.pitchDeg}°) → GAZE.pitchDeg`;
      tips.push(`${r.title}: 정면으로 판정됐어요. 고개를 더 크게 움직이거나, ${ang} 를 조금 낮춰 보세요.`);
    } else if (step.kind === 'front' && r.detected.startsWith('눈')) {
      tips.push(`${r.title}: 정면을 봤는데 '${r.detected}'로 판정됐어요 → GAZE.eyeThreshold 를 올리거나(지금 ${GAZE.eyeThreshold}) 정면 기준을 다시 잡아 보세요.`);
    } else if (step.kind === 'front' && r.detected.startsWith('고개')) {
      tips.push(`${r.title}: 정면을 봤는데 '${r.detected}'로 판정됐어요. 시작할 때 정면 기준을 다시 잡아 보세요.`);
    }
  }
  return tips.length ? tips : ['모든 단계를 통과했어요. 지금 기준값 그대로 써도 됩니다.'];
}
