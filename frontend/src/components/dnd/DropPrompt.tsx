import { toast } from 'sonner';
import { Files, FolderInput } from 'lucide-react';

export type DropOperation = 'move' | 'copy';
export type ConflictStrategy = 'overwrite' | 'skip';
export type DropAction = {
  operation: DropOperation;
  strategy: ConflictStrategy;
};

export type DropPromptState = {
  paths: string[];
  targetPath: string;
  x: number;
  y: number;
} | null;

interface DropPromptProps {
  dropPrompt: DropPromptState;
  onClose: () => void;
  onAction: (action: DropAction) => void;
}

export function DropPrompt({ dropPrompt, onClose, onAction }: DropPromptProps) {
  if (!dropPrompt) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        style={{ top: dropPrompt.y, left: dropPrompt.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction({ operation: 'copy', strategy: 'overwrite' })}
        >
          <Files className="mr-2 h-4 w-4" />
          Copy & Overwrite
        </button>
        <button
          className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction({ operation: 'copy', strategy: 'skip' })}
        >
          <Files className="mr-2 h-4 w-4" />
          Copy & Skip
        </button>
        <button
          className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction({ operation: 'move', strategy: 'overwrite' })}
        >
          <FolderInput className="mr-2 h-4 w-4" />
          Move & Overwrite
        </button>
        <button
          className="flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction({ operation: 'move', strategy: 'skip' })}
        >
          <FolderInput className="mr-2 h-4 w-4" />
          Move & Skip
        </button>
      </div>
    </div>
  );
}

type MutationHandler = {
  mutateAsync: (params: { from: string; to: string; overwrite?: boolean }) => Promise<unknown>;
};

export async function performDropAction({
  action,
  dropPrompt,
  move,
  copy,
  clearSelection,
}: {
  action: DropAction;
  dropPrompt: DropPromptState;
  move: MutationHandler;
  copy: MutationHandler;
  clearSelection: () => void;
}) {
  if (!dropPrompt) return;
  const { paths, targetPath } = dropPrompt;

  try {
    for (const fromPath of paths) {
      const fileName = fromPath.split('/').pop() || '';
      const toPath = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`;

      if (fromPath === toPath) continue;

      if (toPath.startsWith(fromPath + '/')) {
        toast.error(`Cannot move "${fileName}" into itself`);
        continue;
      }

      const overwrite = action.strategy === 'overwrite';

      if (action.operation === 'move') {
        await move.mutateAsync({ from: fromPath, to: toPath, overwrite });
      } else {
        await copy.mutateAsync({ from: fromPath, to: toPath, overwrite });
      }
    }

    clearSelection();
  } catch (error) {
    console.error('Drop action failed:', error);
  }
}
