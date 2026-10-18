import Image from "next/image";

export function PageHeader({
  title,
  subtitle,
  right,
  brand = false,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  /** Show the app icon before the title (home page). */
  brand?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 bg-navy px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {brand && (
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 shrink-0 rounded-xl ring-2 ring-white/15"
            />
          )}
          <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/70">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
    </header>
  );
}
