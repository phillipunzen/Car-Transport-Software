import { requireCtx } from "@/lib/org";
import { aiModel } from "@/lib/ai";
import { recognitionMode } from "@/lib/recognition";
import { Card, PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";

export const metadata = { title: "KI-Erkennung" };

export default async function AiSettingsPage() {
  const ctx = await requireCtx();
  const mode = recognitionMode();
  return (
    <>
      <PageHeader title="KI-Erkennung" subtitle="Automatisches Auslesen von Fahrzeugfotos, Kfz-Scheinen und Belegen." />
      <SettingsNav active="ai" driver={ctx.role === "DRIVER"} fleet={ctx.org.moduleFleet} />
      <Card title="Aktive Erkennung">
        <p className="text-sm font-medium">
          {mode === "ai" ? `Claude (Modell: ${aiModel})` : mode === "ocr" ? "Lokale Texterkennung (OCR) auf dem eigenen Server" : "Automatische Erkennung ist deaktiviert"}
        </p>
        {mode !== "ai" && (
          <p className="mt-3 text-sm text-slate-600">Für die genauere Erkennung per Claude den Server-Administrator bitten, einen ANTHROPIC_API_KEY zu hinterlegen.</p>
        )}
        <p className="mt-3 text-sm text-slate-600">Erkannte Werte bitte immer prüfen. Schlägt die Erkennung fehl, bleibt die Eingabe manuell möglich.</p>
      </Card>
    </>
  );
}
