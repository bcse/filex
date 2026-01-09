import Foundation

/// Utility functions for path manipulation
enum PathUtils {
    /// Join two path components
    static func join(_ base: String, _ component: String) -> String {
        if base == "/" {
            return "/" + component
        }
        return base + "/" + component
    }

    /// Get the parent path
    static func parent(of path: String) -> String {
        guard path != "/" else { return "/" }
        let components = path.split(separator: "/").dropLast()
        if components.isEmpty {
            return "/"
        }
        return "/" + components.joined(separator: "/")
    }

    /// Get the last component (file/folder name)
    static func basename(_ path: String) -> String {
        guard path != "/" else { return "/" }
        return String(path.split(separator: "/").last ?? Substring(path))
    }

    /// Get the directory name (path without the last component)
    static func dirname(_ path: String) -> String {
        return parent(of: path)
    }

    /// Normalize a path (remove double slashes, resolve . and ..)
    static func normalize(_ path: String) -> String {
        var components: [String] = []

        for component in path.split(separator: "/") {
            let str = String(component)
            if str == "." {
                continue
            } else if str == ".." {
                if !components.isEmpty {
                    components.removeLast()
                }
            } else {
                components.append(str)
            }
        }

        if components.isEmpty {
            return "/"
        }

        return "/" + components.joined(separator: "/")
    }

    /// Check if a path is a child of another path
    static func isChild(_ child: String, of parent: String) -> Bool {
        let normalizedChild = normalize(child)
        let normalizedParent = normalize(parent)

        if normalizedParent == "/" {
            return normalizedChild != "/"
        }

        return normalizedChild.hasPrefix(normalizedParent + "/")
    }

    /// Get relative path from base
    static func relative(from base: String, to path: String) -> String {
        let normalizedBase = normalize(base)
        let normalizedPath = normalize(path)

        guard normalizedPath.hasPrefix(normalizedBase) else {
            return normalizedPath
        }

        var relative = String(normalizedPath.dropFirst(normalizedBase.count))
        if relative.hasPrefix("/") {
            relative = String(relative.dropFirst())
        }

        return relative.isEmpty ? "." : relative
    }

    /// Get common ancestor path of multiple paths
    static func commonAncestor(_ paths: [String]) -> String {
        guard !paths.isEmpty else { return "/" }
        guard paths.count > 1 else { return parent(of: paths[0]) }

        let componentArrays = paths.map { $0.split(separator: "/").map(String.init) }
        let minLength = componentArrays.map(\.count).min() ?? 0

        var common: [String] = []

        for i in 0..<minLength {
            let component = componentArrays[0][i]
            if componentArrays.allSatisfy({ $0[i] == component }) {
                common.append(component)
            } else {
                break
            }
        }

        if common.isEmpty {
            return "/"
        }

        return "/" + common.joined(separator: "/")
    }

    /// Get path components as array
    static func components(_ path: String) -> [String] {
        let normalized = normalize(path)
        if normalized == "/" {
            return ["/"]
        }
        return ["/"] + normalized.split(separator: "/").map(String.init)
    }

    /// Build breadcrumb items from path
    static func breadcrumbs(_ path: String) -> [(name: String, path: String)] {
        var result: [(name: String, path: String)] = [("Root", "/")]

        guard path != "/" else { return result }

        var currentPath = ""
        for component in path.split(separator: "/") {
            currentPath += "/" + component
            result.append((String(component), currentPath))
        }

        return result
    }
}
