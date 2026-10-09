"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SignupInput } from "@/types/auth";
import { useAuth } from "../AuthProvider";
import { toSubmitErrors } from "../errors";
import { authMessages, validateSignup, type SignupErrors } from "../validation";
import { AuthField } from "./AuthField";

const fieldOrder: (keyof SignupInput)[] = ["email", "password", "passwordConfirm"];

function focusFirstError(errors: SignupErrors) {
  const firstField = fieldOrder.find((field) => errors[field]);
  if (firstField) document.getElementById(firstField)?.focus();
}

export function SignupForm() {
  const router = useRouter();
  const { status, signup } = useAuth();
  const [values, setValues] = useState<SignupInput>({ email: "", password: "", passwordConfirm: "" });
  const [errors, setErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 이미 로그인한 사용자가 들어오면 목록으로 보낸다. 가입 직후 이동은 handleSubmit이 맡는다.
  useEffect(() => {
    if (status === "authenticated" && !submitting) router.replace("/");
  }, [status, submitting, router]);

  function updateField(field: keyof SignupInput, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    setErrors((current) => {
      const updated: SignupErrors = { ...current, [field]: undefined };
      const bothFilled = next.password !== "" && next.passwordConfirm !== "";
      if (field === "passwordConfirm" && bothFilled && next.password !== next.passwordConfirm) {
        updated.passwordConfirm = authMessages.passwordMismatch;
      }
      if (field === "password" && bothFilled && next.password === next.passwordConfirm) {
        updated.passwordConfirm = undefined;
      }
      return updated;
    });
  }

  function handlePasswordConfirmBlur() {
    if (values.passwordConfirm !== "" && values.password !== values.passwordConfirm) {
      setErrors((current) => ({ ...current, passwordConfirm: authMessages.passwordMismatch }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateSignup(values);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await signup(values);
      router.push("/");
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
      <AuthField id="password" label="비밀번호" type="password" autoComplete="new-password" value={values.password} error={errors.password} hint="8~128자로 입력해 주세요." onChange={(value) => updateField("password", value)} />
      <AuthField id="passwordConfirm" label="비밀번호 확인" type="password" autoComplete="new-password" value={values.passwordConfirm} error={errors.passwordConfirm} hint="같은 비밀번호를 한 번 더 입력해 주세요." onChange={(value) => updateField("passwordConfirm", value)} onBlur={handlePasswordConfirmBlur} />
      <button type="submit" className="button button-primary button-large auth-submit" disabled={submitting}>{submitting ? "가입 중…" : "가입하기"}</button>
    </form>
  );
}
