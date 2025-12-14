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
import type { FileEntry } from '@/types/file';

export function FileIcon({ entry }: { entry: FileEntry }) {
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
}
