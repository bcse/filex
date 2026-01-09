//
//  FilexApp.swift
//  Filex
//
//  Created by Grey Lee on 2026/1/9.
//

import SwiftUI

@main
struct FilexApp: App {
    // MARK: - State

    @State private var serverConfig = ServerConfiguration()
    @State private var navigationState = NavigationState()
    @State private var directoryVM = DirectoryViewModel()
    @State private var treeVM = TreeViewModel()
    @State private var searchVM = SearchViewModel()
    @State private var uploadVM = UploadViewModel()

    // MARK: - Body

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(serverConfig)
                .environment(navigationState)
                .environment(directoryVM)
                .environment(treeVM)
                .environment(searchVM)
                .environment(uploadVM)
                .onAppear {
                    configureAPIClient()
                }
        }
        .commands {
            // File menu
            CommandGroup(replacing: .newItem) {
                Button("New Folder") {
                    NotificationCenter.default.post(name: .newFolderRequested, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])

                Divider()

                Button("Upload Files...") {
                    NotificationCenter.default.post(name: .uploadRequested, object: nil)
                }
                .keyboardShortcut("o", modifiers: [.command, .shift])

                Divider()

                Button("Quick Look") {
                    NotificationCenter.default.post(name: .quickLookRequested, object: nil)
                }
                .keyboardShortcut(" ", modifiers: [])
            }

            // Edit menu additions
            CommandGroup(after: .pasteboard) {
                Divider()

                Button("Select All") {
                    NotificationCenter.default.post(name: .selectAllRequested, object: nil)
                }
                .keyboardShortcut("a", modifiers: .command)

                Button("Rename") {
                    NotificationCenter.default.post(name: .renameRequested, object: nil)
                }

                Button("Delete") {
                    NotificationCenter.default.post(name: .deleteRequested, object: nil)
                }
                .keyboardShortcut(.delete, modifiers: [])
            }

            // Go menu
            CommandMenu("Go") {
                Button("Back") {
                    navigationState.goBack()
                }
                .keyboardShortcut("[", modifiers: .command)
                .disabled(!navigationState.canGoBack)

                Button("Forward") {
                    navigationState.goForward()
                }
                .keyboardShortcut("]", modifiers: .command)
                .disabled(!navigationState.canGoForward)

                Divider()

                Button("Go to Parent Folder") {
                    navigationState.navigateToParent()
                }
                .keyboardShortcut(.upArrow, modifiers: .command)
                .disabled(navigationState.currentPath == "/")

                Button("Go to Root") {
                    navigationState.goHome()
                }
                .keyboardShortcut("h", modifiers: [.command, .shift])
            }

            // View menu
            CommandGroup(after: .sidebar) {
                Divider()

                Button("Refresh") {
                    NotificationCenter.default.post(name: .refreshRequested, object: nil)
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }

        // Settings window
        Settings {
            SettingsView()
                .environment(serverConfig)
        }
    }

    // MARK: - Private

    private func configureAPIClient() {
        if let apiURL = serverConfig.apiBaseURL {
            Task {
                await APIClient.shared.configure(baseURL: apiURL)
            }
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let newFolderRequested = Notification.Name("newFolderRequested")
    static let uploadRequested = Notification.Name("uploadRequested")
    static let selectAllRequested = Notification.Name("selectAllRequested")
    static let renameRequested = Notification.Name("renameRequested")
    static let deleteRequested = Notification.Name("deleteRequested")
    static let refreshRequested = Notification.Name("refreshRequested")
    static let openFileRequested = Notification.Name("openFileRequested")
    static let quickLookRequested = Notification.Name("quickLookRequested")
    static let showSettingsRequested = Notification.Name("showSettingsRequested")
}

// MARK: - Settings View

struct SettingsView: View {
    @Environment(ServerConfiguration.self) private var serverConfig

    var body: some View {
        @Bindable var config = serverConfig

        TabView {
            serverTab
                .tabItem {
                    Label("Server", systemImage: "server.rack")
                }

            pathMappingsTab
                .tabItem {
                    Label("Path Mappings", systemImage: "arrow.left.arrow.right")
                }
        }
        .frame(width: 500, height: 350)
        .padding()
    }

    // MARK: - Server Tab

    private var serverTab: some View {
        @Bindable var config = serverConfig

        return Form {
            Section("Server Connection") {
                TextField("Server URL", text: $config.serverURL)
                    .textFieldStyle(.roundedBorder)

                Toggle("Remember server", isOn: $config.rememberServer)

                if serverConfig.isConfigured {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("Server configured")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    HStack {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(.orange)
                        Text("Enter a server URL (e.g., localhost:3000)")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                Button("Reset") {
                    serverConfig.reset()
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Path Mappings Tab

    private var pathMappingsTab: some View {
        @Bindable var config = serverConfig

        return VStack(alignment: .leading, spacing: 12) {
            Text("Map remote server paths to local filesystem paths")
                .font(.caption)
                .foregroundStyle(.secondary)

            List {
                ForEach($config.pathMappings) { $mapping in
                    HStack {
                        VStack(alignment: .leading) {
                            TextField("Remote prefix (e.g., /)", text: $mapping.prefix)
                                .textFieldStyle(.roundedBorder)
                            TextField("Local path (e.g., /Users/...)", text: $mapping.target)
                                .textFieldStyle(.roundedBorder)
                        }

                        Button {
                            config.pathMappings.removeAll { $0.id == mapping.id }
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 4)
                }
            }
            .listStyle(.inset)

            HStack {
                Button {
                    config.pathMappings.append(PathMapping())
                } label: {
                    Label("Add Mapping", systemImage: "plus")
                }

                Spacer()

                Text("\(config.pathMappings.filter { $0.isValid }.count) active mapping(s)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Settings Sheet (for in-app access)

struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ServerConfiguration.self) private var serverConfig

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.headline)
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.escape)
            }
            .padding()

            Divider()

            // Content
            SettingsView()
                .environment(serverConfig)
        }
        .frame(width: 520, height: 420)
    }
}
