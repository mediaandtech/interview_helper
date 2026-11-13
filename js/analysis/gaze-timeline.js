// 다음 표본까지의 실제 시간으로 집계하고 긴 영상·기록 공백은 보간하지 않습니다.
export const MAX_HOLD_SEC = 0.15;
export function timedSlices(observations, durationSec, hold = MAX_HOLD_SEC) {
  const out=[];
  for(let i=0;i<observations.length;i++) {
    const s=observations[i], next=observations[i+1]?.t??durationSec;
    const start=Math.max(0,s.t), end=Math.min(durationSec,next,s.t+hold);
    if(Number.isFinite(start) && end>start) out.push({...s,start,end,weight:end-start});
  }
  return out;
}
export function gazeObservations(samples) {
  return samples.some(s=>Array.isArray(s.gazeFrames)) ? samples.flatMap(s=>s.gazeFrames??[]) : samples;
}
export function summarizeGaze(samples,durationSec) {
  const observations=gazeObservations(samples);
  const slices=timedSlices(observations,durationSec);
  const known=slices.filter(s=>s.frontal!=null);
  const total=known.reduce((a,s)=>a+s.weight,0);
  const frontal=known.filter(s=>s.frontal).reduce((a,s)=>a+s.weight,0);
  const reasons={};
  for(const s of slices) if(s.gazeReason) reasons[s.gazeReason]=(reasons[s.gazeReason]??0)+s.weight;
  const compared=slices.filter(s=>s.blend?.frontal!=null && s.iris?.frontal!=null);
  const comparedSec=compared.reduce((a,s)=>a+s.weight,0);
  const agreeSec=compared.filter(s=>s.blend.dir===s.iris.dir).reduce((a,s)=>a+s.weight,0);
  return {slices, frontalPct:total?100*frontal/total:null,validSec:total,unknownSec:Math.max(0,durationSec-total),reasons,
    comparison:{seconds:comparedSec,agreementPct:comparedSec?100*agreeSec/comparedSec:null}};
}
