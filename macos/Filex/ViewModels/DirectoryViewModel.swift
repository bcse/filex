import Foundation
import SwiftUI

/// View model for directory listing
@Observable
@MainActor
final class DirectoryViewModel {
    /// Current directory entries
    private(set) var entries: [FileEntry] = []

    /// Total count of entries in the directory
    private(set) var total: Int = 0

    /// Whether data is being loaded
    private(set) var isLoading: Bool = false

    /// Error message if load failed
    private(set) var errorMessage: String?

    /// API client for requests
    private let apiClient: APIClient

    /// Current load task (for cancellation)
    private var loadTask: Task<Void, Never>?

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    /// Load directory contents
    func loadDirectory(
        path: String,
        offset: Int = 0,
        limit: Int = 100,
        sortBy: SortField = .name,
        sortOrder: SortOrder = .ascending
    ) {
        // Cancel any pending load
        loadTask?.cancel()

        loadTask = Task {
            await performLoad(path: path, offset: offset, limit: limit, sortBy: sortBy, sortOrder: sortOrder)
        }
    }

    /// Refresh current directory (keeping same parameters)
    func refresh(
        path: String,
        offset: Int,
        limit: Int,
        sortBy: SortField,
        sortOrder: SortOrder
    ) {
        loadDirectory(path: path, offset: offset, limit: limit, sortBy: sortBy, sortOrder: sortOrder)
    }

    /// Get entry by path
    func entry(for path: String) -> FileEntry? {
        entries.first { $0.path == path }
    }

    /// Get entries for selected paths
    func entries(for paths: Set<String>) -> [FileEntry] {
        entries.filter { paths.contains($0.path) }
    }

    /// Clear entries
    func clear() {
        entries = []
        total = 0
        errorMessage = nil
    }

    // MARK: - Private

    private func performLoad(
        path: String,
        offset: Int,
        limit: Int,
        sortBy: SortField,
        sortOrder: SortOrder
    ) async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await apiClient.listDirectory(
                path: path,
                offset: offset,
                limit: limit,
                sortBy: sortBy,
                sortOrder: sortOrder
            )

            guard !Task.isCancelled else { return }

            entries = response.entries
            total = response.total
        } catch is CancellationError {
            // Ignore cancellation
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
            entries = []
            total = 0
        }

        isLoading = false
    }
}

// MARK: - Pagination

extension DirectoryViewModel {
    /// Check if there are more pages
    var hasMore: Bool {
        entries.count < total
    }

    /// Total number of pages
    func totalPages(limit: Int) -> Int {
        guard limit > 0 else { return 1 }
        return (total + limit - 1) / limit
    }

    /// Current page number (0-indexed)
    func currentPage(offset: Int, limit: Int) -> Int {
        guard limit > 0 else { return 0 }
        return offset / limit
    }
}

// MARK: - Environment Key

private struct DirectoryViewModelKey: EnvironmentKey {
    @MainActor static let defaultValue: DirectoryViewModel = DirectoryViewModel()
}

extension EnvironmentValues {
    var directoryViewModel: DirectoryViewModel {
        get { self[DirectoryViewModelKey.self] }
        set { self[DirectoryViewModelKey.self] = newValue }
    }
}
