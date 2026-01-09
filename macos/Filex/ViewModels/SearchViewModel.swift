import Foundation
import SwiftUI

/// View model for search functionality
@Observable
@MainActor
final class SearchViewModel {
    /// Search results
    private(set) var results: [FileEntry] = []

    /// Total count of results
    private(set) var total: Int = 0

    /// Current search query
    private(set) var query: String = ""

    /// Whether search is in progress
    private(set) var isSearching: Bool = false

    /// Error message if search failed
    private(set) var errorMessage: String?

    /// API client for requests
    private let apiClient: APIClient

    /// Current search task (for cancellation)
    private var searchTask: Task<Void, Never>?

    /// Debounce delay for search input
    private let debounceDelay: Duration = .milliseconds(300)

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    /// Perform search with query
    func search(
        query: String,
        offset: Int = 0,
        limit: Int = 100,
        sortBy: SortField = .name,
        sortOrder: SortOrder = .ascending
    ) {
        // Cancel any pending search
        searchTask?.cancel()

        self.query = query

        // Don't search for very short queries
        guard query.count >= 2 else {
            results = []
            total = 0
            return
        }

        searchTask = Task {
            // Debounce
            try? await Task.sleep(for: debounceDelay)
            guard !Task.isCancelled else { return }

            await performSearch(query: query, offset: offset, limit: limit, sortBy: sortBy, sortOrder: sortOrder)
        }
    }

    /// Search immediately without debounce
    func searchImmediately(
        query: String,
        offset: Int = 0,
        limit: Int = 100,
        sortBy: SortField = .name,
        sortOrder: SortOrder = .ascending
    ) {
        searchTask?.cancel()
        self.query = query

        guard query.count >= 2 else {
            results = []
            total = 0
            return
        }

        searchTask = Task {
            await performSearch(query: query, offset: offset, limit: limit, sortBy: sortBy, sortOrder: sortOrder)
        }
    }

    /// Get entry by path
    func entry(for path: String) -> FileEntry? {
        results.first { $0.path == path }
    }

    /// Clear search results
    func clear() {
        searchTask?.cancel()
        query = ""
        results = []
        total = 0
        errorMessage = nil
    }

    // MARK: - Private

    private func performSearch(
        query: String,
        offset: Int,
        limit: Int,
        sortBy: SortField,
        sortOrder: SortOrder
    ) async {
        isSearching = true
        errorMessage = nil

        do {
            let response = try await apiClient.search(
                query: query,
                offset: offset,
                limit: limit,
                sortBy: sortBy,
                sortOrder: sortOrder
            )

            guard !Task.isCancelled else { return }

            results = response.entries
            total = response.total
        } catch is CancellationError {
            // Ignore cancellation
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
            results = []
            total = 0
        }

        isSearching = false
    }
}

// MARK: - Pagination

extension SearchViewModel {
    /// Check if there are more pages
    var hasMore: Bool {
        results.count < total
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

private struct SearchViewModelKey: EnvironmentKey {
    @MainActor static let defaultValue: SearchViewModel = SearchViewModel()
}

extension EnvironmentValues {
    var searchViewModel: SearchViewModel {
        get { self[SearchViewModelKey.self] }
        set { self[SearchViewModelKey.self] = newValue }
    }
}
