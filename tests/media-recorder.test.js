import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRecording } from '../js/media-recorder.js';
function fixture() {
  let stopped=0, starts=0, stopCalls=0;
  const track={readyState:'live',kind:'audio',stop(){stopped++;}};
  const sensors={audio:{stream:{getTracks:()=>[track]}}};
  class Stream { constructor(tracks) { this.tracks=tracks; } }
  class Recorder {
    constructor(stream) { this.stream=stream; this.state='inactive'; this.mimeType='audio/webm'; }
    start() { starts++; this.state='recording'; }
    stop() { stopCalls++; this.state='inactive'; queueMicrotask(()=>{this.ondataavailable({data:new Blob(['answer'])});this.onstop();}); }
  }
  return { sensors, env:{MediaRecorder:Recorder,MediaStream:Stream}, counts:()=>({stopped,starts,stopCalls}) };
}
test('recording requires explicit opt-in', async () => {
  const f=fixture(); const result=await startRecording(f.sensors,false,f.env).stop();
  assert.equal(result.blob,null); assert.equal(f.counts().starts,0);
});
test('recording waits for final data and repeated stop returns same result', async () => {
  const f=fixture(); const recording=startRecording(f.sensors,true,f.env);
  const [a,b]=await Promise.all([recording.stop(),recording.stop()]);
  assert.equal(a,b); assert.equal(await a.blob.text(),'answer');
  assert.deepEqual(f.counts(),{starts:1,stopCalls:1,stopped:0});
});
test('unsupported recorder and absent devices return a usable fallback', async () => {
  const f=fixture(); assert.equal((await startRecording(f.sensors,true,{}).stop()).blob,null);
  assert.equal((await startRecording({},true,f.env).stop()).blob,null);
});
test('recording start failure does not stop measurement tracks', async () => {
  const f=fixture(); f.env.MediaRecorder=class { constructor(){throw Error('unsupported');} };
  assert.equal((await startRecording(f.sensors,true,f.env).stop()).blob,null);
  assert.equal(f.counts().stopped,0);
});
