export interface FileEntry {
  id?: number;
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
  indexed_at?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  has_children: boolean;
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
}

export interface ListResponse {
  entries: FileEntry[];
}

export interface ErrorResponse {
  error: string;
}

export interface SuccessResponse {
  success: boolean;
  path?: string;
  message?: string;
  performed?: boolean;
}

export type SortField = 'name' | 'size' | 'created' | 'modified' | 'mime_type' | 'width' | 'height' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}
