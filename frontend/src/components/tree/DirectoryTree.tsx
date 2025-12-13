import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTree, useMove } from '@/hooks/useDirectory';
import { useNavigationStore } from '@/stores/navigation';
import { toast } from 'sonner';
import type { TreeNode as TreeNodeType } from '@/types/file';

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
}

function TreeNode({ node, depth }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const { currentPath, setCurrentPath, clearSelection } = useNavigationStore();
  const { data: children, isLoading } = useTree(node.path, isExpanded && node.has_children);
  const move = useMove();

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-file-paths')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/x-file-paths');
    if (!data) return;

    try {
      const paths: string[] = JSON.parse(data);

      for (const fromPath of paths) {
        const fileName = fromPath.split('/').pop() || '';
        const toPath = node.path === '/' ? `/${fileName}` : `${node.path}/${fileName}`;

        // Don't move onto self
        if (fromPath === node.path) continue;

        // Don't move if target is a descendant of source
        if (toPath.startsWith(fromPath + '/')) {
          toast.error(`Cannot move "${fileName}" into itself`);
          continue;
        }

        await move.mutateAsync({ from: fromPath, to: toPath });
      }

      clearSelection();
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [node.path, move, clearSelection]);

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          isSelected && 'bg-accent',
          isDragOver && 'bg-primary/20 ring-2 ring-primary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
        {isExpanded || isDragOver ? (
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
  const { setCurrentPath, currentPath, clearSelection } = useNavigationStore();
  const { data: rootNodes, isLoading } = useTree('/');
  const [isDragOver, setIsDragOver] = useState(false);
  const move = useMove();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-file-paths')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/x-file-paths');
    if (!data) return;

    try {
      const paths: string[] = JSON.parse(data);

      for (const fromPath of paths) {
        const fileName = fromPath.split('/').pop() || '';
        const toPath = `/${fileName}`;

        // Don't move if already at root
        if (fromPath === toPath) continue;

        await move.mutateAsync({ from: fromPath, to: toPath });
      }

      clearSelection();
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [move, clearSelection]);

  return (
    <div className="py-2">
      {/* Root item */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          currentPath === '/' && 'bg-accent',
          isDragOver && 'bg-primary/20 ring-2 ring-primary'
        )}
        onClick={() => setCurrentPath('/')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="w-4" />
        {isDragOver ? (
          <FolderOpen className="w-4 h-4 text-yellow-500" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500" />
        )}
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
