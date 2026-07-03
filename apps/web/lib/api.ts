"use client";

const RENDER_API_URL = "https://promopilot360-api.onrender.com";
const REQUEST_TIMEOUT_MS = 90000;

function getApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) return RENDER_API_URL;
  return "http://localhost:4000";
}

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
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(readApiError(body), response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("A API demorou para responder. Aguarde alguns segundos e tente novamente.", 0);
    }
    throw new ApiError("Nao foi possivel conectar com a API do PromoPilot.", 0);
  } finally {
    window.clearTimeout(timeoutId);
  }
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

function readApiError(body: unknown) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return "Falha na requisicao.";
}
