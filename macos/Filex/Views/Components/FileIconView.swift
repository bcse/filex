//
//  FileIconView.swift
//  Filex
//

import SwiftUI

struct FileIconView: View {
    let entry: FileEntry

    var body: some View {
        Image(systemName: FileUtils.symbolName(for: entry))
            .foregroundStyle(iconColor)
            .font(.body)
    }

    private var iconColor: Color {
        let colorName = FileUtils.symbolColor(for: entry)
        switch colorName {
        case "yellow": return .yellow
        case "green": return .green
        case "purple": return .purple
        case "pink": return .pink
        case "orange": return .orange
        case "blue": return .blue
        case "red": return .red
        case "gray": return .gray
        default: return .gray
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 10) {
        FileIconView(entry: FileEntry(name: "Folder", path: "/folder", isDir: true))
        FileIconView(entry: FileEntry(name: "image.png", path: "/image.png", isDir: false, mimeType: "image/png"))
        FileIconView(entry: FileEntry(name: "video.mp4", path: "/video.mp4", isDir: false, mimeType: "video/mp4"))
        FileIconView(entry: FileEntry(name: "code.swift", path: "/code.swift", isDir: false))
        FileIconView(entry: FileEntry(name: "document.pdf", path: "/document.pdf", isDir: false, mimeType: "application/pdf"))
    }
    .padding()
}
