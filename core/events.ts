/**
 * Internal event bus (13-TECHNICAL-ARCHITECTURE.md §2, Phase 0 requirement).
 *
 * One bus, one emission point per state change: the Archive indexer and the
 * Notification dispatcher (Phase 6) subscribe to the same events, so the two
 * trigger lists can never drift apart. For v1 this is an in-process pub/sub;
 * every published event is also written to the `domain_event` outbox table
 * (durability first, then dispatch) so a durable, replayable history exists
 * from day one even though the subscribers arrive in later phases.
 *
 * Guarantees relied on by tests:
 *  - publish() persists BEFORE notifying subscribers (no alert without a record)
 *  - subscribers run sequentially in subscription order (deterministic)
 *  - a throwing subscriber never prevents the remaining subscribers from
 *    running, and never rejects publish()
 *  - subscribe() returns a working unsubscribe function
 */

import type { UUID } from './types';

export interface DomainEvent<P = Record<string, unknown>> {
  /** Stable event id (also the outbox row id). */
  id: UUID;
  /** Dot-namespaced event name, e.g. 'pod.checkin_logged'. */
  type: string;
  aggregateType: string | null;
  aggregateId: UUID | null;
  payload: P;
  actorUserId: UUID | null;
  orgId: UUID | null;
  /** ISO-8601 instant. */
  occurredAt: string;
}

export interface PublishInput<P = Record<string, unknown>> {
  type: string;
  aggregateType?: string | null;
  aggregateId?: UUID | null;
  payload?: P;
  actorUserId?: UUID | null;
  orgId?: UUID | null;
  /** Overridable for deterministic tests. */
  id?: UUID;
  occurredAt?: string;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface EventBus {
  publish<P>(input: PublishInput<P>): Promise<DomainEvent<P>>;
  /** Subscribe to one event type, or to every event with '*'. */
  subscribe(type: string | '*', handler: EventHandler): Unsubscribe;
  subscriberCount(type: string): number;
  /** Events recorded by the bus (test/dev introspection). */
  history(): DomainEvent[];
  clearHistory(): void;
}

export interface EventBusOptions {
  /** Durable write (outbox). Runs before dispatch; failures abort the publish. */
  persist?: (event: DomainEvent) => void | Promise<void>;
  /** Called when a subscriber throws; defaults to console.error. */
  onError?: (error: unknown, context: { event: DomainEvent; subscriberIndex: number }) => void;
  clock?: () => string;
  idFactory?: () => UUID;
  /** Keep an in-memory log of published events (default: true). */
  keepHistory?: boolean;
}

let sequence = 0;

/**
 * Event ids are UUIDs because they are persisted to the `domain_event` outbox
 * (uuid primary key) and later become the identity an Archive/Notification
 * consumer deduplicates on.
 */
function defaultIdFactory(): string {
  sequence += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Non-secure browser contexts (http on a LAN IP) have no randomUUID.
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const {
    persist,
    onError = (error, context) => {
      // eslint-disable-next-line no-console
      console.error(
        `[event-bus] subscriber ${context.subscriberIndex} failed handling "${context.event.type}"`,
        error,
      );
    },
    clock = () => new Date().toISOString(),
    idFactory = defaultIdFactory,
    keepHistory = true,
  } = options;

  const subscribers = new Map<string, EventHandler[]>();
  const published: DomainEvent[] = [];

  function handlersFor(type: string): EventHandler[] {
    return [...(subscribers.get(type) ?? []), ...(subscribers.get('*') ?? [])];
  }

  return {
    async publish<P>(input: PublishInput<P>): Promise<DomainEvent<P>> {
      if (!input.type || typeof input.type !== 'string') {
        throw new TypeError('event.type is required');
      }

      const event: DomainEvent<P> = {
        id: input.id ?? idFactory(),
        type: input.type,
        aggregateType: input.aggregateType ?? null,
        aggregateId: input.aggregateId ?? null,
        payload: (input.payload ?? {}) as P,
        actorUserId: input.actorUserId ?? null,
        orgId: input.orgId ?? null,
        occurredAt: input.occurredAt ?? clock(),
      };

      // 1. Durable record first: an event that cannot be recorded must not
      //    fire notifications or archive entries.
      if (persist) {
        await persist(event as DomainEvent);
      }

      // 2. Then dispatch, isolating subscriber failures.
      const handlers = handlersFor(event.type);
      for (let i = 0; i < handlers.length; i += 1) {
        const handler = handlers[i];
        if (!handler) continue;
        try {
          await handler(event as DomainEvent);
        } catch (error) {
          onError(error, { event: event as DomainEvent, subscriberIndex: i });
        }
      }

      if (keepHistory) {
        published.push(event as DomainEvent);
      }
      return event;
    },

    subscribe(type, handler) {
      const list = subscribers.get(type) ?? [];
      list.push(handler);
      subscribers.set(type, list);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const current = subscribers.get(type) ?? [];
        const index = current.indexOf(handler);
        if (index >= 0) current.splice(index, 1);
        subscribers.set(type, current);
      };
    },

    subscriberCount(type) {
      return (subscribers.get(type) ?? []).length;
    },

    history() {
      return [...published];
    },

    clearHistory() {
      published.length = 0;
    },
  };
}
