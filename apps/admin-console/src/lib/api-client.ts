const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3005/api/v1";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  try {
    const { body, headers: customHeaders, ...rest } = options;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
      ...rest,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, error.message ?? "Request failed");
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  } catch (error) {
    console.warn(`API call failed: ${endpoint}`, error);
    return {} as T;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "GET" }),
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "POST", body }),
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "PUT", body }),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "PATCH", body }),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),
};
