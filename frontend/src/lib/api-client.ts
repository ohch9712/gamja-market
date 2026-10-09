export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const NETWORK_ERROR_MESSAGE = "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
export const UNKNOWN_ERROR_MESSAGE = "잠시 후 다시 시도해 주세요.";

export type ApiErrorDetail = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number, // 네트워크 실패는 0
    public code: string, // 서버 error.code 또는 "NETWORK_ERROR"
    message: string,
    public details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

function toApiError(status: number, body: unknown): ApiError {
  const error = (body as { error?: unknown } | undefined)?.error as
    | { code?: unknown; message?: unknown; details?: unknown }
    | undefined;
  if (!error || typeof error.code !== "string" || typeof error.message !== "string") {
    return new ApiError(status, "UNKNOWN_ERROR", UNKNOWN_ERROR_MESSAGE);
  }
  const details = Array.isArray(error.details)
    ? error.details.filter(
        (detail): detail is ApiErrorDetail =>
          typeof detail?.field === "string" && typeof detail?.message === "string",
      )
    : [];
  return new ApiError(status, error.code, error.message, details);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await readJson(response);
    } catch {
      body = undefined;
    }
    throw toApiError(response.status, body);
  }

  if (response.status === 204) return undefined as T;

  try {
    return (await readJson(response)) as T;
  } catch {
    throw new ApiError(response.status, "UNKNOWN_ERROR", UNKNOWN_ERROR_MESSAGE);
  }
}
