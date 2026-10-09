type AuthFieldProps = {
  id: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  value: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
};

export function AuthField({ id, label, type, autoComplete, value, error, hint, placeholder, onChange, onBlur }: AuthFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} type={type} autoComplete={autoComplete} inputMode={type === "email" ? "email" : undefined} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={describedBy} />
      {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}
