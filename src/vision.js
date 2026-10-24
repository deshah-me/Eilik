import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const version = '1.1.1';
const wasmPath = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`;
const modelPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function createLocalFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  });
}