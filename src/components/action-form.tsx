"use client";

import { createContext, startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

export type FormState = { error?: string; ok?: string } | undefined;

export const FormPendingContext = createContext(false);

/**
 * Formular mit Server-Action, das Fehler-/Erfolgsmeldungen anzeigt.
 * Wird bewusst über onSubmit ausgelöst: So bleiben Eingaben (z. B. Unterschriften)
 * bei Validierungsfehlern erhalten – React setzt `<form action>` sonst zurück.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  onSubmitStart,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSubmitStart?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (state?.error) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        onSubmitStart?.();
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state?.ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm break-all text-emerald-700">{state.ok}</div>}
      <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
    </form>
  );
}
