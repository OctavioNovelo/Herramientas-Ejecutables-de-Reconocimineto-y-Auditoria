// Utilidades de presentación compartidas por las tres direcciones visuales.

import type { ScanStats, Device } from "../api/heraApi";

// Escapa texto que viene de la red (hostnames, títulos http, salidas de scripts NSE)
// antes de meterlo en innerHTML: un dispositivo puede anunciar cualquier cadena.
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Semáforo de 3 estados. Nunca se comunica solo por color: cada estado lleva también su texto.
export type Estado = "seguro" | "alerta" | "riesgo" | "sin-datos";

export const ESTADO_TEXTO: Record<Estado, string> = {
  seguro: "Segura",
  alerta: "En alerta",
  riesgo: "En riesgo",
  "sin-datos": "Sin diagnóstico",
};

// Nombre del dispositivo si lo tiene de verdad (hostname o fabricante). utils/parser.py pone
// "Dispositivo Desconocido" cuando no hay ninguno: eso no cuenta como nombre.
export function nombreDe(d: { device?: string | null }): string | null {
  const n = (d.device ?? "").trim();
  return n && !/^dispositivo desconocido$/i.test(n) ? n : null;
}

export function estadoRed(stats: ScanStats | null, hasResults: boolean): Estado {
  if (!stats || !hasResults) return "sin-datos";
  if (stats.risk_level === "CRÍTICO" || stats.risk_level === "ALTO") return "riesgo";
  if (stats.risk_level === "MEDIO") return "alerta";
  return "seguro";
}

export function estadoHost(dev: Device): Estado {
  const sev = dev.vulnerabilities.map((v) => v.severity);
  if (sev.includes("critical") || sev.includes("high")) return "riesgo";
  if (sev.includes("medium") || dev.ports.some((p) => PUERTOS_SENSIBLES.has(p))) return "alerta";
  return "seguro";
}

// Puertos cuya sola exposición merece revisión aunque no haya CVE confirmado.
export const PUERTOS_SENSIBLES = new Set([21, 23, 3389, 5900, 7547, 8291, 1433, 3306, 623]);

export function formatoReloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

// Cuenta hacia arriba un número en un elemento (gauge). Respeta prefers-reduced-motion.
export function contarHasta(el: HTMLElement, destino: number, ms = 700) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce || destino === 0) {
    el.textContent = String(destino);
    return;
  }
  const t0 = performance.now();
  let terminado = false;
  const paso = (t: number) => {
    if (terminado) return;
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(destino * e));
    if (k < 1) requestAnimationFrame(paso);
    else terminado = true;
  };
  requestAnimationFrame(paso);
  // Si el navegador deja de dar cuadros de animación (ventana oculta, render sin composición),
  // el número no se puede quedar a medias: a los ms + 150 se fija el valor final.
  setTimeout(() => {
    terminado = true;
    el.textContent = String(destino);
  }, ms + 150);
}

// Calidad de respuesta según la latencia, en barras como las del wifi (4 = respuesta inmediata).
// Mide lo rápido que contesta el equipo, no la intensidad de la señal inalámbrica.
export function barrasRespuesta(ms: number): number {
  return ms <= 2 ? 4 : ms <= 8 ? 3 : ms <= 30 ? 2 : 1;
}
export function respuestaSvg(ms: number): string {
  const n = barrasRespuesta(ms);
  const texto = ["", "respuesta lenta", "respuesta regular", "respuesta buena", "respuesta inmediata"][n];
  return `<span class="resp" role="img" aria-label="${texto}, ${ms.toFixed(1)} ms" title="${texto}, ${ms.toFixed(1)} ms">${[1, 2, 3, 4].map((i) => `<i${i <= n ? ' class="on"' : ""}></i>`).join("")}</span>`;
}
