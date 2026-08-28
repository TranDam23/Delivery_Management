import clsx from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps): React.JSX.Element {
  return (
    <div
      className={clsx(
        "flex flex-col gap-[10px] rounded-dt border border-dt-border bg-dt-panel p-[18px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Nhan nhom noi dung trong the — chu nho, in hoa, mau mo (theo ban thiet ke). */
export function CardLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-dt-muted">{children}</p>
  );
}
