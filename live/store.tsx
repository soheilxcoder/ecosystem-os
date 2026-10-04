/**
 * React stores for the live edition: engine boot state + the signed-in
 * session (the real platform's token, kept in localStorage).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { bootEngine, type BootStage, type Engine } from './engine';

// ---------------------------------------------------------------- engine ---

interface EngineState {
  engine: Engine | null;
  stage: BootStage | 'idle';
  error: string | null;
}

const EngineContext = createContext<EngineState>({ engine: null, stage: 'idle', error: null });

export function EngineProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EngineState>({ engine: null, stage: 'idle', error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = await bootEngine((stage) => {
          if (!cancelled) setState({ engine: null, stage, error: null });
        });
        if (!cancelled) setState({ engine, stage: 'ready', error: null });
      } catch (error) {
        if (!cancelled) {
          setState({ engine: null, stage: 'idle', error: (error as Error).message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <EngineContext.Provider value={state}>{children}</EngineContext.Provider>;
}

export function useEngine(): EngineState {
  return useContext(EngineContext);
}

// --------------------------------------------------------------- session ---

const TOKEN_KEY = 'ecosystem-live-token';

/** The `/api/me` payload — everything the shell renders. */
export interface MePayload {
  user: { id: string; email: string; fullName: string; avatarUrl: string | null; status: string } | null;
  org: { id: string };
  holdings: Array<{ id: string; orgId: string; name: string; code: string | null; createdAt: string }>;
  pods: Array<{ id: string; name: string }>;
  roles: Array<{
    id: string;
    roleType: string;
    scopeType: string;
    scopeId: string | null;
    startDate: string;
    endDate: string | null;
    rotation: {
      state: string;
      daysRemaining: number | null;
      progress: number | null;
      label: string;
    };
  }>;
  isHubUser: boolean;
  today: string;
}

interface SessionState {
  token: string | null;
  me: MePayload | null;
  restoring: boolean;
  refreshMe: () => Promise<void>;
  login: (email: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  token: null,
  me: null,
  restoring: false,
  refreshMe: async () => {},
  login: async () => ({ ok: false }),
  logout: async () => {},
});

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { engine } = useEngine();
  const [token, setToken] = useState<string | null>(() => readToken());
  const [me, setMe] = useState<MePayload | null>(null);
  const [restoring, setRestoring] = useState(false);

  const fetchMe = useCallback(
    async (activeToken: string | null) => {
      if (!engine || !activeToken) return;
      const res = await engine.request({ method: 'GET', url: '/api/me', token: activeToken });
      if (res.status !== 200) {
        setMe(null);
        setToken(null);
        try {
          window.localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      setMe((res.json() as { data: MePayload }).data);
    },
    [engine],
  );

  // Restore the session whenever the engine (or stored token) changes.
  useEffect(() => {
    if (!engine || !token) return;
    let cancelled = false;
    setRestoring(true);
    (async () => {
      await fetchMe(token);
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [engine, token, fetchMe]);

  const login = useCallback(
    async (email: string) => {
      if (!engine) return { ok: false, message: 'engine not ready' };
      const res = await engine.request({
        method: 'POST',
        url: '/api/auth/login',
        body: { email },
      });
      if (res.status !== 200 && res.status !== 201) {
        const payload = res.json() as { error?: string; message?: string };
        return { ok: false, message: payload?.message ?? payload?.error ?? 'login failed' };
      }
      const data = (res.json() as { data: { token: string } }).data;
      try {
        window.localStorage.setItem(TOKEN_KEY, data.token);
      } catch {
        /* ignore */
      }
      setToken(data.token);
      return { ok: true };
    },
    [engine],
  );

  const logout = useCallback(async () => {
    if (engine && token) {
      await engine.request({ method: 'POST', url: '/api/auth/logout', token }).catch(() => undefined);
    }
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setMe(null);
  }, [engine, token]);

  const refreshMe = useCallback(async () => fetchMe(token), [fetchMe, token]);

  const value = useMemo(
    () => ({ token, me, restoring, refreshMe, login, logout }),
    [token, me, restoring, refreshMe, login, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

// ------------------------------------------------------------------- api ---

/** fetch-style helpers over the in-browser API; returns the envelope `data`. */
export function useApi() {
  const { engine } = useEngine();
  const { token } = useSession();

  return useMemo(() => {
    const run = async <T,>(method: string, url: string, body?: unknown): Promise<T> => {
      if (!engine) throw new Error('Engine not ready');
      const res = await engine.request({ method, url, body, token });
      const payload = res.json() as { data?: T; error?: string; message?: string };
      if (res.status >= 400) {
        const err = new Error(payload?.message ?? payload?.error ?? `HTTP ${res.status}`) as Error & {
          status?: number;
          code?: string;
        };
        err.status = res.status;
        err.code = payload?.error;
        throw err;
      }
      return (payload?.data ?? payload) as T;
    };

    return {
      get: <T,>(url: string) => run<T>('GET', url),
      post: <T,>(url: string, body?: unknown) => run<T>('POST', url, body),
      put: <T,>(url: string, body?: unknown) => run<T>('PUT', url, body),
    };
  }, [engine, token]);
}
