import { jwtDecode } from "jwt-decode";

export type Decoded = { exp?: number; sub?: string; role?: string; email?: string };

export function getExpMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const d = jwtDecode<Decoded>(token);
    return d.exp ? d.exp * 1000 : null;
  } catch {
    return null;
  }
}

// In-memory (safer against XSS than localStorage)
let inMemAccess: string | null = null;
let inMemRefresh: string | null = null;

const LS = {
  access: "access_token",
  refresh: "refresh_token",
};

export const tokenStore = {
  // getters
  getAccess: () => {
    if (inMemAccess) return inMemAccess;
    const token = localStorage.getItem(LS.access);
    inMemAccess = token;
    return token;
  },
  getRefresh: () => {
    if (inMemRefresh) return inMemRefresh;
    const token = localStorage.getItem(LS.refresh);
    inMemRefresh = token;
    return token;
  },

  // set both and persist in localStorage
  setBoth: (access: string | null, refresh: string | null) => {
    inMemAccess = access;
    inMemRefresh = refresh;

    if (access) localStorage.setItem(LS.access, access);
    else localStorage.removeItem(LS.access);
    if (refresh) localStorage.setItem(LS.refresh, refresh);
    else localStorage.removeItem(LS.refresh);
  },

  // update just access (e.g., on refresh)
  setAccess: (access: string | null) => {
    inMemAccess = access;
    if (access) localStorage.setItem(LS.access, access);
    else localStorage.removeItem(LS.access);
  },

  // update just refresh (e.g., on rotation)
  setRefresh: (refresh: string | null) => {
    inMemRefresh = refresh;
    if (refresh) localStorage.setItem(LS.refresh, refresh);
    else localStorage.removeItem(LS.refresh);
  },

  readPersisted: () => ({
    access: localStorage.getItem(LS.access),
    refresh: localStorage.getItem(LS.refresh),
  }),

  keys: LS,
};
