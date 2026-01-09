import Foundation

/// Represents a node in the directory tree for the sidebar
struct TreeNode: Codable, Identifiable, Hashable, Sendable {
    let name: String
    let path: String
    let hasChildren: Bool
    var children: [TreeNode]?

    var id: String { path }

    enum CodingKeys: String, CodingKey {
        case name, path
        case hasChildren = "has_children"
        case children
    }

    /// Children that have been loaded (for OutlineGroup)
    var loadedChildren: [TreeNode]? {
        children
    }

    /// Check if this node's children are loaded
    var isLoaded: Bool {
        children != nil
    }

    /// Check if this is the root node
    var isRoot: Bool {
        path == "/"
    }

    /// Parent path of this node
    var parentPath: String {
        let components = path.split(separator: "/").dropLast()
        return "/" + components.joined(separator: "/")
    }

    /// Depth in the tree (0 for root-level items)
    var depth: Int {
        path.split(separator: "/").count - 1
    }
}

// MARK: - Wrapper for UI state

/// Wrapper that adds UI state to TreeNode for the sidebar
@Observable
final class TreeNodeState: Identifiable {
    let node: TreeNode
    var isExpanded: Bool = false
    var isLoading: Bool = false
    var children: [TreeNodeState]?

    var id: String { node.id }
    var name: String { node.name }
    var path: String { node.path }
    var hasChildren: Bool { node.hasChildren }

    init(node: TreeNode, isExpanded: Bool = false) {
        self.node = node
        self.isExpanded = isExpanded
        self.children = node.children?.map { TreeNodeState(node: $0) }
    }

    /// Update children from loaded tree nodes
    func updateChildren(_ nodes: [TreeNode]) {
        self.children = nodes.map { TreeNodeState(node: $0) }
        self.isLoading = false
    }
}
