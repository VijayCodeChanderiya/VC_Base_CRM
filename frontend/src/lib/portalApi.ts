import axios from "axios";
import { useCustomerAuthStore } from "@/store/customerAuth";

export const portalApi = axios.create({
  baseURL: "/api/portal",
});

portalApi.interceptors.request.use((config) => {
  const token = useCustomerAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useCustomerAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
