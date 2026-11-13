// 마이크 → 음량(dB), 말하는 중 여부, 음높이(Hz)
import { AUDIO } from '../config.js';
import { rmsDb, isSpeaking, detectPitch } from '../analysis/audio-math.js';

export function mediaErrorReason(err) {
  const n = err?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'nodevice';
  if (n === 'NotReadableError' || n === 'AbortError') return 'busy';
  return 'error';
}

/**
 * @returns {Promise<{ read(baseDb:number|null): {db:number, speaking:boolean, hz:number|null}, stop():void, stream: MediaStream }>}
 * 실패하면 'denied' | 'nodevice' | 'busy' | 'error' 로 reject
 */
export async function startAudio() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    throw mediaErrorReason(err);
  }
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = AUDIO.fftSize;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  return {
    stream,
    read(baseDb) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      analyser.getFloatTimeDomainData(buf);
      const db = rmsDb(buf);
      const speaking = isSpeaking(db, baseDb);
      const hz = speaking ? detectPitch(buf, ctx.sampleRate) : null;
      return { db, speaking, hz };
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
