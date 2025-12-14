# Filex

A self-hosted, web-based file manager with a familiar desktop-like interface.

Filex is a minimal, opinionated file browser for managing files on remote servers through your web browser. Single binary + SQLite. No external dependencies.

![Screenshot](/docs/screenshot.png?raw=true "Screenshot")

## Features

- **Desktop-like UX** — Keyboard shortcuts, drag & drop, multi-select, context menus
- **Fast browsing** — Real-time directory listings, virtual scrolling for large folders
- **Full-text search** — Background-indexed file search with filters
- **File operations** — Create, rename, delete, copy, move, upload, download
- **Media-aware** — Image/video/audio metadata, dimensions, duration
- **Grid & list views** — Toggle between table and thumbnail grid
- **Dark mode** — Follows system preference with manual toggle
- **Optional auth** — Simple password protection
- **Docker-ready** — UID/GID mapping, health checks

## Quick Start

```bash
docker run -d \
  -p 3000:3000 \
  -v /path/to/your/files:/data \
  -v filex_data:/app/data \
  ghcr.io/bcse/filex:latest
```

Visit `http://localhost:3000`

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FM_ROOT_PATH` | `/data` | Root directory to serve |
| `FM_HOST` | `0.0.0.0` | Server bind address |
| `FM_PORT` | `3000` | Server port |
| `FM_DATABASE_PATH` | `/app/data/filex.db` | SQLite database location |
| `FM_ENABLE_INDEXER` | `true` | Enable background indexing |
| `FM_INDEX_INTERVAL` | `300` | Indexer run interval (seconds) |
| `FM_AUTH_ENABLED` | `false` | Enable password authentication |
| `FM_AUTH_PASSWORD` | (none) | Password for authentication |
| `FM_SESSION_TIMEOUT` | `86400` | Session timeout in seconds |
| `RUST_LOG` | `info` | Log level |
| `PUID` | `1000` | User ID for file permissions (Docker) |
| `PGID` | `1000` | Group ID for file permissions (Docker) |

## Docker Deployment

### Basic Setup

```yaml
# docker-compose.yml
services:
  filex:
    image: ghcr.io/bcse/filex:latest
    ports:
      - "3000:3000"
    volumes:
      - /path/to/your/files:/data:rw
      - filex_data:/app/data
    environment:
      - PUID=1000
      - PGID=1000

volumes:
  filex_data:
```

### With Password Protection

```yaml
environment:
  - FM_AUTH_ENABLED=true
  - FM_AUTH_PASSWORD=your-secure-password
```

### Volume Mounting

Mount read-write for full access:
```yaml
volumes:
  - /home/user/documents:/data:rw
```

Or read-only for browse-only mode:
```yaml
volumes:
  - /mnt/media:/data:ro
```

Mount multiple directories:
```yaml
volumes:
  - /mnt/photos:/data/photos:ro
  - /mnt/documents:/data/documents:rw
```

### UID/GID Mapping

Find your user's UID/GID:
```bash
id
# Output: uid=1000(username) gid=1000(username) ...
```

## Development

### Backend

```bash
cd backend
cargo run
# Server starts on http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Dev server on http://localhost:5173 (proxies API to :3000)
```

### Docker

```bash
cd docker
docker-compose up --build
```

## License

MIT
