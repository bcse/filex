//
//  RenameSheet.swift
//  Filex
//

import SwiftUI

struct RenameSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM

    @State private var newName: String = ""
    @State private var isRenaming: Bool = false
    @State private var errorMessage: String?

    private var selectedEntry: FileEntry? {
        guard let path = navigationState.selectedPaths.first else { return nil }
        return directoryVM.entry(for: path)
    }

    var body: some View {
        VStack(spacing: 20) {
            Text("Rename")
                .font(.headline)

            if let entry = selectedEntry {
                HStack {
                    FileIconView(entry: entry)
                    Text(entry.name)
                        .lineLimit(1)
                }
                .foregroundStyle(.secondary)
            }

            TextField("New name", text: $newName)
                .textFieldStyle(.roundedBorder)
                .frame(width: 300)
                .onSubmit(rename)

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

                Button("Rename") {
                    rename()
                }
                .keyboardShortcut(.return)
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || isRenaming)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(30)
        .disabled(isRenaming)
        .overlay {
            if isRenaming {
                ProgressView()
            }
        }
        .onAppear {
            if let entry = selectedEntry {
                newName = entry.name
            }
        }
    }

    private func rename() {
        guard let entry = selectedEntry else { return }

        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        guard !name.contains("/") && !name.contains("\\") else {
            errorMessage = "Name cannot contain slashes"
            return
        }
        guard name != entry.name else {
            dismiss()
            return
        }

        isRenaming = true
        errorMessage = nil

        Task {
            do {
                _ = try await APIClient.shared.rename(path: entry.path, newName: name)
                dismiss()

                // Refresh directory
                navigationState.clearSelection()
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
            isRenaming = false
        }
    }
}

// MARK: - Preview

#Preview {
    RenameSheet()
        .environment(NavigationState())
        .environment(DirectoryViewModel())
}
