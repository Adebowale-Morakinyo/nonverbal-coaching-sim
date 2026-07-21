import { useEffect, useRef } from "react";

export type FaceLandmarkPoint = {
  x: number;
  y: number;
};

type FaceMeshOverlayProps = {
  landmarks: FaceLandmarkPoint[] | null;
};

export function FaceMeshOverlay({ landmarks }: FaceMeshOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    if (!landmarks?.length) {
      return;
    }

    context.fillStyle = "rgba(34, 197, 94, 0.82)";
    context.strokeStyle = "rgba(99, 102, 241, 0.32)";
    context.lineWidth = 1;

    for (let index = 0; index < landmarks.length; index += 3) {
      const point = landmarks[index];
      const x = point.x * rect.width;
      const y = point.y * rect.height;
      context.beginPath();
      context.arc(x, y, 1.25, 0, Math.PI * 2);
      context.fill();
    }

    drawPolyline(context, landmarks, [10, 338, 297, 332, 284, 251, 389, 356]);
    drawPolyline(context, landmarks, [10, 109, 67, 103, 54, 21, 162, 127]);
    drawPolyline(
      context,
      landmarks,
      [33, 246, 161, 160, 159, 158, 157, 173, 133],
    );
    drawPolyline(
      context,
      landmarks,
      [362, 398, 384, 385, 386, 387, 388, 466, 263],
    );
    drawPolyline(
      context,
      landmarks,
      [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
    );
  }, [landmarks]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full scale-x-[-1]"
      aria-hidden="true"
    />
  );
}

function drawPolyline(
  context: CanvasRenderingContext2D,
  landmarks: FaceLandmarkPoint[],
  indices: number[],
) {
  context.beginPath();
  indices.forEach((index, position) => {
    const point = landmarks[index];
    if (!point) {
      return;
    }
    const x = point.x * context.canvas.clientWidth;
    const y = point.y * context.canvas.clientHeight;
    if (position === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
}
