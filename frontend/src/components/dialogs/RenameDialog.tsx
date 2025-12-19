import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
}

export function RenameDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onConfirm,
}: RenameDialogProps) {
  const trimmedValue = value.trim();

  const handleConfirm = () => {
    if (!trimmedValue) return;
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Enter a new name.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="New name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!trimmedValue}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
