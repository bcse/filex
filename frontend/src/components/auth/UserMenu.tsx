import { useState } from 'react';
import { LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';

interface UserMenuProps {
  onLogout: () => void;
}

export function UserMenu({ onLogout }: UserMenuProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
      onLogout();
    } catch {
      // Even if logout fails on server, clear local state
      onLogout();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleLogout}
      disabled={isLoading}
      title="Sign out"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4" />
      )}
    </Button>
  );
}
