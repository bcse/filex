//
//  DropActionSheet.swift
//  Filex
//

import SwiftUI

struct DropActionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM

    let sourcePaths: [String]
    let targetPath: String

    @State private var isProcessing: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            Text("Move or Copy")
                .font(.headline)

            Text(descriptionText)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack(spacing: 12) {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.escape)

                Button("Copy") {
                    performAction(move: false)
                }

                Button("Move") {
                    performAction(move: true)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(30)
        .disabled(isProcessing)
        .overlay {
            if isProcessing {
                ProgressView()
            }
        }
    }

    private var descriptionText: String {
        let count = sourcePaths.count
        let itemText = count == 1 ? "item" : "items"
        let targetName = PathUtils.basename(targetPath)
        return "\(count) \(itemText) to \"\(targetName)\""
    }

    private func performAction(move: Bool) {
        isProcessing = true
        errorMessage = nil

        Task {
            var hasError = false

            for path in sourcePaths {
                do {
                    if move {
                        _ = try await APIClient.shared.move(from: path, to: targetPath)
                    } else {
                        _ = try await APIClient.shared.copy(from: path, to: targetPath)
                    }
                } catch {
                    hasError = true
                    errorMessage = error.localizedDescription
                    break
                }
            }

            if !hasError {
                dismiss()

                // Refresh directory
                directoryVM.loadDirectory(
                    path: navigationState.currentPath,
                    offset: navigationState.directoryOffset,
                    limit: navigationState.directoryLimit,
                    sortBy: navigationState.sortConfig.field,
                    sortOrder: navigationState.sortConfig.order
                )
            }

            isProcessing = false
        }
    }
}

// MARK: - Preview

#Preview {
    DropActionSheet(sourcePaths: ["/file1.txt", "/file2.txt"], targetPath: "/folder")
        .environment(NavigationState())
        .environment(DirectoryViewModel())
}
