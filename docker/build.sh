#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/bcse/filex}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

# OCI metadata (override via env vars if needed)
VERSION="${VERSION:-$(cargo metadata --no-deps --format-version 1 --manifest-path ../backend/Cargo.toml 2>/dev/null | jq -r '.packages[0].version' 2>/dev/null || grep -m1 '^version' ../backend/Cargo.toml | cut -d'\"' -f2 || echo latest)}"
REVISION="${REVISION:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_DATE="${BUILD_DATE:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
SOURCE_URL="${SOURCE_URL:-https://github.com/bcse/filex}"
DESCRIPTION="${DESCRIPTION:-Filex - a self-hosted file manager}"

docker buildx build \
  --platform "${PLATFORMS}" \
  -f Dockerfile \
  -t "${IMAGE}:latest" \
  --build-arg "GIT_COMMIT_SHA=${REVISION}" \
  --label "org.opencontainers.image.created=${BUILD_DATE}" \
  --label "org.opencontainers.image.authors=Grey Lee" \
  --label "org.opencontainers.image.url=${SOURCE_URL}" \
  --label "org.opencontainers.image.documentation=${SOURCE_URL}/blob/${REVISION}/README.md" \
  --label "org.opencontainers.image.source=${SOURCE_URL}" \
  --label "org.opencontainers.image.version=${VERSION}" \
  --label "org.opencontainers.image.revision=${REVISION}" \
  --label "org.opencontainers.image.vendor=Grey Lee" \
  --label "org.opencontainers.image.licenses=MIT" \
  --label "org.opencontainers.image.ref.name=${VERSION}" \
  --label "org.opencontainers.image.title=filex" \
  --label "org.opencontainers.image.description=${DESCRIPTION}" \
  --annotation "index:org.opencontainers.image.created=${BUILD_DATE}" \
  --annotation "index:org.opencontainers.image.authors=Grey Lee" \
  --annotation "index:org.opencontainers.image.url=${SOURCE_URL}" \
  --annotation "index:org.opencontainers.image.documentation=${SOURCE_URL}/blob/${REVISION}/README.md" \
  --annotation "index:org.opencontainers.image.source=${SOURCE_URL}" \
  --annotation "index:org.opencontainers.image.version=${VERSION}" \
  --annotation "index:org.opencontainers.image.revision=${REVISION}" \
  --annotation "index:org.opencontainers.image.vendor=Grey Lee" \
  --annotation "index:org.opencontainers.image.licenses=MIT" \
  --annotation "index:org.opencontainers.image.ref.name=${VERSION}" \
  --annotation "index:org.opencontainers.image.title=filex" \
  --annotation "index:org.opencontainers.image.description=${DESCRIPTION}" \
  --load ..

docker push "${IMAGE}:latest"
