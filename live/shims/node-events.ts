/** Minimal browser EventEmitter shim for node:events (lazy, inherits-safe). */

type Listener = (...args: unknown[]) => void;

/** Instances carry their listener map lazily (util.inherits never runs the ctor). */
export interface EventEmitterLike {
  _eventsMap?: Map<string, Listener[]>;
}

function eventsOf(emitter: EventEmitterLike): Map<string, Listener[]> {
  if (!emitter._eventsMap) emitter._eventsMap = new Map();
  return emitter._eventsMap;
}

export class EventEmitter implements EventEmitterLike {
  _eventsMap?: Map<string, Listener[]>;

  on(event: string, listener: Listener): this {
    const map = eventsOf(this);
    const list = map.get(event) ?? [];
    list.push(listener);
    map.set(event, list);
    return this;
  }

  addListener(event: string, listener: Listener): this {
    return this.on(event, listener);
  }

  prependListener(event: string, listener: Listener): this {
    const map = eventsOf(this);
    const list = map.get(event) ?? [];
    list.unshift(listener);
    map.set(event, list);
    return this;
  }

  once(event: string, listener: Listener): this {
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Listener): this {
    const map = eventsOf(this);
    const list = map.get(event);
    if (list) map.set(event, list.filter((l) => l !== listener));
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string): this {
    const map = eventsOf(this);
    if (event) map.delete(event);
    else map.clear();
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this._eventsMap?.get(event);
    if (!list || list.length === 0) return false;
    for (const listener of [...list]) listener(...args);
    return true;
  }

  listenerCount(event: string): number {
    return this._eventsMap?.get(event)?.length ?? 0;
  }

  listeners(event: string): Listener[] {
    return [...(this._eventsMap?.get(event) ?? [])];
  }

  setMaxListeners(_n: number): this {
    return this;
  }

  getMaxListeners(): number {
    return Number.POSITIVE_INFINITY;
  }
}

export const once = async (emitter: EventEmitterLike, event: string): Promise<unknown[]> => {
  return new Promise((resolve) => {
    const wrapper: Listener = (...args) => {
      const map = eventsOf(emitter);
      const list = map.get(event);
      if (list) map.set(event, list.filter((l) => l !== wrapper));
      resolve(args);
    };
    const map = eventsOf(emitter);
    const list = map.get(event) ?? [];
    list.push(wrapper);
    map.set(event, list);
  });
};

export default { EventEmitter, once };
