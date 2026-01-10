//
//  SearchResultsView.swift
//  Filex
//

import SwiftUI

struct SearchResultsView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(SearchViewModel.self) private var searchVM

    var body: some View {
        Group {
            if searchVM.isSearching && searchVM.results.isEmpty {
                loadingView
            } else if let error = searchVM.errorMessage {
                errorView(error)
            } else if searchVM.results.isEmpty {
                emptyView
            } else {
                tableView
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Searching...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Search Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        ContentUnavailableView {
            Label("No Results", systemImage: "magnifyingglass")
        } description: {
            Text("No files found matching \"\(searchVM.query)\"")
        } actions: {
            Button("Clear Search") {
                navigationState.clearSearch()
            }
        }
    }

    // MARK: - Table View

    private var tableView: some View {
        Table(of: FileEntry.self, selection: Binding(
            get: { navigationState.selectedPaths },
            set: { navigationState.selectedPaths = $0 }
        )) {
            // Icon column
            TableColumn("") { entry in
                FileIconView(entry: entry)
            }
            .width(24)

            // Name column
            TableColumn("Name") { entry in
                Text(entry.name)
                    .lineLimit(1)
                    .help(entry.name)
            }
            .width(min: 150, ideal: 200)

            // Path column (unique to search results)
            TableColumn("Location") { entry in
                Text(PathUtils.dirname(entry.path))
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
                    .help(entry.path)
            }
            .width(min: 150, ideal: 200)

            // Size column
            TableColumn("Size") { entry in
                Text(entry.isDir ? "-" : FileUtils.formatSize(entry.size))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            .width(80)

            // Modified column
            TableColumn("Modified") { entry in
                Text(DateFormatting.formatStandard(entry.modified))
                    .foregroundStyle(.secondary)
            }
            .width(140)

            // Type column
            TableColumn("Type") { entry in
                Text(entry.isDir ? "Folder" : FileUtils.typeFromMime(entry.mimeType))
                    .foregroundStyle(.secondary)
            }
            .width(80)
        } rows: {
            ForEach(searchVM.results, id: \.path) { entry in
                TableRow(entry)
            }
        }
        .tableStyle(.inset(alternatesRowBackgrounds: true))
        .contextMenu(forSelectionType: String.self) { paths in
            SearchContextMenu(selectedPaths: paths)
        } primaryAction: { paths in
            handlePrimaryAction(paths)
        }
    }

    // MARK: - Private Methods

    private func handlePrimaryAction(_ paths: Set<String>) {
        guard let path = paths.first,
              let entry = searchVM.entry(for: path) else { return }

        if entry.isDir {
            navigationState.clearSearch()
            navigationState.navigate(to: entry.path)
        } else {
            NotificationCenter.default.post(name: .openFileRequested, object: entry.path)
        }
    }
}

// MARK: - Search Context Menu

struct SearchContextMenu: View {
    let selectedPaths: Set<String>
    @Environment(NavigationState.self) private var navigationState
    @Environment(SearchViewModel.self) private var searchVM

    var body: some View {
        if let path = selectedPaths.first,
           selectedPaths.count == 1,
           let entry = searchVM.entry(for: path) {
            if entry.isDir {
                Button("Open Folder") {
                    navigationState.clearSearch()
                    navigationState.navigate(to: entry.path)
                }
            } else {
                Button("Open") {
                    NotificationCenter.default.post(name: .openFileRequested, object: entry.path)
                }
            }

            Button("Show in Folder") {
                navigationState.clearSearch()
                navigationState.navigate(to: PathUtils.dirname(entry.path))
            }

            Divider()
        }

        Button("Copy") {
            navigationState.copySelectedFiles()
        }
        .disabled(selectedPaths.isEmpty)
    }
}

// MARK: - Preview

#Preview {
    SearchResultsView()
        .environment(NavigationState())
        .environment(SearchViewModel())
}
