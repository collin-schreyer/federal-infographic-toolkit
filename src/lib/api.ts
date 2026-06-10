// Centralized fetch wrapper for the Hono backend. Every request sends the
// session cookie (credentials: 'include' would matter cross-origin; with the
// Vite proxy and production same-origin it's already same-site). On 401 we
// dispatch a global event so the SPA can drop back to the login screen.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, {
    method,
    headers,
    body: payload,
    credentials: 'include',
    signal,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('fit:unauthorized'));
  }
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  // Every api.* endpoint returns a JSON object. An empty body or an HTML/text
  // payload with a 200 status means a proxy hiccup or a machine mid-restart —
  // surface it as a retryable error instead of returning null and letting
  // callers crash on destructuring.
  if (data === null || typeof data !== 'object') {
    throw new ApiError(`The server returned an unexpected ${res.status} response — please retry.`, res.status);
  }
  return data as T;
}

export const api = {
  get:    <T>(p: string,             signal?: AbortSignal) => apiFetch<T>('GET',    p,    undefined, signal),
  post:   <T>(p: string, body?: any, signal?: AbortSignal) => apiFetch<T>('POST',   p, body, signal),
  patch:  <T>(p: string, body?: any, signal?: AbortSignal) => apiFetch<T>('PATCH',  p, body, signal),
  delete: <T>(p: string,             signal?: AbortSignal) => apiFetch<T>('DELETE', p,    undefined, signal),
};

// ------- Types shared with the server (mirrored manually) -------

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  must_change_password: number;
  created_at: number;
  created_by: string | null;
}

export interface RenderHistoryItem {
  id: string;
  topic: string;
  variation: 'baseline' | 'tuned' | 'reimagined';
  engine: 'openai' | 'gemini';
  visual_rhetoric: string | null;
  source_name: string | null;
  created_at: number;
  image_url: string;
  settings: any;
}
