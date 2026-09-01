"use client";

import { onAuthStateChanged } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clientAuth } from "@/lib/firebaseClient";
import Navigation from "./Navigation";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const isLoginPage = pathname === "/login";

  useEffect(() => onAuthStateChanged(clientAuth, (user) => {
    setSignedIn(Boolean(user));
    setReady(true);

    if (!user && !isLoginPage) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user && isLoginPage) {
      router.replace("/");
    }
  }), [isLoginPage, pathname, router]);

  if (!ready || (!signedIn && !isLoginPage) || (signedIn && isLoginPage)) {
    return <div className="flex min-h-screen w-full items-center justify-center bg-slate-950"><div className="flex flex-col items-center gap-4 text-white"><div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400" /><p className="text-sm font-bold tracking-wide text-slate-300">Loading FleetFix Pro…</p></div></div>;
  }

  if (isLoginPage) return children;
  return <Navigation>{children}</Navigation>;
}
