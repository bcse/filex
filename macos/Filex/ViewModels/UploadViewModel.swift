import Foundation
import SwiftUI

/// Represents an upload item in the queue
struct UploadItem: Identifiable, Sendable {
    let id: UUID
    let name: String
    let size: Int64
    let url: URL
    let targetPath: String  // Remote directory path where this file should be uploaded
    var progress: Double
    var status: UploadStatus
    var error: String?

    init(url: URL, targetPath: String) {
        self.id = UUID()
        self.name = url.lastPathComponent
        self.size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
        self.url = url
        self.targetPath = targetPath
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
        // Collect directories that need to be created and files to upload
        var directoriesToCreate: [String] = []
        var filesToUpload: [(url: URL, targetPath: String)] = []

        for url in urls {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
                continue
            }

            if isDirectory.boolValue {
                // It's a directory - enumerate recursively
                let baseDir = url.lastPathComponent
                let basePath = joinPath(targetPath, baseDir)
                directoriesToCreate.append(basePath)

                enumerateDirectory(at: url, basePath: basePath, directories: &directoriesToCreate, files: &filesToUpload)
            } else {
                // It's a file
                filesToUpload.append((url: url, targetPath: targetPath))
            }
        }

        // Add file items to upload queue
        for file in filesToUpload {
            let item = UploadItem(url: file.url, targetPath: file.targetPath)
            uploads.append(item)
        }

        // Start uploading if not already
        if !isUploading {
            startUploading(directoriesToCreate: directoriesToCreate)
        }
    }

    /// Start uploading queued files
    func startUploading(directoriesToCreate: [String] = []) {
        uploadTask?.cancel()

        uploadTask = Task {
            // First create all directories
            for dirPath in directoriesToCreate {
                guard !Task.isCancelled else { break }
                do {
                    _ = try await apiClient.createDirectory(path: dirPath)
                } catch {
                    // Directory might already exist, continue anyway
                    print("Failed to create directory \(dirPath): \(error)")
                }
            }

            // Then process upload queue
            await processQueue()
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
    func retryFailed() {
        for i in uploads.indices where uploads[i].status == .failed {
            uploads[i].status = .pending
            uploads[i].progress = 0
            uploads[i].error = nil
        }

        if !isUploading {
            startUploading()
        }
    }

    // MARK: - Private

    private func processQueue() async {
        while let index = uploads.firstIndex(where: { $0.status == .pending }) {
            guard !Task.isCancelled else { break }

            let currentIndex = index  // Capture index value to avoid reference issues
            let targetPath = uploads[currentIndex].targetPath
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

    /// Recursively enumerate a directory and collect subdirectories and files
    private func enumerateDirectory(
        at url: URL,
        basePath: String,
        directories: inout [String],
        files: inout [(url: URL, targetPath: String)]
    ) {
        let fileManager = FileManager.default
        guard let enumerator = fileManager.enumerator(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        while let itemURL = enumerator.nextObject() as? URL {
            var isDirectory: ObjCBool = false
            guard fileManager.fileExists(atPath: itemURL.path, isDirectory: &isDirectory) else {
                continue
            }

            // Get relative path from the base directory
            let relativePath = itemURL.path.replacingOccurrences(of: url.path, with: "")
            let remotePath = joinPath(basePath, relativePath)

            if isDirectory.boolValue {
                directories.append(remotePath)
            } else {
                // Get the parent directory as the target path
                let parentPath = (remotePath as NSString).deletingLastPathComponent
                files.append((url: itemURL, targetPath: parentPath))
            }
        }
    }

    /// Join path components, handling edge cases
    private func joinPath(_ base: String, _ component: String) -> String {
        let cleanBase = base.hasSuffix("/") ? String(base.dropLast()) : base
        let cleanComponent = component.hasPrefix("/") ? String(component.dropFirst()) : component

        if cleanComponent.isEmpty {
            return cleanBase
        }
        if cleanBase.isEmpty || cleanBase == "/" {
            return "/" + cleanComponent
        }
        return cleanBase + "/" + cleanComponent
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
