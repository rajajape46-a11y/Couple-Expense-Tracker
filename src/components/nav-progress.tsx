"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin animated bar at the very top of the screen that starts the moment a
 * link is tapped and finishes when the next page is on screen – so a tap
 * always gives instant feedback, even on a slow connection.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = `${path}?${search}`;
  const [lastUrl, setLastUrl] = useState(current);

  // A new URL has rendered → finish the bar (state derived during render).
  if (lastUrl !== current) {
    setLastUrl(current);
    if (state === "loading") setState("done");
  }

  useEffect(() => {
    if (state !== "done") return;
    timer.current = setTimeout(() => setState("idle"), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
    }
    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement;
      if (form.method.toLowerCase() === "get") setState("loading"); // e.g. search
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <div aria-hidden className={`nav-progress nav-progress-${state}`}>
      <div className="nav-progress-bar" />
    </div>
  );
}
