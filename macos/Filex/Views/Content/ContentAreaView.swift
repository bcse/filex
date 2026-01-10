//
//  ContentAreaView.swift
//  Filex
//

import AppKit
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Window Title Command-Click Handler

/// Monitors Command-clicks on the window title and shows path menu
struct WindowTitleClickMonitor: NSViewRepresentable {
    let currentPath: String
    let onNavigate: (String) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            context.coordinator.setupMonitor(for: view.window)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.currentPath = currentPath
        context.coordinator.onNavigate = onNavigate
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPath: currentPath, onNavigate: onNavigate)
    }

    class Coordinator: NSObject {
        var currentPath: String
        var onNavigate: (String) -> Void
        private var monitor: Any?
        private weak var window: NSWindow?

        init(currentPath: String, onNavigate: @escaping (String) -> Void) {
            self.currentPath = currentPath
            self.onNavigate = onNavigate
        }

        deinit {
            if let monitor = monitor {
                NSEvent.removeMonitor(monitor)
            }
        }

        func setupMonitor(for window: NSWindow?) {
            guard let window = window, self.window == nil else { return }
            self.window = window

            monitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
                guard let self = self else { return event }

                // Check if Command key is pressed
                guard event.modifierFlags.contains(.command) else { return event }

                guard let window = self.window,
                      let titleTextField = self.findTitleTextField(in: window) else { return event }

                let locationInWindow = event.locationInWindow
                let titleFrame = titleTextField.convert(titleTextField.bounds, to: nil)

                // Check if click is on the title text
                if titleFrame.contains(locationInWindow) {
                    self.showPathMenu(in: titleTextField, at: locationInWindow)
                    return nil // Consume the event
                }

                return event
            }
        }

        private func findTitleTextField(in window: NSWindow) -> NSTextField? {
            guard let themeFrame = window.contentView?.superview else { return nil }

            // Search recursively for NSTextField that contains the window title
            return findTitleTextFieldRecursive(in: themeFrame, windowTitle: window.title)
        }

        private func findTitleTextFieldRecursive(in view: NSView, windowTitle: String) -> NSTextField? {
            // Check if this is a text field with the window title
            if let textField = view as? NSTextField {
                // Match by content or by being in the titlebar area
                if textField.stringValue == windowTitle {
                    return textField
                }
            }

            // Recurse into subviews
            for subview in view.subviews {
                if let found = findTitleTextFieldRecursive(in: subview, windowTitle: windowTitle) {
                    return found
                }
            }

            return nil
        }

        func showPathMenu(in titleView: NSView, at locationInWindow: NSPoint) {
            let menu = NSMenu()
            let pathComponents = buildPathComponents(from: currentPath)

            for (index, component) in pathComponents.enumerated() {
                let item = NSMenuItem(title: component.name, action: #selector(menuItemClicked(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = component.path
                item.image = NSImage(systemSymbolName: "folder.fill", accessibilityDescription: "Folder")
                item.image?.isTemplate = false
                if let image = item.image {
                    item.image = image.withSymbolConfiguration(.init(paletteColors: [.systemBlue]))
                }
                if index == 0 {
                    item.state = .on
                }
                menu.addItem(item)
            }

            // Position menu to cover the title - align first item over the title text
            let menuPoint = NSPoint(x: -20, y: -2)
            menu.popUp(positioning: menu.items.first, at: menuPoint, in: titleView)
        }

        @objc func menuItemClicked(_ sender: NSMenuItem) {
            guard let path = sender.representedObject as? String else { return }
            onNavigate(path)
        }

        private func buildPathComponents(from path: String) -> [(name: String, path: String)] {
            var components: [(name: String, path: String)] = []

            if path == "/" {
                components.append((name: "/", path: "/"))
            } else {
                let parts = path.split(separator: "/")
                var currentPath = ""
                var allPaths: [(name: String, path: String)] = []
                for part in parts {
                    currentPath += "/" + part
                    allPaths.append((name: String(part), path: currentPath))
                }
                components = allPaths.reversed()
                components.append((name: "/", path: "/"))
            }

            return components
        }
    }
}

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
        .background(
            // Invisible view that monitors Command-clicks on the window title
            WindowTitleClickMonitor(
                currentPath: navigationState.currentPath,
                onNavigate: { path in
                    navigationState.navigate(to: path)
                }
            )
            .frame(width: 0, height: 0)
        )
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
