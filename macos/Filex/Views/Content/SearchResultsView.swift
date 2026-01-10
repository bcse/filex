//
//  SearchResultsView.swift
//  Filex
//
//  NSViewRepresentable wrapper for search results with drag support
//

import AppKit
import Quartz
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Drag Types

private extension NSPasteboard.PasteboardType {
    static let filexPaths = NSPasteboard.PasteboardType("com.filex.paths")
}

// MARK: - Quick Look Preview Item

private final class SearchPreviewItem: NSObject, QLPreviewItem {
    let url: URL

    init(_ url: URL) {
        self.url = url
    }

    var previewItemURL: URL! {
        url
    }
}

// MARK: - Custom NSTableView with Quick Look Support

private final class SearchTableView: NSTableView {
    override func acceptsPreviewPanelControl(_ panel: QLPreviewPanel!) -> Bool {
        MainActor.assumeIsolated {
            guard delegate is QLPreviewPanelDataSource,
                  delegate is QLPreviewPanelDelegate else {
                return false
            }
            return true
        }
    }

    override func beginPreviewPanelControl(_ panel: QLPreviewPanel!) {
        MainActor.assumeIsolated {
            guard let dataSource = delegate as? QLPreviewPanelDataSource,
                  let delegate = delegate as? QLPreviewPanelDelegate else {
                panel.dataSource = nil
                panel.delegate = nil
                return
            }
            panel.dataSource = dataSource
            panel.delegate = delegate
        }
    }

    override func endPreviewPanelControl(_ panel: QLPreviewPanel!) {
        MainActor.assumeIsolated {
            panel.dataSource = nil
            panel.delegate = nil
        }
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 49 { // Space key
            toggleQuickLook()
        } else {
            super.keyDown(with: event)
        }
    }

    private func toggleQuickLook() {
        guard let panel = QLPreviewPanel.shared() else { return }
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            panel.orderFront(nil)
        }
    }
}

// MARK: - NSSearchResultsTableView

struct NSSearchResultsTableView: NSViewRepresentable {
    let entries: [FileEntry]
    let selectedPaths: Set<String>
    let pathResolver: (String) -> URL?
    let onSelectionChanged: (Set<String>) -> Void
    let onDoubleClick: (FileEntry) -> Void
    let onContextMenuAction: (ContextMenuAction, Set<String>) -> Void

    enum ContextMenuAction {
        case open
        case quickLook
        case showInFolder
        case revealInFinder
        case copy
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder

        let tableView = SearchTableView()
        tableView.style = .inset
        tableView.usesAlternatingRowBackgroundColors = true
        tableView.allowsMultipleSelection = true
        tableView.allowsColumnReordering = false
        tableView.allowsColumnResizing = true
        tableView.allowsColumnSelection = false
        tableView.rowHeight = 24
        tableView.intercellSpacing = NSSize(width: 10, height: 2)

        // Create columns
        let iconColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("icon"))
        iconColumn.title = ""
        iconColumn.width = 24
        iconColumn.minWidth = 24
        iconColumn.maxWidth = 24
        iconColumn.isEditable = false
        tableView.addTableColumn(iconColumn)

        let nameColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        nameColumn.title = "Name"
        nameColumn.width = 200
        nameColumn.minWidth = 100
        nameColumn.isEditable = false
        tableView.addTableColumn(nameColumn)

        let locationColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("location"))
        locationColumn.title = "Location"
        locationColumn.width = 200
        locationColumn.minWidth = 100
        locationColumn.isEditable = false
        tableView.addTableColumn(locationColumn)

        let sizeColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("size"))
        sizeColumn.title = "Size"
        sizeColumn.width = 80
        sizeColumn.minWidth = 60
        sizeColumn.isEditable = false
        tableView.addTableColumn(sizeColumn)

        let modifiedColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("modified"))
        modifiedColumn.title = "Modified"
        modifiedColumn.width = 140
        modifiedColumn.minWidth = 100
        modifiedColumn.isEditable = false
        tableView.addTableColumn(modifiedColumn)

        let typeColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("type"))
        typeColumn.title = "Type"
        typeColumn.width = 80
        typeColumn.minWidth = 60
        typeColumn.isEditable = false
        tableView.addTableColumn(typeColumn)

        tableView.delegate = context.coordinator
        tableView.dataSource = context.coordinator
        tableView.target = context.coordinator
        tableView.doubleAction = #selector(Coordinator.handleDoubleClick(_:))

        // Set up context menu
        let menu = NSMenu()
        menu.delegate = context.coordinator
        tableView.menu = menu

        // Register for drag (source only, no drop)
        tableView.setDraggingSourceOperationMask(.copy, forLocal: true)
        tableView.setDraggingSourceOperationMask(.copy, forLocal: false)

        scrollView.documentView = tableView
        context.coordinator.tableView = tableView

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let tableView = scrollView.documentView as? NSTableView else { return }

        context.coordinator.parent = self
        context.coordinator.entries = entries

        tableView.reloadData()

        // Update selection
        let currentSelection = tableView.selectedRowIndexes
        var newSelection = IndexSet()
        for (index, entry) in entries.enumerated() {
            if selectedPaths.contains(entry.path) {
                newSelection.insert(index)
            }
        }
        if currentSelection != newSelection {
            tableView.selectRowIndexes(newSelection, byExtendingSelection: false)
        }
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, NSTableViewDelegate, NSTableViewDataSource, NSMenuDelegate {
        var parent: NSSearchResultsTableView
        var entries: [FileEntry] = []
        weak var tableView: NSTableView?

        init(_ parent: NSSearchResultsTableView) {
            self.parent = parent
            self.entries = parent.entries
        }

        // MARK: - NSMenuDelegate

        func menuNeedsUpdate(_ menu: NSMenu) {
            menu.removeAllItems()

            guard let tableView = tableView else { return }

            let clickedRow = tableView.clickedRow
            if clickedRow >= 0 && !tableView.selectedRowIndexes.contains(clickedRow) {
                tableView.selectRowIndexes(IndexSet(integer: clickedRow), byExtendingSelection: false)
            }

            var selectedPaths = Set<String>()
            for index in tableView.selectedRowIndexes {
                if index < entries.count {
                    selectedPaths.insert(entries[index].path)
                }
            }

            guard !selectedPaths.isEmpty else { return }

            // Open
            let openItem = NSMenuItem(title: "Open", action: #selector(contextMenuOpen(_:)), keyEquivalent: "")
            openItem.target = self
            openItem.representedObject = selectedPaths
            openItem.image = NSImage(systemSymbolName: "arrow.up.forward.square", accessibilityDescription: "Open")
            menu.addItem(openItem)

            // Open With submenu (single file selection only, with local path)
            if selectedPaths.count == 1,
               let path = selectedPaths.first,
               let entry = entries.first(where: { $0.path == path }),
               !entry.isDir,
               let localURL = parent.pathResolver(path),
               let appURLs = NSWorkspace.shared.urlsForApplications(toOpen: localURL) as [URL]?,
               !appURLs.isEmpty {
                let openWithItem = NSMenuItem(title: "Open With", action: nil, keyEquivalent: "")
                let submenu = NSMenu()

                for appURL in appURLs.prefix(15) {
                    let appName = FileManager.default.displayName(atPath: appURL.path)
                    let appItem = NSMenuItem(title: appName, action: #selector(contextMenuOpenWith(_:)), keyEquivalent: "")
                    appItem.target = self
                    appItem.representedObject = ["fileURL": localURL, "appURL": appURL]

                    let appIcon = NSWorkspace.shared.icon(forFile: appURL.path)
                    appIcon.size = NSSize(width: 16, height: 16)
                    appItem.image = appIcon

                    submenu.addItem(appItem)
                }

                openWithItem.submenu = submenu
                menu.addItem(openWithItem)
            }

            menu.addItem(NSMenuItem.separator())

            // Show in Folder
            if selectedPaths.count == 1 {
                let showItem = NSMenuItem(title: "Show in Folder", action: #selector(contextMenuShowInFolder(_:)), keyEquivalent: "")
                showItem.target = self
                showItem.representedObject = selectedPaths
                showItem.image = NSImage(systemSymbolName: "folder", accessibilityDescription: "Show in Folder")
                menu.addItem(showItem)
            }

            // Reveal in Finder (single selection only, with local path)
            if selectedPaths.count == 1,
               let path = selectedPaths.first,
               let localURL = parent.pathResolver(path) {
                let revealItem = NSMenuItem(title: "Reveal in Finder", action: #selector(contextMenuRevealInFinder(_:)), keyEquivalent: "")
                revealItem.target = self
                revealItem.representedObject = localURL
                revealItem.image = NSImage(systemSymbolName: "finder", accessibilityDescription: "Reveal in Finder")
                menu.addItem(revealItem)
            }

            // Quick Look
            let quickLookItem = NSMenuItem(title: "Quick Look", action: #selector(contextMenuQuickLook(_:)), keyEquivalent: "")
            quickLookItem.target = self
            quickLookItem.representedObject = selectedPaths
            quickLookItem.image = NSImage(systemSymbolName: "eye", accessibilityDescription: "Quick Look")
            menu.addItem(quickLookItem)

            menu.addItem(NSMenuItem.separator())

            // Copy
            let copyItem = NSMenuItem(title: "Copy", action: #selector(contextMenuCopy(_:)), keyEquivalent: "")
            copyItem.target = self
            copyItem.representedObject = selectedPaths
            copyItem.image = NSImage(systemSymbolName: "doc.on.doc", accessibilityDescription: "Copy")
            menu.addItem(copyItem)
        }

        @objc private func contextMenuOpen(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.open, paths)
        }

        @objc private func contextMenuOpenWith(_ sender: NSMenuItem) {
            guard let info = sender.representedObject as? [String: URL],
                  let fileURL = info["fileURL"],
                  let appURL = info["appURL"] else { return }

            NSWorkspace.shared.open(
                [fileURL],
                withApplicationAt: appURL,
                configuration: NSWorkspace.OpenConfiguration()
            )
        }

        @objc private func contextMenuShowInFolder(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.showInFolder, paths)
        }

        @objc private func contextMenuRevealInFinder(_ sender: NSMenuItem) {
            guard let localURL = sender.representedObject as? URL else { return }
            NSWorkspace.shared.activateFileViewerSelecting([localURL])
        }

        @objc private func contextMenuQuickLook(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.quickLook, paths)
        }

        @objc private func contextMenuCopy(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.copy, paths)
        }

        // MARK: - NSTableViewDataSource

        func numberOfRows(in tableView: NSTableView) -> Int {
            entries.count
        }

        // MARK: - Drag Source

        func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> (any NSPasteboardWriting)? {
            guard row < entries.count else { return nil }
            let entry = entries[row]

            let item = NSPasteboardItem()
            item.setString(entry.path, forType: .filexPaths)

            if let localURL = parent.pathResolver(entry.path) {
                item.setString(localURL.absoluteString, forType: .fileURL)
            }

            return item
        }

        // MARK: - NSTableViewDelegate

        func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
            guard row < entries.count else { return nil }
            let entry = entries[row]
            let columnID = tableColumn?.identifier.rawValue ?? ""

            if columnID == "icon" {
                let imageView = NSImageView()
                imageView.image = iconForEntry(entry)
                imageView.imageScaling = .scaleProportionallyDown
                return imageView
            }

            let identifier = NSUserInterfaceItemIdentifier(columnID)
            var cellView = tableView.makeView(withIdentifier: identifier, owner: self) as? NSTableCellView

            if cellView == nil {
                cellView = NSTableCellView()
                cellView?.identifier = identifier

                let textField = NSTextField()
                textField.isBordered = false
                textField.drawsBackground = false
                textField.isEditable = false
                textField.isSelectable = false
                textField.lineBreakMode = .byTruncatingTail
                textField.cell?.truncatesLastVisibleLine = true
                textField.font = .systemFont(ofSize: NSFont.systemFontSize)
                textField.translatesAutoresizingMaskIntoConstraints = false

                cellView?.addSubview(textField)
                cellView?.textField = textField

                NSLayoutConstraint.activate([
                    textField.leadingAnchor.constraint(equalTo: cellView!.leadingAnchor),
                    textField.trailingAnchor.constraint(equalTo: cellView!.trailingAnchor),
                    textField.centerYAnchor.constraint(equalTo: cellView!.centerYAnchor)
                ])
            }

            switch columnID {
            case "name":
                cellView?.textField?.stringValue = entry.name
                cellView?.textField?.textColor = .labelColor
            case "location":
                cellView?.textField?.stringValue = PathUtils.dirname(entry.path)
                cellView?.textField?.textColor = .secondaryLabelColor
            case "size":
                cellView?.textField?.stringValue = entry.isDir ? "-" : FileUtils.formatSize(entry.size)
                cellView?.textField?.textColor = .secondaryLabelColor
            case "modified":
                cellView?.textField?.stringValue = DateFormatting.formatStandard(entry.modified)
                cellView?.textField?.textColor = .secondaryLabelColor
            case "type":
                cellView?.textField?.stringValue = entry.isDir ? "Folder" : FileUtils.typeFromMime(entry.mimeType)
                cellView?.textField?.textColor = .secondaryLabelColor
            default:
                break
            }

            return cellView
        }

        func tableViewSelectionDidChange(_ notification: Notification) {
            guard let tableView = notification.object as? NSTableView else { return }

            var selectedPaths = Set<String>()
            for index in tableView.selectedRowIndexes {
                if index < entries.count {
                    selectedPaths.insert(entries[index].path)
                }
            }

            QLPreviewPanel.shared()?.reloadData()
            parent.onSelectionChanged(selectedPaths)
        }

        // MARK: - Actions

        @objc func handleDoubleClick(_ sender: NSTableView) {
            let row = sender.clickedRow
            guard row >= 0, row < entries.count else { return }
            parent.onDoubleClick(entries[row])
        }

        // MARK: - Helpers

        private func iconForEntry(_ entry: FileEntry) -> NSImage {
            let symbolName = FileUtils.symbolName(for: entry)
            let colorName = FileUtils.symbolColor(for: entry)

            guard let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: entry.name) else {
                return NSImage(systemSymbolName: "doc.fill", accessibilityDescription: "File")!
            }

            let color: NSColor
            switch colorName {
            case "yellow": color = .systemYellow
            case "green": color = .systemGreen
            case "purple": color = .systemPurple
            case "pink": color = .systemPink
            case "orange": color = .systemOrange
            case "blue": color = .systemBlue
            case "red": color = .systemRed
            default: color = .secondaryLabelColor
            }

            return image.withSymbolConfiguration(.init(paletteColors: [color]))!
        }

        private func selectedPreviewItems() -> [SearchPreviewItem] {
            guard let tableView = tableView else { return [] }

            return tableView.selectedRowIndexes.compactMap { index -> SearchPreviewItem? in
                guard index < entries.count else { return nil }
                let entry = entries[index]
                guard !entry.isDir,
                      let url = parent.pathResolver(entry.path),
                      FileManager.default.fileExists(atPath: url.path) else {
                    return nil
                }
                return SearchPreviewItem(url)
            }
        }
    }
}

// MARK: - Quick Look Data Source & Delegate

extension NSSearchResultsTableView.Coordinator: QLPreviewPanelDataSource, QLPreviewPanelDelegate {
    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        selectedPreviewItems().count
    }

    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        let items = selectedPreviewItems()
        guard index >= 0, index < items.count else { return nil }
        return items[index]
    }

    func previewPanel(_ panel: QLPreviewPanel!, handle event: NSEvent!) -> Bool {
        guard let tableView = tableView else { return false }

        if event.type == .keyDown {
            switch event.keyCode {
            case 125, 126: // Down arrow, Up arrow
                tableView.keyDown(with: event)
                return true
            default:
                break
            }
        }

        return false
    }
}

// MARK: - SearchResultsView (SwiftUI Wrapper)

struct SearchResultsView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(SearchViewModel.self) private var searchVM
    @Environment(ServerConfiguration.self) private var serverConfig

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
        NSSearchResultsTableView(
            entries: searchVM.results,
            selectedPaths: navigationState.selectedPaths,
            pathResolver: { remotePath in
                guard let localPath = serverConfig.resolveLocalPath(remotePath) else { return nil }
                return URL(fileURLWithPath: localPath)
            },
            onSelectionChanged: { paths in
                navigationState.selectedPaths = paths
            },
            onDoubleClick: { entry in
                handleDoubleClick(entry)
            },
            onContextMenuAction: { action, paths in
                handleContextMenuAction(action, paths: paths)
            }
        )
    }

    // MARK: - Private Methods

    private func handleDoubleClick(_ entry: FileEntry) {
        if entry.isDir {
            navigationState.clearSearch()
            navigationState.navigate(to: entry.path)
        } else {
            NotificationCenter.default.post(name: .openFileRequested, object: entry.path)
        }
    }

    private func handleContextMenuAction(_ action: NSSearchResultsTableView.ContextMenuAction, paths: Set<String>) {
        switch action {
        case .open:
            if let path = paths.first, let entry = searchVM.entry(for: path) {
                handleDoubleClick(entry)
            }
        case .quickLook:
            if let panel = QLPreviewPanel.shared() {
                if panel.isVisible {
                    panel.orderOut(nil)
                } else {
                    panel.orderFront(nil)
                }
            }
        case .showInFolder:
            if let path = paths.first {
                navigationState.clearSearch()
                navigationState.navigate(to: PathUtils.dirname(path))
            }
        case .revealInFinder:
            // Handled directly in context menu action
            break
        case .copy:
            navigationState.selectedPaths = paths
            navigationState.copySelectedFiles()
        }
    }
}

// MARK: - Preview

#Preview {
    SearchResultsView()
        .environment(NavigationState())
        .environment(SearchViewModel())
        .environment(ServerConfiguration())
}
