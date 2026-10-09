import { ApiError, NETWORK_ERROR_MESSAGE, UNKNOWN_ERROR_MESSAGE } from "@/lib/api-client";

export const authErrorMessages = {
  emailAlreadyExists: "이미 가입된 이메일입니다.",
  invalidCredentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  validation: "입력값을 확인해 주세요.",
} as const;

export type SubmitErrors<Field extends string> = {
  fieldErrors: Partial<Record<Field, string>>;
  formError: string | null;
};

// 서버 에러(5.1 포맷)를 폼의 필드별 메시지와 폼 상단 안내로 나눈다.
export function toSubmitErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[],
): SubmitErrors<Field> {
  const fieldErrors: Partial<Record<Field, string>> = {};
  if (!(error instanceof ApiError)) {
    return { fieldErrors, formError: UNKNOWN_ERROR_MESSAGE };
  }

  const isField = (field: string): field is Field => (fields as readonly string[]).includes(field);
  switch (error.code) {
    case "NETWORK_ERROR":
      return { fieldErrors, formError: NETWORK_ERROR_MESSAGE };
    case "INVALID_CREDENTIALS":
      return { fieldErrors, formError: authErrorMessages.invalidCredentials };
    case "EMAIL_ALREADY_EXISTS": {
      const emailField = "email";
      if (isField(emailField)) {
        fieldErrors[emailField] = authErrorMessages.emailAlreadyExists;
        return { fieldErrors, formError: null };
      }
      return { fieldErrors, formError: authErrorMessages.emailAlreadyExists };
    }
    case "VALIDATION_ERROR": {
      for (const detail of error.details) {
        if (isField(detail.field) && !fieldErrors[detail.field]) {
          fieldErrors[detail.field] = detail.message;
        }
      }
      const mapped = Object.keys(fieldErrors).length > 0;
      return { fieldErrors, formError: mapped ? null : error.message || authErrorMessages.validation };
    }
    default:
      return { fieldErrors, formError: UNKNOWN_ERROR_MESSAGE };
  }
}
