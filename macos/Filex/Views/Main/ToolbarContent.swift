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
            HStack(spacing: 0) {
                Button(action: { navigationState.goBack() }) {
                    Image(systemName: "chevron.left")
                }
                .help("Go Back")
                .disabled(!navigationState.canGoBack)
                
                Divider().frame(height: 19)
                
                Button(action: { navigationState.goForward() }) {
                    Image(systemName: "chevron.right")
                }
                .help("Go Forward")
                .disabled(!navigationState.canGoForward)
            }
        }
    }
}
