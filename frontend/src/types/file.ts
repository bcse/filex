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
  path?: string;
  entries: FileEntry[];
  offset: number;
  limit: number;
  total: number;
  sort_by?: SortField;
  sort_order?: SortOrder;
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

export type SortField =
  | "name"
  | "path"
  | "size"
  | "created"
  | "modified"
  | "mime_type"
  | "width"
  | "height"
  | "duration"
  | "type"
  | "dimensions";
export type SortOrder = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export interface SearchResponse {
  query: string;
  entries: FileEntry[];
  offset: number;
  limit: number;
  total: number;
  sort_by?: SortField;
  sort_order?: SortOrder;
}
