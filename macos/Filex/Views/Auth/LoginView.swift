//
//  LoginView.swift
//  Filex
//

import SwiftUI

struct LoginView: View {
    @Environment(\.dismiss) private var dismiss
    let onLogin: () -> Void

    @State private var password: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            // Logo
            Image(systemName: "folder.fill")
                .font(.system(size: 64))
                .foregroundStyle(.blue)

            Text("Filex")
                .font(.largeTitle)
                .fontWeight(.bold)

            Text("Enter your password to continue")
                .foregroundStyle(.secondary)

            // Password field
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 250)
                .onSubmit(login)

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            // Login button
            Button(action: login) {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text("Login")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(password.isEmpty || isLoading)
            .keyboardShortcut(.return)
        }
        .padding(40)
        .frame(width: 350, height: 350)
    }

    private func login() {
        guard !password.isEmpty else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let response = try await APIClient.shared.login(password: password)
                if response.success {
                    onLogin()
                    dismiss()
                } else {
                    errorMessage = response.error ?? "Login failed"
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - Preview

#Preview {
    LoginView(onLogin: {})
}
