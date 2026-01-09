import Foundation

/// Fields that can be used for sorting
enum SortField: String, CaseIterable, Sendable {
    case name
    case path
    case size
    case created
    case modified
    case mimeType
    case width
    case height
    case duration

    /// Value used in API requests
    var apiValue: String {
        switch self {
        case .mimeType: return "type"
        case .width, .height: return "resolutions"
        default: return rawValue
        }
    }

    /// Display name for UI
    var displayName: String {
        switch self {
        case .name: return "Name"
        case .path: return "Path"
        case .size: return "Size"
        case .created: return "Created"
        case .modified: return "Modified"
        case .mimeType: return "Type"
        case .width: return "Width"
        case .height: return "Height"
        case .duration: return "Duration"
        }
    }

    /// KeyPath for sorting FileEntry
    var keyPath: PartialKeyPath<FileEntry> {
        switch self {
        case .name: return \FileEntry.name
        case .path: return \FileEntry.path
        case .size: return \FileEntry.size
        case .created: return \FileEntry.created
        case .modified: return \FileEntry.modified
        case .mimeType: return \FileEntry.mimeType
        case .width: return \FileEntry.width
        case .height: return \FileEntry.height
        case .duration: return \FileEntry.duration
        }
    }
}

/// Sort direction
enum SortOrder: String, Sendable {
    case ascending = "asc"
    case descending = "desc"

    mutating func toggle() {
        self = (self == .ascending) ? .descending : .ascending
    }

    var isAscending: Bool {
        self == .ascending
    }
}

/// Combined sort configuration
struct SortConfig: Equatable, Sendable {
    var field: SortField
    var order: SortOrder

    init(field: SortField = .name, order: SortOrder = .ascending) {
        self.field = field
        self.order = order
    }

    /// Toggle the order if same field, or switch to new field with ascending order
    mutating func toggleOrSet(_ newField: SortField) {
        if field == newField {
            order.toggle()
        } else {
            field = newField
            order = .ascending
        }
    }
}

// MARK: - Sorting Extensions

extension [FileEntry] {
    /// Sort entries with directories first, then by the given configuration
    func sorted(by config: SortConfig) -> [FileEntry] {
        sorted { lhs, rhs in
            // Directories always come first
            if lhs.isDir != rhs.isDir {
                return lhs.isDir
            }

            let ascending = config.order.isAscending

            switch config.field {
            case .name:
                let result = lhs.name.localizedStandardCompare(rhs.name)
                return ascending ? result == .orderedAscending : result == .orderedDescending

            case .path:
                let result = lhs.path.localizedStandardCompare(rhs.path)
                return ascending ? result == .orderedAscending : result == .orderedDescending

            case .size:
                let lSize = lhs.size ?? 0
                let rSize = rhs.size ?? 0
                return ascending ? lSize < rSize : lSize > rSize

            case .created:
                let lDate = lhs.created ?? .distantPast
                let rDate = rhs.created ?? .distantPast
                return ascending ? lDate < rDate : lDate > rDate

            case .modified:
                let lDate = lhs.modified ?? .distantPast
                let rDate = rhs.modified ?? .distantPast
                return ascending ? lDate < rDate : lDate > rDate

            case .mimeType:
                let lType = lhs.mimeType ?? ""
                let rType = rhs.mimeType ?? ""
                return ascending ? lType < rType : lType > rType

            case .width:
                let lWidth = lhs.width ?? 0
                let rWidth = rhs.width ?? 0
                return ascending ? lWidth < rWidth : lWidth > rWidth

            case .height:
                let lHeight = lhs.height ?? 0
                let rHeight = rhs.height ?? 0
                return ascending ? lHeight < rHeight : lHeight > rHeight

            case .duration:
                let lDuration = lhs.duration ?? 0
                let rDuration = rhs.duration ?? 0
                return ascending ? lDuration < rDuration : lDuration > rDuration
            }
        }
    }
}
