//
//  ServerConfigView.swift
//  Filex
//

import SwiftUI

struct ServerConfigView: View {
    @Environment(ServerConfiguration.self) private var serverConfig

    @State private var serverURL: String = ""
    @State private var isConnecting: Bool = false
    @State private var connectionStatus: ConnectionStatus = .unknown
    @State private var errorMessage: String?

    enum ConnectionStatus {
        case unknown
        case connecting
        case connected
        case failed
    }

    var body: some View {
        VStack(spacing: 24) {
            // Header
            Image(systemName: "server.rack")
                .font(.system(size: 48))
                .foregroundStyle(.blue)

            Text("Server Configuration")
                .font(.title2)
                .fontWeight(.semibold)

            // Server URL field
            VStack(alignment: .leading, spacing: 8) {
                Text("Server URL")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack {
                    TextField("localhost:3000", text: $serverURL)
                        .textFieldStyle(.roundedBorder)

                    Button(action: testConnection) {
                        if isConnecting {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Text("Test")
                        }
                    }
                    .disabled(serverURL.isEmpty || isConnecting)
                }
            }
            .frame(width: 300)

            // Connection status
            connectionStatusView

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            // Buttons
            HStack {
                Button("Reset") {
                    serverURL = ""
                    connectionStatus = .unknown
                    errorMessage = nil
                }

                Button("Save") {
                    serverConfig.serverURL = serverURL
                    serverConfig.rememberServer = true
                }
                .buttonStyle(.borderedProminent)
                .disabled(serverURL.isEmpty || connectionStatus != .connected)
            }
        }
        .padding(30)
        .onAppear {
            serverURL = serverConfig.serverURL
        }
    }

    // MARK: - Connection Status View

    @ViewBuilder
    private var connectionStatusView: some View {
        HStack(spacing: 8) {
            switch connectionStatus {
            case .unknown:
                Image(systemName: "circle")
                    .foregroundStyle(.gray)
                Text("Not tested")
                    .foregroundStyle(.secondary)

            case .connecting:
                ProgressView()
                    .controlSize(.small)
                Text("Connecting...")
                    .foregroundStyle(.secondary)

            case .connected:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Connected")
                    .foregroundStyle(.green)

            case .failed:
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.red)
                Text("Connection failed")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption)
    }

    // MARK: - Test Connection

    private func testConnection() {
        guard !serverURL.isEmpty else { return }

        isConnecting = true
        connectionStatus = .connecting
        errorMessage = nil

        Task {
            do {
                // Create temporary URL
                var urlString = serverURL
                if !urlString.hasPrefix("http://") && !urlString.hasPrefix("https://") {
                    urlString = "http://" + urlString
                }
                guard let baseURL = URL(string: urlString) else {
                    throw APIError.invalidURL
                }

                let apiURL = baseURL.appendingPathComponent("api")
                await APIClient.shared.configure(baseURL: apiURL)

                let health = try await APIClient.shared.getHealth()

                if health.isHealthy {
                    connectionStatus = .connected
                } else {
                    connectionStatus = .failed
                    errorMessage = "Server is not healthy"
                }
            } catch {
                connectionStatus = .failed
                errorMessage = error.localizedDescription
            }
            isConnecting = false
        }
    }
}

// MARK: - Preview

#Preview {
    ServerConfigView()
        .environment(ServerConfiguration())
}
