import Foundation
import SwiftUI

/// Manages server connection configuration with persistence
@Observable
final class ServerConfiguration: @unchecked Sendable {
    private static let serverURLKey = "serverURL"
    private static let rememberServerKey = "rememberServer"
    private static let pathMappingsKey = "pathMappings"

    /// The configured server URL
    var serverURL: String {
        didSet {
            if rememberServer {
                UserDefaults.standard.set(serverURL, forKey: Self.serverURLKey)
            }
        }
    }

    /// Whether to remember the server URL
    var rememberServer: Bool {
        didSet {
            UserDefaults.standard.set(rememberServer, forKey: Self.rememberServerKey)
            if rememberServer {
                UserDefaults.standard.set(serverURL, forKey: Self.serverURLKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.serverURLKey)
            }
        }
    }

    /// Path mappings for remote to local path resolution
    var pathMappings: [PathMapping] {
        didSet {
            savePathMappings()
        }
    }

    /// Whether the server URL is configured
    var isConfigured: Bool {
        !serverURL.isEmpty && URL(string: serverURL) != nil
    }

    /// The base URL for API requests
    var baseURL: URL? {
        guard !serverURL.isEmpty else { return nil }
        var urlString = serverURL
        // Ensure the URL has a scheme
        if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
            urlString = "http://" + urlString
        }
        // Remove trailing slash
        if urlString.hasSuffix("/") {
            urlString = String(urlString.dropLast())
        }
        return URL(string: urlString)
    }

    /// API base URL (with /api prefix)
    var apiBaseURL: URL? {
        baseURL?.appendingPathComponent("api")
    }

    /// Check if path mappings are configured
    var hasPathMappings: Bool {
        pathMappings.contains { $0.isValid }
    }

    init() {
        let remember = UserDefaults.standard.bool(forKey: Self.rememberServerKey)
        self.rememberServer = remember
        if remember {
            self.serverURL = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? ""
        } else {
            self.serverURL = ""
        }
        self.pathMappings = Self.loadPathMappings()
    }

    /// Resolve a remote path to local path
    func resolveLocalPath(_ remotePath: String) -> String? {
        pathMappings.resolveLocalPath(remotePath)
    }

    /// Reset to default state
    func reset() {
        serverURL = ""
        rememberServer = false
        pathMappings = []
        UserDefaults.standard.removeObject(forKey: Self.serverURLKey)
        UserDefaults.standard.removeObject(forKey: Self.pathMappingsKey)
    }

    // MARK: - Private

    private func savePathMappings() {
        if let data = try? JSONEncoder().encode(pathMappings) {
            UserDefaults.standard.set(data, forKey: Self.pathMappingsKey)
        }
    }

    private static func loadPathMappings() -> [PathMapping] {
        guard let data = UserDefaults.standard.data(forKey: pathMappingsKey),
              let mappings = try? JSONDecoder().decode([PathMapping].self, from: data) else {
            return []
        }
        return mappings
    }
}

// MARK: - Environment Key

private struct ServerConfigurationKey: EnvironmentKey {
    static let defaultValue: ServerConfiguration = ServerConfiguration()
}

extension EnvironmentValues {
    var serverConfiguration: ServerConfiguration {
        get { self[ServerConfigurationKey.self] }
        set { self[ServerConfigurationKey.self] = newValue }
    }
}
