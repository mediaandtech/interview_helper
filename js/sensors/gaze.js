// 웹캠 + MediaPipe Face Landmarker → 측정 프레임(고개 각도, 눈별 상태, 홍채 위치, 제외 사유)
import { FilesetResolver, FaceLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { createGazeFrameBuilder, frameFreshness } from '../analysis/gaze-frame.js';
import { mediaErrorReason } from './audio.js';

const WASM = new URL('../../vendor/mediapipe/wasm', import.meta.url).href;
const MODEL = new URL('../../vendor/mediapipe/face_landmarker.task', import.meta.url).href;

async function createLandmarker(delegate) {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

/**
 * @returns {Promise<{ video: HTMLVideoElement,
 *   detect(nowMs:number): GazeFrame, setBase(base:{aperture:{L:number,R:number}}|null): void, stop(): void }>}
 * GazeFrame = { t, fresh, ageMs, face|null, landmarks|null, quality:{ reason, eyes:{L,R} } }
 *   - fresh: 이번 호출에서 새 영상 프레임을 분석했는지 (같은 프레임을 다시 세지 않기 위해)
 *   - quality.reason: null | 'no-face' | 'stale'(영상 정지) | 'no-video' | 'detect-error'
 * 실패하면 'denied' | 'nodevice' | 'busy' | 'error' | 'model' 로 reject
 */
export async function initGaze() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    });
  } catch (err) {
    const r = mediaErrorReason(err);
    throw r;
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try { await video.play(); } catch { stream.getTracks().forEach(t => t.stop()); throw 'error'; }

  let landmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    try { landmarker = await createLandmarker('CPU'); } catch {
      stream.getTracks().forEach((t) => t.stop());
      throw 'model';
    }
  }

  let base = null;
  const builder = createGazeFrameBuilder(() => base);
  let lastVideoTime = -1;
  let lastTs = 0;
  let lastFreshMs = -Infinity;
  let last = builder.build({ landmarks: null, matrix: null, nowMs: 0 });
  const blank = (nowMs, reason) => ({ t: nowMs, fresh: false, ageMs: 0, face: null, landmarks: null, quality: { reason, eyes: { L: 'missing', R: 'missing' } } });

  return {
    video,
    setBase(b) { base = b; builder.reset(); },
    detect(nowMs) {
      if (!stream.getVideoTracks().some(t => t.readyState === 'live' && !t.muted)) { builder.reset(); return blank(nowMs, 'no-video'); }
      if (video.readyState < 2) return blank(nowMs, 'no-video');
      const fr = frameFreshness({ videoTime: video.currentTime, lastVideoTime, nowMs, lastFreshMs });
      if (!fr.fresh) {
        // 같은 프레임: 새 판정 아님. 오래되면 마지막 얼굴을 쓰지 않음
        return fr.stale ? { ...blank(nowMs, 'stale'), ageMs: fr.ageMs } : { ...last, fresh: false, ageMs: fr.ageMs };
      }
      lastVideoTime = video.currentTime;
      lastFreshMs = nowMs;
      const ts = Math.max(nowMs, lastTs + 1);
      lastTs = ts;
      let res;
      try { res = landmarker.detectForVideo(video, ts); } catch (err) {
        console.warn('[gaze] detect failed:', err);
        last = builder.build({ error: true, nowMs });
        return last;
      }
      last = builder.build({
        landmarks: res.faceLandmarks?.[0] ?? null,
        matrix: res.facialTransformationMatrixes?.[0]?.data ?? null,
        blendshapes: res.faceBlendshapes?.[0]?.categories ?? null,
        nowMs, aspect: video.videoWidth / video.videoHeight, imageHeight:video.videoHeight,
      });
      return last;
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      try { landmarker.close(); } catch { /* noop */ }
    },
  };
}
