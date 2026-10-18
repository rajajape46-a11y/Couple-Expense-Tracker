export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 bg-navy px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/70">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
