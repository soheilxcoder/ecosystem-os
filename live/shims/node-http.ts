/**
 * Browser shim for node:http.
 *
 * The platform's browser edition never opens a listening socket: every request
 * flows through Fastify's in-memory `app.inject()` (light-my-request). This
 * shim provides exactly the surface Fastify and light-my-request touch:
 *
 *   - `createServer()` returns an inert server object (Fastify builds one at
 *     construction time even when it never listens);
 *   - `ServerResponse` is a plain constructor function (light-my-request does
 *     `util.inherits(Response, http.ServerResponse)` and `.call()`s it) with a
 *     working header map, write/end bookkeeping and EventEmitter behaviour.
 */
import { EventEmitter } from './node-events';

/** The instance shape light-my-request relies on for outgoing messages. */
interface OutgoingInstance {
  _headersMap: Map<string, { name: string; value: unknown }>;
  statusCode: number;
  statusMessage: string;
  _header: string;
  destroyed: boolean;
  socket?: unknown;
  connection?: unknown;
}

export function IncomingMessage(this: unknown, ..._args: unknown[]): void {}
IncomingMessage.prototype = Object.create(EventEmitter.prototype);
IncomingMessage.prototype.constructor = IncomingMessage;

export function OutgoingMessage(this: unknown, ..._args: unknown[]): void {
  const self = this as OutgoingInstance;
  self._headersMap = new Map();
  self.statusCode = 200;
  self.statusMessage = 'OK';
  self._header = '';
  self.destroyed = false;
}
OutgoingMessage.prototype = Object.create(EventEmitter.prototype);
OutgoingMessage.prototype.constructor = OutgoingMessage;

type OutProto = OutgoingInstance & {
  setHeader: (name: string, value: unknown) => OutProto;
};

OutgoingMessage.prototype.setHeader = function setHeader(this: OutgoingInstance, name: string, value: unknown) {
  this._headersMap.set(name.toLowerCase(), { name, value });
  return this as unknown as OutProto;
};
OutgoingMessage.prototype.getHeader = function getHeader(this: OutgoingInstance, name: string) {
  return this._headersMap.get(name.toLowerCase())?.value;
};
OutgoingMessage.prototype.getHeaders = function getHeaders(this: OutgoingInstance) {
  const out: Record<string, unknown> = {};
  for (const { name, value } of this._headersMap.values()) out[name] = value;
  return out;
};
OutgoingMessage.prototype.getHeaderNames = function getHeaderNames(this: OutgoingInstance) {
  return [...this._headersMap.keys()];
};
OutgoingMessage.prototype.hasHeader = function hasHeader(this: OutgoingInstance, name: string) {
  return this._headersMap.has(name.toLowerCase());
};
OutgoingMessage.prototype.removeHeader = function removeHeader(this: OutgoingInstance, name: string) {
  this._headersMap.delete(name.toLowerCase());
};
OutgoingMessage.prototype.assignSocket = function assignSocket(this: OutgoingInstance, socket: unknown) {
  this.socket = socket;
  this.connection = socket;
};
OutgoingMessage.prototype.writeHead = function writeHead(
  this: OutgoingInstance,
  statusCode: number,
  reasonOrHeaders?: string | Record<string, unknown>,
  maybeHeaders?: Record<string, unknown>,
) {
  this.statusCode = statusCode;
  let headers = maybeHeaders;
  if (typeof reasonOrHeaders === 'object' && reasonOrHeaders !== null) {
    headers = reasonOrHeaders;
  } else if (typeof reasonOrHeaders === 'string') {
    this.statusMessage = reasonOrHeaders;
  }
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      this._headersMap.set(key.toLowerCase(), { name: key, value });
    }
  }
  return this as unknown as OutProto;
};
OutgoingMessage.prototype.write = function write(
  this: OutgoingInstance,
  _chunk: unknown,
  _encoding?: unknown,
  callback?: () => void,
) {
  callback?.();
  return true;
};
OutgoingMessage.prototype.end = function end(
  this: OutgoingInstance,
  _chunk?: unknown,
  _encoding?: unknown,
  callback?: () => void,
) {
  callback?.();
  return this as unknown as OutProto;
};
OutgoingMessage.prototype.flushHeaders = function flushHeaders(this: OutgoingInstance) {};
OutgoingMessage.prototype.setTimeout = function setTimeout(this: OutgoingInstance) {
  return this as unknown as OutProto;
};
OutgoingMessage.prototype.destroy = function destroy(this: OutgoingInstance) {
  this.destroyed = true;
};

export function ServerResponse(this: unknown, ...args: unknown[]): void {
  OutgoingMessage.call(this, ...args);
}
ServerResponse.prototype = Object.create(OutgoingMessage.prototype);
ServerResponse.prototype.constructor = ServerResponse;

export const STATUS_CODES: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity',
  429: 'Too Many Requests', 500: 'Internal Server Error', 503: 'Service Unavailable',
};

/**
 * Fastify calls `createServer()` at construction time even when it never
 * listens. Return an inert object with the surface Fastify inspects: event
 * hooks, `listening`, timeouts, `close`, `address`.
 */
export function createServer(_options?: unknown, _handler?: unknown): Record<string, unknown> {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const server: Record<string, unknown> = { listening: false };
  server.on = (event: string, listener: (...args: unknown[]) => void) => {
    const list = handlers.get(event) ?? [];
    list.push(listener);
    handlers.set(event, list);
    return server;
  };
  server.once = (event: string, listener: (...args: unknown[]) => void) =>
    (server.on as (e: string, l: (...a: unknown[]) => void) => unknown)(event, listener);
  server.off = (event: string, listener: (...args: unknown[]) => void) => {
    const list = handlers.get(event);
    if (list) handlers.set(event, list.filter((l) => l !== listener));
    return server;
  };
  server.removeListener = server.off;
  server.removeAllListeners = () => {
    handlers.clear();
    return server;
  };
  server.emit = () => false;
  server.ref = () => server;
  server.unref = () => server;
  server.address = () => null;
  server.setTimeout = () => server;
  server.closeAllConnections = () => {};
  server.closeIdleConnections = () => {};
  server.close = (callback?: (err?: Error) => void) => {
    callback?.();
    return server;
  };
  return server;
}

export default {
  IncomingMessage,
  ServerResponse,
  OutgoingMessage,
  STATUS_CODES,
  createServer,
};
