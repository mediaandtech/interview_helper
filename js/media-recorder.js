// 카운트다운 후 사용자가 선택한 로컬 녹화만 수행. 원본 센서는 정지하지 않습니다.
export function startRecording(sensors, enabled, env = globalThis) {
  const unavailable = (message) => ({ message, stop: async () => ({ blob: null, message }) });
  if (!enabled) return unavailable('녹화하지 않은 답변입니다.');
  const tracks = [sensors.gaze?.video?.srcObject, sensors.audio?.stream]
    .flatMap(s => s?.getTracks() ?? []).filter(t => t.readyState === 'live');
  if (!tracks.length) return unavailable('녹화할 실제 카메라·마이크가 없습니다.');
  if (!env.MediaRecorder) return unavailable('이 브라우저는 녹화를 지원하지 않습니다. 측정은 계속됩니다.');
  let recorder, resolve, result, timer, failed = false;
  const chunks = [];
  const done = new Promise(r => { resolve = r; });
  const finish = () => {
    if (result) return;
    clearTimeout(timer);
    const blob = !failed && chunks.length ? new Blob(chunks, { type: recorder.mimeType || chunks[0].type }) : null;
    result = { blob, message: blob ? '' : '녹화 파일을 만들지 못했습니다. 측정값과 메모는 사용할 수 있습니다.' };
    resolve(result);
  };
  try {
    recorder = new env.MediaRecorder(new env.MediaStream(tracks));
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => { failed = true; finish(); };
    recorder.onstop = finish;
    recorder.start(1000);
  } catch { return unavailable('녹화를 시작하지 못했습니다. 측정은 계속됩니다.'); }
  return {
    message: tracks.some(t=>t.kind==='video') ? '녹화 중 · 현재 탭에만 보관' : '녹음 중 · 현재 탭에만 보관',
    stop() {
      if (result) return done;
      if (!timer) {
        timer = setTimeout(() => { failed = true; finish(); }, 5000);
        try { if (recorder.state !== 'inactive') recorder.stop(); else finish(); } catch { failed = true; finish(); }
      }
      return done;
    },
  };
}
