import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export const CONFIG = {
  gazeThresholdLow: 0.35,
  gazeThresholdHigh: 0.65,
};

const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_ASSET_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_LOAD_TIMEOUT_MS = 10_000;
const ROLLING_WINDOW_SIZE = 150;

let faceLandmarker: FaceLandmarker | null = null;
const gazeWindow: boolean[] = [];
const yawWindow: number[] = [];
const pitchWindow: number[] = [];

type WorkerRequest =
  | { type: "init" }
  | { type: "frame"; imageBitmap: ImageBitmap; timestamp: number };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "init") {
    void initialize();
    return;
  }

  if (message.type === "frame") {
    analyzeFrame(message.imageBitmap, message.timestamp);
  }
};

async function initialize() {
  let gpuError = "";
  try {
    faceLandmarker = await loadFaceLandmarker("GPU");
    self.postMessage({ type: "ready" });
  } catch {
    gpuError = "GPU delegate failed";
    try {
      faceLandmarker = await loadFaceLandmarker("CPU");
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: `${gpuError}; CPU fallback failed: ${
          error instanceof Error ? error.message : "Model failed to load"
        }`,
      });
    }
  }
}

async function loadFaceLandmarker(delegate: "GPU" | "CPU") {
  return withTimeout(async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_ASSET_PATH, true);
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        delegate,
      },
      numFaces: 1,
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  });
}

async function withTimeout<T>(load: () => Promise<T>) {
  let timeoutID = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutID = self.setTimeout(
      () => reject(new Error("Model failed to load")),
      MODEL_LOAD_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([load(), timeout]);
  } finally {
    self.clearTimeout(timeoutID);
  }
}

function analyzeFrame(imageBitmap: ImageBitmap, timestamp: number) {
  try {
    if (!faceLandmarker) {
      return;
    }

    const results = faceLandmarker.detectForVideo(imageBitmap, timestamp);
    const landmarks = results.faceLandmarks[0];
    if (!landmarks) {
      self.postMessage({ type: "indicators", data: null });
      return;
    }

    const eyeContactRatio = computeEyeContactRatio(landmarks);
    const headStability = computeHeadStability(
      results.facialTransformationMatrixes?.[0]?.data,
    );
    const facialActivity = computeFacialActivity(
      results.faceBlendshapes?.[0]?.categories ?? [],
    );

    self.postMessage({
      type: "indicators",
      data: {
        eyeContactRatio,
        headStability,
        facialActivity,
        landmarks: landmarks.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
        })),
      },
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Facial analysis failed",
    });
  } finally {
    imageBitmap.close();
  }
}

type Landmark = {
  x: number;
  y: number;
  z?: number;
};

type BlendShapeCategory = {
  categoryName: string;
  score: number;
};

function computeEyeContactRatio(landmarks: Landmark[]) {
  const leftRatio = horizontalIrisOffsetRatio(
    landmarks[468],
    landmarks[133],
    landmarks[33],
  );
  const rightRatio = horizontalIrisOffsetRatio(
    landmarks[473],
    landmarks[263],
    landmarks[362],
  );
  const onCamera =
    isWithinGazeThreshold(leftRatio) && isWithinGazeThreshold(rightRatio);

  pushRolling(gazeWindow, onCamera);
  return gazeWindow.filter(Boolean).length / gazeWindow.length;
}

function horizontalIrisOffsetRatio(
  iris: Landmark | undefined,
  inner: Landmark | undefined,
  outer: Landmark | undefined,
) {
  if (!iris || !inner || !outer) {
    return Number.NaN;
  }

  const denominator = outer.x - inner.x;
  if (Math.abs(denominator) < Number.EPSILON) {
    return Number.NaN;
  }

  return (iris.x - inner.x) / denominator;
}

function isWithinGazeThreshold(value: number) {
  return (
    Number.isFinite(value) &&
    value >= CONFIG.gazeThresholdLow &&
    value <= CONFIG.gazeThresholdHigh
  );
}

function computeHeadStability(matrix?: Float32Array | number[]) {
  if (!matrix || matrix.length < 16) {
    return yawWindow.length ? currentHeadStability() : 1;
  }

  const r00 = matrix[0];
  const r10 = matrix[4];
  const r20 = matrix[8];
  const r21 = matrix[9];
  const r22 = matrix[10];
  const yaw = Math.atan2(r10, r00);
  const pitch = Math.atan2(-r20, Math.sqrt(r21 ** 2 + r22 ** 2));

  pushRolling(yawWindow, yaw);
  pushRolling(pitchWindow, pitch);

  return currentHeadStability();
}

function currentHeadStability() {
  return 1 - clamp((variance(yawWindow) + variance(pitchWindow)) / 0.5, 0, 1);
}

function computeFacialActivity(categories: BlendShapeCategory[]) {
  const browInnerUp = categoryScore(categories, "browInnerUp");
  const mouthSmileLeft = categoryScore(categories, "mouthSmileLeft");
  const mouthSmileRight = categoryScore(categories, "mouthSmileRight");

  return clamp(
    (browInnerUp + (mouthSmileLeft + mouthSmileRight) / 2) / 1.5,
    0,
    1,
  );
}

function categoryScore(categories: BlendShapeCategory[], name: string) {
  return (
    categories.find((category) => category.categoryName === name)?.score ?? 0
  );
}

function variance(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  );
}

function pushRolling<T>(values: T[], value: T) {
  values.push(value);
  if (values.length > ROLLING_WINDOW_SIZE) {
    values.shift();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
