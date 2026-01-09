//
//  DetailView.swift
//  Filex
//

import SwiftUI

struct DetailView: View {
    @Environment(PreviewViewModel.self) private var previewVM

    var body: some View {
        Group {
            if let entry = previewVM.entry {
                FilePreviewView(entry: entry)
            } else {
                placeholderView
            }
        }
    }

    private var placeholderView: some View {
        ContentUnavailableView {
            Label("No Selection", systemImage: "doc")
        } description: {
            Text("Select a file to preview")
        }
    }
}

// MARK: - Preview

#Preview {
    DetailView()
        .environment(PreviewViewModel())
}
