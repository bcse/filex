import Foundation

/// Represents a file or directory entry from the Filex server
struct FileEntry: Codable, Identifiable, Hashable, Sendable {
    /// Database ID (may be nil for non-indexed files)
    var dbId: Int?
    let name: String
    let path: String

    /// Use path as the stable identifier
    var id: String { path }
    let isDir: Bool
    var size: Int64?
    var created: Date?
    var modified: Date?
    var mimeType: String?
    var width: Int?
    var height: Int?
    var duration: Double?
    var indexedAt: Date?

    enum CodingKeys: String, CodingKey {
        case dbId = "id"
        case name, path
        case isDir = "is_dir"
        case size, created, modified
        case mimeType = "mime_type"
        case width, height, duration
        case indexedAt = "indexed_at"
    }

    /// File extension without the dot
    var fileExtension: String? {
        let parts = name.split(separator: ".")
        guard parts.count > 1 else { return nil }
        return String(parts.last!)
    }

    /// Parent directory path
    var parentPath: String {
        let components = path.split(separator: "/").dropLast()
        return "/" + components.joined(separator: "/")
    }

    /// Check if this is an image file
    var isImage: Bool {
        guard let mime = mimeType else { return false }
        return mime.hasPrefix("image/")
    }

    /// Check if this is a video file
    var isVideo: Bool {
        guard let mime = mimeType else { return false }
        return mime.hasPrefix("video/")
    }

    /// Check if this is an audio file
    var isAudio: Bool {
        guard let mime = mimeType else { return false }
        return mime.hasPrefix("audio/")
    }

    /// Check if this is a text file
    var isText: Bool {
        guard let mime = mimeType else {
            // Check common text extensions
            let textExtensions = ["txt", "md", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "log"]
            return fileExtension.map { textExtensions.contains($0.lowercased()) } ?? false
        }
        return mime.hasPrefix("text/") || mime == "application/json" || mime == "application/xml"
    }

    /// Check if this is a code file
    var isCode: Bool {
        let codeExtensions = [
            "swift", "rs", "ts", "tsx", "js", "jsx", "py", "rb", "go", "java", "kt", "c", "cpp", "h", "hpp",
            "cs", "php", "html", "css", "scss", "sass", "less", "sql", "sh", "bash", "zsh", "fish"
        ]
        return fileExtension.map { codeExtensions.contains($0.lowercased()) } ?? false
    }

    /// Resolution string for images/videos (e.g., "1920x1080")
    var resolution: String? {
        guard let w = width, let h = height else { return nil }
        return "\(w)x\(h)"
    }

    /// Formatted duration string (e.g., "1:23:45" or "3:45")
    var formattedDuration: String? {
        guard let d = duration else { return nil }
        let totalSeconds = Int(d)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }

    // MARK: - Sortable Properties (non-optional for Table sorting)

    /// Size for sorting (directories sort as -1)
    var sortableSize: Int64 {
        isDir ? -1 : (size ?? 0)
    }

    /// Modified date for sorting
    var sortableModified: Date {
        modified ?? Date.distantPast
    }

    /// Created date for sorting
    var sortableCreated: Date {
        created ?? Date.distantPast
    }
}
