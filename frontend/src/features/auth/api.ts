import { ApiError, apiFetch } from "@/lib/api-client";
import type { AuthUser, Credentials, SignupInput } from "@/types/auth";

type AuthResponse = { user: AuthUser };

// 이메일 정규화(소문자화)는 백엔드가 한다. 프론트는 앞뒤 공백만 걷어 보낸다.
export async function signup(input: SignupInput): Promise<AuthUser> {
  const body: SignupInput = {
    email: input.email.trim(),
    password: input.password,
    passwordConfirm: input.passwordConfirm,
  };
  const data = await apiFetch<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.user;
}

export async function login(credentials: Credentials): Promise<AuthUser> {
  const body: Credentials = { email: credentials.email.trim(), password: credentials.password };
  const data = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<AuthResponse>("/api/auth/me");
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED") {
      return null;
    }
    throw error;
  }
}
