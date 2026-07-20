// hooks/api/axios.js
import axios from "axios";

import { redirectTo } from "@utils/redirect-to";
import { useAuthStore } from "@services/store/use-auth-store";

export const httpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
};

const BASE_URL = import.meta.env.VITE_BASE_URL;
const REFRESH_URL = "/api/v1/auth/refresh";

const axiosClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // important for refresh-token cookie
  headers: {
    "Content-Type": "application/json",
  },
});

/* ------------------------------------------------------------------ */
/* Request interceptor — attach access token                           */
/* ------------------------------------------------------------------ */
axiosClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* ------------------------------------------------------------------ */
/* Refresh queue                                                       */
/* ------------------------------------------------------------------ */
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

/* ------------------------------------------------------------------ */
/* Helper: are we hitting an auth endpoint? (don't loop refresh on it) */
/* ------------------------------------------------------------------ */
const isAuthEndpoint = (url = "") =>
  url.includes("/auth/login") ||
  url.includes("/auth/logout") ||
  url.includes("/auth/refresh");

/* ------------------------------------------------------------------ */
/* Response interceptor — 401 → refresh → retry, else logout + redirect*/
/* ------------------------------------------------------------------ */
axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config ?? {};
    const status = error.response?.status;
    const url = originalRequest.url ?? "";

    // Bail early on non-401s or on auth endpoints (don't try to refresh /refresh)
    if (status !== 401 || originalRequest._retry || isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // Already refreshing? Queue this request until refresh resolves.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token) => {
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(axiosClient(originalRequest));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      // Call refresh endpoint with cookie credentials.
      // Use a *bare* axios so we don't recurse into this interceptor.
      const { data } = await axios.post(
        `${BASE_URL}${REFRESH_URL}`,
        {},
        { withCredentials: true },
      );

      const newToken = data?.accessToken ?? data?.data?.accessToken;
      if (!newToken) throw new Error("No access token from refresh");

      // Persist new token in the store
      useAuthStore.getState().setToken(newToken);

      // Update default + retry headers
      axiosClient.defaults.headers.common.Authorization = `Bearer ${newToken}`;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      processQueue(null, newToken);
      return axiosClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      // Save where the user was so login can bounce them back
      if (typeof window !== "undefined") {
        const here = window.location.pathname + window.location.search;
        redirectTo.set(here);
      }

      // Refresh failed → logout. Pass reload:false so we can do a clean route push
      // if you're using react-router; if you prefer a hard reload, set reload:true.
      useAuthStore.getState().logout?.({ reload: true });

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/* ------------------------------------------------------------------ */
/* Public helpers                                                      */
/* ------------------------------------------------------------------ */
export const defaultAxios = (method, url, config = {}) =>
  axiosClient({ method, url, ...config });

export const axiosMultipart = (method, url, config = {}) =>
  axiosClient({
    method,
    url,
    ...config,
    // Let axios infer multipart boundary; user passes FormData as data.
    headers: { ...(config.headers ?? {}), "Content-Type": undefined },
  });

export default axiosClient;
