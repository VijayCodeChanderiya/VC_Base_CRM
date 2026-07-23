import axios from "axios";
import { useAuthStore } from "@/store/auth";
import { useOrgContextStore } from "@/store/orgContext";

// In prod, frontend and backend live on different domains, so VITE_API_URL points
// at the deployed backend (e.g. https://alphatech-api.onrender.com). Locally it's
// unset and requests fall back to the relative path proxied by vite.config.ts.
const API_ROOT = import.meta.env.VITE_API_URL ?? "";

export const api = axios.create({
  baseURL: `${API_ROOT}/api`,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const { user } = useAuthStore.getState();
  if (user?.role === "SUPER_ADMIN") {
    const orgId = useOrgContextStore.getState().organizationId;
    if (orgId) {
      config.headers["X-Organization-Id"] = orgId;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
