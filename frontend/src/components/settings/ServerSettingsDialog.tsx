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
  resetApiBaseCache,
  setServerUrl,
} from "@/lib/config";
import { Loader2, Server } from "lucide-react";

interface ServerSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServerUpdated?: () => void;
}

export function ServerSettingsDialog({
  open,
  onOpenChange,
  onServerUpdated,
}: ServerSettingsDialogProps) {
  const [url, setUrl] = useState("http://localhost:3000");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(getServerUrl() || "http://localhost:3000");
    setError(null);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url) return;

    const previousUrl = getServerUrl();
    setError(null);
    setIsLoading(true);

    setServerUrl(url);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Update the Filex server URL for this desktop client.
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
