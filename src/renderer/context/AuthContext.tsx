import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AuthUser } from '../types';
import { useApi } from './ApiContext';
import { HttpDataApi } from '../../adapters/HttpDataApi';

const AUTH_STORAGE_KEY = 'aero-planer-session';
const WS_URL = import.meta.env.VITE_WS_URL || undefined;

interface StoredSession {
  user: AuthUser;
  shiftStartTime: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  shiftStartTime: Date | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (login: string, pin: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

interface SocketContextValue {
  socket: Socket | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SocketContext = createContext<SocketContextValue>({ socket: null });

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [user, setUser] = useState<AuthUser | null>(() => readStoredSession()?.user ?? null);
  const [shiftStartTime, setShiftStartTime] = useState<Date | null>(() => {
    const session = readStoredSession();
    return session?.shiftStartTime ? new Date(session.shiftStartTime) : null;
  });
  const [isLoading, setIsLoading] = useState(() => Boolean(readStoredSession()?.user));
  const [socket, setSocket] = useState<Socket | null>(null);

  const persistSession = useCallback((nextUser: AuthUser, start: Date) => {
    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ user: nextUser, shiftStartTime: start.toISOString() }),
    );
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setShiftStartTime(null);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setSocket((prev) => {
      prev?.disconnect();
      return null;
    });
  }, []);

  useEffect(() => {
    const session = readStoredSession();
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await api.validateSession();
      if (cancelled) return;

      if (result.ok && result.data) {
        setUser(result.data as AuthUser);
        setShiftStartTime(session.shiftStartTime ? new Date(session.shiftStartTime) : new Date());
      } else {
        clearSession();
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [api, clearSession]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    const token = api instanceof HttpDataApi ? api.getAccessToken() : null;
    if (!token) return;

    const s = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    setSocket(s);
    return () => {
      s.disconnect();
    };
  }, [user?.id, api]);

  const login = useCallback(
    async (loginName: string, pin: string) => {
      setIsLoading(true);
      try {
        const result = await api.loginOperator(loginName, pin);
        if (!result.ok || !result.data) {
          return { ok: false as const, error: result.error ?? 'Ошибка авторизации.' };
        }
        const authUser = result.data as AuthUser;
        const start = new Date();
        setUser(authUser);
        setShiftStartTime(start);
        persistSession(authUser, start);
        return { ok: true as const };
      } finally {
        setIsLoading(false);
      }
    },
    [api, persistSession],
  );

  const logout = useCallback(async () => {
    await api.logoutOperator();
    clearSession();
  }, [api, clearSession]);

  const authValue = useMemo(
    () => ({
      user,
      shiftStartTime,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
    }),
    [user, shiftStartTime, isLoading, login, logout],
  );

  const socketValue = useMemo(() => ({ socket }), [socket]);

  return (
    <AuthContext.Provider value={authValue}>
      <SocketContext.Provider value={socketValue}>{children}</SocketContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useSocket() {
  return useContext(SocketContext);
}

export function usePermissions() {
  const { user } = useAuth();
  const role = user?.role;

  return useMemo(
    () => ({
      isAdmin: role === 'Администратор',
      isHead: role === 'Руководитель',
      isOperator: role === 'Оператор',
      isTechnician: role === 'Техник',
    }),
    [role],
  );
}
