//
//  ToolbarContent.swift
//  Filex
//

import SwiftUI

struct FilexToolbarContent: ToolbarContent {
    @Environment(NavigationState.self) private var navigationState
    @Environment(DirectoryViewModel.self) private var directoryVM

    var body: some ToolbarContent {
        // Navigation buttons
        ToolbarItemGroup(placement: .navigation) {
            Button(action: { navigationState.goBack() }) {
                Image(systemName: "chevron.left")
            }
            .help("Go Back")
            .disabled(!navigationState.canGoBack)

            Button(action: { navigationState.goForward() }) {
                Image(systemName: "chevron.right")
            }
            .help("Go Forward")
            .disabled(!navigationState.canGoForward)
        }

        // Primary actions
        ToolbarItemGroup(placement: .primaryAction) {
            Button(action: {
                NotificationCenter.default.post(name: .newFolderRequested, object: nil)
            }) {
                Image(systemName: "folder.badge.plus")
            }
            .help("New Folder")

            Button(action: {
                NotificationCenter.default.post(name: .uploadRequested, object: nil)
            }) {
                Image(systemName: "arrow.up.doc")
            }
            .help("Upload Files")

            Button(action: {
                NotificationCenter.default.post(name: .renameRequested, object: nil)
            }) {
                Image(systemName: "pencil")
            }
            .help("Rename")
            .disabled(!navigationState.hasSingleSelection)

            Button(action: {
                NotificationCenter.default.post(name: .deleteRequested, object: nil)
            }) {
                Image(systemName: "trash")
            }
            .help("Delete")
            .disabled(!navigationState.hasSelection)
        }
    }
}
