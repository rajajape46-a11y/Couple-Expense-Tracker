"use client";

import { useFormStatus } from "react-dom";

/** Red outline submit button that asks for confirmation first. */
export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="w-full rounded-xl border border-coral/40 bg-white px-4 py-3 font-semibold text-coral disabled:opacity-60"
    >
      {pending ? "Deleting…" : children}
    </button>
  );
}
