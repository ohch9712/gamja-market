import { vi, type Mock } from "vitest";
import { useAuth } from "@/features/auth/AuthProvider";
import type { AuthUser } from "@/types/auth";

export const testUser: AuthUser = {
  id: "6d2c1b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  email: "potato@example.com",
  createdAt: "2026-10-10T03:21:45.123456Z",
};

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details: { field: string; message: string }[] = [],
): Response {
  return jsonResponse(status, { error: { code, message, details } });
}

export const unauthenticatedResponse = () => errorResponse(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
export const networkFailure = () => Promise.reject(new TypeError("Failed to fetch"));
/** 응답하지 않다가 signal이 abort되면 실제 fetch처럼 AbortError로 끝나는 요청 */
export const hangUntilAborted = (init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
  });

type RouteHandler = (init?: RequestInit) => Response | Promise<Response>;
export type FetchMock = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;

function routeKey(input: RequestInfo | URL, init?: RequestInit) {
  return `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
}

/** `"POST /api/auth/login"` 형태의 키로 응답을 정해 전역 fetch를 바꾼다. */
export function stubFetch(routes: Record<string, RouteHandler>): FetchMock {
  const fetchMock: FetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const handler = routes[routeKey(input, init)];
    if (!handler) throw new Error(`예상하지 못한 요청: ${routeKey(input, init)}`);
    return handler(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function callsTo(fetchMock: FetchMock, key: string) {
  return fetchMock.mock.calls.filter(([input, init]) => routeKey(input, init) === key);
}

export function requestBody(fetchMock: FetchMock, key: string, index = 0): unknown {
  const init = callsTo(fetchMock, key)[index]?.[1];
  return typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
}

/** 테스트에서 AuthProvider 상태를 관찰하기 위한 컴포넌트 */
export function AuthStatusProbe() {
  const { status, backendAvailable } = useAuth();
  return <span data-testid="auth-status" data-backend={String(backendAvailable)}>{status}</span>;
}
