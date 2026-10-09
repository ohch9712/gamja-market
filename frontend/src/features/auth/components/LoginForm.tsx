"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Credentials } from "@/types/auth";
import { useAuth } from "../AuthProvider";
import { toSubmitErrors } from "../errors";
import { validateLogin, type LoginErrors } from "../validation";
import { AuthField } from "./AuthField";

const fieldOrder: (keyof Credentials)[] = ["email", "password"];

function focusFirstError(errors: LoginErrors) {
  const firstField = fieldOrder.find((field) => errors[field]);
  if (firstField) document.getElementById(firstField)?.focus();
}

type LoginFormProps = {
  /** 로그인 성공 후 이동할 경로. `getSafeRedirectPath`를 거친 값이어야 한다. */
  redirectTo?: string;
};

export function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const router = useRouter();
  const { status, login } = useAuth();
  const [values, setValues] = useState<Credentials>({ email: "", password: "" });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 이미 로그인한 사용자가 들어오면 목록으로 보낸다. 로그인 직후 이동은 handleSubmit이 맡는다.
  useEffect(() => {
    if (status === "authenticated" && !submitting) router.replace("/");
  }, [status, submitting, router]);

  function updateField(field: keyof Credentials, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await login(values);
      router.push(redirectTo);
    } catch (error) {
      const result = toSubmitErrors(error, fieldOrder);
      setErrors(result.fieldErrors);
      setFormError(result.formError);
      setSubmitting(false);
      focusFirstError(result.fieldErrors);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {formError && <p className="form-alert" role="alert">{formError}</p>}
      <AuthField id="email" label="이메일" type="email" autoComplete="email" value={values.email} error={errors.email} placeholder="potato@example.com" onChange={(value) => updateField("email", value)} />
      <AuthField id="password" label="비밀번호" type="password" autoComplete="current-password" value={values.password} error={errors.password} onChange={(value) => updateField("password", value)} />
      <button type="submit" className="button button-primary button-large auth-submit" disabled={submitting}>{submitting ? "로그인 중…" : "로그인"}</button>
    </form>
  );
}
