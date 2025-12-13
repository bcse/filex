import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { X, Image, FileText, File, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigationStore } from '@/stores/navigation';
import { usePreviewStore } from '@/stores/preview';
import { useDirectory } from '@/hooks/useDirectory';
import { api } from '@/api/client';
import type { FileEntry } from '@/types/file';

const MIN_WIDTH = 250;
const MAX_WIDTH = 600;
const MAX_TEXT_SIZE = 100000; // 100KB max for text preview

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'sh', 'yml', 'yaml', 'toml', 'env', 'gitignore', 'log', 'ini', 'cfg', 'conf'];

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(getFileExtension(filename));
}

function isTextFile(filename: string): boolean {
  return TEXT_EXTENSIONS.includes(getFileExtension(filename));
}

interface PreviewContentProps {
  file: FileEntry;
}

function ImagePreview({ file }: PreviewContentProps) {
  const downloadUrl = api.getDownloadUrl(file.path);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
        <img
          src={downloadUrl}
          alt={file.name}
          className="max-w-full max-h-full object-contain rounded"
        />
      </div>
      {(file.width || file.height) && (
        <div className="px-4 py-2 text-sm text-muted-foreground border-t">
          {file.width} × {file.height} px
        </div>
      )}
    </div>
  );
}

function TextPreview({ file }: PreviewContentProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setIsLoading(true);
      setError(null);
      setContent(null);

      try {
        // Skip if file is too large
        if (file.size && file.size > MAX_TEXT_SIZE) {
          setIsTruncated(true);
        }

        const text = await api.getTextContent(file.path, MAX_TEXT_SIZE);
        if (!cancelled) {
          setContent(text);
          setIsTruncated(file.size ? file.size > MAX_TEXT_SIZE : false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [file.path, file.size]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
        <FileText className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm text-center text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
          {content}
        </pre>
      </ScrollArea>
      {isTruncated && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
          File truncated at {formatFileSize(MAX_TEXT_SIZE)}
        </div>
      )}
    </div>
  );
}

function FilePreview({ file }: PreviewContentProps) {
  const Icon = file.is_dir ? File : isImageFile(file.name) ? Image : isTextFile(file.name) ? FileText : File;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-muted-foreground">
      <Icon className="w-16 h-16 mb-4 opacity-30" />
      <p className="text-sm text-center">
        {file.is_dir ? 'Folder preview not available' : 'Preview not available for this file type'}
      </p>
    </div>
  );
}

export function PreviewPanel() {
  const { isOpen, setIsOpen, previewWidth, setPreviewWidth } = usePreviewStore();
  const { selectedFiles, currentPath } = useNavigationStore();
  const { data } = useDirectory(currentPath);
  const isResizing = useRef(false);

  // Get the selected file entry
  const selectedFile = useMemo(() => {
    if (selectedFiles.size !== 1) return null;
    const selectedPath = Array.from(selectedFiles)[0];
    return data?.entries.find((e) => e.path === selectedPath) || null;
  }, [selectedFiles, data?.entries]);

  // Resize handlers
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX));
    setPreviewWidth(newWidth);
  }, [setPreviewWidth]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!selectedFile) return;
    const url = api.getDownloadUrl(selectedFile.path);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="border-l bg-background flex flex-col relative"
      style={{ width: `${previewWidth}px`, minWidth: `${previewWidth}px` }}
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
        onMouseDown={startResizing}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm truncate">
          {selectedFile ? selectedFile.name : 'Preview'}
        </h2>
        <div className="flex items-center gap-1">
          {selectedFile && !selectedFile.is_dir && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {selectedFile ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Preview area */}
          <div className="flex-1 min-h-0">
            {isImageFile(selectedFile.name) ? (
              <ImagePreview file={selectedFile} />
            ) : isTextFile(selectedFile.name) ? (
              <TextPreview file={selectedFile} />
            ) : (
              <FilePreview file={selectedFile} />
            )}
          </div>

          {/* Metadata */}
          <ScrollArea className="border-t">
            <div className="p-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Type</dt>
                <dd className="mt-0.5">{selectedFile.is_dir ? 'Folder' : selectedFile.mime_type || 'Unknown'}</dd>
              </div>
              {!selectedFile.is_dir && selectedFile.size !== undefined && (
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wider">Size</dt>
                  <dd className="mt-0.5">{formatFileSize(selectedFile.size)}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Modified</dt>
                <dd className="mt-0.5">{formatDate(selectedFile.modified)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Created</dt>
                <dd className="mt-0.5">{formatDate(selectedFile.created)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wider">Path</dt>
                <dd className="mt-0.5 break-all text-xs">{selectedFile.path}</dd>
              </div>
              {selectedFile.duration && (
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wider">Duration</dt>
                  <dd className="mt-0.5">{Math.floor(selectedFile.duration / 60)}:{String(Math.floor(selectedFile.duration % 60)).padStart(2, '0')}</dd>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
          <File className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm text-center">
            {selectedFiles.size === 0
              ? 'Select a file to preview'
              : `${selectedFiles.size} items selected`}
          </p>
        </div>
      )}
    </div>
  );
}
