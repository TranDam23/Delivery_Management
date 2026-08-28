import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "danger";

/** Ba bien the nut trong ban thiet ke: vang (chinh), vien xam (phu), do (nguy hiem). */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-dt-yellow text-[#0f0f12] hover:brightness-95",
  secondary: "border border-dt-border bg-dt-panel2 text-dt-text hover:border-dt-muted",
  danger: "bg-dt-red text-white hover:brightness-95",
};

/** Dung cho ca <button> lan <Link> de hai thu trong giong het nhau. */
export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-dt px-[18px] py-[11px] text-[13px] font-medium",
    "transition disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASS[variant],
    className,
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}
