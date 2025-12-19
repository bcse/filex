ARG VERSION=unknown
ARG GIT_COMMIT_SHA=unknown

# Build stage for frontend
FROM node:25 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM rust:1 AS backend-builder
ARG VERSION
ARG GIT_COMMIT_SHA
ENV VERSION=${VERSION}
ENV GIT_COMMIT_SHA=${GIT_COMMIT_SHA}

WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock* backend/build.rs ./
# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source and rebuild
COPY backend/build.rs ./build.rs
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:stable-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    ffmpeg \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with default UID/GID
RUN groupadd -g 1000 filex && \
    useradd -u 1000 -g filex -m filex

WORKDIR /app

# Copy built artifacts
COPY --from=backend-builder /app/backend/target/release/filex-backend /app/filex
COPY --from=frontend-builder /app/frontend/dist /app/static

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories
RUN mkdir -p /app/data /data && \
    chown -R filex:filex /app /data

# Environment variables with defaults
ENV FM_ROOT_PATH=/data
ENV FM_HOST=0.0.0.0
ENV FM_PORT=3000
ENV FM_DATABASE_PATH=/app/data/filex.db
ENV FM_ENABLE_INDEXER=true
ENV FM_INDEX_INTERVAL=300
ENV RUST_LOG=info

# UID/GID mapping (can be overridden at runtime)
ENV PUID=1000
ENV PGID=1000

EXPOSE 3000

# Health check using curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/app/filex"]
