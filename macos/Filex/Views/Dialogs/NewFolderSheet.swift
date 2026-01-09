//
//  NewFolderSheet.swift
//  Filex
//

import SwiftUI

struct NewFolderSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM

    @State private var folderName: String = ""
    @State private var isCreating: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            Text("New Folder")
                .font(.headline)

            TextField("Folder name", text: $folderName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 300)
                .onSubmit(createFolder)

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.escape)

                Button("Create") {
                    createFolder()
                }
                .keyboardShortcut(.return)
                .disabled(folderName.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(30)
        .disabled(isCreating)
        .overlay {
            if isCreating {
                ProgressView()
            }
        }
    }

    private func createFolder() {
        let name = folderName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        guard !name.contains("/") && !name.contains("\\") else {
            errorMessage = "Folder name cannot contain slashes"
            return
        }

        isCreating = true
        errorMessage = nil

        Task {
            do {
                let path = PathUtils.join(navigationState.currentPath, name)
                _ = try await APIClient.shared.createDirectory(path: path)
                dismiss()

                // Refresh directory
                directoryVM.loadDirectory(
                    path: navigationState.currentPath,
                    offset: navigationState.directoryOffset,
                    limit: navigationState.directoryLimit,
                    sortBy: navigationState.sortConfig.field,
                    sortOrder: navigationState.sortConfig.order
                )
            } catch {
                errorMessage = error.localizedDescription
            }
            isCreating = false
        }
    }
}

// MARK: - Preview

#Preview {
    NewFolderSheet()
        .environment(NavigationState())
        .environment(DirectoryViewModel())
}
