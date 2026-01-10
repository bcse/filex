//
//  FileTableView.swift
//  Filex
//
//  NSViewRepresentable wrapper for NSTableView with in-place editing and Quick Look support
//

import AppKit
import Quartz
import SwiftUI
import UniformTypeIdentifiers

// MARK: - Drag and Drop Types

private extension NSPasteboard.PasteboardType {
    /// Custom pasteboard type for internal file path drag operations
    static let filexPaths = NSPasteboard.PasteboardType("com.filex.paths")
}

// MARK: - Quick Look Preview Item

private final class FilePreviewItem: NSObject, QLPreviewItem {
    let url: URL

    init(_ url: URL) {
        self.url = url
    }

    var previewItemURL: URL! {
        url
    }
}

// MARK: - Custom NSTableView with Quick Look Support

private final class QuickLookTableView: NSTableView {
    /// Callback to trigger rename mode
    var onReturnKey: (() -> Void)?

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
        } else if event.keyCode == 36 { // Return key
            // Only trigger rename if we have a single selection
            // When a text field is editing, it will be first responder and this won't be called
            if selectedRowIndexes.count == 1 {
                onReturnKey?()
            }
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

// MARK: - NSFileTableView

struct NSFileTableView: NSViewRepresentable {
    let entries: [FileEntry]
    let selectedPaths: Set<String>
    let pathResolver: (String) -> URL?
    let onSelectionChanged: (Set<String>) -> Void
    let onDoubleClick: (FileEntry) -> Void
    let onRename: (FileEntry, String) -> Void
    let onSort: (SortField, SortOrder) -> Void
    let onReturnKey: () -> Void
    let onContextMenuAction: (ContextMenuAction, Set<String>) -> Void
    let onMove: ([String], String) -> Void  // source paths, destination folder path
    let onCopy: ([String], String) -> Void  // source paths, destination folder path

    enum ContextMenuAction {
        case open
        case quickLook
        case copy
        case cut
        case paste
        case rename
        case delete
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

        let tableView = QuickLookTableView()
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
        nameColumn.width = 250
        nameColumn.minWidth = 150
        nameColumn.isEditable = true
        nameColumn.sortDescriptorPrototype = NSSortDescriptor(key: "name", ascending: true)
        tableView.addTableColumn(nameColumn)

        let sizeColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("size"))
        sizeColumn.title = "Size"
        sizeColumn.width = 80
        sizeColumn.minWidth = 60
        sizeColumn.isEditable = false
        sizeColumn.sortDescriptorPrototype = NSSortDescriptor(key: "size", ascending: true)
        tableView.addTableColumn(sizeColumn)

        let modifiedColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("modified"))
        modifiedColumn.title = "Modified"
        modifiedColumn.width = 140
        modifiedColumn.minWidth = 100
        modifiedColumn.isEditable = false
        modifiedColumn.sortDescriptorPrototype = NSSortDescriptor(key: "modified", ascending: true)
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

        let coordinator = context.coordinator
        tableView.onReturnKey = { [weak coordinator] in
            coordinator?.parent.onReturnKey()
        }

        // Set up context menu
        let menu = NSMenu()
        menu.delegate = context.coordinator
        tableView.menu = menu

        // Register for drag and drop
        tableView.setDraggingSourceOperationMask([.copy, .move], forLocal: true)
        tableView.setDraggingSourceOperationMask(.copy, forLocal: false)
        tableView.registerForDraggedTypes([.filexPaths, .fileURL])

        scrollView.documentView = tableView
        context.coordinator.tableView = tableView

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let tableView = scrollView.documentView as? NSTableView else { return }

        context.coordinator.parent = self
        context.coordinator.entries = entries

        // Reload data
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

    class Coordinator: NSObject, NSTableViewDelegate, NSTableViewDataSource, NSTextFieldDelegate, NSMenuDelegate {
        var parent: NSFileTableView
        var entries: [FileEntry] = []
        weak var tableView: NSTableView?

        init(_ parent: NSFileTableView) {
            self.parent = parent
            self.entries = parent.entries
        }

        // MARK: - NSMenuDelegate

        func menuNeedsUpdate(_ menu: NSMenu) {
            menu.removeAllItems()

            guard let tableView = tableView else { return }

            // Get clicked row - if clicking on unselected row, select it first
            let clickedRow = tableView.clickedRow
            if clickedRow >= 0 && !tableView.selectedRowIndexes.contains(clickedRow) {
                tableView.selectRowIndexes(IndexSet(integer: clickedRow), byExtendingSelection: false)
            }

            // Get selected paths
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
               let localURL = parent.pathResolver(path) {
                let openWithItem = NSMenuItem(title: "Open With", action: nil, keyEquivalent: "")
                openWithItem.image = NSImage(systemSymbolName: "arrow.up.forward.app", accessibilityDescription: "Open With")

                let submenu = NSMenu()
                let appURLs = NSWorkspace.shared.urlsForApplications(toOpen: localURL)

                if appURLs.isEmpty {
                    let noAppsItem = NSMenuItem(title: "No Applications", action: nil, keyEquivalent: "")
                    noAppsItem.isEnabled = false
                    submenu.addItem(noAppsItem)
                } else {
                    for appURL in appURLs.prefix(15) { // Limit to 15 apps
                        let appName = FileManager.default.displayName(atPath: appURL.path)
                        let appItem = NSMenuItem(title: appName, action: #selector(contextMenuOpenWith(_:)), keyEquivalent: "")
                        appItem.target = self
                        appItem.representedObject = ["fileURL": localURL, "appURL": appURL]

                        // Get app icon
                        let appIcon = NSWorkspace.shared.icon(forFile: appURL.path)
                        appIcon.size = NSSize(width: 16, height: 16)
                        appItem.image = appIcon

                        submenu.addItem(appItem)
                    }
                }

                openWithItem.submenu = submenu
                menu.addItem(openWithItem)
            }

            // Quick Look
            let quickLookItem = NSMenuItem(title: "Quick Look", action: #selector(contextMenuQuickLook(_:)), keyEquivalent: "")
            quickLookItem.target = self
            quickLookItem.representedObject = selectedPaths
            quickLookItem.image = NSImage(systemSymbolName: "eye", accessibilityDescription: "Quick Look")
            menu.addItem(quickLookItem)

            menu.addItem(NSMenuItem.separator())

            // Rename (single selection only)
            if selectedPaths.count == 1 {
                let renameItem = NSMenuItem(title: "Rename", action: #selector(contextMenuRename(_:)), keyEquivalent: "")
                renameItem.target = self
                renameItem.representedObject = selectedPaths
                renameItem.image = NSImage(systemSymbolName: "pencil", accessibilityDescription: "Rename")
                menu.addItem(renameItem)
            }

            // Delete
            let deleteItem = NSMenuItem(title: "Delete", action: #selector(contextMenuDelete(_:)), keyEquivalent: "")
            deleteItem.target = self
            deleteItem.representedObject = selectedPaths
            deleteItem.image = NSImage(systemSymbolName: "trash", accessibilityDescription: "Delete")
            menu.addItem(deleteItem)
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

        @objc private func contextMenuQuickLook(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.quickLook, paths)
        }

        @objc private func contextMenuRename(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.rename, paths)
        }

        @objc private func contextMenuDelete(_ sender: NSMenuItem) {
            guard let paths = sender.representedObject as? Set<String> else { return }
            parent.onContextMenuAction(.delete, paths)
        }

        // MARK: - NSTableViewDataSource

        func numberOfRows(in tableView: NSTableView) -> Int {
            entries.count
        }

        func tableView(_ tableView: NSTableView, objectValueFor tableColumn: NSTableColumn?, row: Int) -> Any? {
            guard row < entries.count else { return nil }
            let entry = entries[row]

            switch tableColumn?.identifier.rawValue {
            case "name":
                return entry.name
            case "size":
                return entry.isDir ? "-" : FileUtils.formatSize(entry.size)
            case "modified":
                return DateFormatting.formatStandard(entry.modified)
            case "type":
                return entry.isDir ? "Folder" : FileUtils.typeFromMime(entry.mimeType)
            default:
                return nil
            }
        }

        func tableView(_ tableView: NSTableView, setObjectValue object: Any?, for tableColumn: NSTableColumn?, row: Int) {
            guard tableColumn?.identifier.rawValue == "name",
                  let newName = object as? String,
                  row < entries.count else { return }

            let entry = entries[row]
            let trimmedName = newName.trimmingCharacters(in: .whitespaces)

            if !trimmedName.isEmpty && trimmedName != entry.name {
                parent.onRename(entry, trimmedName)
            }
        }

        // MARK: - Drag Source

        func tableView(_ tableView: NSTableView, pasteboardWriterForRow row: Int) -> (any NSPasteboardWriting)? {
            guard row < entries.count else { return nil }
            let entry = entries[row]

            let item = NSPasteboardItem()

            // Write the path for internal drag operations
            item.setString(entry.path, forType: .filexPaths)

            // If we have a local file URL, also provide it for external drags
            if let localURL = parent.pathResolver(entry.path) {
                item.setString(localURL.absoluteString, forType: .fileURL)
            }

            return item
        }

        // MARK: - Drop Target

        func tableView(_ tableView: NSTableView, validateDrop info: any NSDraggingInfo, proposedRow row: Int, proposedDropOperation dropOperation: NSTableView.DropOperation) -> NSDragOperation {
            // Only accept drops ON rows (folders), not between rows
            guard dropOperation == .on, row >= 0, row < entries.count else {
                return []
            }

            let targetEntry = entries[row]

            // Can only drop onto folders
            guard targetEntry.isDir else {
                return []
            }

            // Get the paths being dragged
            let draggedPaths = getDraggedPaths(from: info.draggingPasteboard)

            // Can't drop onto self or parent
            for path in draggedPaths {
                if path == targetEntry.path || targetEntry.path.hasPrefix(path + "/") {
                    return []
                }
            }

            // Option key = copy, otherwise move
            if info.draggingSourceOperationMask.contains(.copy) && NSEvent.modifierFlags.contains(.option) {
                return .copy
            } else {
                return .move
            }
        }

        func tableView(_ tableView: NSTableView, acceptDrop info: any NSDraggingInfo, row: Int, dropOperation: NSTableView.DropOperation) -> Bool {
            guard row >= 0, row < entries.count else { return false }

            let targetEntry = entries[row]
            guard targetEntry.isDir else { return false }

            let draggedPaths = getDraggedPaths(from: info.draggingPasteboard)
            guard !draggedPaths.isEmpty else { return false }

            let isCopy = NSEvent.modifierFlags.contains(.option)

            if isCopy {
                parent.onCopy(draggedPaths, targetEntry.path)
            } else {
                parent.onMove(draggedPaths, targetEntry.path)
            }

            return true
        }

        private func getDraggedPaths(from pasteboard: NSPasteboard) -> [String] {
            // Read paths from all pasteboard items (supports multi-item drag)
            guard let items = pasteboard.pasteboardItems else { return [] }

            var paths: [String] = []
            for item in items {
                if let path = item.string(forType: .filexPaths) {
                    paths.append(path)
                }
            }
            return paths
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
                textField.isEditable = (columnID == "name")
                textField.isSelectable = (columnID == "name")
                textField.lineBreakMode = .byTruncatingTail
                textField.cell?.truncatesLastVisibleLine = true
                textField.font = .systemFont(ofSize: NSFont.systemFontSize)
                textField.translatesAutoresizingMaskIntoConstraints = false

                if columnID == "name" {
                    textField.delegate = self
                }

                cellView?.addSubview(textField)
                cellView?.textField = textField

                NSLayoutConstraint.activate([
                    textField.leadingAnchor.constraint(equalTo: cellView!.leadingAnchor),
                    textField.trailingAnchor.constraint(equalTo: cellView!.trailingAnchor),
                    textField.centerYAnchor.constraint(equalTo: cellView!.centerYAnchor)
                ])
            }

            // Set value
            switch columnID {
            case "name":
                cellView?.textField?.stringValue = entry.name
                cellView?.textField?.textColor = .labelColor
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

            // Reload Quick Look panel data when selection changes
            QLPreviewPanel.shared()?.reloadData()

            parent.onSelectionChanged(selectedPaths)
        }

        func tableView(_ tableView: NSTableView, sortDescriptorsDidChange oldDescriptors: [NSSortDescriptor]) {
            guard let sortDescriptor = tableView.sortDescriptors.first,
                  let key = sortDescriptor.key else { return }

            let field: SortField
            switch key {
            case "name": field = .name
            case "size": field = .size
            case "modified": field = .modified
            default: return
            }

            let order: SortOrder = sortDescriptor.ascending ? .ascending : .descending
            parent.onSort(field, order)
        }

        // MARK: - NSTextFieldDelegate

        func controlTextDidEndEditing(_ obj: Notification) {
            guard let textField = obj.object as? NSTextField,
                  let tableView = self.tableView else { return }

            let row = tableView.row(for: textField)
            guard row >= 0, row < entries.count else { return }

            let entry = entries[row]
            let newName = textField.stringValue.trimmingCharacters(in: .whitespaces)

            if !newName.isEmpty && newName != entry.name {
                parent.onRename(entry, newName)
            }
        }

        // MARK: - Actions

        @objc func handleDoubleClick(_ sender: NSTableView) {
            let row = sender.clickedRow
            guard row >= 0, row < entries.count else { return }
            parent.onDoubleClick(entries[row])
        }

        func startEditing(at row: Int) {
            guard let tableView = tableView,
                  row >= 0, row < entries.count else { return }

            let nameColumnIndex = tableView.column(withIdentifier: NSUserInterfaceItemIdentifier("name"))
            guard nameColumnIndex >= 0,
                  let cellView = tableView.view(atColumn: nameColumnIndex, row: row, makeIfNecessary: false) as? NSTableCellView,
                  let textField = cellView.textField else { return }

            tableView.window?.makeFirstResponder(textField)
            textField.selectText(nil)
        }

        // MARK: - Helpers

        private func iconForEntry(_ entry: FileEntry) -> NSImage {
            let symbolName = FileUtils.symbolName(for: entry)
            let colorName = FileUtils.symbolColor(for: entry)

            guard let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: entry.name) else {
                return NSImage(systemSymbolName: "doc.fill", accessibilityDescription: "File")!
            }

            // Apply tint color
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

        /// Get selected entries that have valid local paths for preview
        private func selectedPreviewItems() -> [FilePreviewItem] {
            guard let tableView = tableView else { return [] }

            return tableView.selectedRowIndexes.compactMap { index -> FilePreviewItem? in
                guard index < entries.count else { return nil }
                let entry = entries[index]
                guard !entry.isDir,
                      let url = parent.pathResolver(entry.path),
                      FileManager.default.fileExists(atPath: url.path) else {
                    return nil
                }
                return FilePreviewItem(url)
            }
        }
    }
}

// MARK: - Quick Look Data Source & Delegate

extension NSFileTableView.Coordinator: QLPreviewPanelDataSource, QLPreviewPanelDelegate {
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

        // Forward arrow key events to the table view for navigation
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

// MARK: - FileTableView (SwiftUI Wrapper)

struct FileTableView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM
    @Environment(ServerConfiguration.self) private var serverConfig

    var body: some View {
        Group {
            if directoryVM.isLoading && directoryVM.entries.isEmpty {
                loadingView
            } else if let error = directoryVM.errorMessage {
                errorView(error)
            } else if directoryVM.entries.isEmpty {
                emptyView
            } else {
                tableView
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .renameRequested)) { _ in
            startRenaming()
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        } actions: {
            Button("Retry") {
                loadDirectory()
            }
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        ContentUnavailableView {
            Label("Empty Folder", systemImage: "folder")
        } description: {
            Text("This folder is empty")
        } actions: {
            Button("New Folder") {
                NotificationCenter.default.post(name: .newFolderRequested, object: nil)
            }
            Button("Upload Files") {
                NotificationCenter.default.post(name: .uploadRequested, object: nil)
            }
        }
    }

    // MARK: - Table View

    private var tableView: some View {
        NSFileTableView(
            entries: directoryVM.entries,
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
            onRename: { entry, newName in
                handleRename(entry: entry, newName: newName)
            },
            onSort: { field, order in
                handleSort(field: field, order: order)
            },
            onReturnKey: {
                startRenaming()
            },
            onContextMenuAction: { action, paths in
                handleContextMenuAction(action, paths: paths)
            },
            onMove: { sourcePaths, destinationFolder in
                handleMove(sourcePaths: sourcePaths, to: destinationFolder)
            },
            onCopy: { sourcePaths, destinationFolder in
                handleCopy(sourcePaths: sourcePaths, to: destinationFolder)
            }
        )
    }

    // MARK: - Private Methods

    private func handleDoubleClick(_ entry: FileEntry) {
        if entry.isDir {
            navigationState.navigate(to: entry.path)
        } else {
            NotificationCenter.default.post(name: .openFileRequested, object: entry.path)
        }
    }

    private func handleRename(entry: FileEntry, newName: String) {
        Task {
            do {
                _ = try await APIClient.shared.rename(path: entry.path, newName: newName)
                loadDirectory()
            } catch {
                print("Rename failed: \(error)")
            }
        }
    }

    private func handleMove(sourcePaths: [String], to destinationFolder: String) {
        Task {
            for path in sourcePaths {
                do {
                    _ = try await APIClient.shared.move(from: path, to: destinationFolder)
                } catch {
                    print("Move failed for \(path): \(error)")
                }
            }
            loadDirectory()
        }
    }

    private func handleCopy(sourcePaths: [String], to destinationFolder: String) {
        Task {
            for path in sourcePaths {
                do {
                    _ = try await APIClient.shared.copy(from: path, to: destinationFolder)
                } catch {
                    print("Copy failed for \(path): \(error)")
                }
            }
            loadDirectory()
        }
    }

    private func handleSort(field: SortField, order: SortOrder) {
        if navigationState.sortConfig.field != field || navigationState.sortConfig.order != order {
            navigationState.sortConfig = SortConfig(field: field, order: order)
        }
    }

    private func loadDirectory() {
        directoryVM.loadDirectory(
            path: navigationState.currentPath,
            offset: navigationState.directoryOffset,
            limit: navigationState.directoryLimit,
            sortBy: navigationState.sortConfig.field,
            sortOrder: navigationState.sortConfig.order
        )
    }

    private func handleContextMenuAction(_ action: NSFileTableView.ContextMenuAction, paths: Set<String>) {
        switch action {
        case .open:
            if let path = paths.first, let entry = directoryVM.entry(for: path) {
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
        case .copy:
            navigationState.selectedPaths = paths
            navigationState.copySelectedFiles()
        case .cut:
            navigationState.selectedPaths = paths
            navigationState.cutSelectedFiles()
        case .paste:
            Task { await pasteFiles() }
        case .rename:
            NotificationCenter.default.post(name: .renameRequested, object: nil)
        case .delete:
            NotificationCenter.default.post(name: .deleteRequested, object: nil)
        }
    }

    private func pasteFiles() async {
        let paths = navigationState.clipboard.paths
        let isCut = navigationState.clipboard.isCut

        for path in paths {
            do {
                if isCut {
                    _ = try await APIClient.shared.move(from: path, to: navigationState.currentPath)
                } else {
                    _ = try await APIClient.shared.copy(from: path, to: navigationState.currentPath)
                }
            } catch {
                print("Paste failed for \(path): \(error)")
            }
        }

        if isCut {
            navigationState.clearClipboard()
        }

        loadDirectory()
    }

    private func startRenaming() {
        guard navigationState.hasSingleSelection,
              let path = navigationState.selectedPaths.first,
              let index = directoryVM.entries.firstIndex(where: { $0.path == path }) else { return }

        // Find the NSTableView and start editing
        DispatchQueue.main.async {
            if let window = NSApp.keyWindow,
               let scrollView = findScrollView(in: window.contentView),
               let tableView = scrollView.documentView as? NSTableView {
                let nameColumnIndex = tableView.column(withIdentifier: NSUserInterfaceItemIdentifier("name"))
                if nameColumnIndex >= 0,
                   let cellView = tableView.view(atColumn: nameColumnIndex, row: index, makeIfNecessary: false) as? NSTableCellView,
                   let textField = cellView.textField {
                    window.makeFirstResponder(textField)
                    textField.selectText(nil)
                }
            }
        }
    }

    private func findScrollView(in view: NSView?) -> NSScrollView? {
        guard let view = view else { return nil }

        if let scrollView = view as? NSScrollView,
           scrollView.documentView is NSTableView {
            return scrollView
        }

        for subview in view.subviews {
            if let found = findScrollView(in: subview) {
                return found
            }
        }

        return nil
    }
}

// MARK: - Preview

#Preview {
    FileTableView()
        .environment(NavigationState())
        .environment(DirectoryViewModel())
        .environment(ServerConfiguration())
}
