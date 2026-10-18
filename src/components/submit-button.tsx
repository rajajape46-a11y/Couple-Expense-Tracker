"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`rounded-xl px-4 py-3 font-semibold transition active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
