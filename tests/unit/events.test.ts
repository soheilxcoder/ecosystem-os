/**
 * Internal event bus — the single emission point every module publishes to, so
 * the Archive indexer and the Notification dispatcher (Phase 6) can never drift
 * apart (11-MODULE-NOTIFICATIONS.md, "Business logic").
 */

import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type DomainEvent } from '../../core/events';

describe('createEventBus', () => {
  it('requires an event type', async () => {
    const bus = createEventBus();
    await expect(bus.publish({ type: '' })).rejects.toThrow(/type is required/);
  });

  it('delivers an event to a subscriber of that type', async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe('pod.checkin_logged', handler);

    const event = await bus.publish({
      type: 'pod.checkin_logged',
      aggregateType: 'pod',
      aggregateId: 'pod-1',
      payload: { week: 4 },
      actorUserId: 'user-1',
      orgId: 'org-1',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const received = handler.mock.calls[0]![0] as DomainEvent;
    expect(received.type).toBe('pod.checkin_logged');
    expect(received.payload).toEqual({ week: 4 });
    expect(received.aggregateId).toBe('pod-1');
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not deliver unrelated event types', async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe('pod.checkin_logged', handler);
    await bus.publish({ type: 'cloud.proposed' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers every event to a wildcard subscriber', async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.subscribe('*', handler);
    await bus.publish({ type: 'a.one' });
    await bus.publish({ type: 'b.two' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('runs subscribers sequentially in subscription order', async () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.subscribe('x', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push('first');
    });
    bus.subscribe('x', () => {
      order.push('second');
    });
    await bus.publish({ type: 'x' });
    expect(order).toEqual(['first', 'second']);
  });

  it('isolates a failing subscriber: later subscribers still run, publish resolves', async () => {
    const bus = createEventBus({ onError: () => {} });
    const second = vi.fn();
    bus.subscribe('x', () => {
      throw new Error('subscriber exploded');
    });
    bus.subscribe('x', second);

    await expect(bus.publish({ type: 'x' })).resolves.toBeTruthy();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('reports subscriber failures through onError without losing the event', async () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    bus.subscribe('x', () => {
      throw new Error('boom');
    });
    await bus.publish({ type: 'x' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1].event.type).toBe('x');
  });

  it('unsubscribes cleanly', async () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('x', handler);
    unsubscribe();
    await bus.publish({ type: 'x' });
    expect(handler).not.toHaveBeenCalled();
    expect(bus.subscriberCount('x')).toBe(0);
  });

  it('persists before dispatching — a failed write means no notifications', async () => {
    const handler = vi.fn();
    let persistCalls = 0;
    const bus = createEventBus({
      persist: async () => {
        persistCalls += 1;
        throw new Error('database is down');
      },
    });
    bus.subscribe('x', handler);

    await expect(bus.publish({ type: 'x' })).rejects.toThrow('database is down');
    expect(persistCalls).toBe(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes the exact persisted event to subscribers', async () => {
    const persisted: DomainEvent[] = [];
    const bus = createEventBus({ persist: (event) => void persisted.push(event) });
    let received: DomainEvent | null = null;
    bus.subscribe('x', (event) => {
      received = event;
    });
    await bus.publish({ type: 'x', payload: { n: 1 } });
    expect(persisted[0]).toEqual(received);
  });

  it('keeps a history of published events for inspection', async () => {
    const bus = createEventBus();
    await bus.publish({ type: 'a' });
    await bus.publish({ type: 'b' });
    expect(bus.history().map((e) => e.type)).toEqual(['a', 'b']);
    bus.clearHistory();
    expect(bus.history()).toEqual([]);
  });

  it('accepts an injected clock and id for deterministic events', async () => {
    const bus = createEventBus({ clock: () => '2026-06-15T00:00:00.000Z', idFactory: () => 'fixed-id' });
    const event = await bus.publish({ type: 'a' });
    expect(event.id).toBe('fixed-id');
    expect(event.occurredAt).toBe('2026-06-15T00:00:00.000Z');
  });
});
