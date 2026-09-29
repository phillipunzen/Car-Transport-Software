"use client";

import { useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingContext } from "@/components/action-form";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Speichern…",
  confirm,
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(FormPendingContext);
  const pending = formPending || actionPending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
