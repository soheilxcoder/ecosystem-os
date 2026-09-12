/**
 * Server-side API client.
 *
 * Browser code never calls the API directly: every request here runs inside a
 * React Server Component or a server action, and the session token is attached
 * server-side. That keeps the token out of JavaScript, keeps the API on a
 * private port, and means the browser only ever sees its own origin.
 */

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  message?: string;
  issues?: unknown;
  requestId?: string;
}

export interface RequestOptions {
  token?: string | null;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Next.js fetch cache directive. Defaults to no-store (live numbers). */
  cache?: RequestCache;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, method = 'GET', body, cache = 'no-store' } = options;

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      cache,
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new ApiError(
      503,
      'The platform API is unreachable — start it with `npm run dev:api`',
      'api_unreachable',
    );
  }

  const text = await response.text();
  const payload: ApiEnvelope<T> = text ? safeParse<ApiEnvelope<T>>(text) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.message ?? `Request failed with ${response.status}`,
      payload.error,
      payload.requestId,
    );
  }

  if (!('data' in payload)) {
    throw new ApiError(response.status, 'Malformed API response: missing `data`', 'bad_response');
  }
  return payload.data as T;
}

/** Returns null instead of throwing — for optional shell data. */
export async function apiRequestOrNull<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      // eslint-disable-next-line no-console
      console.warn(`[api] ${options.method ?? 'GET'} ${path} failed: ${error.status} ${error.message}`);
      return null;
    }
    throw error;
  }
}

function safeParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export { API_ORIGIN };
