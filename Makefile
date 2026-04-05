.PHONY: all build test lint clean docker-build docker-up docker-down migrate proto

# Go services
GO_SERVICES := device-service policy-service command-service compliance-service kiosk-service geofence-service cert-service remote-control-service

# TypeScript services
TS_SERVICES := admin-api app-service file-service notification-service report-service audit-service

## Help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

## Build
build: build-go build-ts ## Build all services

build-go: ## Build Go services
	@for svc in $(GO_SERVICES); do \
		echo "Building $$svc..."; \
		cd services/$$svc && go build -o ../../bin/$$svc ./cmd/server && cd ../..; \
	done

build-ts: ## Build TypeScript services
	pnpm turbo build

## Test
test: test-go test-ts ## Run all tests

test-go: ## Run Go tests
	@for svc in $(GO_SERVICES); do \
		echo "Testing $$svc..."; \
		cd services/$$svc && go test ./... -v -race && cd ../..; \
	done

test-ts: ## Run TypeScript tests
	pnpm turbo test

## Lint
lint: lint-go lint-ts ## Lint all code

lint-go: ## Lint Go code
	@for svc in $(GO_SERVICES); do \
		echo "Linting $$svc..."; \
		cd services/$$svc && golangci-lint run ./... && cd ../..; \
	done

lint-ts: ## Lint TypeScript code
	pnpm turbo lint

## Proto
proto: ## Generate protobuf code
	cd proto && buf generate

## Database
migrate-up: ## Run database migrations
	migrate -path migrations -database "$(DATABASE_URL)" up

migrate-down: ## Rollback last migration
	migrate -path migrations -database "$(DATABASE_URL)" down 1

migrate-create: ## Create new migration (usage: make migrate-create NAME=create_foo)
	migrate create -ext sql -dir migrations -seq $(NAME)

## Docker
docker-build: ## Build all Docker images
	@for svc in $(GO_SERVICES) $(TS_SERVICES); do \
		echo "Building Docker image for $$svc..."; \
		docker build -t mdm-$$svc:latest -f infra/docker/$$svc.Dockerfile .; \
	done

docker-up: ## Start local development environment
	docker compose up -d

docker-down: ## Stop local development environment
	docker compose down

docker-logs: ## View Docker logs
	docker compose logs -f

## Clean
clean: ## Clean build artifacts
	rm -rf bin/ node_modules/ .turbo/
	@for svc in $(GO_SERVICES); do \
		cd services/$$svc && go clean && cd ../..; \
	done
	pnpm turbo clean
