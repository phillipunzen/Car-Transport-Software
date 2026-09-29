import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
          <h2 className="section-title">{title}</h2>
          {actions}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  className = "",
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <div className={className}>
      <label htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        required={required}
        placeholder={placeholder}
        className="input"
        {...rest}
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Select({
  label,
  name,
  options,
  defaultValue,
  className = "",
  required,
  empty,
}: {
  label: string;
  name: string;
  options: Record<string, string> | { value: string; label: string }[];
  defaultValue?: string | null;
  className?: string;
  required?: boolean;
  empty?: string;
}) {
  const entries = Array.isArray(options) ? options.map((o) => [o.value, o.label]) : Object.entries(options);
  return (
    <div className={className}>
      <label htmlFor={name}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} required={required} className="input">
        {empty !== undefined && <option value="">{empty}</option>}
        {entries.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
  className = "",
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={rows} defaultValue={defaultValue ?? ""} placeholder={placeholder} className="input" />
    </div>
  );
}

export function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-900">{v || "–"}</dd>
        </div>
      ))}
    </dl>
  );
}
