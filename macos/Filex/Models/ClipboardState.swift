import Foundation

/// Represents the clipboard state for copy/cut operations
enum ClipboardState: Equatable, Sendable {
    case empty
    case copy([String])
    case cut([String])

    /// Get the file paths in the clipboard
    var paths: [String] {
        switch self {
        case .empty:
            return []
        case .copy(let paths), .cut(let paths):
            return paths
        }
    }

    /// Check if the clipboard has content
    var isEmpty: Bool {
        paths.isEmpty
    }

    /// Check if this is a cut operation
    var isCut: Bool {
        if case .cut = self { return true }
        return false
    }

    /// Check if this is a copy operation
    var isCopy: Bool {
        if case .copy = self { return true }
        return false
    }

    /// Number of items in the clipboard
    var count: Int {
        paths.count
    }

    /// Description for UI display
    var description: String {
        guard !isEmpty else { return "" }
        let operation = isCut ? "Cut" : "Copied"
        let itemText = count == 1 ? "item" : "items"
        return "\(operation) \(count) \(itemText)"
    }
}
