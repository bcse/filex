import { format } from 'date-fns';
import {
  Folder,
  File,
  Image,
  Video,
  Music,
  FileText,
  FileCode,
  Archive,
} from 'lucide-react';
import type { FileEntry, SortField } from '@/types/file';
import { formatFileSize, formatDuration, formatDimensions } from '@/lib/utils';

export interface Column {
  key: SortField | 'icon' | 'path';
  label: string;
  width: string;
  sortable: boolean;
  render: (entry: FileEntry) => React.ReactNode;
}

const getBasedir = (path: string) => {
  const lastSlash = path.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return path.substring(0, lastSlash);
};

const FileIcon = ({ entry }: { entry: FileEntry }) => {
  if (entry.is_dir) {
    return <Folder className="w-4 h-4 text-yellow-500" />;
  }
  
  const mime = entry.mime_type || '';
  
  if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-green-500" />;
  if (mime.startsWith('video/')) return <Video className="w-4 h-4 text-purple-500" />;
  if (mime.startsWith('audio/')) return <Music className="w-4 h-4 text-pink-500" />;
  if (mime.includes('pdf') || mime.startsWith('text/')) return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes('zip') || mime.includes('archive')) return <Archive className="w-4 h-4 text-orange-500" />;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('typescript')) {
    return <FileCode className="w-4 h-4 text-blue-500" />;
  }
  
  return <File className="w-4 h-4 text-gray-500" />;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
  } catch {
    return '-';
  }
};

const iconColumn: Column = {
  key: 'icon',
  label: '',
  width: '40px',
  sortable: false,
  render: (entry) => <FileIcon entry={entry} />,
};

const nameColumn: Column = {
  key: 'name',
  label: 'Name',
  width: '1fr',
  sortable: true,
  render: (entry) => (
    <span className="truncate" title={entry.name}>
      {entry.name}
    </span>
  ),
};

const pathColumn: Column = {
  key: 'path',
  label: 'Path',
  width: '1fr',
  sortable: true,
  render: (entry) => {
    const basedir = getBasedir(entry.path);
    return (
      <span className="truncate text-muted-foreground" title={basedir}>
        {basedir}
      </span>
    );
  },
};

export const columns: Column[] = [
  iconColumn,
  nameColumn,
  {
    key: 'size',
    label: 'Size',
    width: '100px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {entry.is_dir ? '-' : formatFileSize(entry.size)}
      </span>
    ),
  },
  {
    key: 'modified',
    label: 'Modified',
    width: '150px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDate(entry.modified)}
      </span>
    ),
  },
  {
    key: 'created',
    label: 'Created',
    width: '150px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDate(entry.created)}
      </span>
    ),
  },
  {
    key: 'mime_type',
    label: 'Type',
    width: '120px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground truncate" title={entry.mime_type}>
        {entry.is_dir ? 'Folder' : entry.mime_type?.split('/')[1] || '-'}
      </span>
    ),
  },
  {
    key: 'width',
    label: 'Dimensions',
    width: '100px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDimensions(entry.width, entry.height)}
      </span>
    ),
  },
  {
    key: 'duration',
    label: 'Duration',
    width: '80px',
    sortable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDuration(entry.duration)}
      </span>
    ),
  },
];

// Search results columns include path column after name
export const searchColumns: Column[] = [
  iconColumn,
  nameColumn,
  pathColumn,
  ...columns.slice(2),
];
