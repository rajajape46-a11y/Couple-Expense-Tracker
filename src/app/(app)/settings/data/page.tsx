import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { undoImport } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { getImports } from "@/lib/data";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Import & export" };

export default async function DataPage() {
  const imports = await getImports();
  return (
    <main>
      <PageHeader
        title="Import & export"
        right={
          <Link href="/settings" className="flex items-center text-sm text-white/80">
            <ChevronLeft size={18} /> Settings
          </Link>
        }
      />

      <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">Export to Excel</h2>
        <p className="mt-1 text-sm text-muted">
          Downloads every expense in your &ldquo;Monthly expense log&rdquo; layout – Dashboard, Monthly
          Summary, dropdowns and all. Excel recalculates it when opened (click <em>Enable Editing</em> if
          it opens in Protected View). It also works as a backup.
        </p>
        <a
          href="/api/export"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 font-semibold text-white"
        >
          <Download size={18} /> Export to Excel
        </a>
      </section>

      <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">Import from Excel</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Works with your Monthly expense log file (old or new layout) and with files exported from here.
          You&apos;ll see a preview first. Rows with the same date, amount and merchant as an existing
          expense are treated as duplicates and skipped.
        </p>
        <ImportPanel />
      </section>

      {imports.length > 0 && (
        <section className="m-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-navy">Recent imports</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {imports.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.file_name}</p>
                  <p className="text-xs text-muted">
                    {new Date(i.created_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })} ·{" "}
                    {i.rows_added} added · {i.rows_skipped} skipped
                    {i.undone_at && " · undone"}
                  </p>
                </div>
                {!i.undone_at && i.rows_added > 0 && (
                  <form action={undoImport}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="rounded-lg border border-coral/40 px-3 py-1.5 text-xs font-semibold text-coral">
                      Undo
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
