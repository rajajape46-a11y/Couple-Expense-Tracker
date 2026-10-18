"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

type Brief = {
  line: number;
  date: string | null;
  merchant: string;
  amount: number | null;
  category: string;
  reasons?: string[];
};
type Preview = {
  fileName: string;
  sheet: string;
  rows: unknown[];
  counts: { total: number; new: number; duplicate: number; problem: number };
  newRows: Brief[];
  duplicates: Brief[];
  problems: Brief[];
  missing: { category: string; subcategory: string }[];
};
type Result = { added: number; duplicates: number; problems: number };

export function ImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read the file.");
      setPreview(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: preview.fileName, rows: preview.rows, createMissing }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed.");
      setResult(json);
      setPreview(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canFix = preview && preview.missing.length > 0;
  const willAdd = preview ? preview.counts.new : 0;

  return (
    <div className="space-y-3">
      <label
        className={`flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas px-4 py-6 text-center text-sm font-medium text-navy ${busy ? "opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
          aria-label="Choose Excel file to import"
        />
        {busy && !preview ? "Reading file…" : "Choose an Excel file (.xlsx)"}
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-coral">{error}</p>}

      {result && (
        <p role="status" className="rounded-xl bg-teal-soft px-4 py-3 text-sm font-medium text-teal">
          Imported {result.added} new expense{result.added === 1 ? "" : "s"}. Skipped {result.duplicates} duplicate
          {result.duplicates === 1 ? "" : "s"}
          {result.problems ? ` and ${result.problems} row${result.problems === 1 ? "" : "s"} with problems` : ""}.
        </p>
      )}

      {preview && (
        <div className="space-y-3" data-testid="import-preview">
          <p className="text-sm text-muted">
            <strong className="text-ink">{preview.fileName}</strong> · sheet &ldquo;{preview.sheet}&rdquo; ·{" "}
            {preview.counts.total} rows
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Count label="New" value={preview.counts.new} tone="text-teal" />
            <Count label="Duplicates" value={preview.counts.duplicate} tone="text-muted" />
            <Count label="Problems" value={preview.counts.problem} tone="text-coral" />
          </div>

          {canFix && (
            <div className="rounded-xl bg-amber/10 p-3 text-sm">
              <p className="font-medium">These categories aren&apos;t in the app yet:</p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {preview.missing.map((m) => (
                  <li key={m.category + m.subcategory}>
                    {m.category}
                    {m.subcategory && <> → {m.subcategory}</>}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMissing}
                  onChange={(e) => setCreateMissing(e.target.checked)}
                  className="h-5 w-5 accent-teal"
                />
                Create them and import those rows too
              </label>
            </div>
          )}

          <Group title="New – will be added" rows={preview.newRows} />
          <Group title="Duplicates – already in the app, will be skipped" rows={preview.duplicates} />
          <Group title="Problems – will be skipped" rows={preview.problems} showReasons />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={busy}
              className="flex-1 rounded-xl border border-line bg-white px-4 py-3 font-semibold text-navy"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || (willAdd === 0 && !(canFix && createMissing))}
              className="flex-1 rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Importing…" : canFix && createMissing ? "Import" : `Import ${willAdd}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-canvas p-2">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Group({ title, rows, showReasons }: { title: string; rows: Brief[]; showReasons?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-xl border border-line bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        {title} ({rows.length})
      </summary>
      <ul className="max-h-64 divide-y divide-line overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.line} className="px-3 py-2">
            <div className="flex justify-between gap-2">
              <span className="truncate">
                <span className="text-muted">{r.date ?? "no date"}</span> · {r.merchant || "—"}
              </span>
              <span className="shrink-0 tabular-nums">{r.amount === null ? "—" : money(r.amount)}</span>
            </div>
            {showReasons && r.reasons && (
              <p className="text-xs text-coral">
                Row {r.line}: {r.reasons.join("; ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
