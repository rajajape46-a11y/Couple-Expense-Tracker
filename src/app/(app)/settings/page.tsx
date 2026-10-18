import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { getCategories, getContext } from "@/lib/data";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, people, household } = await getContext();
  const categories = await getCategories(true);
  return (
    <main>
      <PageHeader title="Settings" subtitle={household?.name} />

      <section className="p-4">
        <h2 className="mb-1 font-semibold text-navy">Categories & budgets</h2>
        <p className="mb-3 text-sm text-muted">
          Tap a category to rename it, set a monthly budget, or add sub-categories. Hiding keeps past
          expenses intact but removes it from the Add screen.
        </p>
        <CategoryManager categories={categories} />
      </section>

      <section className="mx-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">People</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {people.map((p) => (
            <li key={p.id} className="flex justify-between">
              <span>{p.name}</span>
              <span className="text-muted">{p.user_id ? "has login" : "no login yet"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm text-muted">Signed in as {user.email}</p>
        <form action={signOut} className="mt-3">
          <button className="w-full rounded-xl border border-line px-4 py-3 font-semibold text-navy">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
