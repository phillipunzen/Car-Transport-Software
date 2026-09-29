"use client";

import { createContext, startTransition, useActionState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { isNetworkError } from "@/lib/network";

export type FormState = { error?: string; ok?: string; offline?: boolean } | undefined;

export const FormPendingContext = createContext(false);

/**
 * Formular mit Server-Action, das Fehler-/Erfolgsmeldungen anzeigt.
 * - Wird bewusst über onSubmit ausgelöst: So bleiben Eingaben (z. B. Unterschriften)
 *   bei Validierungsfehlern erhalten – React setzt `<form action>` sonst zurück.
 * - Funkloch-sicher: Ohne Verbindung bleiben die Eingaben erhalten und werden
 *   automatisch gesendet, sobald wieder Netz da ist.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  onSubmitStart,
  onSuccess,
  onQueued,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSubmitStart?: () => void;
  onSuccess?: () => void;
  /** Wird aufgerufen, wenn das Senden mangels Verbindung zurückgestellt wurde */
  onQueued?: () => void;
}) {
  const queued = useRef<FormData | null>(null);
  const onQueuedRef = useRef(onQueued);
  onQueuedRef.current = onQueued;

  const safeAction = useCallback(
    async (prev: FormState, fd: FormData): Promise<FormState> => {
      const park = (): FormState => {
        queued.current = fd;
        onQueuedRef.current?.();
        return { offline: true };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) return park();
      try {
        const result = await action(prev, fd);
        queued.current = null;
        return result;
      } catch (e) {
        // Nur Verbindungsfehler abfangen – Weiterleitungen u. a. an Next.js durchreichen
        if (isNetworkError(e)) return park();
        throw e;
      }
    },
    [action],
  );

  const [state, formAction, pending] = useActionState(safeAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const resend = useCallback(() => {
    const fd = queued.current;
    if (fd && navigator.onLine) startTransition(() => formAction(fd));
  }, [formAction]);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccessRef.current?.();
    }
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (state?.error || state?.offline) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  // Zurückgestellte Eingaben automatisch senden, sobald wieder eine Verbindung besteht
  useEffect(() => {
    if (!state?.offline) return;
    window.addEventListener("online", resend);
    const timer = setInterval(resend, 20000);
    return () => {
      window.removeEventListener("online", resend);
      clearInterval(timer);
    };
  }, [state, resend]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        if (navigator.onLine) onSubmitStart?.();
        startTransition(() => formAction(fd));
      }}
    >
      {state?.offline && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>⚠ Keine Internetverbindung – deine Eingaben sind gesichert und werden automatisch gesendet, sobald wieder Netz da ist.</span>
          <button type="button" onClick={resend} className="shrink-0 font-semibold underline">
            Jetzt erneut senden
          </button>
        </div>
      )}
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state?.ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm break-all text-emerald-700">{state.ok}</div>}
      <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
    </form>
  );
}
