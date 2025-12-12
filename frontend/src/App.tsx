import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    </QueryClientProvider>
  );
}

export default App;
