//
//  BreadcrumbView.swift
//  Filex
//

import SwiftUI

struct BreadcrumbView: View {
    @Environment(NavigationState.self) private var navigationState

    var body: some View {
        if navigationState.isSearching {
            searchBreadcrumb
        } else {
            pathBreadcrumb
        }
    }

    private var searchBreadcrumb: some View {
        HStack(spacing: 4) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)

            Text("Search results for \"\(navigationState.searchQuery)\"")
                .lineLimit(1)
                .foregroundStyle(.secondary)
        }
        .font(.callout)
    }

    private var pathBreadcrumb: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(Array(navigationState.pathComponents.enumerated()), id: \.offset) { index, component in
                    if index > 0 {
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }

                    Button {
                        navigationState.navigate(to: component.path)
                    } label: {
                        HStack(spacing: 2) {
                            if index == 0 {
                                Image(systemName: "folder.fill")
                                    .font(.caption)
                            }
                            Text(component.name)
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(
                        index == navigationState.pathComponents.count - 1 ? .primary : .secondary
                    )
                }
            }
            .font(.callout)
        }
        .frame(maxWidth: 400)
    }
}

// MARK: - Preview

#Preview {
    BreadcrumbView()
        .environment(NavigationState())
        .padding()
}
