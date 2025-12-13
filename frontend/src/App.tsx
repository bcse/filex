import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MainPanel } from '@/components/layout/MainPanel';
import { UploadProgress } from '@/components/layout/UploadProgress';
import { LoginPage } from '@/components/auth/LoginPage';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const { setAuthRequired, setLogoutHandler } = useAuthStore();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    // Set up the logout handler
    setLogoutHandler(() => {
      setAuthState('unauthenticated');
      queryClient.clear();
    });
  }, [setLogoutHandler]);

  const checkAuthStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthRequired(status.auth_required);
      if (!status.auth_required || status.authenticated) {
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    } catch {
      // If we can't check auth status, assume authenticated (auth might be disabled)
      setAuthState('authenticated');
    }
  };

  const handleLoginSuccess = () => {
    setAuthState('authenticated');
    // Clear any stale query cache
    queryClient.clear();
  };

  if (authState === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-background text-foreground">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <MainPanel />
        </div>
      </div>
      <UploadProgress />
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
