FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY services/device-service/go.mod services/device-service/go.sum ./
RUN go mod download

COPY services/device-service/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/device-service ./cmd/server

FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/device-service /device-service

EXPOSE 50051

ENTRYPOINT ["/device-service"]
