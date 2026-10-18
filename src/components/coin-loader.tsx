/**
 * Loading screen: coins drop into a jar that slowly fills, with a rotating
 * caption. Pure CSS (see globals.css), so it shows instantly on navigation.
 */
export function CoinLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-16">
      <span className="sr-only">{label}…</span>
      <svg viewBox="0 0 120 130" className="coin-loader h-32 w-32" aria-hidden>
        {/* coins */}
        {[0, 1, 2].map((i) => (
          <g key={i} className={`coin coin-${i}`}>
            <circle cx="60" cy="18" r="11" className={i === 1 ? "fill-amber" : "fill-teal"} />
            <circle cx="60" cy="18" r="7.5" fill="none" stroke="white" strokeOpacity=".45" strokeWidth="1.5" />
            <text x="60" y="22.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
              $
            </text>
          </g>
        ))}
        {/* jar */}
        <defs>
          <clipPath id="jar-inside">
            <path d="M30 56 h60 v52 a14 14 0 0 1 -14 14 h-32 a14 14 0 0 1 -14 -14 z" />
          </clipPath>
        </defs>
        <g clipPath="url(#jar-inside)">
          <rect x="26" y="56" width="68" height="70" className="jar-fill fill-teal/25" />
        </g>
        <path
          d="M30 56 h60 v52 a14 14 0 0 1 -14 14 h-32 a14 14 0 0 1 -14 -14 z"
          fill="none"
          className="stroke-navy"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <rect x="24" y="48" width="72" height="9" rx="4.5" className="fill-navy" />
      </svg>
      <div className="loader-captions mt-2 h-5 overflow-hidden text-sm font-medium text-muted">
        <p>Counting your coins…</p>
        <p>Tallying the receipts…</p>
        <p>Balancing the books…</p>
        <p>Counting your coins…</p>
      </div>
    </div>
  );
}

/** Coin loader plus faint placeholder cards shaped like a typical page. */
export function PageLoading() {
  return (
    <main>
      <div className="h-[calc(env(safe-area-inset-top)+4rem)] bg-navy" />
      <CoinLoader />
      <div className="space-y-3 px-4" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </main>
  );
}
