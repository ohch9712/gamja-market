import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { SignupForm } from "@/features/auth/components/SignupForm";
import { LoginForm } from "@/features/auth/components/LoginForm";
import SignupPage from "@/app/signup/page";
import LoginPage from "@/app/login/page";
import {
  AuthStatusProbe,
  callsTo,
  errorResponse,
  jsonResponse,
  networkFailure,
  requestBody,
  stubFetch,
  testUser,
  unauthenticatedResponse,
} from "./helpers/auth";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderWithAuth(ui: ReactNode) {
  const result = render(<AuthProvider>{ui}<AuthStatusProbe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId("auth-status")).not.toHaveTextContent("loading"));
  return result;
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fieldError(id: string) {
  return document.getElementById(`${id}-error`);
}

describe("SignupForm", () => {
  it("/signup 페이지는 이메일·비밀번호·비밀번호 확인 3개 필드만 렌더링한다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    const { container } = await renderWithAuth(<SignupPage />);
    expect(screen.getByRole("heading", { level: 1, name: "회원가입" })).toBeInTheDocument();
    expect(container.querySelectorAll("input")).toHaveLength(3);
    expect(screen.getByLabelText("이메일")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "password");
    const confirm = screen.getByLabelText("비밀번호 확인");
    expect(confirm).toHaveAttribute("id", "passwordConfirm");
    expect(confirm).toHaveAttribute("type", "password");
    expect(confirm).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });

  it("비밀번호 확인이 다르면 제출 시 불일치 메시지를 보여 주고 API를 호출하지 않는다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1235");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(fieldError("passwordConfirm")).toHaveTextContent("비밀번호가 일치하지 않습니다.");
    expect(screen.getByLabelText("비밀번호 확인")).toHaveFocus();
    expect(callsTo(fetchMock, "POST /api/auth/signup")).toHaveLength(0);
  });

  it("비밀번호가 일치하면 passwordConfirm을 포함한 본문으로 1회 호출하고 /로 이동한다", async () => {
    const fetchMock = stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/signup": () => jsonResponse(201, { user: testUser }),
    });
    await renderWithAuth(<SignupForm />);
    type("이메일", "Potato@Example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("button", { name: "가입 중…" })).toBeDisabled();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(callsTo(fetchMock, "POST /api/auth/signup")).toHaveLength(1);
    expect(requestBody(fetchMock, "POST /api/auth/signup")).toEqual({
      email: "Potato@Example.com",
      password: "gamja1234",
      passwordConfirm: "gamja1234",
    });
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("빈 폼을 제출하면 필드별 메시지를 보여 주고 첫 에러 필드에 포커스한다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(fieldError("email")).toHaveTextContent("올바른 이메일 형식이 아닙니다.");
    expect(fieldError("password")).toHaveTextContent("비밀번호는 8~128자로 입력해 주세요.");
    expect(fieldError("passwordConfirm")).toHaveTextContent("비밀번호를 한 번 더 입력해 주세요.");
    expect(screen.getByLabelText("이메일")).toHaveFocus();
    expect(callsTo(fetchMock, "POST /api/auth/signup")).toHaveLength(0);
  });

  it("비밀번호가 8자 미만이면 비밀번호 에러만 보여 주고 불일치 에러는 띄우지 않는다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja12");
    type("비밀번호 확인", "different");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(fieldError("password")).toHaveTextContent("비밀번호는 8~128자로 입력해 주세요.");
    expect(fieldError("passwordConfirm")).toBeNull();
    expect(screen.getByLabelText("비밀번호")).toHaveFocus();
    expect(callsTo(fetchMock, "POST /api/auth/signup")).toHaveLength(0);
  });

  it("입력 중에 불일치를 바로 알려 주고, 비밀번호를 고쳐 일치하면 즉시 지운다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<SignupForm />);
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja12");
    expect(fieldError("passwordConfirm")).toHaveTextContent("비밀번호가 일치하지 않습니다.");

    type("비밀번호", "gamja12");
    expect(fieldError("passwordConfirm")).toBeNull();
  });

  it("비밀번호 확인 칸을 벗어날 때(blur) 일치 여부를 검사한다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<SignupForm />);
    type("비밀번호 확인", "gamja1234");
    expect(fieldError("passwordConfirm")).toBeNull();
    fireEvent.blur(screen.getByLabelText("비밀번호 확인"));
    expect(fieldError("passwordConfirm")).toHaveTextContent("비밀번호가 일치하지 않습니다.");
  });

  it("409 EMAIL_ALREADY_EXISTS는 이메일 필드 아래에 표시한다", async () => {
    stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/signup": () => errorResponse(409, "EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다."),
    });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(fieldError("email")).toHaveTextContent("이미 가입된 이메일입니다."));
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "가입하기" })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("422 VALIDATION_ERROR의 details를 필드별 메시지로 보여 준다(passwordConfirm 포함)", async () => {
    stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/signup": () => errorResponse(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.", [
        { field: "passwordConfirm", message: "비밀번호가 일치하지 않습니다." },
      ]),
    });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await waitFor(() => expect(fieldError("passwordConfirm")).toHaveTextContent("비밀번호가 일치하지 않습니다."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("서버에 연결할 수 없으면 폼 상단에 안내한다", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure, "POST /api/auth/signup": networkFailure });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("그 외 서버 에러는 '잠시 후 다시 시도해 주세요.'로 안내한다", async () => {
    stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/signup": () => errorResponse(500, "INTERNAL_ERROR", "Internal Server Error"),
    });
    await renderWithAuth(<SignupForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    type("비밀번호 확인", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 후 다시 시도해 주세요.");
  });

  it("이미 로그인 상태면 /로 리다이렉트한다", async () => {
    stubFetch({ "GET /api/auth/me": () => jsonResponse(200, { user: testUser }) });
    await renderWithAuth(<SignupForm />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});

describe("LoginForm", () => {
  async function renderLoginPage(searchParams: Record<string, string> = {}) {
    const page = await LoginPage({ searchParams: Promise.resolve(searchParams) });
    return renderWithAuth(page);
  }

  it("/login 페이지는 이메일·비밀번호 2개 필드만 렌더링한다", async () => {
    stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    const { container } = await renderLoginPage();
    expect(screen.getByRole("heading", { level: 1, name: "로그인" })).toBeInTheDocument();
    expect(container.querySelectorAll("input")).toHaveLength(2);
    expect(screen.getByLabelText("이메일")).toBeInTheDocument();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText("비밀번호 확인")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
  });

  it("빈 값으로 제출하면 검증 메시지를 보여 주고 API를 호출하지 않는다", async () => {
    const fetchMock = stubFetch({ "GET /api/auth/me": unauthenticatedResponse });
    await renderWithAuth(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(fieldError("email")).toHaveTextContent("올바른 이메일 형식이 아닙니다.");
    expect(fieldError("password")).toHaveTextContent("비밀번호는 8~128자로 입력해 주세요.");
    expect(screen.getByLabelText("이메일")).toHaveFocus();
    expect(callsTo(fetchMock, "POST /api/auth/login")).toHaveLength(0);
  });

  it("401 INVALID_CREDENTIALS는 폼 상단에 안내한다", async () => {
    stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/login": () => errorResponse(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다."),
    });
    await renderWithAuth(<LoginForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("이메일 또는 비밀번호가 올바르지 않습니다.");
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("성공하면 next 경로로 이동하고 passwordConfirm 없이 전송한다", async () => {
    const fetchMock = stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/login": () => jsonResponse(200, { user: testUser }),
    });
    await renderLoginPage({ next: "/requests/new" });
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/requests/new"));
    expect(requestBody(fetchMock, "POST /api/auth/login")).toEqual({ email: "potato@example.com", password: "gamja1234" });
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("next가 외부 주소면 무시하고 /로 이동한다", async () => {
    stubFetch({
      "GET /api/auth/me": unauthenticatedResponse,
      "POST /api/auth/login": () => jsonResponse(200, { user: testUser }),
    });
    await renderLoginPage({ next: "//evil.example.com" });
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
  });

  it("서버에 연결할 수 없으면 폼 상단에 안내한다", async () => {
    stubFetch({ "GET /api/auth/me": networkFailure, "POST /api/auth/login": networkFailure });
    await renderWithAuth(<LoginForm />);
    type("이메일", "potato@example.com");
    type("비밀번호", "gamja1234");
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("이미 로그인 상태면 /로 리다이렉트한다", async () => {
    stubFetch({ "GET /api/auth/me": () => jsonResponse(200, { user: testUser }) });
    await renderLoginPage({ next: "/requests/new" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});
