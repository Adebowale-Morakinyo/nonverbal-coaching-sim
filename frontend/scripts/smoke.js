import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadRootEnv();

const API_BASE = normalizeLoopback(
  process.env.API_BASE_URL ??
    process.env.VITE_API_PROXY_TARGET ??
    "http://127.0.0.1:8080",
);
const FRONTEND_BASE = normalizeLoopback(
  process.env.FRONTEND_BASE_URL ?? "http://127.0.0.1:5173",
);

function normalizeLoopback(url) {
  return url.replace("://localhost", "://127.0.0.1");
}

function loadRootEnv() {
  try {
    const envPath = resolve(process.cwd(), "..", ".env");
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      process.env[key] ??= value;
    }
  } catch {
    // Root .env is optional for smoke; defaults still apply.
  }
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await check("backend health", async () => {
  const response = await fetch(`${API_BASE}/health`);
  if (response.status !== 200) {
    throw new Error(`Expected 200 from /health, got ${response.status}`);
  }
});

await check("create session returns UUID", async () => {
  const response = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      condition: "verbal_only",
      interview_type: "behavioural",
      participant_code: "smoke-test",
    }),
  });

  if (response.status !== 201) {
    throw new Error(`Expected 201 from /api/sessions, got ${response.status}`);
  }

  const body = await response.json();
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(body.id)) {
    throw new Error(`Expected UUID id, got ${JSON.stringify(body)}`);
  }
});

await check("frontend page loads", async () => {
  const response = await fetch(FRONTEND_BASE);
  if (response.status !== 200) {
    throw new Error(`Expected 200 from frontend, got ${response.status}`);
  }
});

console.log(
  "MANUAL: confirm MediaPipe loads in browser by starting a full_multimodal session and checking window.__mediapipe_loaded === true after worker init.",
);
