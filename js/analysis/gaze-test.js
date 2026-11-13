// 시선 인식 점검: 단계별로 정해진 방향을 보게 하고, 감지 방향의 일치와 미측정 시간을 확인합니다.
import { timedSlices } from './gaze-timeline.js';
import { GAZE_REASON_TEXT } from './gaze-logic.js';

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
  { id: 'eye-up', kind:'eye', dir:'up', title:'눈만 위', say:'고개를 유지하고 눈만 화면 위쪽으로 움직이세요' },
  { id:'blink', kind:'closed', title:'눈 감김 확인', say:'눈을 가볍게 감고 측정 시간 동안 유지하세요. 불편하면 자연스럽게 깜빡여도 됩니다' },
  { id:'cover-left', kind:'single', source:'R', title:'왼쪽 눈 가리기', say:'눈을 누르지 말고 왼쪽 눈 앞을 손으로 가리세요. 오른쪽 눈으로 렌즈를 봅니다' },
  { id:'cover-right', kind:'single', source:'L', title:'오른쪽 눈 가리기', say:'눈을 누르지 말고 오른쪽 눈 앞을 손으로 가리세요. 왼쪽 눈으로 렌즈를 봅니다' },
  { id:'opposite', kind:'mixed', title:'고개와 눈을 반대로', say:'고개를 오른쪽으로 조금 돌리고 눈은 왼쪽을 보세요. 불편하면 건너뛸 수 있습니다' },
  { id: 'front-again', kind: 'front',            title: '다시 정면',       say: '다시 카메라 렌즈를 보세요' },
];

/** 한 프레임(analyzeGaze 결과 + eyeRaw)이 이 단계의 기대와 맞는지. 얼굴이 없으면 false */
export function frameMatches(frame, step) {
  if (!frame) return false;
  if (step.kind==='closed') return frame.eye?.dir==='closed';
  if (step.kind==='single') return frame.eye?.source===step.source;
  if (step.kind==='mixed') return frame.conflict===true;
  if (step.kind === 'front') return frame.frontal===true;
  if (step.kind === 'head') return frame.head.dir === step.dir;
  return frame.head.ok && frame.eye.dir === step.dir; // 눈만: 고개는 정면이어야
}

/** 프레임 → 사람이 읽는 판정 */
export function frameLabel(frame) {
  if (!frame) return '얼굴 없음';
  if (frame.reason) return GAZE_REASON_TEXT[frame.reason]??frame.reason;
  if (!frame.head.ok) return `고개 ${WORD[frame.head.dir]}`;
  if (!frame.eye.ok) return `눈 ${WORD[frame.eye.dir]}`;
  return '정면';
}

/** 수행 평가 없이, 별도 확인 표본에서 장치 관찰값만 요약합니다. */
export function evaluateObservationStep(frames, step, durationSec) {
  const slices=timedSlices(frames,durationSec);
  const seconds=xs=>xs.reduce((a,s)=>a+s.weight,0);
  const eligible=slices.filter(s=>s.frontal!=null);
  const matched=slices.filter(s=>frameMatches(s,step));
  const counts={};
  for(const s of slices) {const label=frameLabel(s);counts[label]=(counts[label]??0)+s.weight;}
  const summarize=method=>{
    const entries=slices.filter(s=>s[method]);
    return {matchPct:durationSec?100*seconds(entries.filter(s=>frameMatches(s[method],step)))/durationSec:0,
      unknownPct:durationSec?100*(durationSec-seconds(entries.filter(s=>s[method].frontal!=null)))/durationSec:0,
      usedIris:entries.some(s=>s[method].eye?.method==='iris')};
  };
  return {id:step.id,title:step.title,durationSec,observedSec:seconds(slices),
    matchPct:durationSec?100*seconds(matched)/durationSec:0,
    unknownPct:durationSec?100*(durationSec-seconds(eligible))/durationSec:0,
    firstMatchSec:matched[0]?.t??null,
    detected:Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]??'측정 없음',
    blend:summarize('blend'),iris:summarize('iris')};
}
