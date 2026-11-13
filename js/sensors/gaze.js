// 웹캠 + MediaPipe Face Landmarker → 고개 각도, 눈 방향, 얼굴 점
import { FilesetResolver, FaceLandmarker } from '../../vendor/mediapipe/vision_bundle.mjs';
import { headAnglesFromMatrix, eyeFromBlendshapes } from '../analysis/gaze-logic.js';
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
 *   detect(nowMs:number): { face: {yaw:number,pitch:number,eye:object}|null, landmarks: {x:number,y:number}[]|null },
 *   stop(): void }>}
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
  await video.play();

  let landmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    try { landmarker = await createLandmarker('CPU'); } catch {
      stream.getTracks().forEach((t) => t.stop());
      throw 'model';
    }
  }

  let lastVideoTime = -1;
  let lastTs = 0;
  let last = { face: null, landmarks: null };

  return {
    video,
    detect(nowMs) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return last;
      lastVideoTime = video.currentTime;
      const ts = Math.max(nowMs, lastTs + 1);
      lastTs = ts;
      let res;
      try { res = landmarker.detectForVideo(video, ts); } catch (err) {
        console.warn('[gaze] detect failed:', err);
        last = { face: null, landmarks: null };
        return last;
      }
      const lm = res.faceLandmarks?.[0];
      const mat = res.facialTransformationMatrixes?.[0]?.data;
      const bs = res.faceBlendshapes?.[0]?.categories;
      if (!lm || !mat) { last = { face: null, landmarks: null }; return last; }
      const { yaw, pitch } = headAnglesFromMatrix(Array.from(mat));
      last = { face: { yaw, pitch, eye: bs ? eyeFromBlendshapes(bs) : { down: 0, up: 0, left: 0, right: 0 } }, landmarks: lm };
      return last;
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      try { landmarker.close(); } catch { /* noop */ }
    },
  };
}
