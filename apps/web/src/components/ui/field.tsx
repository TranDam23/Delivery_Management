import clsx from "clsx";

const CONTROL_CLASS =
  "h-[42px] w-full rounded-dt border border-dt-border bg-dt-panel2 px-3 text-[13px] text-dt-text " +
  "placeholder:text-dt-muted focus:border-dt-yellow focus:outline-none";

interface FieldShellProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** Khung nhan + o nhap + loi, dung chung cho input va select. */
export function FieldShell({
  label,
  required,
  error,
  hint,
  children,
  className,
}: FieldShellProps): React.JSX.Element {
  return (
    <label className={clsx("flex flex-col gap-[6px]", className)}>
      <span className="text-[11px] font-medium text-dt-muted">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {error ? <span className="text-[11px] text-dt-red">{error}</span> : null}
      {!error && hint ? <span className="text-[11px] text-dt-muted">{hint}</span> : null}
    </label>
  );
}

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export function TextField({
  label,
  error,
  hint,
  required,
  wrapperClassName,
  className,
  ...props
}: TextFieldProps): React.JSX.Element {
  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <input
        className={clsx(CONTROL_CLASS, error && "border-dt-red", className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export function SelectField({
  label,
  error,
  hint,
  required,
  wrapperClassName,
  className,
  children,
  ...props
}: SelectFieldProps): React.JSX.Element {
  return (
    <FieldShell
      label={label}
      required={required}
      error={error}
      hint={hint}
      className={wrapperClassName}
    >
      <select className={clsx(CONTROL_CLASS, error && "border-dt-red", className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}
