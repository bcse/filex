//
//  VideoPreviewView.swift
//  Filex
//

import SwiftUI
import AVKit

struct VideoPreviewView: View {
    let entry: FileEntry
    @Environment(PreviewViewModel.self) private var previewVM

    @State private var player: AVPlayer?

    var body: some View {
        Group {
            if let url = previewVM.downloadURL {
                VideoPlayer(player: player)
                    .onAppear {
                        player = AVPlayer(url: url)
                    }
                    .onDisappear {
                        player?.pause()
                        player = nil
                    }
            } else {
                errorView
            }
        }
    }

    private var errorView: some View {
        ContentUnavailableView {
            Label("Failed to Load", systemImage: "exclamationmark.triangle")
        } description: {
            Text("Could not load the video")
        }
    }
}

// MARK: - Preview

#Preview {
    VideoPreviewView(entry: FileEntry(
        name: "video.mp4",
        path: "/video.mp4",
        isDir: false,
        mimeType: "video/mp4"
    ))
    .environment(PreviewViewModel())
}
