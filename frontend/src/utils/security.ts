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

// Semáforo de 3 estados. Nunca se comunica solo por color: cada estado tiene forma y texto.
export type Estado = "seguro" | "alerta" | "riesgo" | "sin-datos";

export const ESTADO_TEXTO: Record<Estado, string> = {
  seguro: "Segura",
  alerta: "En alerta",
  riesgo: "En riesgo",
  "sin-datos": "Sin diagnóstico",
};

// SVG de forma por estado (círculo, triángulo, rombo, anillo vacío), 12×12, currentColor.
export const ESTADO_FORMA: Record<Estado, string> = {
  seguro: `<svg class="hera-shape" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>`,
  alerta: `<svg class="hera-shape" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 L11.2 10.5 H0.8 Z" fill="currentColor"/></svg>`,
  riesgo: `<svg class="hera-shape" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.6 L11.4 6 L6 11.4 L0.6 6 Z" fill="currentColor"/></svg>`,
  "sin-datos": `<svg class="hera-shape" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
};

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
  const paso = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(destino * e));
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
