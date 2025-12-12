import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainPanel } from '@/components/layout/MainPanel';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex bg-background text-foreground">
        <Sidebar />
        <MainPanel />
      </div>
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}

export default App;
