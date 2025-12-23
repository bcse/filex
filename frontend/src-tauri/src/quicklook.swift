import AppKit
import Quartz

// Callback type for navigation events (direction: -1 = up, 1 = down)
typealias NavigationCallback = @convention(c) (Int32) -> Void

class FilexQuickLookDataSource: NSObject, QLPreviewPanelDataSource, QLPreviewPanelDelegate {
    static let shared = FilexQuickLookDataSource()

    var url: URL?
    var navigationCallback: NavigationCallback?
    var globalMonitor: Any?
    var localMonitor: Any?

    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        url != nil ? 1 : 0
    }

    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        url as? any QLPreviewItem
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

        // Key codes: Up=126, Down=125, Space=49, Escape=53
        switch event.keyCode {
        case 126: // Up arrow
            if let callback = navigationCallback {
                DispatchQueue.main.async { callback(-1) }
            }
            return true

        case 125: // Down arrow
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

// Open QuickLook panel with a file and navigation callback
@_cdecl("filex_quick_look_with_callback")
func filexQuickLookWithCallback(path: UnsafePointer<CChar>?, callback: NavigationCallback?) -> Bool {
    guard let path else { return false }
    guard let pathString = String(validatingUTF8: path) else { return false }

    let fileURL = URL(fileURLWithPath: pathString)
    let dataSource = FilexQuickLookDataSource.shared
    dataSource.url = fileURL
    dataSource.navigationCallback = callback

    let panel = QLPreviewPanel.shared()!
    panel.dataSource = dataSource
    panel.delegate = dataSource
    panel.reloadData()
    panel.makeKeyAndOrderFront(nil)

    dataSource.startKeyboardMonitor()
    return true
}

// Update the preview with a new file path
@_cdecl("filex_quick_look_refresh")
func filexQuickLookRefresh(path: UnsafePointer<CChar>?) -> Bool {
    let panel = QLPreviewPanel.shared()!
    guard panel.isVisible else { return false }

    guard let path else {
        // Close panel if path is null
        panel.orderOut(nil)
        let dataSource = FilexQuickLookDataSource.shared
        dataSource.stopKeyboardMonitor()
        dataSource.navigationCallback = nil
        return true
    }

    guard let pathString = String(validatingUTF8: path) else { return false }

    let fileURL = URL(fileURLWithPath: pathString)
    let dataSource = FilexQuickLookDataSource.shared
    dataSource.url = fileURL
    panel.reloadData()
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
