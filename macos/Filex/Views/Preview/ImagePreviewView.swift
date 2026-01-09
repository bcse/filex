//
//  ImagePreviewView.swift
//  Filex
//

import SwiftUI

struct ImagePreviewView: View {
    let entry: FileEntry
    @Environment(PreviewViewModel.self) private var previewVM

    @State private var imagePhase: AsyncImagePhase = .empty

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.opacity(0.02)

                if let url = previewVM.downloadURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .empty:
                            ProgressView()
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .scaleEffect(previewVM.imageScale)
                                .offset(previewVM.imageOffset)
                                .gesture(magnificationGesture)
                                .gesture(dragGesture)
                                .onTapGesture(count: 2) {
                                    withAnimation {
                                        previewVM.resetImageState()
                                    }
                                }
                        case .failure:
                            errorView
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height)
                } else {
                    errorView
                }
            }
        }
    }

    // MARK: - Error View

    private var errorView: some View {
        ContentUnavailableView {
            Label("Failed to Load", systemImage: "exclamationmark.triangle")
        } description: {
            Text("Could not load the image")
        } actions: {
            if previewVM.downloadURL != nil {
                Button("Try Again") {
                    // Force reload by resetting state
                    imagePhase = .empty
                }
            }
        }
    }

    // MARK: - Gestures

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let newScale = previewVM.imageScale * value
                previewVM.imageScale = min(max(newScale, 0.1), 10.0)
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                previewVM.imageOffset = CGSize(
                    width: value.translation.width,
                    height: value.translation.height
                )
            }
    }
}

// MARK: - Preview

#Preview {
    ImagePreviewView(entry: FileEntry(
        name: "photo.jpg",
        path: "/photo.jpg",
        isDir: false,
        mimeType: "image/jpeg"
    ))
    .environment(PreviewViewModel())
}
