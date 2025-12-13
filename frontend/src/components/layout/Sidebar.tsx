import React, { useCallback, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { DirectoryTree } from '@/components/tree/DirectoryTree';
import { useNavigationStore } from '@/stores/navigation';
import { useThemeStore } from '@/stores/theme';

const MIN_WIDTH = 150;
const MAX_WIDTH = 500;

export function Sidebar() {
  const { sidebarWidth, setSidebarWidth } = useNavigationStore();
  const { theme, setTheme } = useThemeStore();
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

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
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
    setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  useEffect(() => {
    // Restore from localStorage
    const saved = localStorage.getItem('sidebarWidth');
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= MIN_WIDTH && width <= MAX_WIDTH) {
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
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h1 className="text-lg font-semibold">FileManager</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="w-4 h-4" />
        </Button>
      </div>
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
