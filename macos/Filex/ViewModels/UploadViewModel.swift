import Foundation
import SwiftUI

/// Represents an upload item in the queue
struct UploadItem: Identifiable, Sendable {
    let id: UUID
    let name: String
    let size: Int64
    let url: URL
    var progress: Double
    var status: UploadStatus
    var error: String?

    init(url: URL) {
        self.id = UUID()
        self.name = url.lastPathComponent
        self.size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
        self.url = url
        self.progress = 0
        self.status = .pending
    }

    enum UploadStatus: Sendable {
        case pending
        case uploading
        case completed
        case failed
    }
}

/// View model for upload management
@Observable
@MainActor
final class UploadViewModel {
    /// Upload queue
    private(set) var uploads: [UploadItem] = []

    /// Whether any upload is in progress
    var isUploading: Bool {
        uploads.contains { $0.status == .uploading }
    }

    /// Count of pending uploads
    var pendingCount: Int {
        uploads.filter { $0.status == .pending }.count
    }

    /// Count of completed uploads
    var completedCount: Int {
        uploads.filter { $0.status == .completed }.count
    }

    /// Count of failed uploads
    var failedCount: Int {
        uploads.filter { $0.status == .failed }.count
    }

    /// Total progress (0.0 - 1.0)
    var totalProgress: Double {
        guard !uploads.isEmpty else { return 0 }
        let total = uploads.reduce(0.0) { $0 + $1.progress }
        return total / Double(uploads.count)
    }

    /// API client for requests
    private let apiClient: APIClient

    /// Current upload task
    private var uploadTask: Task<Void, Never>?

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    /// Add files to upload queue
    func addFiles(_ urls: [URL], targetPath: String) {
        for url in urls {
            let item = UploadItem(url: url)
            uploads.append(item)
        }

        // Start uploading if not already
        if !isUploading {
            startUploading(to: targetPath)
        }
    }

    /// Start uploading queued files
    func startUploading(to targetPath: String) {
        uploadTask?.cancel()

        uploadTask = Task {
            await processQueue(targetPath: targetPath)
        }
    }

    /// Cancel all uploads
    func cancelAll() {
        uploadTask?.cancel()
        uploads.removeAll { $0.status == .pending }
        for i in uploads.indices where uploads[i].status == .uploading {
            uploads[i].status = .failed
            uploads[i].error = "Cancelled"
        }
    }

    /// Remove completed uploads from list
    func clearCompleted() {
        uploads.removeAll { $0.status == .completed }
    }

    /// Remove failed uploads from list
    func clearFailed() {
        uploads.removeAll { $0.status == .failed }
    }

    /// Clear all uploads
    func clearAll() {
        uploadTask?.cancel()
        uploads.removeAll()
    }

    /// Retry failed uploads
    func retryFailed(to targetPath: String) {
        for i in uploads.indices where uploads[i].status == .failed {
            uploads[i].status = .pending
            uploads[i].progress = 0
            uploads[i].error = nil
        }

        if !isUploading {
            startUploading(to: targetPath)
        }
    }

    // MARK: - Private

    private func processQueue(targetPath: String) async {
        while let index = uploads.firstIndex(where: { $0.status == .pending }) {
            guard !Task.isCancelled else { break }

            let currentIndex = index  // Capture index value to avoid reference issues
            uploads[currentIndex].status = .uploading

            do {
                _ = try await apiClient.upload(
                    to: targetPath,
                    files: [uploads[currentIndex].url]
                ) { [weak self] progress in
                    Task { @MainActor [weak self] in
                        guard let self = self, currentIndex < self.uploads.count else { return }
                        self.uploads[currentIndex].progress = progress
                    }
                }

                uploads[currentIndex].status = .completed
                uploads[currentIndex].progress = 1.0
            } catch {
                uploads[currentIndex].status = .failed
                uploads[currentIndex].error = error.localizedDescription
            }
        }
    }
}

// MARK: - Environment Key

private struct UploadViewModelKey: EnvironmentKey {
    @MainActor static let defaultValue: UploadViewModel = UploadViewModel()
}

extension EnvironmentValues {
    var uploadViewModel: UploadViewModel {
        get { self[UploadViewModelKey.self] }
        set { self[UploadViewModelKey.self] = newValue }
    }
}
