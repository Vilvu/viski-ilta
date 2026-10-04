import axios from 'axios';

export const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Native sign-in endpoints report bad credentials as 401; let the login
    // form show those inline instead of redirecting.
    const isAuthEndpoint = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
