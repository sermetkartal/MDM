FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY services/command-service/go.mod services/command-service/go.sum ./
RUN go mod download

COPY services/command-service/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/command-service ./cmd/server

FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/command-service /command-service

EXPOSE 50053

ENTRYPOINT ["/command-service"]
