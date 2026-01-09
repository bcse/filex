import Foundation

/// Response from GET /api/browse
nonisolated struct ListResponse: Codable, Sendable {
    let path: String?
    let entries: [FileEntry]
    let offset: Int
    let limit: Int
    let total: Int
    let sortBy: String?
    let sortOrder: String?

    enum CodingKeys: String, CodingKey {
        case path, entries, offset, limit, total
        case sortBy = "sort_by"
        case sortOrder = "sort_order"
    }

    /// Check if there are more pages
    var hasMore: Bool {
        offset + entries.count < total
    }

    /// Total number of pages
    var totalPages: Int {
        guard limit > 0 else { return 1 }
        return (total + limit - 1) / limit
    }

    /// Current page number (0-indexed)
    var currentPage: Int {
        guard limit > 0 else { return 0 }
        return offset / limit
    }
}

/// Response from GET /api/search
nonisolated struct SearchResponse: Codable, Sendable {
    let query: String
    let entries: [FileEntry]
    let offset: Int
    let limit: Int
    let total: Int
    let sortBy: String?
    let sortOrder: String?

    enum CodingKeys: String, CodingKey {
        case query, entries, offset, limit, total
        case sortBy = "sort_by"
        case sortOrder = "sort_order"
    }

    /// Check if there are more pages
    var hasMore: Bool {
        offset + entries.count < total
    }

    /// Total number of pages
    var totalPages: Int {
        guard limit > 0 else { return 1 }
        return (total + limit - 1) / limit
    }

    /// Current page number (0-indexed)
    var currentPage: Int {
        guard limit > 0 else { return 0 }
        return offset / limit
    }
}

/// Generic success response from file operations
nonisolated struct SuccessResponse: Codable, Sendable {
    let success: Bool
    let path: String?
    let message: String?
    let performed: Bool?
}

/// Error response from the server
nonisolated struct ErrorResponse: Codable, Sendable {
    let error: String
}

/// Response from GET /api/auth/status
nonisolated struct AuthStatus: Codable, Sendable {
    let authenticated: Bool
    let authRequired: Bool

    enum CodingKeys: String, CodingKey {
        case authenticated
        case authRequired = "auth_required"
    }
}

/// Response from POST /api/auth/login
nonisolated struct AuthResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

/// Response from GET /api/health
nonisolated struct HealthResponse: Codable, Sendable {
    let status: String
    let version: String?
    let gitCommit: String?
    let builtAt: String?
    let ffprobeAvailable: Bool?
    let databaseStatus: DatabaseStatus?

    enum CodingKeys: String, CodingKey {
        case status, version
        case gitCommit = "git_commit"
        case builtAt = "built_at"
        case ffprobeAvailable = "ffprobe_available"
        case databaseStatus = "database_status"
    }

    nonisolated struct DatabaseStatus: Codable, Sendable {
        let connected: Bool
        let error: String?
    }

    var isHealthy: Bool {
        status == "ok"
    }
}

/// Response from GET /api/statistics
nonisolated struct StatisticsResponse: Codable, Sendable {
    let lastIndexedAt: String?
    let totalFilesCount: Int?
    let totalSize: String?

    enum CodingKeys: String, CodingKey {
        case lastIndexedAt = "last_indexed_at"
        case totalFilesCount = "total_files_count"
        case totalSize = "total_size"
    }
}

/// Response from GET /api/index/status
nonisolated struct IndexStatus: Codable, Sendable {
    let isRunning: Bool

    enum CodingKeys: String, CodingKey {
        case isRunning = "is_running"
    }
}
