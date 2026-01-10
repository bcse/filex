import Foundation

/// Utility functions for file operations
enum FileUtils {
    /// Format file size in human-readable format
    static func formatSize(_ bytes: Int64?) -> String {
        guard let bytes = bytes else { return "-" }
        guard bytes > 0 else { return "0 B" }

        let units = ["B", "KB", "MB", "GB", "TB"]
        var size = Double(bytes)
        var unitIndex = 0

        while size >= 1024 && unitIndex < units.count - 1 {
            size /= 1024
            unitIndex += 1
        }

        if unitIndex == 0 {
            return "\(bytes) B"
        } else {
            return String(format: "%.1f %@", size, units[unitIndex])
        }
    }

    /// Get file type suffix from MIME type
    static func typeFromMime(_ mimeType: String?) -> String {
        guard let mime = mimeType else { return "-" }
        let components = mime.split(separator: "/")
        guard components.count == 2 else { return mime }
        return String(components[1])
    }

    /// Get SF Symbol name for a file entry
    static func symbolName(for entry: FileEntry) -> String {
        if entry.isDir {
            return "folder.fill"
        }

        // Check by MIME type first
        if let mime = entry.mimeType {
            if mime.hasPrefix("image/") {
                return "photo.fill"
            }
            if mime.hasPrefix("video/") {
                return "film.fill"
            }
            if mime.hasPrefix("audio/") {
                return "music.note"
            }
            if mime.hasPrefix("text/") {
                return "doc.text.fill"
            }
            if mime == "application/pdf" {
                return "doc.fill"
            }
            if mime == "application/json" || mime == "application/xml" {
                return "doc.text.fill"
            }
            if mime.contains("zip") || mime.contains("tar") || mime.contains("archive") || mime.contains("compressed") {
                return "doc.zipper"
            }
        }

        // Check by extension
        if let ext = entry.fileExtension?.lowercased() {
            switch ext {
            // Images
            case "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tiff", "svg", "ico":
                return "photo.fill"

            // Videos
            case "mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv":
                return "film.fill"

            // Audio
            case "mp3", "wav", "aac", "flac", "m4a", "ogg", "wma", "aiff":
                return "music.note"

            // Documents
            case "pdf":
                return "doc.fill"
            case "doc", "docx":
                return "doc.richtext.fill"
            case "xls", "xlsx":
                return "tablecells.fill"
            case "ppt", "pptx":
                return "rectangle.split.3x3.fill"

            // Code
            case "swift", "rs", "ts", "tsx", "js", "jsx", "py", "rb", "go", "java", "kt", "c", "cpp", "h", "hpp", "cs":
                return "chevron.left.forwardslash.chevron.right"
            case "html", "css", "scss", "sass", "less":
                return "globe"
            case "json", "xml", "yaml", "yml", "toml":
                return "doc.text.fill"
            case "sh", "bash", "zsh", "fish":
                return "terminal.fill"

            // Archives
            case "zip", "tar", "gz", "rar", "7z", "bz2", "xz":
                return "doc.zipper"

            // Text
            case "txt", "md", "rtf", "log":
                return "doc.text.fill"

            // Other
            case "dmg", "iso", "img":
                return "externaldrive.fill"
            case "app":
                return "app.fill"
            case "pkg", "deb", "rpm":
                return "shippingbox.fill"

            default:
                break
            }
        }

        return "doc.fill"
    }

    /// Get symbol color for a file entry
    static func symbolColor(for entry: FileEntry) -> String {
        if entry.isDir {
            return "yellow"
        }

        // Check by MIME type first
        if let mime = entry.mimeType {
            if mime.hasPrefix("image/") {
                return "green"
            }
            if mime.hasPrefix("video/") {
                return "purple"
            }
            if mime.hasPrefix("audio/") {
                return "pink"
            }
            if mime.hasPrefix("text/") || mime == "application/json" || mime == "application/xml" {
                return "orange"
            }
            if mime == "application/pdf" {
                return "red"
            }
            if mime.contains("zip") || mime.contains("tar") || mime.contains("archive") || mime.contains("compressed") {
                return "orange"
            }
        }

        // Check by extension as fallback
        if let ext = entry.fileExtension?.lowercased() {
            switch ext {
            // Images
            case "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tiff", "svg", "ico":
                return "green"

            // Videos
            case "mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv":
                return "purple"

            // Audio
            case "mp3", "wav", "aac", "flac", "m4a", "ogg", "wma", "aiff":
                return "pink"

            // Code
            case "swift", "rs", "ts", "tsx", "js", "jsx", "py", "rb", "go", "java", "kt", "c", "cpp", "h", "hpp", "cs",
                 "html", "css", "scss", "sass", "less", "sh", "bash", "zsh", "fish":
                return "blue"

            // Documents
            case "pdf":
                return "red"

            // Text/Config
            case "txt", "md", "rtf", "log", "json", "xml", "yaml", "yml", "toml":
                return "orange"

            // Archives
            case "zip", "tar", "gz", "rar", "7z", "bz2", "xz":
                return "orange"

            // Other
            case "dmg", "iso", "img":
                return "gray"

            default:
                break
            }
        }

        return "gray"
    }
}
