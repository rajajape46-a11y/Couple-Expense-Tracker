"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, List, Plus, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Expenses", icon: List },
  { href: "/add", label: "Add", icon: Plus, primary: true },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {items.map(({ href, label, icon: Icon, ...rest }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          const primary = "primary" in rest;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  active ? "text-navy" : "text-muted"
                }`}
              >
                {primary ? (
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-teal text-white shadow-lg ring-4 ring-canvas">
                    <Icon size={26} strokeWidth={2.5} />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
