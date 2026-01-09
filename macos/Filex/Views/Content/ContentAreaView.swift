//
//  ContentAreaView.swift
//  Filex
//

import SwiftUI
import UniformTypeIdentifiers

struct ContentAreaView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM
    @Environment(SearchViewModel.self) private var searchVM

    @State private var showNewFolderSheet = false
    @State private var showDeleteConfirm = false
    @State private var fileImporter = false

    var body: some View {
        VStack(spacing: 0) {
            // Main content
            if navigationState.isSearching {
                SearchResultsView()
            } else {
                FileTableView()
            }

            // Status bar
            StatusBarView()
        }
        .navigationTitle(currentTitle)
        .sheet(isPresented: $showNewFolderSheet) {
            NewFolderSheet()
        }
        .confirmationDialog(
            "Delete \(navigationState.selectedPaths.count) item(s)?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task { await deleteSelectedItems() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
        .fileImporter(
            isPresented: $fileImporter,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            handleFileImport(result)
        }
        .onReceive(NotificationCenter.default.publisher(for: .newFolderRequested)) { _ in
            showNewFolderSheet = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .deleteRequested)) { _ in
            if navigationState.hasSelection {
                showDeleteConfirm = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .uploadRequested)) { _ in
            fileImporter = true
        }
        .onReceive(NotificationCenter.default.publisher(for: .selectAllRequested)) { _ in
            navigationState.selectAll(directoryVM.entries)
        }
        .onChange(of: navigationState.currentPath) { _, newPath in
            loadDirectory(path: newPath)
        }
        .onChange(of: navigationState.directoryOffset) { _, _ in
            loadDirectory(path: navigationState.currentPath)
        }
        .onChange(of: navigationState.sortConfig) { _, _ in
            loadDirectory(path: navigationState.currentPath)
        }
    }

    // MARK: - Computed Properties

    private var currentTitle: String {
        if navigationState.isSearching {
            return "Search Results"
        }
        return PathUtils.basename(navigationState.currentPath)
    }

    // MARK: - Private Methods

    private func loadDirectory(path: String) {
        directoryVM.loadDirectory(
            path: path,
            offset: navigationState.directoryOffset,
            limit: navigationState.directoryLimit,
            sortBy: navigationState.sortConfig.field,
            sortOrder: navigationState.sortConfig.order
        )
    }

    private func deleteSelectedItems() async {
        for path in navigationState.selectedPaths {
            do {
                _ = try await APIClient.shared.delete(path: path)
            } catch {
                // Handle error - could show alert
                print("Failed to delete \(path): \(error)")
            }
        }
        navigationState.clearSelection()
        loadDirectory(path: navigationState.currentPath)
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            Task {
                do {
                    _ = try await APIClient.shared.upload(
                        to: navigationState.currentPath,
                        files: urls
                    ) { _ in }
                    loadDirectory(path: navigationState.currentPath)
                } catch {
                    print("Upload failed: \(error)")
                }
            }
        case .failure(let error):
            print("File import failed: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    ContentAreaView()
        .environment(NavigationState())
        .environment(DirectoryViewModel())
        .environment(SearchViewModel())
}
