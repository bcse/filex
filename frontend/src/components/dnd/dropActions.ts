import { toast } from "sonner";
import type { DropAction, DropPromptState } from "./DropPrompt";

type MutationHandler = {
  mutateAsync: (params: {
    from: string;
    to: string;
    overwrite?: boolean;
    suppressToast?: boolean;
  }) => Promise<{
    performed?: boolean;
  } | void>;
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
    let performedCount = 0;
    let skippedCount = 0;
    const total = paths.length;

    for (const fromPath of paths) {
      const fileName = fromPath.split("/").pop() || "";
      const toPath =
        targetPath === "/" ? `/${fileName}` : `${targetPath}/${fileName}`;

      if (fromPath === toPath) continue;

      if (toPath.startsWith(fromPath + "/")) {
        toast.error(`Cannot move "${fileName}" into itself`);
        continue;
      }

      const overwrite = action.strategy === "overwrite";

      const result =
        action.operation === "move"
          ? await move.mutateAsync({
              from: fromPath,
              to: toPath,
              overwrite,
              suppressToast: true,
            })
          : await copy.mutateAsync({
              from: fromPath,
              to: toPath,
              overwrite,
              suppressToast: true,
            });

      if (result?.performed === false) {
        skippedCount += 1;
      } else {
        performedCount += 1;
      }
    }

    clearSelection();

    if (performedCount > 0 || skippedCount > 0) {
      const verb = action.operation === "copy" ? "Copied" : "Moved";
      const skippedSuffix =
        skippedCount > 0 ? ` (skipped ${skippedCount})` : "";
      toast.success(
        `${verb} ${performedCount} of ${total} items${skippedSuffix}`,
      );
    }
  } catch (error) {
    console.error("Drop action failed:", error);
  }
}
