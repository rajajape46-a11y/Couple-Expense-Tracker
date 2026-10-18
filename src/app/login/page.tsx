import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <Image src="/icons/icon-192.png" alt="" width={64} height={64} className="mx-auto rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold text-navy">Couple Expenses</h1>
        <p className="mt-1 text-sm text-muted">Sign in to log and view your shared spending.</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-muted">
        Accounts are created by the owner in Supabase – there is no public sign-up.
      </p>
    </main>
  );
}
