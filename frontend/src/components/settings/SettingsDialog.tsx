import { useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";
import {
  clearServerUrl,
  getServerUrl,
  getPathMappings,
  resetApiBaseCache,
  setServerUrl,
  setPathMappings,
  type PathMapping,
} from "@/lib/config";
import { Loader2, Plus, Server, Trash2 } from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServerUpdated?: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  onServerUpdated,
}: SettingsDialogProps) {
  const [url, setUrl] = useState("http://localhost:3000");
  const [mappings, setMappings] = useState<Array<PathMapping & { id: string }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const createMappingRow = (mapping?: PathMapping) => ({
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    prefix: mapping?.prefix ?? "",
    target: mapping?.target ?? "",
  });

  useEffect(() => {
    if (!open) return;
    setUrl(getServerUrl() || "http://localhost:3000");
    setMappings(getPathMappings().map((mapping) => createMappingRow(mapping)));
    setError(null);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url) return;

    const previousUrl = getServerUrl();
    setError(null);
    setIsLoading(true);

    try {
      setServerUrl(url);
    } catch {
      setError("Server URL must start with http:// or https://");
      setIsLoading(false);
      return;
    }
    const sanitizedMappings = mappings
      .map((mapping) => ({
        prefix: mapping.prefix.trim(),
        target: mapping.target.trim(),
      }))
      .filter((mapping) => mapping.prefix && mapping.target);
    setPathMappings(sanitizedMappings);
    resetApiBaseCache();

    try {
      await api.health();
      onServerUpdated?.();
      onOpenChange(false);
    } catch {
      if (previousUrl) {
        setServerUrl(previousUrl);
      } else {
        clearServerUrl();
      }
      resetApiBaseCache();
      setError(
        "Could not connect to server. Please check the URL and ensure the server is running.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateMapping = (
    id: string,
    field: "prefix" | "target",
    value: string,
  ) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.id === id
          ? {
              ...mapping,
              [field]: value,
            }
          : mapping,
      ),
    );
  };

  const addMapping = () => {
    setMappings((current) => [...current, createMappingRow()]);
  };

  const removeMapping = (id: string) => {
    setMappings((current) => current.filter((mapping) => mapping.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Update desktop client preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="tauri-server-url"
              className="text-sm font-medium text-foreground"
            >
              Server URL
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="tauri-server-url"
                type="url"
                placeholder="http://localhost:3000"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10"
                disabled={isLoading}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Example: http://localhost:3000 or https://files.example.com
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Path mappings
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMapping}
                disabled={isLoading}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add mapping
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Map remote paths to local folders for direct opening.
            </p>
            {mappings.length === 0 ? (
              <div className="text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2">
                No mappings configured.
              </div>
            ) : (
              <div className="space-y-2">
                {mappings.map((mapping) => (
                  <div key={mapping.id} className="flex gap-2">
                    <Input
                      placeholder="/remote_dir/"
                      value={mapping.prefix}
                      onChange={(e) =>
                        updateMapping(mapping.id, "prefix", e.target.value)
                      }
                      disabled={isLoading}
                    />
                    <Input
                      placeholder="/local_dir/"
                      value={mapping.target}
                      onChange={(e) =>
                        updateMapping(mapping.id, "target", e.target.value)
                      }
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMapping(mapping.id)}
                      disabled={isLoading}
                      title="Remove mapping"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isLoading}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isLoading || !url}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
