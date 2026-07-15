# Nonverbal Coaching Sim

Full-stack scaffold for a nonverbal communication coaching simulator.

## Project layout

```text
backend/              Go API server
frontend/             React + TypeScript Vite app
docker-compose.yml    Postgres + backend dev services
.env.example          Local environment template
```

## Prerequisites

- Go 1.22+
- Node.js 20+
- Docker and Docker Compose

## Backend

```bash
cd backend
cp ../.env.example .env
make migrate
make dev
```

The server listens on `http://localhost:8080` by default.

Useful endpoints:

- `GET /healthz`
- `POST /api/sessions`
- `GET /api/sessions/{id}`
- `POST /api/sessions/{id}/turns`
- `POST /api/sessions/{id}/end`
- `POST /api/sessions/{id}/snapshot`
- `GET /api/sessions/{id}/report`
- `GET /ws/{id}`

Backend checks:

```bash
cd backend
make test
make smoke
go test -tags integration ./...
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` and proxies API requests to the Go server.

If your backend is not on `8080`, set `VITE_API_PROXY_TARGET` when starting Vite:

```bash
VITE_API_PROXY_TARGET=http://localhost:18080 npm run dev
```

## Docker development

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres and the backend server. Run the frontend separately with `npm run dev`.

## Quality checks

Run all formatting, linting, tests, and frontend build checks from the repo root:

```bash
make check
```

Individual commands are available too:

```bash
make format
make lint
make test
make build
```

To run these checks automatically before every commit, install the local Git hook:

```bash
make install-hooks
```

## Environment

Copy `.env.example` to `.env` and fill in values as needed.

- `PORT`: backend HTTP port
- `DATABASE_URL`: PostgreSQL connection string
- `OPENROUTER_API_KEY`: API key for OpenRouter-backed coaching responses
- `OPENROUTER_BASE_URL`: OpenRouter API base URL
- `LLM_MODEL`: OpenRouter model name
- `ALLOWED_ORIGINS`: comma-separated browser origins allowed by the backend
- `VITE_API_PROXY_TARGET`: frontend dev proxy target
