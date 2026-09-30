"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { VehicleScan } from "@/components/vehicle-scan";
import { VehiclePicker } from "@/components/vehicle-picker";
import { RETURN_TYPE, TRANSPORT_MODE } from "@/lib/labels";
import type { effectiveConditions } from "@/lib/pricing";
import type { VehicleOption } from "@/lib/vehicles";
import { calculateRoute, locateAddress } from "@/app/(app)/orders/geo-actions";

export type OrderFormValues = Partial<Record<string, string>>;

export type CustomerOption = {
  id: string;
  name: string;
  displayName: string;
  contact: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  conditions: ReturnType<typeof effectiveConditions>;
};

type Prefix = "pickup" | "delivery";

const VEHICLE_FIELDS = ["licensePlate", "vin", "make", "model", "color", "firstRegistration", "vehicleType"] as const;

const minutesLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h ? `${h} Std. ${min} Min.` : `${min} Min.`;
};

function parseNum(s: string | undefined) {
  if (!s) return 0;
  const t = s.trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}

export function OrderForm({
  action,
  values,
  customers,
  members,
  vehicles,
  orderId,
  recognition,
  geo,
  mode = "order",
  quoteId,
  hidden,
  restricted = false,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  values?: OrderFormValues;
  customers: CustomerOption[];
  members: { id: string; name: string }[];
  vehicles: VehicleOption[];
  orderId?: string;
  recognition: "ai" | "ocr" | "off";
  geo: boolean;
  /** "quote": vereinfachtes Formular für Angebote (Eckdaten + Preis) */
  mode?: "order" | "quote";
  quoteId?: string;
  /** Zusätzliche versteckte Felder (z. B. Bezug zu einer Anfrage) */
  hidden?: Record<string, string>;
  /** Fahrer: ohne Kundenwechsel, Fahrerzuweisung und Preise */
  restricted?: boolean;
}) {
  const isQuote = mode === "quote";
  const recordId = orderId ?? quoteId;
  const initial = useMemo(() => ({ transportMode: "DRIVEN", pricingType: "FLAT", ...values }) as Record<string, string>, [values]);
  const [v, setV] = useState<Record<string, string>>(initial);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const setMany = (patch: Record<string, string | null | undefined>) =>
    setV((s) => ({ ...s, ...Object.fromEntries(Object.entries(patch).map(([k, val]) => [k, val ?? ""])) }));

  // ---- Lokaler Entwurf: Eingaben überleben Neuladen / Funkloch ----------------
  const draftKey = `${mode}-draft:${recordId ?? "new"}`;
  const [restored, setRestored] = useState(false);
  const skipSave = useRef(true);
  // Nach dem Absenden denselben Stand nicht erneut als Entwurf ablegen (sonst taucht er im nächsten neuen Auftrag auf)
  const submittedState = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, string>;
        if (JSON.stringify(draft) !== JSON.stringify(initial)) {
          setV(draft);
          setRestored(true);
        }
      }
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, [draftKey, initial]);
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        if (submittedState.current === JSON.stringify(v)) return;
        localStorage.setItem(draftKey, JSON.stringify(v));
      } catch {
        /* ignorieren */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [v, draftKey]);
  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignorieren */
    }
    setV(initial);
    setRestored(false);
  };

  // ---- Streckenberechnung -------------------------------------------------------
  const [route, setRoute] = useState<{ busy: boolean; msg?: string; error?: boolean }>({ busy: false });
  const [distanceAuto, setDistanceAuto] = useState(!initial.distanceKm);
  const lastRouteKey = useRef<string | null>(null);
  const addr = (p: Prefix) => ({ street: v[`${p}Street`] || null, zip: v[`${p}Zip`] || null, city: v[`${p}City`] || null });
  const routeKey = JSON.stringify([addr("pickup"), addr("delivery")]);
  const routeReady = Boolean((v.pickupZip || v.pickupCity) && (v.deliveryZip || v.deliveryCity));

  async function runRoute(force = false) {
    if (!geo || !routeReady) return;
    if (!force && lastRouteKey.current === routeKey) return;
    lastRouteKey.current = routeKey;
    setRoute({ busy: true, msg: "Strecke wird berechnet…" });
    const res = await calculateRoute(addr("pickup"), addr("delivery"));
    if (res.error || res.km === undefined) {
      setRoute({ busy: false, msg: res.error ?? "Keine Route gefunden", error: true });
      return;
    }
    setMany({ distanceKm: String(res.km).replace(".", ","), durationMinutes: String(res.minutes) });
    setDistanceAuto(true);
    setRoute({ busy: false, msg: `Berechnet: ${res.km.toLocaleString("de-DE")} km · ca. ${minutesLabel(res.minutes ?? 0)} Fahrzeit` });
  }

  useEffect(() => {
    if (!geo || !routeReady || !distanceAuto) return;
    const t = setTimeout(() => runRoute(false), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, distanceAuto, geo, routeReady]);

  // ---- Kunde / Fahrzeug -----------------------------------------------------------
  const customer = customers.find((c) => c.id === v.customerId);
  const copyCustomerAddress = (p: Prefix) => {
    if (!customer) return;
    setMany({
      [`${p}Name`]: customer.displayName,
      [`${p}Street`]: customer.street,
      [`${p}Zip`]: customer.zip,
      [`${p}City`]: customer.city,
      [`${p}Contact`]: customer.contact,
      [`${p}Phone`]: customer.phone,
    });
  };
  const applyVehicle = (veh: VehicleOption) => {
    setMany({
      vehicleId: veh.id,
      ...Object.fromEntries(VEHICLE_FIELDS.map((k) => [k, veh[k] ?? v[k] ?? ""])),
      ...(!v.customerId && veh.customerId ? { customerId: veh.customerId } : {}),
    });
  };
  const plate = (v.licensePlate ?? "").toUpperCase().replace(/[\s-]/g, "");
  const vin = (v.vin ?? "").toUpperCase().trim();
  const knownMatch =
    !v.vehicleId && (plate || vin)
      ? vehicles.find(
          (veh) => (vin.length === 17 && veh.vin === vin) || (plate.length >= 4 && veh.licensePlate?.replace(/[\s-]/g, "") === plate),
        )
      : undefined;

  const km = parseNum(v.distanceKm);
  const transport = v.pricingType === "PER_KM" ? km * parseNum(v.pricePerKm) : parseNum(v.price);
  const returnTotal = v.returnType === "FLAT" ? parseNum(v.returnFlat) : v.returnType === "PER_KM" ? km * parseNum(v.returnPerKm) : 0;
  const total = transport + returnTotal;

  /** Kunde gewählt: seine Konditionen (km-Preis, Rückreise) vorschlagen – vorhandene Eingaben bleiben */
  function selectCustomer(id: string) {
    const c = customers.find((x) => x.id === id)?.conditions;
    setV((s) => {
      const next: Record<string, string> = { ...s, customerId: id };
      if (!c) return next;
      const fmt = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
      if (c.pricePerKm !== null && (!s.pricePerKm || !recordId)) next.pricePerKm = fmt(c.pricePerKm);
      if (!recordId || !s.returnType || s.returnType === "NONE") {
        next.returnType = c.returnType;
        next.returnFlat = s.returnFlat || fmt(c.returnFlat);
        next.returnPerKm = s.returnPerKm || fmt(c.returnPerKm);
      }
      return next;
    });
  }

  const input = (name: string, label: string, opts: { className?: string; type?: string; required?: boolean; mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const { className = "", type = "text", required, mono, ...rest } = opts;
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
          value={v[name] ?? ""}
          onChange={(e) => set(name, e.target.value)}
          required={required}
          className={`input ${mono ? "font-mono uppercase" : ""}`}
          {...rest}
        />
      </div>
    );
  };

  const addressBlock = (p: Prefix, title: string) => (
    <fieldset className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="section-title">{title}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={!customer} onClick={() => copyCustomerAddress(p)} title={customer ? "" : "Bitte zuerst einen Kunden wählen"}>
            👤 Adresse vom Kunden
          </button>
          {geo && <LocateButton onAddress={(a) => setMany({ [`${p}Street`]: a.street, [`${p}Zip`]: a.zip, [`${p}City`]: a.city })} />}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {!isQuote && input(`${p}Name`, "Name / Firma", { className: "sm:col-span-2" })}
        {input(`${p}Street`, "Straße & Hausnummer", { className: "sm:col-span-2", autoComplete: "off" })}
        {input(`${p}Zip`, "PLZ", { inputMode: "numeric" })}
        {input(`${p}City`, "Ort")}
        {!isQuote && input(`${p}Contact`, "Ansprechpartner")}
        {!isQuote && input(`${p}Phone`, "Telefon", { type: "tel" })}
        {(!isQuote || p === "pickup") &&
          input(`${p}Date`, p === "pickup" ? (isQuote ? "Gewünschter Abholtermin" : "Abholtermin") : "Zustelltermin", { type: "datetime-local", className: "sm:col-span-2" })}
      </div>
    </fieldset>
  );

  return (
    <ActionForm
      action={action}
      className="space-y-6"
      onSubmitStart={() => {
        submittedState.current = JSON.stringify(v);
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignorieren */
        }
      }}
      onQueued={() => {
        // Ohne Netz: Entwurf auf dem Gerät behalten, falls die Seite geschlossen wird
        try {
          localStorage.setItem(draftKey, JSON.stringify(v));
        } catch {
          /* ignorieren */
        }
      }}
    >
      {recordId && <input type="hidden" name="id" value={recordId} />}
      {Object.entries(hidden ?? {}).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <input type="hidden" name="vehicleId" value={v.vehicleId ?? ""} />
      <input type="hidden" name="durationMinutes" value={v.durationMinutes ?? ""} />

      {restored && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>Nicht gespeicherte Eingaben von diesem Gerät wurden wiederhergestellt.</span>
          <button type="button" onClick={discardDraft} className="font-semibold underline">
            Verwerfen
          </button>
        </div>
      )}

      <section className="card card-body space-y-4">
        <h2 className="section-title">{isQuote ? "Angebot für" : "Auftrag"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {restricted ? (
            <div className="sm:col-span-2">
              <label>Kunde</label>
              <p className="mt-1 text-sm font-medium">{customer?.displayName ?? "–"}</p>
              <input type="hidden" name="customerId" value={v.customerId ?? ""} />
            </div>
          ) : (
          <div className="sm:col-span-2">
            <label htmlFor="customerId">
              Kunde <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <select id="customerId" name="customerId" value={v.customerId ?? ""} onChange={(e) => selectCustomer(e.target.value)} required className="input">
                <option value="">Bitte wählen…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!recordId && (
                <Link href={isQuote ? "/customers/new" : "/customers/new?returnTo=order"} className="btn-secondary mt-1 shrink-0">
                  + Neu
                </Link>
              )}
            </div>
          </div>
          )}
          <div>
            <label htmlFor="transportMode">Überführungsart</label>
            <select id="transportMode" name="transportMode" value={v.transportMode} onChange={(e) => set("transportMode", e.target.value)} className="input">
              {Object.entries(TRANSPORT_MODE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {!isQuote && input("reference", "Referenz / Bestellnr. des Kunden")}
          <div className={isQuote || restricted ? "hidden" : "sm:col-span-2"}>
            <label htmlFor="assignedToId">Fahrer</label>
            <select id="assignedToId" name="assignedToId" value={v.assignedToId ?? ""} onChange={(e) => set("assignedToId", e.target.value)} className="input">
              <option value="">Nicht zugewiesen</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="card card-body space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Fahrzeug</h2>
          {v.vehicleId && (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              Aus Fahrzeugbestand übernommen
              <button type="button" className="text-brand-600 underline" onClick={() => set("vehicleId", "")}>
                lösen
              </button>
            </span>
          )}
        </div>
        {vehicles.length > 0 && <VehiclePicker vehicles={vehicles} customerId={v.customerId} onSelect={applyVehicle} />}
        {recognition !== "off" && !isQuote && (
          <VehicleScan
            orderId={orderId}
            mode={recognition}
            onResult={(d) =>
              setV((s) => ({
                ...s,
                licensePlate: d.licensePlate ?? s.licensePlate ?? "",
                make: d.make ?? s.make ?? "",
                model: d.model ?? s.model ?? "",
                vin: d.vin ?? s.vin ?? "",
                color: d.color ?? s.color ?? "",
                firstRegistration: d.firstRegistration ?? s.firstRegistration ?? "",
              }))
            }
          />
        )}
        {knownMatch && (
          <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Fahrzeug bereits bekannt: <strong>{[knownMatch.make, knownMatch.model].filter(Boolean).join(" ") || "Fahrzeug"}</strong>{" "}
              {knownMatch.licensePlate && `(${knownMatch.licensePlate})`}
            </span>
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => applyVehicle(knownMatch)}>
              Daten übernehmen
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {input("licensePlate", "Kennzeichen", { mono: true })}
          {!isQuote && input("vin", "Fahrgestellnummer (FIN)", { mono: true, maxLength: 17 })}
          {input("make", "Marke")}
          {input("model", "Modell")}
          {!isQuote && input("color", "Farbe")}
          {!isQuote && input("firstRegistration", "Erstzulassung")}
          {!isQuote && input("vehicleType", "Fahrzeugtyp (z. B. PKW, Transporter, Wohnmobil)", { className: "sm:col-span-2" })}
        </div>
      </section>

      <section className="card card-body grid gap-8 lg:grid-cols-2">
        {addressBlock("pickup", "Abholung")}
        {addressBlock("delivery", "Zustellung")}
      </section>

      <section className="card card-body space-y-4">
        <h2 className="section-title">{restricted ? "Strecke" : "Strecke & Preis"}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="distanceKm">Entfernung (km)</label>
            <div className="flex gap-2">
              <input
                id="distanceKm"
                name="distanceKm"
                inputMode="decimal"
                value={v.distanceKm ?? ""}
                onChange={(e) => {
                  set("distanceKm", e.target.value);
                  setDistanceAuto(false);
                }}
                className="input"
              />
              {geo && (
                <button
                  type="button"
                  className="btn-secondary mt-1 shrink-0 px-3"
                  disabled={route.busy || !routeReady}
                  onClick={() => runRoute(true)}
                  title="Strecke aus Abhol- und Zieladresse berechnen"
                >
                  {route.busy ? "…" : "↻"}
                </button>
              )}
            </div>
            {route.msg ? (
              <p className={`mt-1 text-xs ${route.error ? "text-red-600" : "text-slate-500"}`}>{route.msg}</p>
            ) : v.durationMinutes ? (
              <p className="mt-1 text-xs text-slate-500">ca. {minutesLabel(Number(v.durationMinutes))} Fahrzeit</p>
            ) : geo ? (
              <p className="mt-1 text-xs text-slate-500">Wird aus den Adressen automatisch berechnet.</p>
            ) : null}
          </div>
          {!restricted && (
          <div>
            <label htmlFor="pricingType">Abrechnung</label>
            <select id="pricingType" name="pricingType" value={v.pricingType} onChange={(e) => set("pricingType", e.target.value)} className="input">
              <option value="FLAT">Pauschalpreis</option>
              <option value="PER_KM">Nach Kilometern</option>
            </select>
          </div>
          )}
          {!restricted &&
            (v.pricingType === "FLAT"
              ? input("price", "Pauschale netto (€)", { inputMode: "decimal" })
              : input("pricePerKm", "Preis je km netto (€)", { inputMode: "decimal" }))}
        </div>
        <div className={restricted ? "hidden" : "grid gap-4 sm:grid-cols-3"}>
          <div>
            <label htmlFor="returnType">Rückreise des Fahrers</label>
            <select id="returnType" name="returnType" value={v.returnType ?? "NONE"} onChange={(e) => set("returnType", e.target.value)} className="input">
              {Object.entries(RETURN_TYPE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {v.returnType === "FLAT" && input("returnFlat", "Rückreise-Pauschale netto (€)", { inputMode: "decimal" })}
          {v.returnType === "PER_KM" && input("returnPerKm", "Rückreise je km netto (€)", { inputMode: "decimal" })}
          {v.returnType === "RECEIPTS" && (
            <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">Bahn-, Bus- und Taxibelege werden im Auftrag unter „Belege“ erfasst und weiterberechnet.</p>
          )}
        </div>
        {total > 0 && !restricted && (
          <p className="text-sm text-slate-600">
            Auftragswert: <strong>{total.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</strong> netto
            {returnTotal > 0 && ` (davon Rückreise ${returnTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })})`}
          </p>
        )}
        <div className={isQuote ? "hidden" : ""}>
          <label htmlFor="notes">Notizen / Hinweise für den Fahrer</label>
          <textarea id="notes" name="notes" rows={3} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} className="input" />
        </div>
      </section>

      <div className="sticky bottom-20 z-10 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:bottom-4">
        {isQuote ? (
          <SubmitButton name="intent" value="close" pendingText="Wird gespeichert…">
            {quoteId ? "Eckdaten speichern" : "Angebot erstellen"}
          </SubmitButton>
        ) : orderId ? (
          <>
            <SubmitButton name="intent" value="stay" className="btn-secondary">
              Zwischenspeichern
            </SubmitButton>
            <SubmitButton name="intent" value="close">
              Speichern & schließen
            </SubmitButton>
          </>
        ) : (
          <>
            <SubmitButton name="intent" value="stay" className="btn-secondary" pendingText="Wird angelegt…">
              Anlegen & weiter bearbeiten
            </SubmitButton>
            <SubmitButton name="intent" value="close" pendingText="Wird angelegt…">
              Auftrag anlegen
            </SubmitButton>
          </>
        )}
        <Link href={isQuote ? (quoteId ? `/quotes/${quoteId}` : "/quotes") : orderId ? `/orders/${orderId}` : "/orders"} className="btn-ghost">
          Abbrechen
        </Link>
      </div>
    </ActionForm>
  );
}

/** Ermittelt die Adresse zum aktuellen Standort (GPS des Geräts). */
function LocateButton({ onAddress }: { onAddress: (a: { street: string | null; zip: string | null; city: string | null }) => void }) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  function locate() {
    if (!("geolocation" in navigator)) return setState({ busy: false, error: "Standort wird von diesem Gerät nicht unterstützt." });
    if (!window.isSecureContext) return setState({ busy: false, error: "Standort funktioniert nur über HTTPS." });
    setState({ busy: true });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await locateAddress(pos.coords.latitude, pos.coords.longitude);
        if (res.address) {
          onAddress(res.address);
          setState({ busy: false });
        } else setState({ busy: false, error: res.error });
      },
      (err) =>
        setState({
          busy: false,
          error: err.code === err.PERMISSION_DENIED ? "Standortzugriff wurde nicht erlaubt." : "Standort konnte nicht ermittelt werden.",
        }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  return (
    <span className="flex flex-col items-end">
      <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={state.busy} onClick={locate}>
        {state.busy ? "Wird geortet…" : "📍 Mein Standort"}
      </button>
      {state.error && <span className="mt-1 text-xs text-red-600">{state.error}</span>}
    </span>
  );
}
