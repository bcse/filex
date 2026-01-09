//
//  SidebarView.swift
//  Filex
//

import SwiftUI

struct SidebarView: View {
    @Environment(NavigationState.self) private var navigationState
    @Environment(TreeViewModel.self) private var treeVM

    var body: some View {
        List(selection: Binding(
            get: { navigationState.currentPath },
            set: { newPath in
                if let path = newPath {
                    navigationState.navigate(to: path)
                }
            }
        )) {
            // Root folder
            Label("Root", systemImage: "folder.fill")
                .tag("/")

            // Tree nodes
            if let rootNodes = treeVM.rootNodes {
                ForEach(rootNodes) { node in
                    TreeNodeRow(node: node)
                }
            } else if treeVM.isLoading {
                HStack {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading...")
                        .foregroundStyle(.secondary)
                }
            } else if let error = treeVM.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Folders")
        .toolbar {
            ToolbarItem {
                Button(action: {
                    Task { await treeVM.refresh() }
                }) {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh folder tree")
            }
        }
    }
}

// MARK: - Tree Node Row

struct TreeNodeRow: View {
    let node: TreeNodeState
    @Environment(NavigationState.self) private var navigationState
    @Environment(TreeViewModel.self) private var treeVM

    var body: some View {
        if node.hasChildren {
            DisclosureGroup(
                isExpanded: Binding(
                    get: { node.isExpanded },
                    set: { isExpanded in
                        if isExpanded {
                            Task { await treeVM.expandNode(node) }
                        } else {
                            treeVM.collapseNode(node)
                        }
                    }
                )
            ) {
                if let children = node.children {
                    ForEach(children) { child in
                        TreeNodeRow(node: child)
                    }
                } else if node.isLoading {
                    HStack {
                        ProgressView()
                            .controlSize(.small)
                        Text("Loading...")
                            .foregroundStyle(.secondary)
                            .font(.caption)
                    }
                }
            } label: {
                nodeLabel
            }
            .tag(node.path)
        } else {
            nodeLabel
                .tag(node.path)
        }
    }

    private var nodeLabel: some View {
        Label {
            Text(node.name)
                .lineLimit(1)
        } icon: {
            Image(systemName: node.isExpanded ? "folder.fill" : "folder")
                .foregroundStyle(.yellow)
        }
    }
}

// MARK: - Preview

#Preview {
    SidebarView()
        .environment(NavigationState())
        .environment(TreeViewModel())
        .frame(width: 250)
}
