"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("promopilot.token");
}

export function setToken(token: string) {
  window.localStorage.setItem("promopilot.token", token);
}

export function clearToken() {
  window.localStorage.removeItem("promopilot.token");
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || "Falha na requisicao.", response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function postJson<T>(path: string, body: unknown) {
  return apiFetch<T>(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function putJson<T>(path: string, body: unknown) {
  return apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export function patchJson<T>(path: string, body: unknown) {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}
