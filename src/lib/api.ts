import axios from "axios";
import { tokenStore } from "@/auth/token";

// Central Axios instance used across the app. Attach the access token to
// every request unless `skipAuth` is explicitly set. This ensures that once a
// user logs in, subsequent calls automatically include the bearer token.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
});

api.interceptors.request.use((config) => {
  if (!config.skipAuth) {
    const token = tokenStore.getAccess();
    if (token && !config.headers?.Authorization) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, unknown>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
