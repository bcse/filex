import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Loader2 } from 'lucide-react';
import { buildEntryPath, cn } from '@/lib/utils';
import { useTree, useMove, useCopy } from '@/hooks/useDirectory';
import { useNavigationStore } from '@/stores/navigation';
import type { TreeNode as TreeNodeType } from '@/types/file';
import { DropPrompt, DropPromptState, DropAction } from '@/components/dnd/DropPrompt';
import { performDropAction } from '@/components/dnd/dropActions';

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
  parentPath: string;
  onDropPrompt: (paths: string[], targetPath: string, x: number, y: number) => void;
}

const TreeNode = React.memo(function TreeNode({ node, depth, parentPath, onDropPrompt }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const { currentPath, setCurrentPath } = useNavigationStore();
  const itemRef = useRef<HTMLDivElement>(null);

  const normalizedPath = React.useMemo(
    () => buildEntryPath(node.name, node.path, parentPath),
    [node.name, node.path, parentPath]
  );

  const { data: children, isLoading } = useTree(
    normalizedPath,
    isExpanded && node.has_children
  );

  const isSelected = currentPath === normalizedPath;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.has_children) {
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      // Track when user manually collapses an ancestor of current path
      if (!newExpanded) {
        const isAncestorOrSelf =
          currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`);
        if (isAncestorOrSelf) {
          setUserCollapsed(true);
        }
      }
    }
  };

  const handleSelect = () => {
    setCurrentPath(normalizedPath, { exitSearch: true });
  };

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-file-paths', JSON.stringify([normalizedPath]));
  }, [normalizedPath]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-file-paths')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/x-file-paths');
    if (!data) return;

    try {
      const paths: string[] = JSON.parse(data);

      // Don't allow dropping onto self or any ancestor
      if (paths.includes(normalizedPath)) return;
      // Don't allow dropping a folder into its own descendant
      if (paths.some(p => normalizedPath.startsWith(`${p}/`))) return;

      onDropPrompt(paths, normalizedPath, e.clientX, e.clientY);
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [normalizedPath, onDropPrompt]);

  // Auto-expand to reveal the current path
  useEffect(() => {
    if (!node.has_children) return;
    if (userCollapsed) return; // Don't auto-expand if user manually collapsed

    const isAncestorOrSelf =
      currentPath === normalizedPath || currentPath.startsWith(`${normalizedPath}/`);
    if (isAncestorOrSelf && !isExpanded) {
      setIsExpanded(true);
    }
  }, [currentPath, isExpanded, node.has_children, normalizedPath, userCollapsed]);

  // Reset userCollapsed when currentPath changes (allow auto-expand on navigation)
  const prevPathRef = useRef(currentPath);
  useEffect(() => {
    if (currentPath !== prevPathRef.current) {
      setUserCollapsed(false);
      prevPathRef.current = currentPath;
    }
  }, [currentPath]);

  // Keep the selected node in view when navigating from elsewhere
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isSelected]);

  return (
    <div>
      <div
        ref={itemRef}
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          isSelected && 'bg-accent',
          isDragOver && 'bg-primary/20 ring-2 ring-primary',
          isDragging && 'opacity-50'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
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
            <TreeNode
              key={child.path || child.name}
              node={child}
              depth={depth + 1}
              parentPath={normalizedPath}
              onDropPrompt={onDropPrompt}
            />
          ))}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.depth === nextProps.depth &&
  prevProps.parentPath === nextProps.parentPath &&
  prevProps.onDropPrompt === nextProps.onDropPrompt &&
  prevProps.node.path === nextProps.node.path &&
  prevProps.node.name === nextProps.node.name &&
  prevProps.node.has_children === nextProps.node.has_children
));

export function DirectoryTree() {
  const { setCurrentPath, currentPath, clearSelection } = useNavigationStore();
  const { data: rootNodes, isLoading } = useTree('/');
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPrompt, setDropPrompt] = useState<DropPromptState>(null);
  const move = useMove();
  const copy = useCopy();

  const handleDropPrompt = useCallback((paths: string[], targetPath: string, x: number, y: number) => {
    setDropPrompt({ paths, targetPath, x, y });
  }, []);

  const handleDropAction = useCallback(async (action: DropAction) => {
    await performDropAction({
      action,
      dropPrompt,
      move,
      copy,
      clearSelection,
    });
    setDropPrompt(null);
  }, [clearSelection, copy, dropPrompt, move]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-file-paths')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const data = e.dataTransfer.getData('application/x-file-paths');
    if (!data) return;

    try {
      const paths: string[] = JSON.parse(data);

      if (paths.includes('/')) return;

      handleDropPrompt(paths, '/', e.clientX, e.clientY);
    } catch (error) {
      console.error('Drop failed:', error);
    }
  }, [handleDropPrompt]);

  return (
    <div className="py-2">
      {/* Root item */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent rounded-sm',
          currentPath === '/' && 'bg-accent',
          isDragOver && 'bg-primary/20 ring-2 ring-primary'
        )}
        onClick={() => setCurrentPath('/', { exitSearch: true })}
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
          <TreeNode
            key={node.path || node.name}
            node={node}
            depth={1}
            parentPath="/"
            onDropPrompt={handleDropPrompt}
          />
        ))
      )}

      <DropPrompt
        dropPrompt={dropPrompt}
        onClose={() => setDropPrompt(null)}
        onAction={handleDropAction}
      />
    </div>
  );
}
