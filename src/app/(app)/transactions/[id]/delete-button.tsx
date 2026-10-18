"use client";

import { useFormStatus } from "react-dom";

export function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("Delete this expense?")) e.preventDefault();
      }}
      className="w-full rounded-xl border border-coral/40 bg-white px-4 py-3 font-semibold text-coral disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete expense"}
    </button>
  );
}
