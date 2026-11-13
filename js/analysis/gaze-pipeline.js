// 새 영상 프레임만 처리하고 원시 관찰과 시간 안정화 관찰을 함께 보관합니다.
import { GAZE } from '../config.js';
import { gazeSample } from './gaze-logic.js';

const key = g => `${g.frontal}:${g.dir}:${g.reason}:${g.eye.source}`;
export function createGazePipeline(calib = {}, method = 'blendshape') {
  let lastTime = null, filtered = null;
  const held = new Map();
  function stabilize(g, t, name) {
    let h = held.get(name);
    if (!h || g.frontal == null || h.value.frontal == null) {
      h = { value:g, candidate:null, since:t }; held.set(name,h); return g;
    }
    if (key(g) === key(h.value)) { h.candidate=null; h.value=g; return g; }
    if (key(g) !== h.candidate) { h.candidate=key(g); h.since=t; }
    if (t-h.since >= GAZE.switchHoldSec) { h.value=g; h.candidate=null; return g; }
    return { ...h.value, pending:true, head:{ ...h.value.head, yaw:g.head.yaw, pitch:g.head.pitch } };
  }
  return {
    reset() { lastTime=null; filtered=null; held.clear(); },
    update(d, nowMs) {
      const invalid = d?.quality?.reason;
      if (d?.fresh === false && !invalid) return null;
      const t = nowMs/1000;
      const dt = lastTime == null ? Infinity : t-lastTime;
      if (dt > GAZE.gapResetSec || invalid) { filtered=null; held.clear(); }
      const raw = gazeSample(d,calib,{method});
      if (d?.fresh === false && invalid) {
        filtered=null; lastTime=null;
        return { raw, stable:raw, blend:gazeSample(d,calib,{method:'blendshape'}), iris:gazeSample(d,calib,{method:'iris'}), frame:d };
      }
      lastTime=t;
      let face=d?.face;
      if (face) {
        const alpha=filtered ? 1-Math.exp(-Math.max(0,dt)/GAZE.smoothTauSec) : 1;
        const mix=(a,b)=>a == null ? b : a+(b-a)*alpha;
        const eyes=face.eyes && Object.fromEntries(['L','R'].map(side=>{
          const e=face.eyes[side], prev=filtered?.eyes?.[side];
          if (!e) return [side,e];
          return [side,{...e, iris:e.iris && {x:mix(prev?.state==='ok'?prev.iris?.x:null,e.iris.x),y:mix(prev?.state==='ok'?prev.iris?.y:null,e.iris.y)},
            blend:Object.fromEntries(Object.entries(e.blend).map(([k,v])=>[k,mix(prev?.state==='ok'?prev.blend?.[k]:null,v)]))}];
        }));
        face={...face,yaw:mix(filtered?.yaw,face.yaw),pitch:mix(filtered?.pitch,face.pitch),eyes,
          eye:Object.fromEntries(Object.entries(face.eye??{}).map(([k,v])=>[k,mix(filtered?.eye?.[k],v)]))};
        filtered=face;
      } else { filtered=null; held.clear(); }
      const frame={...d,face};
      const blend=stabilize(gazeSample(frame,calib,{method:'blendshape'}),t,'blendshape');
      const iris=stabilize(gazeSample(frame,calib,{method:'iris'}),t,'iris');
      const stable=method==='iris'?iris:blend;
      return { raw, stable, blend, iris, frame };
    },
  };
}
