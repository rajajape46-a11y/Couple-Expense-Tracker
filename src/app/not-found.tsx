import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-navy">Not found</h1>
      <p className="mt-2 text-sm text-muted">That page or expense doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-navy px-4 py-3 font-semibold text-white">
        Go home
      </Link>
    </main>
  );
}
