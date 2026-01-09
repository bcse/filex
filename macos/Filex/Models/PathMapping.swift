//
//  PathMapping.swift
//  Filex
//

import Foundation

/// Maps remote server paths to local filesystem paths
struct PathMapping: Codable, Identifiable, Equatable, Sendable {
    var id: UUID
    var prefix: String  // Remote path prefix (e.g., "/")
    var target: String  // Local path (e.g., "/Users/user/files")

    init(id: UUID = UUID(), prefix: String = "", target: String = "") {
        self.id = id
        self.prefix = prefix
        self.target = target
    }

    /// Normalize prefix to ensure it starts and ends with /
    var normalizedPrefix: String {
        var normalized = prefix.trimmingCharacters(in: .whitespaces)
        if !normalized.hasPrefix("/") {
            normalized = "/" + normalized
        }
        if !normalized.hasSuffix("/") {
            normalized = normalized + "/"
        }
        return normalized
    }

    /// Normalize target to remove trailing slash
    var normalizedTarget: String {
        let trimmed = target.trimmingCharacters(in: .whitespaces)
        if trimmed == "/" { return "/" }
        return trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed
    }

    /// Check if this mapping is valid (has both prefix and target)
    var isValid: Bool {
        !prefix.trimmingCharacters(in: .whitespaces).isEmpty &&
        !target.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

// MARK: - Path Resolution

extension Array where Element == PathMapping {
    /// Resolve a remote path to a local path using the mappings
    /// Returns nil if no mapping matches
    func resolveLocalPath(_ remotePath: String) -> String? {
        // Sort by prefix length (longest first) to match most specific mapping
        let sortedMappings = self
            .filter { $0.isValid }
            .sorted { $0.prefix.count > $1.prefix.count }

        for mapping in sortedMappings {
            let normalizedPrefix = mapping.normalizedPrefix

            // Check if path matches this prefix
            // Handle both exact prefix match and paths starting with prefix
            if remotePath == normalizedPrefix.dropLast() || remotePath.hasPrefix(normalizedPrefix) {
                let normalizedTarget = mapping.normalizedTarget

                if remotePath == normalizedPrefix.dropLast() {
                    // Exact match to prefix (without trailing /)
                    return normalizedTarget
                }

                let remainder = String(remotePath.dropFirst(normalizedPrefix.count))

                if remainder.isEmpty {
                    return normalizedTarget
                }

                if normalizedTarget == "/" {
                    return "/" + remainder
                }

                return normalizedTarget + "/" + remainder
            }
        }

        return nil
    }
}
