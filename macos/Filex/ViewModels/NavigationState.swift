import Foundation
import SwiftUI

/// History entry for navigation back/forward
enum HistoryEntry: Equatable, Sendable {
    case path(String, offset: Int)
    case search(path: String, pathOffset: Int, query: String, searchOffset: Int)

    var displayPath: String {
        switch self {
        case .path(let path, _):
            return path
        case .search(let path, _, _, _):
            return path
        }
    }
}

/// Central navigation and selection state for the app
@Observable
@MainActor
final class NavigationState {
    // MARK: - Current Location

    /// Current directory path
    var currentPath: String = "/"

    /// Offset for directory pagination
    var directoryOffset: Int = 0

    /// Limit for directory pagination
    var directoryLimit: Int = 100

    /// Current sort configuration
    var sortConfig: SortConfig = SortConfig()

    // MARK: - Selection

    /// Currently selected file paths
    var selectedPaths: Set<String> = []

    /// Last selected path (for range selection)
    var lastSelectedPath: String?

    // MARK: - Search

    /// Current search query
    var searchQuery: String = ""

    /// Whether search mode is active
    var isSearching: Bool = false

    /// Offset for search pagination
    var searchOffset: Int = 0

    // MARK: - Clipboard

    /// Clipboard state for copy/cut operations
    var clipboard: ClipboardState = .empty

    // MARK: - Preview

    /// Currently previewed file entry
    var previewEntry: FileEntry?

    // MARK: - Navigation History

    /// Navigation history stack
    private(set) var history: [HistoryEntry] = [.path("/", offset: 0)]

    /// Current position in history
    private(set) var historyIndex: Int = 0

    // MARK: - Computed Properties

    /// Check if can go back in history
    var canGoBack: Bool {
        historyIndex > 0
    }

    /// Check if can go forward in history
    var canGoForward: Bool {
        historyIndex < history.count - 1
    }

    /// Path components for breadcrumb display
    var pathComponents: [(name: String, path: String)] {
        guard currentPath != "/" else {
            return [("Root", "/")]
        }

        var components: [(name: String, path: String)] = [("Root", "/")]
        var currentBuildPath = ""

        for part in currentPath.split(separator: "/") {
            currentBuildPath += "/" + part
            components.append((String(part), currentBuildPath))
        }

        return components
    }

    /// Check if there's content in clipboard
    var hasClipboardContent: Bool {
        !clipboard.isEmpty
    }

    /// Check if single item is selected
    var hasSingleSelection: Bool {
        selectedPaths.count == 1
    }

    /// Check if any items are selected
    var hasSelection: Bool {
        !selectedPaths.isEmpty
    }

    // MARK: - Navigation Methods

    /// Navigate to a path
    func navigate(to path: String, recordHistory: Bool = true) {
        let normalizedPath = path.isEmpty ? "/" : path
        currentPath = normalizedPath
        directoryOffset = 0
        selectedPaths.removeAll()
        lastSelectedPath = nil

        if isSearching {
            isSearching = false
            searchQuery = ""
            searchOffset = 0
        }

        if recordHistory {
            pushHistory(.path(normalizedPath, offset: 0))
        }
    }

    /// Navigate to parent directory
    func navigateToParent() {
        guard currentPath != "/" else { return }
        let parent = (currentPath as NSString).deletingLastPathComponent
        navigate(to: parent.isEmpty ? "/" : parent)
    }

    /// Go back in history
    func goBack() {
        guard canGoBack else { return }
        historyIndex -= 1
        applyHistoryEntry(history[historyIndex])
    }

    /// Go forward in history
    func goForward() {
        guard canGoForward else { return }
        historyIndex += 1
        applyHistoryEntry(history[historyIndex])
    }

    /// Navigate to home (root)
    func goHome() {
        navigate(to: "/")
    }

    // MARK: - Selection Methods

    /// Select a single file (clearing others)
    func selectFile(_ path: String) {
        selectedPaths = [path]
        lastSelectedPath = path
    }

    /// Toggle selection of a file (for Cmd+click)
    func toggleSelection(_ path: String) {
        if selectedPaths.contains(path) {
            selectedPaths.remove(path)
        } else {
            selectedPaths.insert(path)
        }
        lastSelectedPath = path
    }

    /// Add files to selection (for range selection)
    func extendSelection(_ paths: [String]) {
        selectedPaths.formUnion(paths)
        lastSelectedPath = paths.last
    }

    /// Select all entries from a list
    func selectAll(_ entries: [FileEntry]) {
        selectedPaths = Set(entries.map(\.path))
        lastSelectedPath = entries.last?.path
    }

    /// Clear selection
    func clearSelection() {
        selectedPaths.removeAll()
        lastSelectedPath = nil
    }

    // MARK: - Clipboard Methods

    /// Copy selected files to clipboard
    func copySelectedFiles() {
        guard hasSelection else { return }
        clipboard = .copy(Array(selectedPaths))
    }

    /// Cut selected files to clipboard
    func cutSelectedFiles() {
        guard hasSelection else { return }
        clipboard = .cut(Array(selectedPaths))
    }

    /// Clear clipboard
    func clearClipboard() {
        clipboard = .empty
    }

    // MARK: - Search Methods

    /// Start search with query
    func startSearch(_ query: String) {
        searchQuery = query
        isSearching = query.count >= 2
        searchOffset = 0
        selectedPaths.removeAll()
        lastSelectedPath = nil

        if isSearching {
            pushHistory(.search(
                path: currentPath,
                pathOffset: directoryOffset,
                query: query,
                searchOffset: 0
            ))
        }
    }

    /// Clear search and return to directory view
    func clearSearch() {
        searchQuery = ""
        isSearching = false
        searchOffset = 0
        selectedPaths.removeAll()
        lastSelectedPath = nil
    }

    // MARK: - Preview Methods

    /// Open preview for a file entry
    func openPreview(_ entry: FileEntry) {
        previewEntry = entry
    }

    /// Close preview
    func closePreview() {
        previewEntry = nil
    }

    // MARK: - Pagination Methods

    /// Go to next page
    func nextPage() {
        if isSearching {
            searchOffset += directoryLimit
        } else {
            directoryOffset += directoryLimit
        }
    }

    /// Go to previous page
    func previousPage() {
        if isSearching {
            searchOffset = max(0, searchOffset - directoryLimit)
        } else {
            directoryOffset = max(0, directoryOffset - directoryLimit)
        }
    }

    /// Go to specific page
    func goToPage(_ page: Int) {
        let newOffset = page * directoryLimit
        if isSearching {
            searchOffset = newOffset
        } else {
            directoryOffset = newOffset
        }
    }

    // MARK: - Private Methods

    private func pushHistory(_ entry: HistoryEntry) {
        // Truncate forward history
        history = Array(history.prefix(historyIndex + 1))
        history.append(entry)
        historyIndex = history.count - 1
    }

    private func applyHistoryEntry(_ entry: HistoryEntry) {
        switch entry {
        case .path(let path, let offset):
            currentPath = path
            directoryOffset = offset
            isSearching = false
            searchQuery = ""
            searchOffset = 0

        case .search(let path, let pathOffset, let query, let searchOff):
            currentPath = path
            directoryOffset = pathOffset
            searchQuery = query
            searchOffset = searchOff
            isSearching = true
        }

        selectedPaths.removeAll()
        lastSelectedPath = nil
    }
}

// MARK: - Environment Key

private struct NavigationStateKey: EnvironmentKey {
    @MainActor static let defaultValue: NavigationState = NavigationState()
}

extension EnvironmentValues {
    var navigationState: NavigationState {
        get { self[NavigationStateKey.self] }
        set { self[NavigationStateKey.self] = newValue }
    }
}
