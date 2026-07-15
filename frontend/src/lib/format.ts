import type { InterviewType } from "./api";

export function formatInterviewType(type?: InterviewType) {
  if (!type) {
    return "Interview";
  }

  return `${type.charAt(0).toUpperCase()}${type.slice(1)} Interview`;
}

export function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}
