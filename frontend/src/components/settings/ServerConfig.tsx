import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/api/client";
import { setServerUrl, getServerUrl, resetApiBaseCache } from "@/lib/config";
import { Folder, Server, Loader2 } from "lucide-react";

interface ServerConfigProps {
  onConnected: () => void;
}

export function ServerConfig({ onConnected }: ServerConfigProps) {
  const [url, setUrl] = useState(getServerUrl() || "http://localhost:3000");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Update the server URL config
    try {
      setServerUrl(url);
      resetApiBaseCache();
    } catch {
      setError("Server URL must start with http:// or https://");
      setIsLoading(false);
      return;
    }

    try {
      // Test the connection
      await api.health();
      onConnected();
    } catch {
      setError(
        "Could not connect to server. Please check the URL and ensure the server is running.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Folder className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Filex</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect to your Filex server
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="server-url"
              className="text-sm font-medium text-foreground"
            >
              Server URL
            </label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="server-url"
                type="url"
                placeholder="http://localhost:3000"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10"
                autoFocus
                disabled={isLoading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the URL of your running Filex server
            </p>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || !url}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
