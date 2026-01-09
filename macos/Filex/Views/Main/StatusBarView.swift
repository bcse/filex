//
//  StatusBarView.swift
//  Filex
//

import SwiftUI

struct StatusBarView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM
    @Environment(SearchViewModel.self) private var searchVM

    var body: some View {
        HStack {
            // Item count
            Text(statusText)
                .font(.caption)
                .foregroundStyle(.secondary)

            Spacer()

            // Pagination controls
            if showPagination {
                paginationControls
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
    }

    // MARK: - Computed Properties

    private var isSearching: Bool {
        navigationState.isSearching
    }

    private var total: Int {
        isSearching ? searchVM.total : directoryVM.total
    }

    private var currentOffset: Int {
        isSearching ? navigationState.searchOffset : navigationState.directoryOffset
    }

    private var limit: Int {
        navigationState.directoryLimit
    }

    private var currentPage: Int {
        guard limit > 0 else { return 0 }
        return currentOffset / limit
    }

    private var totalPages: Int {
        guard limit > 0 else { return 1 }
        return max(1, (total + limit - 1) / limit)
    }

    private var showPagination: Bool {
        totalPages > 1
    }

    private var canGoBack: Bool {
        currentPage > 0
    }

    private var canGoForward: Bool {
        currentPage < totalPages - 1
    }

    private var statusText: String {
        if total == 0 {
            return "No items"
        }

        let start = currentOffset + 1
        let end = min(currentOffset + limit, total)

        if isSearching {
            return "\(start)-\(end) of \(total) results"
        } else {
            return "\(start)-\(end) of \(total) items"
        }
    }

    // MARK: - Pagination Controls

    private var paginationControls: some View {
        HStack(spacing: 4) {
            // First page
            Button(action: goToFirstPage) {
                Image(systemName: "chevron.left.2")
            }
            .buttonStyle(.borderless)
            .disabled(!canGoBack)

            // Previous page
            Button(action: goToPreviousPage) {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.borderless)
            .disabled(!canGoBack)

            // Page indicator
            Text("Page \(currentPage + 1) of \(totalPages)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(minWidth: 100)

            // Next page
            Button(action: goToNextPage) {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.borderless)
            .disabled(!canGoForward)

            // Last page
            Button(action: goToLastPage) {
                Image(systemName: "chevron.right.2")
            }
            .buttonStyle(.borderless)
            .disabled(!canGoForward)
        }
    }

    // MARK: - Actions

    private func goToFirstPage() {
        navigationState.goToPage(0)
    }

    private func goToPreviousPage() {
        navigationState.previousPage()
    }

    private func goToNextPage() {
        navigationState.nextPage()
    }

    private func goToLastPage() {
        navigationState.goToPage(totalPages - 1)
    }
}

// MARK: - Preview

#Preview {
    StatusBarView()
        .environment(NavigationState())
        .environment(DirectoryViewModel())
        .environment(SearchViewModel())
}
