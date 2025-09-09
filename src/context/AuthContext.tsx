import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api";
import { getExpMs, tokenStore } from "../auth/token";

type User = { id?: string; email?: string; role?: string } | null;

type AuthCtx = {
  accessToken: string | null;
  user: User;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void> | void;
};

const AuthContext = createContext<AuthCtx | null>(null);

// ---- replace / adjust to your API ----
async function getProfile() {
  const { data } = await api.get("/me", { requireAuth: true });
  return data as { id: string; email: string; role?: string };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  // refs for interceptors & timers
  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const rememberRef = useRef(false);

  const schedule = (token: string | null) => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const expMs = getExpMs(token);
    if (expMs) {
      const delay = Math.max(expMs - Date.now() - 60_000, 0); // refresh 60s before expiry
      refreshTimerRef.current = window.setTimeout(() => void refresh(), delay);
    }
  };

  const setTokens = (access: string | null, refresh?: string | null) => {
    setAccessToken(access);
    accessRef.current = access;
    if (typeof refresh !== "undefined") refreshRef.current = refresh ?? null;

    tokenStore.setBoth(access, refreshRef.current, rememberRef.current);
    schedule(access);
  };

  // Refresh using refresh_token from memory/localStorage (NOT cookies)
  const refresh = async () => {
    const rt = refreshRef.current ?? tokenStore.readPersisted().refresh;
    if (!rt) throw new Error("No refresh token");
    // Most APIs accept the refresh in body; adapt if your API expects headers
    const { data } = await api.post("/auth/refresh", { refresh_token: rt }); // public call

    // support snakeCase or camelCase
    const newAccess: string = data.access_token ?? data.accessToken;
    const newRefresh: string | undefined =
      data.refresh_token ?? data.refreshToken;

    // some backends rotate refresh tokens; if not provided, keep old
    setTokens(newAccess, newRefresh ?? rt);
    return newAccess;
  };

  const login: AuthCtx["login"] = async (email, password, remember = false) => {
    const { data } = await api.post("/auth/login", { email, password }); // public call

    const a: string = data.access_token ?? data.accessToken;
    const r: string = data.refresh_token ?? data.refreshToken;

    rememberRef.current = remember;
    setTokens(a, r);
    try {
      const me = await getProfile();
      setUser(me);
    } catch {
      setUser(null);
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout"); // public call
    } catch {
      /* ignore */
    }
    rememberRef.current = false;
    setTokens(null, null);
    setUser(null);
  };

  // ---- Boot: restore session safely ----
  useEffect(() => {
    (async () => {
      try {
        // 1) Try using any persisted refresh token to get a fresh access token
        const persisted = tokenStore.readPersisted();
        if (persisted.refresh) {
          rememberRef.current = true;
          refreshRef.current = persisted.refresh;
          await refresh(); // sets access & (rotated) refresh
          try {
            setUser(await getProfile());
          } catch {
            setUser(null);
          }
          setLoading(false);
          return;
        }

        // 2) If we only have a persisted access (rare), use it until it expires
        if (
          persisted.access &&
          (!getExpMs(persisted.access) ||
            getExpMs(persisted.access)! > Date.now())
        ) {
          rememberRef.current = true;
          setTokens(persisted.access, null);
          try {
            setUser(await getProfile());
          } catch {
            setUser(null);
          }
        } else {
          setTokens(null, null);
          setUser(null);
        }
        setLoading(false);
      } catch {
        setTokens(null, null);
        setUser(null);
        setLoading(false);
      }
    })();

    // multi-tab sync (listen for access/refresh changes)
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === tokenStore.keys.access ||
        e.key === tokenStore.keys.refresh
      ) {
        const persisted = tokenStore.readPersisted();
        accessRef.current = persisted.access;
        refreshRef.current = persisted.refresh;
        setAccessToken(persisted.access);
        schedule(persisted.access);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // ---- Axios interceptors ----
  useEffect(() => {
    // REQUEST: attach access token only when explicitly requested
    const apiHost = api.defaults.baseURL
      ? new URL(api.defaults.baseURL).host
      : null;

    const reqId = api.interceptors.request.use((config) => {
      if (config.requireAuth && accessRef.current) {
        // host safety: never attach to other domains
        const abs = config.url
          ? new URL(config.url, api.defaults.baseURL || window.location.origin)
          : null;
        if (!abs || (apiHost && abs.host !== apiHost)) return config;

        config.headers = config.headers ?? {};
        if (!config.headers.Authorization) {
          (config.headers as any).Authorization = `Bearer ${accessRef.current}`;
        }
      }
      return config;
    });

    // RESPONSE: 401 -> refresh with safe queue; avoid recursion on auth endpoints
    let isRefreshing = false;
    let queue: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];

    const processQueue = (err: any, newToken?: string) => {
      queue.forEach(({ resolve, reject }) =>
        err ? reject(err) : resolve(newToken)
      );
      queue = [];
    };

    const resId = api.interceptors.response.use(
      (r) => r,
      async (error) => {
        const status = error?.response?.status;
        const original = error?.config;

        // Do not handle 401s coming from auth endpoints themselves
        if (original?.url) {
          const abs = new URL(
            original.url,
            api.defaults.baseURL || window.location.origin
          );
          const path = abs.pathname;
          if (
            path.startsWith("/auth/refresh") ||
            path.startsWith("/auth/login") ||
            path.startsWith("/auth/logout")
          ) {
            return Promise.reject(error);
          }
        }

        if (status === 401 && original && !original._retry) {
          original._retry = true;

          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              queue.push({
                resolve: (t) => {
                  if (t && original.headers)
                    (original.headers as any).Authorization = `Bearer ${t}`;
                  resolve(api(original));
                },
                reject,
              });
            });
          }

          isRefreshing = true;
          try {
            const newToken = await refresh();
            processQueue(null, newToken);
            if (original.headers)
              (original.headers as any).Authorization = `Bearer ${newToken}`;
            return api(original);
          } catch (e) {
            processQueue(e);
            await logout();
            return Promise.reject(e);
          } finally {
            isRefreshing = false;
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(reqId);
      api.interceptors.response.eject(resId);
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      accessToken,
      user,
      isAuthenticated: Boolean(accessToken),
      loading,
      login,
      logout,
    }),
    [accessToken, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
