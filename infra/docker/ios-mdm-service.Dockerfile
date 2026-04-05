FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY services/ios-mdm-service/go.mod services/ios-mdm-service/go.sum ./
RUN go mod download

COPY services/ios-mdm-service/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/ios-mdm-service ./cmd/server

FROM gcr.io/distroless/static-debian12

COPY --from=builder /bin/ios-mdm-service /ios-mdm-service

EXPOSE 8443 50060

ENTRYPOINT ["/ios-mdm-service"]
