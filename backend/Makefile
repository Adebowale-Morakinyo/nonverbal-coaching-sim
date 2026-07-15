.PHONY: dev migrate test smoke

dev:
	go run cmd/server/main.go

migrate:
	go run cmd/migrate/main.go

test:
	GOCACHE=$${GOCACHE:-/tmp/go-build-cache} go test ./...

smoke:
	GOCACHE=$${GOCACHE:-/tmp/go-build-cache} go test -tags smoke ./...
