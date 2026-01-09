# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Filex macOS is a native macOS desktop client for the Filex file manager server. Built with SwiftUI using the @Observable pattern for state management. Communicates with a Filex backend server via REST API.

## Build Commands

```bash
# Build from command line
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Debug build

# Run tests
xcodebuild -project Filex.xcodeproj -scheme Filex test

# Build for release
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Release build
```

Open `Filex.xcodeproj` in Xcode for GUI-based development.

## Architecture

### State Management

Uses SwiftUI's @Observable macro with SwiftUI Environment for dependency injection. All observable state objects are created in `FilexApp.swift` and passed via `.environment()`:

- **ServerConfiguration** - Server URL, auth persistence, path mappings (remote→local)
- **NavigationState** - Current path, selection, clipboard, history, sorting, search state
- **DirectoryViewModel** - Directory listing with pagination
- **TreeViewModel** - Sidebar folder tree with lazy loading and caching
- **SearchViewModel** - Search results
- **UploadViewModel** - Upload queue and progress

### API Layer

`APIClient` is an actor-based singleton (`APIClient.shared`) handling all server communication:
- Browse: `listDirectory`, `getTree`
- Search: `search`
- File ops: `createDirectory`, `rename`, `move`, `copy`, `delete`, `upload`
- Auth: `login`, `logout`, `getAuthStatus`

### View Hierarchy

```
FilexApp (WindowGroup + commands)
└── ContentView (NavigationSplitView)
    ├── SidebarView (tree navigation)
    └── ContentAreaView
        ├── FileTableView (directory listing with Table)
        └── SearchResultsView
```

### Communication Pattern

Views communicate via NotificationCenter for menu-triggered actions:
- `.newFolderRequested`, `.uploadRequested`, `.renameRequested`, `.deleteRequested`
- `.refreshRequested`, `.openFileRequested`, `.quickLookRequested`

### Path Mapping

The app maps remote server paths to local filesystem paths via `ServerConfiguration.pathMappings`. This enables:
- Opening files locally with default apps
- QuickLook preview using local files
- Configured in Settings → Path Mappings tab

## Verification Workflow

**IMPORTANT**: After implementing a feature or fixing a bug, always run the test server and the app to verify the work. Do not assume changes are correct without manual verification.

```bash
# 1. Start the backend test server (from backend directory)
cd ../backend && FM_ROOT_PATH=../testdata FM_DATABASE_PATH=./data/filex.db FM_PORT=3434 cargo run

# 2. Build and run the macOS app
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Debug build
# Or open Filex.xcodeproj in Xcode and run (Cmd+R)

# 3. Configure app to connect to localhost:3434
```

## Key Patterns

- ViewModels use `Task` for async operations with cancellation support
- `@MainActor` isolation on all ViewModels and NavigationState
- Custom EnvironmentKeys for each observable type
- Server-side sorting via API parameters (not client-side)
