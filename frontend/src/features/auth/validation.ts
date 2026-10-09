import type { Credentials, SignupInput } from "@/types/auth";

export type LoginErrors = Partial<Record<keyof Credentials, string>>;
export type SignupErrors = Partial<Record<keyof SignupInput, string>>;

export const authMessages = {
  email: "올바른 이메일 형식이 아닙니다.",
  password: "비밀번호는 8~128자로 입력해 주세요.",
  passwordMismatch: "비밀번호가 일치하지 않습니다.",
  passwordConfirmRequired: "비밀번호를 한 번 더 입력해 주세요.",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 백엔드(Python len)와 같게 UTF-16 코드 유닛이 아니라 문자(코드 포인트) 수로 센다.
function charLength(value: string) {
  return Array.from(value).length;
}

export function validateEmail(email: string): string | undefined {
  const trimmed = email.trim();
  const length = charLength(trimmed);
  if (length < 1 || length > 254 || !EMAIL_PATTERN.test(trimmed)) {
    return authMessages.email;
  }
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  const length = charLength(password);
  return length < 8 || length > 128 ? authMessages.password : undefined;
}

export function validatePasswordConfirm(password: string, passwordConfirm: string): string | undefined {
  if (passwordConfirm === "") return authMessages.passwordConfirmRequired;
  return password === passwordConfirm ? undefined : authMessages.passwordMismatch;
}

export function validateLogin(credentials: Credentials): LoginErrors {
  const errors: LoginErrors = {};
  const email = validateEmail(credentials.email);
  const password = validatePassword(credentials.password);
  if (email) errors.email = email;
  if (password) errors.password = password;
  return errors;
}

export function validateSignup(input: SignupInput): SignupErrors {
  const errors: SignupErrors = validateLogin(input);
  if (input.passwordConfirm === "") {
    errors.passwordConfirm = authMessages.passwordConfirmRequired;
  } else if (!errors.password && input.password !== input.passwordConfirm) {
    // 비밀번호 자체가 규칙을 어기면 불일치 에러는 함께 띄우지 않는다(백엔드 5.3과 동일).
    errors.passwordConfirm = authMessages.passwordMismatch;
  }
  return errors;
}
