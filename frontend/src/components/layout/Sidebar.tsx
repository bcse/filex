import React, { useCallback, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DirectoryTree } from '@/components/tree/DirectoryTree';
import { useNavigationStore } from '@/stores/navigation';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/config/layout';

export function Sidebar() {
  const { sidebarWidth, setSidebarWidth } = useNavigationStore();
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist to localStorage
    localStorage.setItem('sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, e.clientX));
    setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  useEffect(() => {
    // Restore from localStorage
    const saved = localStorage.getItem('sidebarWidth');
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= SIDEBAR_MIN_WIDTH && width <= SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(width);
      }
    }
  }, [setSidebarWidth]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <div
      ref={sidebarRef}
      className="border-r bg-muted/30 flex flex-col relative"
      style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}
    >
      <ScrollArea className="flex-1">
        <DirectoryTree />
      </ScrollArea>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
        onMouseDown={startResizing}
      />
    </div>
  );
}
