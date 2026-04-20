FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY services/policy-service/go.mod services/policy-service/go.sum ./
RUN go mod download

COPY services/policy-service/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/policy-service ./cmd/server

FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/policy-service /policy-service

EXPOSE 50052

ENTRYPOINT ["/policy-service"]
