import { Suspense } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { NavProgress } from "@/components/nav-progress";
import { getContext } from "@/lib/data";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { household, people, user } = await getContext();

  if (!household || people.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-xl font-bold text-navy">Almost there</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          You&apos;re signed in as <strong>{user.email}</strong>, but this login isn&apos;t linked to a
          household yet. Run <code>supabase/setup/01_setup_household.sql</code> (or{" "}
          <code>02_link_second_person.sql</code>) in the Supabase SQL Editor, then reload.
        </p>
        <form action={signOut} className="mt-6">
          <button className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-medium">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <div className="mx-auto max-w-xl pb-28">{children}</div>
      <BottomNav />
    </>
  );
}
