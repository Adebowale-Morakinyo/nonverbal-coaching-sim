.PHONY: setup format lint test build check install-hooks dev-backend dev-frontend dev test-all

setup:
	cd frontend && npm install

format:
	gofmt -w backend/cmd backend/internal
	cd frontend && npm run format

lint:
	cd frontend && npm run lint

test:
	cd backend && GOCACHE=$${GOCACHE:-/tmp/go-build-cache} go test ./...

build:
	cd frontend && npm run build
	cd backend && go build ./...

check: format lint test build

dev-backend:
	cd backend && make dev

dev-frontend:
	cd frontend && npm run dev

dev:
	(cd backend && make dev) & (cd frontend && npm run dev) & wait

test-all:
	cd backend && make smoke && make test
	cd frontend && npm run smoke && npm run e2e

install-hooks:
	cp scripts/pre-commit .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
