# Build stage for frontend
FROM node:25 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM rust:1 AS backend-builder

WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock* ./
# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source and rebuild
COPY backend/src ./src
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:stable-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 filemanager

WORKDIR /app

# Copy built artifacts
COPY --from=backend-builder /app/backend/target/release/filemanager-backend /app/filemanager
COPY --from=frontend-builder /app/frontend/dist /app/static

# Create directories
RUN mkdir -p /app/data /data && \
    chown -R filemanager:filemanager /app /data

# Environment variables
ENV FM_ROOT_PATH=/data
ENV FM_HOST=0.0.0.0
ENV FM_PORT=3000
ENV FM_DATABASE_PATH=/app/data/filemanager.db
ENV FM_ENABLE_INDEXER=true
ENV FM_INDEX_INTERVAL=300
ENV RUST_LOG=info

# The user can override PUID/PGID at runtime
ENV PUID=1000
ENV PGID=1000

USER filemanager

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["/app/filemanager"]
