import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTree } from '@/hooks/useDirectory';
import { useNavigationStore } from '@/stores/navigation';
import type { TreeNode as TreeNodeType } from '@/types/file';

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentPath, setCurrentPath } = useNavigationStore();
  const { data: children, isLoading } = useTree(node.path, isExpanded && node.has_children);
  
  const isSelected = currentPath === node.path;
  
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.has_children) {
      setIsExpanded(!isExpanded);
    }
  };
  
  const handleSelect = () => {
    setCurrentPath(node.path);
  };
  
  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          isSelected && 'bg-accent'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
      >
        <span
          className="flex items-center justify-center w-4 h-4"
          onClick={handleToggle}
        >
          {node.has_children ? (
            isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )
          ) : null}
        </span>
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-yellow-500" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500" />
        )}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      
      {isExpanded && children && (
        <div>
          {children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DirectoryTree() {
  const { setCurrentPath, currentPath } = useNavigationStore();
  const { data: rootNodes, isLoading } = useTree('/');
  
  return (
    <div className="py-2">
      {/* Root item */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          currentPath === '/' && 'bg-accent'
        )}
        onClick={() => setCurrentPath('/')}
      >
        <span className="w-4" />
        <Folder className="w-4 h-4 text-yellow-500" />
        <span className="text-sm font-medium">Root</span>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        rootNodes?.map((node) => (
          <TreeNode key={node.path} node={node} depth={1} />
        ))
      )}
    </div>
  );
}
