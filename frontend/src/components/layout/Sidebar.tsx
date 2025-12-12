import { ScrollArea } from '@/components/ui/scroll-area';
import { DirectoryTree } from '@/components/tree/DirectoryTree';
import { useNavigationStore } from '@/stores/navigation';

export function Sidebar() {
  const { sidebarWidth } = useNavigationStore();
  
  return (
    <div
      className="border-r bg-muted/30 flex flex-col"
      style={{ width: `${sidebarWidth}px`, minWidth: `${sidebarWidth}px` }}
    >
      <div className="px-4 py-3 border-b">
        <h1 className="text-lg font-semibold">FileManager</h1>
      </div>
      <ScrollArea className="flex-1">
        <DirectoryTree />
      </ScrollArea>
    </div>
  );
}
