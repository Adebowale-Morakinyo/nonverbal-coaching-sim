# Nonverbal Coaching Simulator

## Overview

The Nonverbal Coaching Simulator is a full-stack AI interview practice tool for candidate-facing research demos. It supports a verbal-only condition and a full multimodal condition that adds live facial-analysis indicators and stores nonverbal snapshots for post-session reporting.

## Tech Stack

- Backend: Go 1.22, pgx/v5, gorilla/websocket, OpenRouter, PostgreSQL
- Frontend: React, TypeScript, Vite, Tailwind CSS, Framer Motion, MediaPipe Tasks Vision
- Testing: Go smoke/integration tests, Playwright e2e tests, frontend smoke script
- Local services: Docker Compose Postgres, or a local PostgreSQL instance

## Quick Start

```bash
cp .env.example .env
docker compose up -d postgres
cd backend && make migrate
cd backend && make dev
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`.

If you use an existing local Postgres instance, set `DATABASE_URL` in the root `.env` before running migrations. The root `.env` is canonical: backend commands load `../.env`, and Vite loads the same file via `envDir`.

## Environment Variables

```env
DATABASE_URL=postgres://user:pass@localhost:5432/nonverbal_sim?sslmode=disable
OPENROUTER_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4-5
PORT=8080
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_PROXY_TARGET=http://localhost:8080
```

## Running Tests

Backend:

```bash
cd backend
make smoke
make test
go test -tags integration ./...
```

Frontend:

```bash
cd frontend
npm run smoke
npm run e2e
npm run lint
npm run build
```

All project checks:

```bash
make test-all
make build
```

Install Playwright browser binaries if needed:

```bash
cd frontend
npx playwright install chromium
```

## Research Context

This prototype supports a final-year research study comparing verbal-only AI interview preparation with a multimodal condition that includes nonverbal feedback. The goal is to evaluate whether live nonverbal indicators and post-session summaries improve candidate confidence and interview performance awareness.
