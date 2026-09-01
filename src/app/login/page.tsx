"use client";

import { FirebaseError } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Wrench } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { clientAuth } from "@/lib/firebaseClient";

const messages: Record<string, string> = {
  "auth/invalid-credential": "The email address or password is incorrect.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait and try again.",
  "auth/user-disabled": "This user account has been disabled.",
};

const TEST_ACCOUNT_ALIASES: Record<string, string> = {
  "test@fleetfix.co.za": "test@fleetfixpro.co.za",
};

function authenticationEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  return TEST_ACCOUNT_ALIASES[normalized] || normalized;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setNotice("");
    try {
      await setPersistence(clientAuth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(clientAuth, authenticationEmail(email), password);
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (caught) {
      const code = caught instanceof FirebaseError ? caught.code : "";
      setError(messages[code] || "We could not sign you in. Please try again.");
    } finally { setLoading(false); }
  }

  async function resetPassword() {
    setError(""); setNotice("");
    if (!email.trim()) { setError("Enter your email address first, then select Forgot password."); return; }
    try {
      await sendPasswordResetEmail(clientAuth, authenticationEmail(email));
      setNotice("Password reset email sent. Check your inbox.");
    } catch (caught) {
      const code = caught instanceof FirebaseError ? caught.code : "";
      setError(messages[code] || "We could not send the reset email.");
    }
  }

  return <main className="min-h-screen w-full bg-[#071426] text-slate-900 lg:grid lg:grid-cols-[1.08fr_0.92fr]">
    <section className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-[#0a2a51] via-[#0b3768] to-[#071426] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
      <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" /><div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl" />
      <Brand />
      <div className="relative max-w-2xl"><p className="mb-5 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">Everything in one place</p><h1 className="text-5xl font-black leading-[1.05] tracking-tight xl:text-6xl">Keep every vehicle, job and customer moving.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-blue-100/75">Your complete service operations workspace—from workshop intake to invoicing and every milestone between.</p><div className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">{["Live workshop visibility", "Secure team access", "Quotes to invoices", "Parts and stock control"].map((item) => <div key={item} className="flex items-center gap-3 text-sm font-bold text-blue-50"><CheckCircle2 className="text-cyan-300" size={18} />{item}</div>)}</div></div>
      <p className="relative text-xs font-semibold text-blue-200/60">FleetFix Pro · Built for modern service teams</p>
    </section>

    <section className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-5 py-10 sm:px-10"><div className="w-full max-w-md">
      <div className="mb-9 lg:hidden"><Brand dark /></div>
      <div className="mb-8"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><ShieldCheck size={24} /></div><h2 className="text-4xl font-black tracking-tight text-slate-950">Welcome back</h2><p className="mt-3 text-slate-500">Sign in to manage your FleetFix Pro workspace.</p></div>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email address" icon={<Mail size={19} />}><input autoComplete="email" autoFocus required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></Field>
        <Field label="Password" icon={<LockKeyhole size={19} />}><input autoComplete="current-password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></Field>
        <div className="flex items-center justify-between gap-4 text-sm"><label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-600"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 accent-blue-600" />Remember me</label><button type="button" onClick={() => void resetPassword()} className="font-black text-blue-700 hover:text-blue-900">Forgot password?</button></div>
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}{notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{notice}</div>}
        <button disabled={loading} type="submit" className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#0b3768] font-black text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#0d477f] disabled:opacity-60">{loading ? "Signing in…" : "Sign in to FleetFix Pro"}{!loading && <ArrowRight size={19} />}</button>
      </form>
      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={18} /><p>Your account is protected by Firebase Authentication. Contact your administrator if you need access.</p></div>
    </div></section>
  </main>;
}

function Brand({ dark = false }: { dark?: boolean }) { return <div className="relative flex items-center gap-3"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${dark ? "bg-[#0b3768] text-cyan-300" : "bg-cyan-400 text-[#071426]"}`}><Wrench size={25} /></div><div><p className={`text-xl font-black tracking-tight ${dark ? "text-slate-950" : "text-white"}`}>FleetFix Pro</p><p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-500">Workshop intelligence</p></div></div>; }
function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">{label}</span><span className="relative block"><span className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400">{icon}</span>{children}</span></label>; }
