import Foundation

/// Actor-based API client for communicating with the Filex server
actor APIClient {
    private let session: URLSession
    private var baseURL: URL?

    /// Date decoder for ISO8601 dates from the server
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            // Create formatter locally to avoid Sendable issues
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            // Try with fractional seconds first
            if let date = formatter.date(from: dateString) {
                return date
            }
            // Try without fractional seconds
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date: \(dateString)")
        }
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        self.session = URLSession(configuration: config)
    }

    /// Configure the base URL for API requests
    func configure(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// Check if the client is configured
    var isConfigured: Bool {
        baseURL != nil
    }

    // MARK: - Browse & Navigation

    /// List directory contents
    func listDirectory(
        path: String,
        offset: Int = 0,
        limit: Int = 100,
        sortBy: SortField = .name,
        sortOrder: SortOrder = .ascending
    ) async throws -> ListResponse {
        guard let base = baseURL else { throw APIError.notConnected }

        var components = URLComponents(url: base.appendingPathComponent("browse"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "path", value: path),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "sort_by", value: sortBy.apiValue),
            URLQueryItem(name: "sort_order", value: sortOrder.rawValue)
        ]

        return try await request(components.url!)
    }

    /// Get directory tree for sidebar
    func getTree(path: String = "/") async throws -> [TreeNode] {
        guard let base = baseURL else { throw APIError.notConnected }

        var components = URLComponents(url: base.appendingPathComponent("tree"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "path", value: path)]

        return try await request(components.url!)
    }

    // MARK: - Search

    /// Search for files
    func search(
        query: String,
        offset: Int = 0,
        limit: Int = 100,
        sortBy: SortField = .name,
        sortOrder: SortOrder = .ascending
    ) async throws -> SearchResponse {
        guard let base = baseURL else { throw APIError.notConnected }

        var components = URLComponents(url: base.appendingPathComponent("search"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "sort_by", value: sortBy.apiValue),
            URLQueryItem(name: "sort_order", value: sortOrder.rawValue)
        ]

        return try await request(components.url!)
    }

    // MARK: - File Operations

    /// Create a new directory
    func createDirectory(path: String) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("files/mkdir")
        let body = ["path": path]
        return try await request(url, method: "POST", body: try encoder.encode(body))
    }

    /// Rename a file or directory
    func rename(path: String, newName: String) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("files/rename")
        let body = ["path": path, "new_name": newName]
        return try await request(url, method: "POST", body: try encoder.encode(body))
    }

    /// Move a file or directory
    func move(from: String, to: String, overwrite: Bool = false) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("files/move")
        let body: [String: Any] = ["from": from, "to": to, "overwrite": overwrite]
        return try await request(url, method: "POST", body: try JSONSerialization.data(withJSONObject: body))
    }

    /// Copy a file or directory
    func copy(from: String, to: String, overwrite: Bool = false) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("files/copy")
        let body: [String: Any] = ["from": from, "to": to, "overwrite": overwrite]
        return try await request(url, method: "POST", body: try JSONSerialization.data(withJSONObject: body))
    }

    /// Delete a file or directory
    func delete(path: String) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("files/delete")
        let body = ["path": path]
        return try await request(url, method: "DELETE", body: try encoder.encode(body))
    }

    /// Get download URL for a file
    func downloadURL(for path: String) -> URL? {
        guard let base = baseURL else { return nil }
        var components = URLComponents(url: base.appendingPathComponent("files/download"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "path", value: path)]
        return components.url
    }

    /// Upload files to a directory
    func upload(
        to targetPath: String,
        files: [URL],
        progress: @escaping @Sendable (Double) -> Void
    ) async throws -> SuccessResponse {
        guard let base = baseURL else { throw APIError.notConnected }

        let boundary = UUID().uuidString
        var url = base.appendingPathComponent("files/upload")
        if !targetPath.isEmpty && targetPath != "/" {
            url = url.appendingPathComponent(targetPath)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        // Build multipart form data
        var data = Data()
        for fileURL in files {
            guard let fileData = try? Data(contentsOf: fileURL) else { continue }
            let filename = fileURL.lastPathComponent

            data.append("--\(boundary)\r\n".data(using: .utf8)!)
            data.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            data.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
            data.append(fileData)
            data.append("\r\n".data(using: .utf8)!)
        }
        data.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = data

        // For now, we'll use a simple upload without progress tracking
        // A more sophisticated implementation would use URLSessionUploadTask with delegate
        let (responseData, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            let errorResponse = try? decoder.decode(ErrorResponse.self, from: responseData)
            throw APIError.serverError(httpResponse.statusCode, errorResponse?.error ?? "Upload failed")
        }

        progress(1.0)
        return try decoder.decode(SuccessResponse.self, from: responseData)
    }

    // MARK: - Authentication

    /// Login with password
    func login(password: String) async throws -> AuthResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("auth/login")
        let body = ["password": password]
        return try await request(url, method: "POST", body: try encoder.encode(body))
    }

    /// Logout
    func logout() async throws {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("auth/logout")
        let _: SuccessResponse = try await request(url, method: "POST")
    }

    /// Get authentication status
    func getAuthStatus() async throws -> AuthStatus {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("auth/status")
        return try await request(url)
    }

    // MARK: - System

    /// Get server health
    func getHealth() async throws -> HealthResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("health")
        return try await request(url)
    }

    /// Get statistics
    func getStatistics() async throws -> StatisticsResponse {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("statistics")
        return try await request(url)
    }

    /// Get indexer status
    func getIndexStatus() async throws -> IndexStatus {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("index/status")
        return try await request(url)
    }

    /// Trigger re-indexing
    func triggerIndex() async throws -> IndexStatus {
        guard let base = baseURL else { throw APIError.notConnected }
        let url = base.appendingPathComponent("index/trigger")
        return try await request(url, method: "POST")
    }

    // MARK: - Private

    private func request<T: Decodable>(_ url: URL, method: String = "GET", body: Data? = nil) async throws -> T {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body

        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200..<300:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw APIError.decodingError(error)
            }

        case 401:
            throw APIError.unauthorized

        case 404:
            let errorResponse = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.notFound(errorResponse?.error ?? "Not found")

        case 400:
            let errorResponse = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.badRequest(errorResponse?.error ?? "Bad request")

        default:
            let errorResponse = try? decoder.decode(ErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorResponse?.error ?? "Unknown error")
        }
    }
}

// MARK: - Shared Instance

extension APIClient {
    /// Shared API client instance
    static let shared = APIClient()
}
