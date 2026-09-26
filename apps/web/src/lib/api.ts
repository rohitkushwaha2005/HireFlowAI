import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, ApiSuccess, ErrorCode, Paginated, PaginationMeta, SessionDto } from '@hireflow/shared';

/**
 * HTTP client. The access token lives only in memory (never localStorage) to limit XSS exposure;
 * the refresh token is an httpOnly cookie the browser sends to /api/auth/refresh. A 401 triggers
 * one shared refresh attempt, then the original request is retried.
 */

const baseURL = `${(import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''}/api`;

type Listener = () => void;

class SessionStore {
  private token: string | null = null;
  private organizationId: string | null = null;
  private readonly listeners = new Set<Listener>();

  getToken() {
    return this.token;
  }
  getOrganizationId() {
    return this.organizationId;
  }
  set(token: string | null, organizationId?: string | null) {
    this.token = token;
    if (organizationId !== undefined) this.organizationId = organizationId;
  }
  setOrganization(organizationId: string | null) {
    this.organizationId = organizationId;
  }
  clear() {
    this.token = null;
    this.organizationId = null;
  }
  /** Fired when the session can no longer be refreshed (e.g. expired or revoked). */
  onExpired(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  expire() {
    this.clear();
    this.listeners.forEach((l) => l());
  }
}

export const session = new SessionStore();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues ?? [];
    return Object.fromEntries(issues.filter((i) => i.path).map((i) => [i.path, i.message]));
  }
}

export const http = axios.create({ baseURL, withCredentials: true, timeout: 60_000 });

http.interceptors.request.use((config) => {
  const token = session.getToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  const org = session.getOrganizationId();
  if (org) config.headers.set('X-Organization-Id', org);
  return config;
});

let refreshing: Promise<SessionDto | null> | null = null;

/** Single-flight refresh shared by concurrent 401s. */
export function refreshSession(): Promise<SessionDto | null> {
  refreshing ??= axios
    .post<ApiSuccess<SessionDto>>(`${baseURL}/auth/refresh`, null, { withCredentials: true })
    .then((res) => {
      session.set(res.data.data.accessToken);
      return res.data.data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    if (status === 401 && original && !original._retried && !NO_REFRESH.some((p) => original.url?.startsWith(p))) {
      original._retried = true;
      const refreshed = await refreshSession();
      if (refreshed) return http(original);
      session.expire();
    }
    throw toApiError(error);
  },
);

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body && body.success === false && body.error) {
      return new ApiError(error.response!.status, body.error.code, body.error.message, body.error.details, body.error.requestId);
    }
    if (error.code === 'ECONNABORTED') return new ApiError(0, 'INTERNAL_ERROR', 'The request timed out. Please try again.');
    if (!error.response) return new ApiError(0, 'INTERNAL_ERROR', 'Cannot reach the server. Check your connection.');
    return new ApiError(error.response.status, 'INTERNAL_ERROR', 'Unexpected server response');
  }
  return new ApiError(0, 'INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error');
}

export function errorMessage(error: unknown): string {
  return toApiError(error).message;
}

// ── Typed helpers ────────────────────────────────────────────────────────────

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<ApiSuccess<T>>(url, config);
  return res.data.data;
}

export async function getPage<T>(url: string, params?: object): Promise<Paginated<T>> {
  const res = await http.get<ApiSuccess<T[]>>(url, { params });
  const pagination = res.data.meta?.pagination as PaginationMeta;
  return { items: res.data.data, pagination };
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.post<ApiSuccess<T>>(url, body, config);
  return res.data.data;
}

export async function patch<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<ApiSuccess<T>>(url, body);
  return res.data.data;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<ApiSuccess<T>>(url, body);
  return res.data.data;
}

export async function del<T = null>(url: string): Promise<T> {
  const res = await http.delete<ApiSuccess<T>>(url);
  return res.data.data;
}

/** Serializes arrays as comma-separated values, matching the API's csv query parsing. */
export function toQuery(params: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) out[key] = value.join(',');
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

export const apiBaseUrl = baseURL;
