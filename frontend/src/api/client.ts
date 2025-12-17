import type {
  ListResponse,
  SuccessResponse,
  TreeNode,
  ErrorResponse,
  SearchResponse,
  SortField,
  SortOrder,
} from '@/types/file';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ErrorResponse = await response.json().catch(() => ({
      error: 'Unknown error',
    }));
    throw new ApiError(response.status, error.error);
  }
  return response.json();
}

export const api = {
  // Browse
  async listDirectory(
    path: string = '/',
    options: {
      signal?: AbortSignal;
      offset?: number;
      limit?: number;
      sort_by?: SortField;
      sort_order?: SortOrder;
    } = {}
  ): Promise<ListResponse> {
    const params = new URLSearchParams({ path });
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.sort_by) params.set('sort_by', options.sort_by);
    if (options.sort_order) params.set('sort_order', options.sort_order);
    const response = await fetch(`${API_BASE}/browse?${params}`, {
      signal: options.signal,
    });
    return handleResponse(response);
  },

  async getTree(path: string = '/'): Promise<TreeNode[]> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE}/tree?${params}`);
    return handleResponse(response);
  },

  // Search
  async search(
    query: string,
    options: { signal?: AbortSignal; offset?: number; limit?: number; sort_by?: SortField; sort_order?: SortOrder } = {}
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.sort_by) params.set('sort_by', options.sort_by);
    if (options.sort_order) params.set('sort_order', options.sort_order);
    const response = await fetch(`${API_BASE}/search?${params}`, {
      signal: options.signal,
    });
    return handleResponse(response);
  },

  // File Operations
  async createDirectory(path: string): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return handleResponse(response);
  },

  async rename(path: string, newName: string): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, new_name: newName }),
    });
    return handleResponse(response);
  },

  async move(from: string, to: string, overwrite = false): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, overwrite }),
    });
    return handleResponse(response);
  },

  async copy(from: string, to: string, overwrite = false): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, overwrite }),
    });
    return handleResponse(response);
  },

  async delete(path: string): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return handleResponse(response);
  },

  getDownloadUrl(path: string): string {
    const params = new URLSearchParams({ path });
    return `${API_BASE}/files/download?${params}`;
  },

  async getTextContent(path: string, maxBytes: number = 100000): Promise<string> {
    const response = await fetch(this.getDownloadUrl(path));
    if (!response.ok) {
      throw new ApiError(response.status, 'Failed to fetch file content');
    }
    const blob = await response.blob();
    // Only read up to maxBytes
    const slice = blob.slice(0, maxBytes);
    return slice.text();
  },

  async upload(targetPath: string, files: FileList): Promise<SuccessResponse> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    const response = await fetch(`${API_BASE}/files/upload${targetPath}`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  uploadWithProgress(
    targetPath: string,
    file: File,
    onProgress: (progress: number) => void
  ): Promise<SuccessResponse> {
    return new Promise((resolve, reject) => {
      // XHR is required here to reliably report upload progress for multipart/form-data.
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('files', file);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            resolve({ success: true, path: targetPath, message: 'Upload complete' });
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new ApiError(xhr.status, error.error || 'Upload failed'));
          } catch {
            reject(new ApiError(xhr.status, 'Upload failed'));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new ApiError(0, 'Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new ApiError(0, 'Upload cancelled'));
      });

      xhr.open('POST', `${API_BASE}/files/upload${targetPath}`);
      xhr.send(formData);
    });
  },

  // Authentication
  async login(password: string): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return handleResponse(response);
  },

  async logout(): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async getAuthStatus(): Promise<{ authenticated: boolean; auth_required: boolean }> {
    const response = await fetch(`${API_BASE}/auth/status`);
    return handleResponse(response);
  },

  // System
  async health(): Promise<{ status: string; version: string; ffprobe_available: boolean }> {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  async getIndexStatus(): Promise<{ is_running: boolean }> {
    const response = await fetch(`${API_BASE}/index/status`);
    return handleResponse(response);
  },

  async triggerIndex(): Promise<{ is_running: boolean }> {
    const response = await fetch(`${API_BASE}/index/trigger`, { method: 'POST' });
    return handleResponse(response);
  },
};

export { ApiError };
