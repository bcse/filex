# Repository Guidelines

## Project Overview

Filex is a self-hosted, web-based file manager with a desktop-like interface. Single Rust binary + SQLite, with optional ffprobe for media metadata enrichment.

## Project Structure
- `backend/`: Rust/Axum API server, SQLite access, indexing, search, and file ops.
- `frontend/`: React + TypeScript UI built with Vite; components, hooks, stores, and tests live under `frontend/src/`.
- `docker/`: Dockerfile, entrypoint, compose files, and proxy examples.
- `docs/`: diagrams and screenshots.

## Build, Test, and Development Commands
- `cd backend && cargo run`: run the API server on `:3000`.
- `cd backend && cargo test`: run backend unit/integration tests.
- `cd frontend && npm install`: install frontend dependencies.
- `cd frontend && npm run dev`: start the Vite dev server on `:5173` (proxies API to `:3000`).
- `cd frontend && npm run build`: typecheck and build the production UI.
- `cd frontend && npm run test`: run Vitest once.
- `cd frontend && npm run lint`: run ESLint (auto-fix enabled).
- `cd docker && docker-compose up --build`: run the full stack in Docker.

Frontend change checklist: format, lint, test, build, then sync `dist/` into `backend/static/`.
```bash
cd frontend && npm run format && npm run lint && npm run test:coverage && npm run build
cp -r dist/* ../backend/static/
```

Backend change checklist: format and run tests.
```bash
cd backend && cargo fmt && cargo test
```

Local test server (run in `backend/`):
```bash
FM_ROOT_PATH=../testdata FM_DATABASE_PATH=./data/filex.db FM_PORT=3434 cargo run
```

## Coding Style & Naming Conventions
- Follow existing patterns in each folder; avoid large refactors without need.
- Frontend formatting uses ESLint + Prettier (`npm run lint`, `npm run format`).
- Tests follow `*.test.ts` / `*.test.tsx` naming in `frontend/src/`.
- Rust tests live alongside code in `#[cfg(test)]` modules.

## Testing Guidelines
- Frontend: Vitest + Testing Library; run targeted tests during UI changes.
- Backend: `cargo test` for API and service behavior.
- Keep new tests close to the affected module or component.

## Commit & Pull Request Guidelines
- Commit history uses conventional prefixes like `feat`, `fix`, `refactor`, `chore`, `test`, `perf` (sometimes with a scope, e.g. `feat(frontend): ...`).
- PRs should include: a short summary, key behavior changes, and tests run.
- For UI changes, include screenshots or a short screen recording when possible.

## Configuration
- Core config is via env vars (`FM_ROOT_PATH`, `FM_PORT`, `FM_DATABASE_PATH`, etc.).
- Search matches file/folder paths (not contents); indexing powers search and media metadata.
- ffprobe (from FFmpeg) enriches media metadata; the Docker image includes it.
- `.fxignore` files (gitignore-style) exclude paths from the search index.

## Architecture

### Backend (Rust/Axum)

**API Layer** (`backend/src/api/`): REST endpoints for browse, files, search, auth, system.

**Services** (`backend/src/services/`):
- `FilesystemService` - File operations with path safety (prevents directory traversal via canonicalization)
- `IndexerService` - Background loop scanning files into SQLite
- `SearchService` - In-memory search index built from database
- `MetadataService` - Extracts media metadata via ffprobe

**Database**: SQLite with WAL mode. Two-phase indexing: fast path scan, then async metadata extraction.

**Data flow**: API Request → Auth Middleware → Handler → Service → DB/Filesystem → Response with FileEntry objects enriched with indexed metadata.

### Frontend (React/TypeScript)

**State Management** (Zustand stores in `frontend/src/stores/`):
- `navigation.ts` - Current path, selection, clipboard, history, sorting, layout
- `upload.ts` - Upload queue with progress tracking
- `theme.ts` - Light/dark/system theme with persistence
- `auth.ts` - Auth status

**Key Hooks** (`frontend/src/hooks/`):
- `useDirectory` - Fetch directory contents with pagination
- `useSearch` - Search with query state
- `useKeyboard` - Keyboard shortcuts

**API Client** (`frontend/src/api/client.ts`): Centralized REST wrapper with error handling.

**UI Patterns**: Virtual scrolling for large directories, drag-and-drop uploads, keyboard navigation.
