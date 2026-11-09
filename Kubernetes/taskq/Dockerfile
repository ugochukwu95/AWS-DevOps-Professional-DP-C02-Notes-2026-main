# syntax=docker/dockerfile:1
FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/worker ./cmd/worker

# distroless/static has no shell or package manager: use `kubectl debug` to inspect it.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /out/worker /
# Numeric, so the kubelet can verify runAsNonRoot (a user *name* can't be checked).
USER 65532:65532
EXPOSE 8080 8081
ENTRYPOINT ["/api"]
