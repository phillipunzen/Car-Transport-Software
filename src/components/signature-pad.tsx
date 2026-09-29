"use client";

import { useEffect, useRef, useState } from "react";

/** Unterschriftenfeld für Finger, Stift oder Maus. Wert = PNG als Data-URL. */
export function SignaturePad({
  name,
  label,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    if (defaultValue) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight);
      img.src = defaultValue;
    }
  }, [defaultValue]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function start(e: React.PointerEvent) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const v = canvas.current!.toDataURL("image/png");
    setValue(v);
    onChange?.(v);
  }
  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setValue("");
    onChange?.("");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label>{label}</label>
        <button type="button" onClick={clear} className="text-xs text-slate-500 hover:text-slate-800">
          Löschen
        </button>
      </div>
      <canvas
        ref={canvas}
        className="mt-1 h-40 w-full touch-none rounded-lg border border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <p className="mt-1 text-xs text-slate-400">{value ? "✔ Unterschrieben" : "Bitte hier unterschreiben"}</p>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
