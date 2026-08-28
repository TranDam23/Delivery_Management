
interface PageHeaderProps {
  heading: string;
  subtitle: string;
  action?: React.ReactNode;
}

export function PageHeader({ heading, subtitle, action }: PageHeaderProps): React.JSX.Element {
  return (
    <header className="flex min-h-[68px] items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{heading}</h1>
        <p className="text-[12px] text-dt-muted">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
