import Foundation
import SwiftUI

/// View model for the sidebar directory tree
@Observable
@MainActor
final class TreeViewModel {
    /// Root nodes of the tree
    private(set) var rootNodes: [TreeNodeState]?

    /// Whether the tree is loading
    private(set) var isLoading: Bool = false

    /// Error message if load failed
    private(set) var errorMessage: String?

    /// API client for requests
    private let apiClient: APIClient

    /// Cache of loaded children by path
    private var childrenCache: [String: [TreeNodeState]] = [:]

    init(apiClient: APIClient = .shared) {
        self.apiClient = apiClient
    }

    /// Load root nodes of the tree
    func loadRootNodes() async {
        isLoading = true
        errorMessage = nil

        do {
            let nodes = try await apiClient.getTree(path: "/")
            rootNodes = nodes.map { TreeNodeState(node: $0) }
        } catch {
            errorMessage = error.localizedDescription
            rootNodes = []
        }

        isLoading = false
    }

    /// Load children for a specific node
    func loadChildren(for node: TreeNodeState) async {
        guard node.hasChildren && node.children == nil else { return }

        // Check cache first
        if let cached = childrenCache[node.path] {
            node.children = cached
            return
        }

        node.isLoading = true

        do {
            let nodes = try await apiClient.getTree(path: node.path)
            let children = nodes.map { TreeNodeState(node: $0) }
            node.children = children
            childrenCache[node.path] = children
        } catch {
            // Keep children nil on error - can retry later
        }

        node.isLoading = false
    }

    /// Expand a node and load its children
    func expandNode(_ node: TreeNodeState) async {
        node.isExpanded = true
        if node.children == nil {
            await loadChildren(for: node)
        }
    }

    /// Collapse a node
    func collapseNode(_ node: TreeNodeState) {
        node.isExpanded = false
    }

    /// Toggle node expansion
    func toggleNode(_ node: TreeNodeState) async {
        if node.isExpanded {
            collapseNode(node)
        } else {
            await expandNode(node)
        }
    }

    /// Find a node by path
    func findNode(path: String) -> TreeNodeState? {
        func search(in nodes: [TreeNodeState]?) -> TreeNodeState? {
            guard let nodes = nodes else { return nil }
            for node in nodes {
                if node.path == path {
                    return node
                }
                if let found = search(in: node.children) {
                    return found
                }
            }
            return nil
        }
        return search(in: rootNodes)
    }

    /// Expand tree to reveal a specific path
    func revealPath(_ path: String) async {
        let components = path.split(separator: "/")
        var currentPath = ""

        for component in components {
            currentPath += "/" + component
            if let node = findNode(path: currentPath) {
                if !node.isExpanded && node.hasChildren {
                    await expandNode(node)
                }
            }
        }
    }

    /// Refresh a specific node's children
    func refreshNode(_ node: TreeNodeState) async {
        childrenCache.removeValue(forKey: node.path)
        node.children = nil
        await loadChildren(for: node)
    }

    /// Clear the tree cache and reload
    func refresh() async {
        childrenCache.removeAll()
        await loadRootNodes()
    }

    /// Clear all data
    func clear() {
        rootNodes = nil
        childrenCache.removeAll()
        errorMessage = nil
    }
}

// MARK: - Flat List for OutlineGroup

extension TreeViewModel {
    /// Get flattened list of visible nodes for display
    var visibleNodes: [TreeNodeState] {
        var result: [TreeNodeState] = []

        func addNodes(_ nodes: [TreeNodeState]?, depth: Int = 0) {
            guard let nodes = nodes else { return }
            for node in nodes {
                result.append(node)
                if node.isExpanded {
                    addNodes(node.children, depth: depth + 1)
                }
            }
        }

        addNodes(rootNodes)
        return result
    }
}

// MARK: - Environment Key

private struct TreeViewModelKey: EnvironmentKey {
    @MainActor static let defaultValue: TreeViewModel = TreeViewModel()
}

extension EnvironmentValues {
    var treeViewModel: TreeViewModel {
        get { self[TreeViewModelKey.self] }
        set { self[TreeViewModelKey.self] = newValue }
    }
}
