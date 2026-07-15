.PHONY: setup format lint test build check install-hooks

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

check: format lint test build

install-hooks:
	cp scripts/pre-commit .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
