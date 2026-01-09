import Foundation

/// Errors that can occur when communicating with the Filex server
enum APIError: LocalizedError, Sendable {
    case invalidURL
    case invalidResponse
    case networkError(Error)
    case serverError(Int, String)
    case decodingError(Error)
    case unauthorized
    case notFound(String)
    case badRequest(String)
    case notConnected

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .unauthorized:
            return "Authentication required"
        case .notFound(let path):
            return "Not found: \(path)"
        case .badRequest(let message):
            return "Bad request: \(message)"
        case .notConnected:
            return "Not connected to server"
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .invalidURL:
            return "Check the server URL in settings"
        case .networkError:
            return "Check your network connection and server availability"
        case .unauthorized:
            return "Please log in again"
        case .notConnected:
            return "Configure the server URL in settings"
        default:
            return nil
        }
    }

    /// Check if this is an authentication error
    var isAuthError: Bool {
        if case .unauthorized = self { return true }
        if case .serverError(401, _) = self { return true }
        return false
    }

    /// Check if this is a network connectivity error
    var isNetworkError: Bool {
        if case .networkError = self { return true }
        if case .notConnected = self { return true }
        return false
    }
}
