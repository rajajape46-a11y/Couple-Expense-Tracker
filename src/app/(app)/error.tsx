"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-navy">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-navy px-4 py-3 font-semibold text-white">
        Try again
      </button>
    </main>
  );
}
