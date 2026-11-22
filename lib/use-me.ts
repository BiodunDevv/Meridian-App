"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export interface Me {
  email: string;
  username: string;
  name: string;
  role: "investor" | "staff" | "admin";
}

const noop = () => () => {};

/**
 * Signed-in state for the public pages. The landing page is statically rendered, so we read a
 * small non-sensitive cookie for an instant answer, then confirm and fetch details from /api/me.
 */
export function useMe() {
  const hint = useSyncExternalStore(
    noop,
    () => /(?:^|;\s*)apx_hint=1/.test(document.cookie),
    () => false,
  );
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  // Always ask the server once. Sessions created before the hint cookie existed have no cookie,
  // so the hint can speed things up but must never be the only signal.
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user: Me | null }) => {
        if (!live) return;
        setMe(j.user);
        const has = /(?:^|;\s*)apx_hint=1/.test(document.cookie);
        if (j.user && !has)
          document.cookie = "apx_hint=1; path=/; max-age=2592000; samesite=lax";
        if (!j.user && has) document.cookie = "apx_hint=; Max-Age=0; path=/";
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Confirmed by the server, or (until it answers) the cookie says so.
  const signedIn = Boolean(me) || (hint && me !== null);
  return {
    signedIn,
    me: me ?? null,
    dashboardHref:
      me?.role === "admin" || me?.role === "staff" ? "/admin" : "/dashboard",
  };
}
