/**
 * API server entry point.
 *
 * The API owns the database (a single PGlite instance cannot be shared across
 * processes), exposes every module's REST endpoints, and is the only place that
 * talks SQL. The Next.js app calls it server-side, so browser code never needs
 * to know it exists.
 */

import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { z } from 'zod';

import { createDatabase, type Database } from '../db/client';
import { migrate } from '../db/migrate';
import { createEventBus, type EventBus } from '../core/events';
import { persistDomainEvent } from '../db/repositories/audit';
import { todayISO, type ISODate } from '../core/time';
import { loadEnv, type Env } from './config';
import { AuthService, AuthError } from './auth/service';
import { WindowClosedError } from './services/pods';
import { registerAuthMiddleware } from './middleware/auth';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerMeRoutes } from './routes/me';
import { registerCalendarRoutes } from './routes/calendar';
import { registerPodRoutes } from './routes/pods';
import type { PodServiceContext } from './services/pods';

export interface ServerContext {
  db: Database;
  bus: EventBus;
  env: Env;
  authService: AuthService;
  today: () => ISODate;
  close: () => Promise<void>;
}

export interface CreateContextOptions {
  /** Override env values (tests, scripts). */
  env?: Partial<Record<string, string | undefined>>;
  /** Reuse an existing database instead of opening one (tests). */
  db?: Database;
  /** Apply migrations on boot (default true). */
  runMigrations?: boolean;
  logger?: boolean;
}

export async function createServerContext(options: CreateContextOptions = {}): Promise<ServerContext> {
  const env = loadEnv(options.env ?? {});
  const ownsDb = !options.db;
  const db = options.db ?? (await createDatabase({ url: env.DATABASE_URL, dataDir: env.PGLITE_DATA_DIR }));

  if (options.runMigrations !== false) {
    await migrate(db);
  }

  const today = (): ISODate => env.TODAY ?? todayISO();

  // The event bus persists every event to the outbox before dispatching, so a
  // durable record exists now for the Archive and Notifications subscribers
  // that arrive in Phase 6.
  const bus = createEventBus({
    persist: async (event) => {
      await persistDomainEvent(db, event);
    },
  });

  // Transparent observability: every event is visible in the API log.
  bus.subscribe('*', (event) => {
    if (options.logger !== false) {
      // eslint-disable-next-line no-console
      console.log(`[event] ${event.type} (${event.aggregateType ?? '-'}/${event.aggregateId ?? '-'})`);
    }
  });

  const authService = new AuthService({ db, bus, env });

  return {
    db,
    bus,
    env,
    authService,
    today,
    async close() {
      if (ownsDb) await db.close();
    },
  };
}

export interface BuildServerOptions extends CreateContextOptions {
  context?: ServerContext;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const context = options.context ?? (await createServerContext(options));
  const { db, bus, env, authService, today } = context;

  const app = Fastify({
    logger: options.logger === false ? false : { level: env.LOG_LEVEL },
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  registerAuthMiddleware(app, { db, authService, today });

  // Shared context for the pod services: every time-boxed rule resolves
  // "today" through the same injected clock.
  const podContext = (): PodServiceContext => ({ db, bus, today });

  registerHealthRoutes(app, { db });
  registerAuthRoutes(app, { authService, db });
  registerMeRoutes(app, { db, today });
  registerCalendarRoutes(app, { db, today, podContext });
  registerPodRoutes(app, { db, today, podContext });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({
      error: 'not_found',
      message: `No route for ${request.method} ${request.url}`,
      requestId: request.id,
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // A time-boxed action attempted outside its calendar window: 409 Conflict,
    // with the day and the allowed range so the UI can explain itself.
    if (error instanceof WindowClosedError) {
      return reply.code(409).send({
        error: 'window_closed',
        message: error.message,
        action: error.action,
        cycleDay: error.day,
        allowedDays: error.allowedDays,
        requestId: request.id,
      });
    }

    if (error instanceof AuthError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        requestId: request.id,
      });
    }

    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: 'invalid_request',
        message: 'Request validation failed',
        issues: error.issues,
        requestId: request.id,
      });
    }

    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error, requestId: request.id }, 'Unhandled error');
    }
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : 'request_error',
      message: statusCode >= 500 ? 'Something went wrong processing this request' : error.message,
      requestId: request.id,
    });
  });

  app.decorate('context', context);
  // Expose the bus so module routes can publish domain events.
  app.decorate('bus', bus);

  app.addHook('onClose', async () => {
    await context.close();
  });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    context: ServerContext;
    bus: EventBus;
  }
}

async function start(): Promise<void> {
  const app = await buildServer();
  const { env } = app.context;
  try {
    await app.listen({ host: env.API_HOST, port: env.API_PORT });
    console.log(`[api] listening on http://${env.API_HOST}:${env.API_PORT} (driver: ${app.context.db.driver})`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (invokedDirectly) {
  void start();
}
