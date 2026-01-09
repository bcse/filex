//
//  TextPreviewView.swift
//  Filex
//

import SwiftUI

struct TextPreviewView: View {
    @Environment(PreviewViewModel.self) private var previewVM

    var body: some View {
        Group {
            if previewVM.isLoading {
                loadingView
            } else if let error = previewVM.errorMessage {
                errorView(error)
            } else if let content = previewVM.textContent {
                textView(content)
            } else {
                emptyView
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        ContentUnavailableView {
            Label("Empty File", systemImage: "doc")
        } description: {
            Text("This file is empty")
        }
    }

    // MARK: - Text View

    private func textView(_ content: String) -> some View {
        ScrollView([.horizontal, .vertical]) {
            Text(content)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(nsColor: .textBackgroundColor))
    }
}

// MARK: - Preview

#Preview {
    TextPreviewView()
        .environment(PreviewViewModel())
}
