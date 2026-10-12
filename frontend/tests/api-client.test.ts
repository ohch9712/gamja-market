import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, ApiError, REQUEST_TIMEOUT_MS, apiFetch } from "@/lib/api-client";
import { getMe, login, logout, signup } from "@/features/auth/api";
import {
  callsTo,
  errorResponse,
  hangUntilAborted,
  jsonResponse,
  networkFailure,
  requestBody,
  stubFetch,
  testUser,
  unauthenticatedResponse,
} from "./helpers/auth";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("에러가 발생해야 합니다.");
}

describe("apiFetch", () => {
  it("API_BASE_URL에 경로를 붙이고 credentials: include로 요청한다", async () => {
    const fetchMock = stubFetch({ "GET /api/health": () => jsonResponse(200, { status: "ok" }) });
    await expect(apiFetch("/api/health")).resolves.toEqual({ status: "ok" });
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(`${API_BASE_URL}/api/health`);
    expect(init?.credentials).toBe("include");
  });

  it("JSON 본문이면 Content-Type: application/json을 붙인다", async () => {
    const fetchMock = stubFetch({ "POST /api/auth/login": () => jsonResponse(200, { user: testUser }) });
    await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ a: 1 }) });
    const init = fetchMock.mock.calls[0][1];
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.credentials).toBe("include");
  });

  it("204는 undefined를 반환한다", async () => {
    stubFetch({ "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("에러 응답을 5.1 포맷으로 파싱해 ApiError로 던진다", async () => {
    stubFetch({ "POST /api/auth/signup": () => errorResponse(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.") });
    const error = await catchError(apiFetch("/api/auth/signup", { method: "POST", body: "{}" }));
    expect(error).toMatchObject({ status: 409, code: "EMAIL_ALREADY_EXISTS", message: "이미 가입된 이메일입니다.", details: [] });
  });

  it("VALIDATION_ERROR의 details를 그대로 담는다", async () => {
    const details = [{ field: "passwordConfirm", message: "비밀번호가 일치하지 않습니다." }];
    stubFetch({ "POST /api/auth/signup": () => errorResponse(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.", details) });
    const error = await catchError(apiFetch("/api/auth/signup", { method: "POST", body: "{}" }));
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_ERROR", details });
  });

  it("에러 본문을 파싱할 수 없으면 UNKNOWN_ERROR", async () => {
    stubFetch({ "GET /api/auth/me": () => new Response("Internal Server Error", { status: 500 }) });
    const error = await catchError(apiFetch("/api/auth/me"));
    expect(error).toMatchObject({ status: 500, code: "UNKNOWN_ERROR" });
  });

  it("fetch 자체가 실패하면 NETWORK_ERROR(status 0)", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure });
    const error = await catchError(apiFetch("/api/auth/me"));
    expect(error).toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("응답이 REQUEST_TIMEOUT_MS 안에 오지 않으면 요청을 끊고 TIMEOUT(status 0)", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ "GET /api/auth/me": hangUntilAborted });
    const pending = catchError(apiFetch("/api/auth/me"));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(await pending).toMatchObject({
      status: 0,
      code: "TIMEOUT",
      message: "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
    });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("timeoutMs로 요청별 타임아웃을 바꿀 수 있다", async () => {
    vi.useFakeTimers();
    stubFetch({ "GET /api/auth/me": hangUntilAborted });
    const pending = catchError(apiFetch("/api/auth/me", { timeoutMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ code: "TIMEOUT" });
  });

  it("호출자가 취소하면 TIMEOUT이 아니라 AbortError를 그대로 던진다", async () => {
    stubFetch({ "GET /api/auth/me": hangUntilAborted });
    const controller = new AbortController();
    const pending = apiFetch("/api/auth/me", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("응답이 오면 타이머를 정리해 이후에 abort하지 않는다", async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch({ "GET /api/health": () => jsonResponse(200, { status: "ok" }) });
    await expect(apiFetch("/api/health")).resolves.toEqual({ status: "ok" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });
});

describe("features/auth/api", () => {
  it("signup은 passwordConfirm을 포함해 전송하고 user를 반환한다", async () => {
    const fetchMock = stubFetch({ "POST /api/auth/signup": () => jsonResponse(201, { user: testUser }) });
    await expect(signup({ email: " Potato@Example.com ", password: "gamja1234", passwordConfirm: "gamja1234" })).resolves.toEqual(testUser);
    expect(requestBody(fetchMock, "POST /api/auth/signup")).toEqual({
      email: "Potato@Example.com",
      password: "gamja1234",
      passwordConfirm: "gamja1234",
    });
  });

  it("login은 email·password만 전송한다", async () => {
    const fetchMock = stubFetch({ "POST /api/auth/login": () => jsonResponse(200, { user: testUser }) });
    await expect(login({ email: "potato@example.com", password: "gamja1234" })).resolves.toEqual(testUser);
    expect(requestBody(fetchMock, "POST /api/auth/login")).toEqual({ email: "potato@example.com", password: "gamja1234" });
  });

  it("logout은 POST /api/auth/logout을 호출한다", async () => {
    const fetchMock = stubFetch({ "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    await expect(logout()).resolves.toBeUndefined();
    expect(callsTo(fetchMock, "POST /api/auth/logout")).toHaveLength(1);
  });

  it("getMe는 로그인 상태면 user, 401 UNAUTHENTICATED면 null", async () => {
    stubFetch({ "GET /api/auth/me": () => jsonResponse(200, { user: testUser }) });
    await expect(getMe()).resolves.toEqual(testUser);
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await expect(getMe()).resolves.toBeNull();
  });

  it("getMe는 그 외 에러(NETWORK_ERROR·TIMEOUT 포함)를 던진다", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure });
    expect(await catchError(getMe())).toMatchObject({ code: "NETWORK_ERROR" });
    stubFetch({ "GET /api/auth/me": () => errorResponse(500, "INTERNAL_ERROR", "서버 오류") });
    expect(await catchError(getMe())).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });
});
