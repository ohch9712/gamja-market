import { describe, expect, it } from "vitest";
import { authMessages, validateLogin, validateSignup } from "@/features/auth/validation";
import { getLoginPath, getSafeRedirectPath } from "@/features/auth/redirect";

const validSignup = { email: "Potato@Example.com", password: "gamja1234", passwordConfirm: "gamja1234" };

describe("validateSignup", () => {
  it("올바른 입력이면 에러가 없다", () => {
    expect(validateSignup(validSignup)).toEqual({});
  });

  it("이메일 형식을 검사한다(앞뒤 공백은 제거 후 검사)", () => {
    expect(validateSignup({ ...validSignup, email: "  potato@example.com  " })).toEqual({});
    for (const email of ["", "   ", "potato", "potato@example", "po tato@example.com", "@example.com"]) {
      expect(validateSignup({ ...validSignup, email }).email).toBe(authMessages.email);
    }
    const tooLong = `${"a".repeat(243)}@example.com`; // 255자
    expect(validateSignup({ ...validSignup, email: tooLong }).email).toBe(authMessages.email);
    expect(validateSignup({ ...validSignup, email: tooLong.slice(1) }).email).toBeUndefined();
  });

  it("비밀번호는 8~128자(문자 수 기준)만 허용한다", () => {
    const withPassword = (password: string) => validateSignup({ ...validSignup, password, passwordConfirm: password });
    expect(withPassword("a".repeat(7)).password).toBe(authMessages.password);
    expect(withPassword("a".repeat(8)).password).toBeUndefined();
    expect(withPassword("a".repeat(128)).password).toBeUndefined();
    expect(withPassword("a".repeat(129)).password).toBe(authMessages.password);
    expect(withPassword("  공백도  허용 ").password).toBeUndefined();
    // 이모지는 UTF-16으로 2칸이지만 1문자로 센다(백엔드 len과 동일)
    expect(withPassword("🥔".repeat(8)).password).toBeUndefined();
    expect(withPassword("🥔".repeat(128)).password).toBeUndefined();
  });

  it("비밀번호 확인이 비어 있으면 다시 입력하라고 안내한다", () => {
    expect(validateSignup({ ...validSignup, passwordConfirm: "" }).passwordConfirm).toBe(authMessages.passwordConfirmRequired);
  });

  it("비밀번호 확인이 다르면 불일치 에러를 낸다(대소문자·공백 구분)", () => {
    expect(validateSignup({ ...validSignup, passwordConfirm: "gamja1235" })).toEqual({ passwordConfirm: authMessages.passwordMismatch });
    expect(validateSignup({ ...validSignup, passwordConfirm: "GAMJA1234" }).passwordConfirm).toBe(authMessages.passwordMismatch);
    expect(validateSignup({ ...validSignup, passwordConfirm: "gamja1234 " }).passwordConfirm).toBe(authMessages.passwordMismatch);
  });

  it("비밀번호가 규칙을 어기면 불일치 에러는 함께 내지 않는다", () => {
    expect(validateSignup({ ...validSignup, password: "short", passwordConfirm: "different" })).toEqual({ password: authMessages.password });
  });
});

describe("validateLogin", () => {
  it("올바른 입력이면 에러가 없다", () => {
    expect(validateLogin({ email: "potato@example.com", password: "gamja1234" })).toEqual({});
  });

  it("빈 값과 형식 오류를 5.4 규칙대로 거른다", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({ email: authMessages.email, password: authMessages.password });
    expect(validateLogin({ email: "potato", password: "gamja1234" })).toEqual({ email: authMessages.email });
  });
});

describe("로그인 후 이동 경로", () => {
  it("`/`로 시작하는 상대 경로만 허용한다", () => {
    expect(getSafeRedirectPath("/requests/new")).toBe("/requests/new");
    expect(getSafeRedirectPath("/requests/new?x=1")).toBe("/requests/new?x=1");
    for (const next of [undefined, null, "", "requests/new", "https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(getSafeRedirectPath(next)).toBe("/");
    }
  });

  it("로그인 경로에 next를 붙인다", () => {
    expect(getLoginPath("/requests/new")).toBe("/login?next=/requests/new");
    expect(getLoginPath("/a b&c")).toBe("/login?next=/a%20b%26c");
  });
});
