# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Filex macOS is a native macOS desktop client for the Filex file manager server. Built with SwiftUI using the @Observable pattern for state management. Communicates with a Filex backend server via REST API.

## Build Commands

```bash
# Build from command line (output to .build folder)
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Debug -derivedDataPath ./.build build

# Run tests
xcodebuild -project Filex.xcodeproj -scheme Filex -derivedDataPath ./.build test

# Build for release
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Release -derivedDataPath ./.build build

# Launch the built app
open ./.build/Build/Products/Debug/Filex.app
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
        ├── FileTableView (NSTableView wrapper with in-place editing and Quick Look)
        └── SearchResultsView
```

### Communication Pattern

Views communicate via NotificationCenter for menu-triggered actions:
- `.newFolderRequested`, `.uploadRequested`, `.renameRequested`, `.deleteRequested`
- `.refreshRequested`, `.openFileRequested`

### Quick Look Integration

Quick Look is integrated directly into the NSTableView:
- Space key toggles Quick Look panel (handled in `QuickLookTableView.keyDown`)
- Table view subclass implements `acceptsPreviewPanelControl`, `beginPreviewPanelControl`, `endPreviewPanelControl`
- Coordinator implements `QLPreviewPanelDataSource` and `QLPreviewPanelDelegate`
- Selection changes automatically reload Quick Look data
- Uses path mappings to resolve remote paths to local file URLs

### Path Mapping

The app maps remote server paths to local filesystem paths via `ServerConfiguration.pathMappings`. This enables:
- Opening files locally with default apps
- Quick Look preview using local files
- Configured in Settings → Path Mappings tab

## Verification Workflow

**IMPORTANT**: After implementing a feature or fixing a bug, always run the test server and the app to verify the work. Do not assume changes are correct without manual verification. Use Peekaboo to automate UI testing.

```bash
# 1. Start the backend test server (from backend directory)
cd ../backend && FM_ROOT_PATH=../testdata FM_DATABASE_PATH=./data/filex.db FM_PORT=3434 cargo run &

# 2. Build and run the macOS app
xcodebuild -project Filex.xcodeproj -scheme Filex -configuration Debug -derivedDataPath ./.build build
open ./.build/Build/Products/Debug/Filex.app

# 3. Use Peekaboo to verify UI behavior
peekaboo app switch --to Filex
peekaboo see --app Filex --annotate --path /tmp/filex-test.png
peekaboo click --app Filex --on <element_id>
peekaboo press <key> --app Filex
```

### Peekaboo Testing Tips

- Always use `peekaboo see --annotate` to capture UI state and get element IDs
- Use `--app Filex` to target the app specifically
- Use `peekaboo press` for keyboard input (space, arrow keys, escape, etc.)
- View annotated screenshots with the Read tool to inspect UI state
- Verify features work before claiming they are fixed

## Key Patterns

- ViewModels use `Task` for async operations with cancellation support
- `@MainActor` isolation on all ViewModels and NavigationState
- Custom EnvironmentKeys for each observable type
- Server-side sorting via API parameters (not client-side)
