import Foundation
import SwiftUI

/// View model for file preview functionality
@Observable
@MainActor
final class PreviewViewModel {
    /// Currently previewed file entry
    var entry: FileEntry?

    /// Cached download URL for the current entry
    private(set) var downloadURL: URL?

    /// Text content for text file preview
    private(set) var textContent: String?

    /// Whether content is loading
    private(set) var isLoading: Bool = false

    /// Error message if load failed
    private(set) var errorMessage: String?

    /// Image zoom scale
    var imageScale: CGFloat = 1.0

    /// Image offset for panning
    var imageOffset: CGSize = .zero

    /// API client for requests
    private let apiClient: APIClient

    /// Maximum text file size to load (200KB)
    private let maxTextSize: Int64 = 200 * 1024

    /// Current load task
    private var loadTask: Task<Void, Never>?

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    /// Open preview for a file entry
    func open(_ fileEntry: FileEntry) {
        entry = fileEntry
        resetImageState()

        // Fetch download URL asynchronously
        Task {
            downloadURL = await apiClient.downloadURL(for: fileEntry.path)
        }

        // Load text content if applicable
        if fileEntry.isText || fileEntry.isCode {
            loadTextContent()
        }
    }

    /// Close preview
    func close() {
        loadTask?.cancel()
        entry = nil
        downloadURL = nil
        textContent = nil
        errorMessage = nil
        resetImageState()
    }

    /// Reset image view state
    func resetImageState() {
        imageScale = 1.0
        imageOffset = .zero
    }

    /// Zoom in
    func zoomIn() {
        imageScale = min(imageScale * 1.25, 10.0)
    }

    /// Zoom out
    func zoomOut() {
        imageScale = max(imageScale / 1.25, 0.1)
    }

    /// Fit to screen
    func fitToScreen() {
        imageScale = 1.0
        imageOffset = .zero
    }

    /// Actual size (1:1)
    func actualSize() {
        imageScale = 1.0
        imageOffset = .zero
    }

    // MARK: - Computed Properties

    /// Check if current entry is an image
    var isImage: Bool {
        entry?.isImage ?? false
    }

    /// Check if current entry is a video
    var isVideo: Bool {
        entry?.isVideo ?? false
    }

    /// Check if current entry is text
    var isText: Bool {
        guard let entry = entry else { return false }
        return entry.isText || entry.isCode
    }

    /// Check if preview is supported for current entry
    var isPreviewSupported: Bool {
        guard let entry = entry else { return false }
        return entry.isImage || entry.isVideo || entry.isText || entry.isCode
    }

    // MARK: - Private

    private func loadTextContent() {
        loadTask?.cancel()

        guard let entry = entry,
              let size = entry.size,
              size <= maxTextSize else {
            if let size = entry?.size, size > maxTextSize {
                errorMessage = "File too large to preview (max \(maxTextSize / 1024)KB)"
            }
            return
        }

        loadTask = Task {
            await performLoadTextContent()
        }
    }

    private func performLoadTextContent() async {
        isLoading = true
        errorMessage = nil

        guard let url = downloadURL else {
            errorMessage = "Cannot get download URL"
            isLoading = false
            return
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)

            guard !Task.isCancelled else { return }

            if let text = String(data: data, encoding: .utf8) {
                textContent = text
            } else {
                errorMessage = "Cannot decode file as text"
            }
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

// MARK: - Environment Key

private struct PreviewViewModelKey: EnvironmentKey {
    @MainActor static let defaultValue: PreviewViewModel = PreviewViewModel()
}

extension EnvironmentValues {
    var previewViewModel: PreviewViewModel {
        get { self[PreviewViewModelKey.self] }
        set { self[PreviewViewModelKey.self] = newValue }
    }
}
