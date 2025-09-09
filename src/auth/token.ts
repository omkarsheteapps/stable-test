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
  refresh: "refresh_token", // persist only if user selects "Remember me"
};

export const tokenStore = {
  // getters
  getAccess: () => inMemAccess,
  getRefresh: () => inMemRefresh,

  // set both; if persist=true store in localStorage, else keep only in memory
  setBoth: (access: string | null, refresh: string | null, persist = false) => {
    inMemAccess = access;
    inMemRefresh = refresh;

    if (persist) {
      if (access) localStorage.setItem(LS.access, access);
      else localStorage.removeItem(LS.access);
      if (refresh) localStorage.setItem(LS.refresh, refresh);
      else localStorage.removeItem(LS.refresh);
    } else {
      localStorage.removeItem(LS.access);
      localStorage.removeItem(LS.refresh);
    }
  },

  // update just access (e.g., on refresh)
  setAccess: (access: string | null, persist = false) => {
    inMemAccess = access;
    if (persist && access) localStorage.setItem(LS.access, access);
    else localStorage.removeItem(LS.access);
  },

  // update just refresh (e.g., on rotation)
  setRefresh: (refresh: string | null, persist = false) => {
    inMemRefresh = refresh;
    if (persist && refresh) localStorage.setItem(LS.refresh, refresh);
    else localStorage.removeItem(LS.refresh);
  },

  readPersisted: () => ({
    access: localStorage.getItem(LS.access),
    refresh: localStorage.getItem(LS.refresh),
  }),

  keys: LS,
};
