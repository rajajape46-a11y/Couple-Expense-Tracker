"use client";

import { useActionState, useState } from "react";
import { signIn } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [state, action] = useActionState(signIn, null);
  // Controlled so the email survives a failed attempt (React resets forms after an action).
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-teal"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-teal"
        />
      </label>
      {state && !state.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-coral">
          {state.message}
        </p>
      )}
      <SubmitButton pendingText="Signing in…" className="w-full bg-navy text-white">
        Sign in
      </SubmitButton>
    </form>
  );
}
