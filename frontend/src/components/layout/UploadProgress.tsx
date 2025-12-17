import React from 'react';
import { X, CheckCircle, AlertCircle, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUploadStore, UploadItem } from '@/stores/upload';
import { cn, formatFileSize } from '@/lib/utils';

function UploadItemRow({ item }: { item: UploadItem }) {
  const { removeUpload } = useUploadStore();

  return (
    <div className="flex items-center gap-3 py-2 px-3 border-b border-border last:border-b-0">
      <div className="flex-shrink-0">
        {item.status === 'completed' && (
          <CheckCircle className="w-4 h-4 text-green-500" />
        )}
        {item.status === 'error' && (
          <AlertCircle className="w-4 h-4 text-destructive" />
        )}
        {(item.status === 'uploading' || item.status === 'pending') && (
          <Upload className="w-4 h-4 text-muted-foreground animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm truncate" title={item.name}>
            {item.name}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatFileSize(item.size)}
          </span>
        </div>
        {item.status === 'uploading' && (
          <div className="mt-1 flex items-center gap-2">
            <Progress value={item.progress} className="h-1.5" />
            <span className="text-xs text-muted-foreground w-8">
              {item.progress}%
            </span>
          </div>
        )}
        {item.status === 'error' && item.error && (
          <p className="text-xs text-destructive mt-0.5 truncate">{item.error}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0"
        onClick={() => removeUpload(item.id)}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

export function UploadProgress() {
  const { uploads, clearCompleted } = useUploadStore();
  const [collapsed, setCollapsed] = React.useState(false);

  const uploadsList = Array.from(uploads.values());

  if (uploadsList.length === 0) {
    return null;
  }

  const completedCount = uploadsList.filter((u) => u.status === 'completed').length;
  const uploadingCount = uploadsList.filter((u) => u.status === 'uploading').length;
  const errorCount = uploadsList.filter((u) => u.status === 'error').length;

  const totalProgress = uploadsList.reduce((acc, u) => acc + u.progress, 0);
  const averageProgress = Math.round(totalProgress / uploadsList.length);

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          <span className="text-sm font-medium">
            {uploadingCount > 0
              ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? 's' : ''}`
              : `${uploadsList.length} upload${uploadsList.length > 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(completedCount > 0 || errorCount > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
            >
              Clear
            </Button>
          )}
          {collapsed ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Progress summary when collapsed */}
      {collapsed && uploadingCount > 0 && (
        <div className="px-3 py-2">
          <Progress value={averageProgress} className="h-1.5" />
        </div>
      )}

      {/* Upload list */}
      {!collapsed && (
        <div className={cn('max-h-64 overflow-y-auto', uploadsList.length > 5 && 'pr-1')}>
          {uploadsList.map((item) => (
            <UploadItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
