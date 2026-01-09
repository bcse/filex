//
//  FilePreviewView.swift
//  Filex
//

import SwiftUI
import AVKit

struct FilePreviewView: View {
    let entry: FileEntry
    @Environment(PreviewViewModel.self) private var previewVM

    var body: some View {
        VStack(spacing: 0) {
            // Preview content
            previewContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Info bar
            infoBar
        }
        .navigationTitle(entry.name)
        .toolbar {
            if entry.isImage {
                ToolbarItemGroup {
                    Button(action: { previewVM.zoomIn() }) {
                        Image(systemName: "plus.magnifyingglass")
                    }
                    .help("Zoom In")

                    Button(action: { previewVM.zoomOut() }) {
                        Image(systemName: "minus.magnifyingglass")
                    }
                    .help("Zoom Out")

                    Button(action: { previewVM.fitToScreen() }) {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                    }
                    .help("Fit to Screen")

                    Button(action: { previewVM.actualSize() }) {
                        Image(systemName: "1.square")
                    }
                    .help("Actual Size")
                }
            }
        }
    }

    // MARK: - Preview Content

    @ViewBuilder
    private var previewContent: some View {
        if entry.isImage {
            ImagePreviewView(entry: entry)
        } else if entry.isVideo {
            VideoPreviewView(entry: entry)
        } else if entry.isText || entry.isCode {
            TextPreviewView()
        } else {
            unsupportedView
        }
    }

    // MARK: - Unsupported View

    private var unsupportedView: some View {
        VStack(spacing: 16) {
            FileIconView(entry: entry)
                .font(.system(size: 64))

            Text(entry.name)
                .font(.headline)

            Text("Preview not available for this file type")
                .foregroundStyle(.secondary)

            if let mime = entry.mimeType {
                Text(mime)
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    // MARK: - Info Bar

    private var infoBar: some View {
        HStack {
            // File info
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.callout)
                    .fontWeight(.medium)

                HStack(spacing: 8) {
                    if let size = entry.size {
                        Text(FileUtils.formatSize(size))
                    }
                    if let resolution = entry.resolution {
                        Text(resolution)
                    }
                    if let duration = entry.formattedDuration {
                        Text(duration)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            // Close button
            Button(action: {
                previewVM.close()
            }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Close Preview")
        }
        .padding(12)
        .background(.bar)
    }

}

// MARK: - Preview

#Preview {
    FilePreviewView(entry: FileEntry(
        name: "example.txt",
        path: "/example.txt",
        isDir: false,
        size: 1024,
        mimeType: "text/plain"
    ))
    .environment(PreviewViewModel())
}
