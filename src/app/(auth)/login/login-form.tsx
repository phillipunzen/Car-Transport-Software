"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "../actions";

/** Anmeldung mit optionalem zweiten Schritt (Code aus der Authenticator-App). */
export function LoginForm({ callbackUrl, defaultEmail = "" }: { callbackUrl?: string; defaultEmail?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const step2 = Boolean(state?.needsCode);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />
      <div className={step2 ? "hidden" : "space-y-4"}>
        <div>
          <label htmlFor="email">E-Mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="password">Passwort</label>
            <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-xs font-medium text-brand-600">
              Passwort vergessen?
            </Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </div>
      </div>
      {step2 && (
        <div>
          <label htmlFor="code">Bestätigungscode</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required placeholder="123456" className="input text-center font-mono text-lg tracking-widest" />
          <p className="mt-1 text-xs text-slate-500">6-stelliger Code aus deiner Authenticator-App – oder einer deiner Wiederherstellungscodes.</p>
        </div>
      )}
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Anmelden…" : step2 ? "Bestätigen" : "Anmelden"}
      </button>
    </form>
  );
}
