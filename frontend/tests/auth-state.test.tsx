import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/components/RequireAuth";
import { Header } from "@/components/Header";
import NewRequestPage from "@/app/requests/new/page";
import { REQUEST_TIMEOUT_MS } from "@/lib/api-client";
import {
  AuthStatusProbe,
  callsTo,
  hangUntilAborted,
  jsonResponse,
  networkFailure,
  stubFetch,
  testUser,
  unauthenticatedResponse,
} from "./helpers/auth";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/requests/new" }));

const meOk = () => jsonResponse(200, { user: testUser });
const never = () => new Promise<Response>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderHeader() {
  return render(<AuthProvider><Header /><AuthStatusProbe /></AuthProvider>);
}

describe("AuthProvider", () => {
  it("마운트 시 getMe를 1회 호출한다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": meOk });
    renderHeader();
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));
    expect(callsTo(fetchMock, "GET /api/auth/me")).toHaveLength(1);
  });

  it("백엔드가 꺼져 있으면 미로그인 + backendAvailable=false", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure });
    renderHeader();
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("auth-status")).toHaveAttribute("data-backend", "false");
  });

  it("getMe가 타임아웃되면 미로그인 + backendAvailable=false", async () => {
    vi.useFakeTimers();
    stubFetch({ "GET /api/auth/me": hangUntilAborted });
    renderHeader();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("loading");
    await act(() => vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("auth-status")).toHaveAttribute("data-backend", "false");
  });

  it("늦게 도착한 최초 getMe 응답이 로그인 결과를 덮어쓰지 않는다", async () => {
    let resolveMe: (response: Response) => void = () => {};
    stubFetch({
      "GET /api/auth/me": () => new Promise<Response>((resolve) => { resolveMe = resolve; }),
      "POST /api/auth/login": meOk,
    });
    function LoginButton() {
      const { login } = useAuth();
      return <button type="button" onClick={() => login({ email: testUser.email, password: "gamja1234" })}>login</button>;
    }
    render(<AuthProvider><LoginButton /><AuthStatusProbe /></AuthProvider>);
    fireEvent.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated"));

    resolveMe(unauthenticatedResponse());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
  });

  it("AuthProvider 밖에서 useAuth를 쓰면 에러를 낸다", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<AuthStatusProbe />)).toThrow("AuthProvider");
  });
});

describe("헤더 AuthMenu", () => {
  it("loading: 응답을 기다리는 동안에도 로그인·회원가입 링크와 구매요청 CTA를 보여 준다", () => {
    stubFetch({ "GET /api/auth/me": never });
    renderHeader();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("loading");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /구매요청 올리기/ })).toHaveAttribute("href", "/requests/new");
  });

  it("loading 중 보이던 링크는 로그인 확인이 끝나면 이메일·로그아웃으로 바뀐다", async () => {
    let resolveMe: (response: Response) => void = () => {};
    stubFetch({ "GET /api/auth/me": () => new Promise<Response>((resolve) => { resolveMe = resolve; }) });
    renderHeader();
    expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
    resolveMe(meOk());
    expect(await screen.findByText(testUser.email)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("getMe가 타임아웃돼도 로그인·회원가입 링크를 유지한다", async () => {
    vi.useFakeTimers();
    stubFetch({ "GET /api/auth/me": hangUntilAborted });
    renderHeader();
    await act(() => vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
  });

  it("unauthenticated: 로그인·회원가입 링크를 보여 준다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    renderHeader();
    expect(await screen.findByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: /구매요청 올리기/ })).toBeInTheDocument();
  });

  it("백엔드가 꺼져 있어도 미로그인 링크를 보여 준다", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure });
    renderHeader();
    expect(await screen.findByRole("link", { name: "로그인" })).toBeInTheDocument();
  });

  it("authenticated: 이메일과 로그아웃 버튼을 보여 주고, 로그아웃하면 링크로 바뀌고 /로 이동한다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": meOk, "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    renderHeader();
    expect(await screen.findByText(testUser.email)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /구매요청 올리기/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(screen.queryByText(testUser.email)).not.toBeInTheDocument();
    expect(callsTo(fetchMock, "POST /api/auth/logout")).toHaveLength(1);
    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("로그아웃 API가 실패해도 화면은 로그아웃 상태가 된다", async () => {
    stubFetch({ "GET /api/auth/me": meOk, "POST /api/auth/logout": networkFailure });
    renderHeader();
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("link", { name: "로그인" })).toBeInTheDocument();
    expect(router.push).toHaveBeenCalledWith("/");
  });
});

describe("RequireAuth (/requests/new 게이트)", () => {
  function renderGate() {
    return render(<AuthProvider><RequireAuth><p>보호된 내용</p></RequireAuth><AuthStatusProbe /></AuthProvider>);
  }

  it("loading 동안에는 내용 대신 로딩 플레이스홀더를 보여 준다", () => {
    stubFetch({ "GET /api/auth/me": never });
    renderGate();
    expect(screen.getByRole("status")).toHaveTextContent("로그인 상태를 확인하고 있어요");
    expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("미로그인이면 /login?next=/requests/new로 보낸다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    renderGate();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=/requests/new"));
    expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument();
  });

  it("백엔드가 꺼져 있어도 미로그인으로 판정해 로그인 화면으로 보낸다", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure });
    renderGate();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=/requests/new"));
  });

  it("로그인 상태면 원래 내용을 보여 준다", async () => {
    stubFetch({ "GET /api/auth/me": meOk });
    renderGate();
    expect(await screen.findByText("보호된 내용")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("보호 화면에서 로그아웃하면 로그인 화면이 아니라 /로 이동한다", async () => {
    stubFetch({ "GET /api/auth/me": meOk, "POST /api/auth/logout": () => new Response(null, { status: 204 }) });
    render(<AuthProvider><Header /><RequireAuth><p>보호된 내용</p></RequireAuth></AuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(screen.queryByText("보호된 내용")).not.toBeInTheDocument());
    expect(router.push).toHaveBeenCalledWith("/");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("/requests/new 페이지는 로그인 후 기존 등록 폼을 그대로 보여 준다", async () => {
    stubFetch({ "GET /api/auth/me": meOk });
    render(<AuthProvider><NewRequestPage /></AuthProvider>);
    expect(await screen.findByRole("button", { name: /구매요청 미리 등록하기/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /제목/ })).toBeInTheDocument();
  });

  it("/requests/new 페이지는 미로그인 시 폼을 렌더링하지 않고 로그인으로 보낸다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    render(<AuthProvider><NewRequestPage /></AuthProvider>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=/requests/new"));
    expect(screen.queryByRole("button", { name: /구매요청 미리 등록하기/ })).not.toBeInTheDocument();
  });
});
