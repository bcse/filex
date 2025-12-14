import { toast } from 'sonner';

export type DropPromptState = {
  paths: string[];
  targetPath: string;
  x: number;
  y: number;
} | null;

interface DropPromptProps {
  dropPrompt: DropPromptState;
  onClose: () => void;
  onAction: (action: 'move' | 'copy') => void;
}

export function DropPrompt({ dropPrompt, onClose, onAction }: DropPromptProps) {
  if (!dropPrompt) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ top: dropPrompt.y, left: dropPrompt.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="w-full cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction('move')}
        >
          Move here
        </button>
        <button
          className="w-full cursor-pointer select-none rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent focus:outline-none focus:bg-accent"
          onClick={() => onAction('copy')}
        >
          Copy here
        </button>
      </div>
    </div>
  );
}

type MutationHandler = {
  mutateAsync: (params: { from: string; to: string }) => Promise<unknown>;
};

export async function performDropAction({
  action,
  dropPrompt,
  move,
  copy,
  clearSelection,
}: {
  action: 'move' | 'copy';
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

      if (action === 'move') {
        await move.mutateAsync({ from: fromPath, to: toPath });
      } else {
        await copy.mutateAsync({ from: fromPath, to: toPath });
      }
    }

    clearSelection();
  } catch (error) {
    console.error('Drop action failed:', error);
  }
}
