import axios from "axios";

const API_ROOT = import.meta.env.VITE_API_URL ?? "";

export const publicApi = axios.create({
  baseURL: `${API_ROOT}/api/public`,
});
