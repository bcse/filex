export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  created?: string;
  modified?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  has_children: boolean;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

export interface IndexedFile {
  id: number;
  path: string;
  name: string;
  is_dir: boolean;
  size?: number;
  created_at?: string;
  modified_at?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
  indexed_at: string;
}

export interface ListResponse {
  path: string;
  entries: FileEntry[];
}

export interface SearchResponse {
  query: string;
  results: IndexedFile[];
  count: number;
}

export interface ErrorResponse {
  error: string;
}

export interface SuccessResponse {
  success: boolean;
  path?: string;
  message?: string;
}

export type SortField = 'name' | 'size' | 'created' | 'modified' | 'mime_type' | 'width' | 'height' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}
