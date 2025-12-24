import AppKit
import Quartz

// Callback type for navigation events (direction: -1 = up, 1 = down)
typealias NavigationCallback = @convention(c) (Int32) -> Void

class FilexQuickLookDataSource: NSObject, QLPreviewPanelDataSource, QLPreviewPanelDelegate {
    static let shared = FilexQuickLookDataSource()

    var urls: [URL] = []
    var currentIndex: Int = 0
    var navigationCallback: NavigationCallback?
    var globalMonitor: Any?
    var localMonitor: Any?

    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        urls.count
    }

    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        guard index >= 0 && index < urls.count else { return nil }
        return urls[index] as NSURL
    }

    func previewPanelDidClose(_ panel: QLPreviewPanel!) {
        stopKeyboardMonitor()
        navigationCallback = nil
    }

    func startKeyboardMonitor() {
        guard globalMonitor == nil && localMonitor == nil else { return }

        // Global monitor catches events when QuickLook panel has focus
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            _ = self?.handleKeyEvent(event)
        }

        // Local monitor catches events when our app has focus
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let handled = self?.handleKeyEvent(event) ?? false
            return handled ? nil : event
        }
    }

    func stopKeyboardMonitor() {
        if let monitor = globalMonitor {
            NSEvent.removeMonitor(monitor)
            globalMonitor = nil
        }
        if let monitor = localMonitor {
            NSEvent.removeMonitor(monitor)
            localMonitor = nil
        }
    }

    func handleKeyEvent(_ event: NSEvent) -> Bool {
        let panel = QLPreviewPanel.shared()!
        guard panel.isVisible else { return false }

        // Key codes: Up=126, Down=125, Left=123, Right=124, Space=49, Escape=53
        switch event.keyCode {
        case 126, 123: // Up or Left arrow - previous item
            if urls.count > 1 {
                // Use built-in navigation for multiple items
                let newIndex = currentIndex > 0 ? currentIndex - 1 : urls.count - 1
                currentIndex = newIndex
                DispatchQueue.main.async {
                    panel.reloadData()
                    panel.currentPreviewItemIndex = newIndex
                }
            }
            // Also notify frontend for single-item mode navigation
            if let callback = navigationCallback {
                DispatchQueue.main.async { callback(-1) }
            }
            return true

        case 125, 124: // Down or Right arrow - next item
            if urls.count > 1 {
                // Use built-in navigation for multiple items
                let newIndex = currentIndex < urls.count - 1 ? currentIndex + 1 : 0
                currentIndex = newIndex
                DispatchQueue.main.async {
                    panel.reloadData()
                    panel.currentPreviewItemIndex = newIndex
                }
            }
            // Also notify frontend for single-item mode navigation
            if let callback = navigationCallback {
                DispatchQueue.main.async { callback(1) }
            }
            return true

        case 49, 53: // Space or Escape - close panel
            DispatchQueue.main.async { [weak self] in
                panel.orderOut(nil)
                self?.stopKeyboardMonitor()
                self?.navigationCallback = nil
            }
            return true

        default:
            return false
        }
    }
}

// Open QuickLook panel with multiple files (JSON-encoded array of paths) and navigation callback
@_cdecl("filex_quick_look_with_callback")
func filexQuickLookWithCallback(pathsJson: UnsafePointer<CChar>?, callback: NavigationCallback?) -> Bool {
    guard let pathsJson else { return false }
    guard let jsonString = String(validatingUTF8: pathsJson) else { return false }
    guard let jsonData = jsonString.data(using: .utf8) else { return false }

    guard let paths = try? JSONDecoder().decode([String].self, from: jsonData) else { return false }
    guard !paths.isEmpty else { return false }

    let urls = paths.map { URL(fileURLWithPath: $0) }

    let dataSource = FilexQuickLookDataSource.shared
    dataSource.urls = urls
    dataSource.currentIndex = 0
    dataSource.navigationCallback = callback

    let panel = QLPreviewPanel.shared()!
    panel.dataSource = dataSource
    panel.delegate = dataSource
    panel.reloadData()
    panel.currentPreviewItemIndex = 0
    panel.makeKeyAndOrderFront(nil)

    dataSource.startKeyboardMonitor()
    return true
}

// Update the preview with new file paths (JSON-encoded array)
@_cdecl("filex_quick_look_refresh")
func filexQuickLookRefresh(pathsJson: UnsafePointer<CChar>?) -> Bool {
    let panel = QLPreviewPanel.shared()!
    guard panel.isVisible else { return false }

    guard let pathsJson else {
        // Close panel if paths is null
        panel.orderOut(nil)
        let dataSource = FilexQuickLookDataSource.shared
        dataSource.stopKeyboardMonitor()
        dataSource.navigationCallback = nil
        return true
    }

    guard let jsonString = String(validatingUTF8: pathsJson) else { return false }
    guard let jsonData = jsonString.data(using: .utf8) else { return false }
    guard let paths = try? JSONDecoder().decode([String].self, from: jsonData) else { return false }
    guard !paths.isEmpty else { return false }

    let urls = paths.map { URL(fileURLWithPath: $0) }

    let dataSource = FilexQuickLookDataSource.shared
    dataSource.urls = urls
    dataSource.currentIndex = 0
    panel.reloadData()
    panel.currentPreviewItemIndex = 0
    return true
}

// Close the QuickLook panel
@_cdecl("filex_quick_look_close")
func filexQuickLookClose() {
    let panel = QLPreviewPanel.shared()!
    if panel.isVisible {
        panel.orderOut(nil)
    }
    let dataSource = FilexQuickLookDataSource.shared
    dataSource.stopKeyboardMonitor()
    dataSource.navigationCallback = nil
}

// Check if QuickLook panel is currently visible
@_cdecl("filex_quick_look_is_visible")
func filexQuickLookIsVisible() -> Bool {
    QLPreviewPanel.shared()?.isVisible ?? false
}
