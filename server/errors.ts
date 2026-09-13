/** Uniform HTTP error helper — Fastify renders `statusCode` + `message` for us. */

export interface HttpError extends Error {
  statusCode: number;
  code?: string;
}

export function httpError(statusCode: number, message: string, code?: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

export const unauthorized = (message = 'A valid session is required'): HttpError =>
  httpError(401, message, 'unauthorized');

export const forbidden = (message = 'Not allowed', code = 'forbidden'): HttpError =>
  httpError(403, message, code);

export const notFound = (message = 'Not found'): HttpError => httpError(404, message, 'not_found');

export const badRequest = (message: string, code = 'invalid_request'): HttpError =>
  httpError(400, message, code);

/**
 * 409 — the request is well-formed but contradicts a rule (a window is closed,
 * a pod is on the wrong governance track, a decision is already final).
 */
export const conflict = (message: string, code = 'conflict'): HttpError =>
  httpError(409, message, code);
