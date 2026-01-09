//
//  QuickLookController.swift
//  Filex
//

import AppKit
import Quartz

/// Controller for managing Quick Look preview panel
@MainActor
final class QuickLookController: NSObject, QLPreviewPanelDataSource, QLPreviewPanelDelegate {
    static let shared = QuickLookController()

    private var previewItems: [URL] = []
    private var currentIndex: Int = 0

    private override init() {
        super.init()
    }

    // MARK: - Public API

    /// Show Quick Look panel for the given local file URLs
    func showQuickLook(for urls: [URL]) {
        guard !urls.isEmpty else { return }

        previewItems = urls
        currentIndex = 0

        if let panel = QLPreviewPanel.shared() {
            // Set dataSource and delegate directly before showing
            panel.dataSource = self
            panel.delegate = self

            if panel.isVisible {
                panel.reloadData()
            } else {
                panel.makeKeyAndOrderFront(nil)
            }
        }
    }

    /// Toggle Quick Look panel visibility
    func toggleQuickLook(for urls: [URL]) {
        guard let panel = QLPreviewPanel.shared() else { return }

        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            showQuickLook(for: urls)
        }
    }

    /// Close Quick Look panel
    func closeQuickLook() {
        QLPreviewPanel.shared()?.orderOut(nil)
    }

    /// Check if Quick Look panel is visible
    var isVisible: Bool {
        QLPreviewPanel.shared()?.isVisible ?? false
    }

    /// Update preview items without changing panel visibility
    func updateItems(_ urls: [URL]) {
        previewItems = urls
        currentIndex = 0
        QLPreviewPanel.shared()?.reloadData()
    }

    // MARK: - QLPreviewPanelDataSource

    func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        previewItems.count
    }

    func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> (any QLPreviewItem)! {
        guard index >= 0, index < previewItems.count else { return nil }
        return previewItems[index] as NSURL
    }

    // MARK: - QLPreviewPanelDelegate

    func previewPanel(_ panel: QLPreviewPanel!, handle event: NSEvent!) -> Bool {
        // Handle keyboard navigation
        if event.type == .keyDown {
            switch event.keyCode {
            case 125: // Down arrow
                NotificationCenter.default.post(name: .quickLookNavigate, object: 1)
                return true
            case 126: // Up arrow
                NotificationCenter.default.post(name: .quickLookNavigate, object: -1)
                return true
            default:
                break
            }
        }
        return false
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let quickLookNavigate = Notification.Name("quickLookNavigate")
}

// MARK: - App Delegate Extension for Quick Look

/// Custom window that handles Quick Look panel
class QuickLookWindow: NSWindow {
    override func acceptsPreviewPanelControl(_ panel: QLPreviewPanel!) -> Bool {
        true
    }

    override func beginPreviewPanelControl(_ panel: QLPreviewPanel!) {
        panel.dataSource = QuickLookController.shared
        panel.delegate = QuickLookController.shared
    }

    override func endPreviewPanelControl(_ panel: QLPreviewPanel!) {
        panel.dataSource = nil
        panel.delegate = nil
    }
}
