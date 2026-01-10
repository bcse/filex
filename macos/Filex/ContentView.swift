//
//  ContentView.swift
//  Filex
//
//  Created by Grey Lee on 2026/1/9.
//

import SwiftUI

struct ContentView: View {
    @Environment(ServerConfiguration.self) private var serverConfig
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM
    @Environment(TreeViewModel.self) private var treeVM
    @Environment(SearchViewModel.self) private var searchVM

    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var showServerConfig = false
    @State private var showSettings = false
    @State private var showNoMappingAlert = false
    @State private var alertFilePath: String = ""

    var body: some View {
        Group {
            if serverConfig.isConfigured {
                mainContent
            } else {
                serverSetupView
            }
        }
        .sheet(isPresented: $showServerConfig) {
            ServerConfigSheet()
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
        }
        .alert("Path Mapping Required", isPresented: $showNoMappingAlert) {
            Button("Open Settings") {
                showSettings = true
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("To open files locally, configure path mappings in Settings.\n\nFile: \(alertFilePath)")
        }
    }

    // MARK: - Main Content

    @ViewBuilder
    private var mainContent: some View {
        @Bindable var nav = navigationState

        NavigationSplitView(columnVisibility: $columnVisibility) {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 350)
        } detail: {
            ContentAreaView()
        }
        .searchable(text: $nav.searchQuery, prompt: "Search files...")
        .onChange(of: navigationState.searchQuery) { _, newValue in
            handleSearchChange(newValue)
        }
        .onChange(of: serverConfig.apiBaseURL) { _, newURL in
            if let url = newURL {
                Task {
                    await APIClient.shared.configure(baseURL: url)
                    await loadInitialData()
                }
            }
        }
        .toolbar {
            FilexToolbarContent()
        }
        .task {
            await loadInitialData()
        }
        .onReceive(NotificationCenter.default.publisher(for: .refreshRequested)) { _ in
            Task { await refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openFileRequested)) { notification in
            handleOpenFile(notification)
        }
        .onReceive(NotificationCenter.default.publisher(for: .showSettingsRequested)) { _ in
            showSettings = true
        }
    }

    // MARK: - Server Setup View

    private var serverSetupView: some View {
        VStack(spacing: 20) {
            Image(systemName: "server.rack")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)

            Text("Welcome to Filex")
                .font(.largeTitle)
                .fontWeight(.semibold)

            Text("Connect to a Filex server to get started")
                .foregroundStyle(.secondary)

            Button("Configure Server") {
                showServerConfig = true
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Private Methods

    private func handleSearchChange(_ query: String) {
        if query.count >= 2 {
            navigationState.isSearching = true
            searchVM.search(
                query: query,
                offset: navigationState.searchOffset,
                limit: navigationState.directoryLimit,
                sortBy: navigationState.sortConfig.field,
                sortOrder: navigationState.sortConfig.order
            )
        } else if query.isEmpty {
            navigationState.isSearching = false
            searchVM.clear()
        }
    }

    private func loadInitialData() async {
        await treeVM.loadRootNodes()
        directoryVM.loadDirectory(
            path: navigationState.currentPath,
            offset: navigationState.directoryOffset,
            limit: navigationState.directoryLimit,
            sortBy: navigationState.sortConfig.field,
            sortOrder: navigationState.sortConfig.order
        )
    }

    private func refresh() async {
        await treeVM.refresh()
        directoryVM.refresh(
            path: navigationState.currentPath,
            offset: navigationState.directoryOffset,
            limit: navigationState.directoryLimit,
            sortBy: navigationState.sortConfig.field,
            sortOrder: navigationState.sortConfig.order
        )
    }

    private func handleOpenFile(_ notification: Notification) {
        guard let remotePath = notification.object as? String else { return }

        if let localPath = serverConfig.resolveLocalPath(remotePath) {
            let url = URL(fileURLWithPath: localPath)
            if FileManager.default.fileExists(atPath: localPath) {
                NSWorkspace.shared.open(url)
            } else {
                alertFilePath = remotePath
                showNoMappingAlert = true
            }
        } else {
            alertFilePath = remotePath
            showNoMappingAlert = true
        }
    }
}

// MARK: - Server Config Sheet

struct ServerConfigSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ServerConfiguration.self) private var serverConfig

    @State private var serverURL: String = ""

    var body: some View {
        VStack(spacing: 20) {
            Text("Server Configuration")
                .font(.headline)

            TextField("Server URL (e.g., localhost:3000)", text: $serverURL)
                .textFieldStyle(.roundedBorder)
                .frame(width: 300)

            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.escape)

                Button("Connect") {
                    serverConfig.serverURL = serverURL
                    serverConfig.rememberServer = true
                    dismiss()
                }
                .keyboardShortcut(.return)
                .disabled(serverURL.isEmpty)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(30)
        .onAppear {
            serverURL = serverConfig.serverURL
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(ServerConfiguration())
        .environment(NavigationState())
        .environment(DirectoryViewModel())
        .environment(TreeViewModel())
        .environment(SearchViewModel())
        .environment(UploadViewModel())
}
