import type {
  ListResponse,
  SearchResponse,
  SuccessResponse,
  TreeNode,
  ErrorResponse,
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
  async listDirectory(path: string = '/'): Promise<ListResponse> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE}/browse?${params}`);
    return handleResponse(response);
  },

  async getTree(path: string = '/'): Promise<TreeNode[]> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${API_BASE}/tree?${params}`);
    return handleResponse(response);
  },

  // Search
  async search(query: string, limit: number = 50): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await fetch(`${API_BASE}/search?${params}`);
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

  async move(from: string, to: string): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    return handleResponse(response);
  },

  async copy(from: string, to: string): Promise<SuccessResponse> {
    const response = await fetch(`${API_BASE}/files/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
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

  // System
  async health(): Promise<{ status: string; version: string; ffprobe_available: boolean }> {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  async triggerIndex(): Promise<{ is_running: boolean }> {
    const response = await fetch(`${API_BASE}/index/trigger`, { method: 'POST' });
    return handleResponse(response);
  },
};

export { ApiError };
