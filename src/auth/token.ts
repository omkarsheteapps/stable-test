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

const LS = {
  access: "access_token",
  refresh: "refresh_token",
};

export const tokenStore = {
  // getters
  getAccess: () => localStorage.getItem(LS.access),
  getRefresh: () => localStorage.getItem(LS.refresh),

  // set both and persist in localStorage
  setBoth: (access: string | null, refresh: string | null) => {
    if (access) localStorage.setItem(LS.access, access);
    else localStorage.removeItem(LS.access);
    if (refresh) localStorage.setItem(LS.refresh, refresh);
    else localStorage.removeItem(LS.refresh);
  },

  // update just access (e.g., on refresh)
  setAccess: (access: string | null) => {
    if (access) localStorage.setItem(LS.access, access);
    else localStorage.removeItem(LS.access);
  },

  // update just refresh (e.g., on rotation)
  setRefresh: (refresh: string | null) => {
    if (refresh) localStorage.setItem(LS.refresh, refresh);
    else localStorage.removeItem(LS.refresh);
  },

  readPersisted: () => ({
    access: localStorage.getItem(LS.access),
    refresh: localStorage.getItem(LS.refresh),
  }),

  keys: LS,
};
