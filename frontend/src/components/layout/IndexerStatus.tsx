import { Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIndexerStatus, useIndexer } from '@/hooks/useDirectory';
import { cn } from '@/lib/utils';

export function IndexerStatus() {
  const { data, isLoading } = useIndexerStatus();
  const { triggerIndex } = useIndexer();

  const isRunning = data?.is_running ?? false;

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 px-2 gap-1.5',
        isRunning && 'text-primary'
      )}
      onClick={() => triggerIndex.mutate()}
      disabled={isRunning || triggerIndex.isPending}
      title={isRunning ? 'Indexing in progress...' : 'Click to start indexing'}
    >
      {isLoading || isRunning || triggerIndex.isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Database className="w-4 h-4" />
      )}
      <span className="text-xs">
        {isRunning ? 'Indexing...' : 'Index'}
      </span>
    </Button>
  );
}
