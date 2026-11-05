// Carta pequeña (la de A, vista desde arriba) para ubicarse cuando la red es grande: muestra
// dónde caen los hosts que encontró el buscador y cuál está elegido. Solo lleva etiqueta el
// host elegido y el que está bajo el cursor; el resto se identifica en el índice.

import type { Device } from "../api/heraApi";
import { esc, estadoHost, ESTADO_TEXTO, Estado } from "../utils/security";

const W = 420;
const H = 340;
const CX = W / 2;
const CY = H / 2;
const R_MIN = 34;
const R_MAX = 150;
const BANDAS_MS = [1, 2, 4, 8];
const NS = "http://www.w3.org/2000/svg";

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 8));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function forma(estado: Estado, x: number, y: number, s = 4.6): string {
  if (estado === "riesgo") return `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z"/>`;
  if (estado === "alerta") return `<path d="M${x} ${y - s} L${x + s * 0.95} ${y + s * 0.72} H${x - s * 0.95} Z"/>`;
  return `<circle cx="${x}" cy="${y}" r="${s * 0.75}"/>`;
}

// Curva de nivel ligeramente irregular, como en la carta de A.
function contorno(r: number, semilla: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const k = 1 + 0.03 * Math.sin(3 * t + semilla) + 0.018 * Math.sin(5 * t + semilla * 1.7);
    pts.push(`${(CX + Math.cos(t) * r * k).toFixed(1)},${(CY + Math.sin(t) * r * k * 0.86).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export class Minimapa {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private etiqueta: SVGGElement | null = null;
  private seleccionado: string | null = null;
  private onSelect: (ip: string) => void;
  private puntos = new Map<string, { x: number; y: number; d: Device }>();

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "minimapa";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-label", "Carta de la red: hosts por latencia y estado");
    this.el.appendChild(this.svg);
  }

  getElement() {
    return this.el;
  }

  setScanning(on: boolean) {
    this.el.classList.toggle("is-scanning", on);
  }

  select(ip: string | null) {
    this.seleccionado = ip;
    this.svg.querySelectorAll<SVGGElement>(".mm-pin").forEach((g) => g.classList.toggle("is-selected", g.dataset.ip === ip));
    this.rotular(ip);
  }

  setVisibles(ips: Set<string> | null) {
    this.svg.querySelectorAll<SVGGElement>(".mm-pin").forEach((g) => {
      const dentro = !ips || ips.has(g.dataset.ip!);
      g.classList.toggle("is-fuera", !dentro);
      g.classList.toggle("is-encontrado", !!ips && dentro);
    });
  }

  update(devices: Device[]) {
    const maxMs = Math.max(8, ...devices.map((d) => d.latency || 0));
    const ordenados = [...devices].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    const n = ordenados.length;
    this.puntos.clear();
    const finos: string[] = [];
    for (let r = R_MIN - 18; r <= R_MAX + 24; r += 9) finos.push(`<path class="mm-fino" d="${contorno(r, r * 0.07)}"/>`);
    const bandas = BANDAS_MS.map((ms) => `<path class="mm-banda" d="${contorno(radioLatencia(ms, maxMs), radioLatencia(ms, maxMs) * 0.07)}"/>`).join("");
    const pins = ordenados
      .map((d, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1) + 0.2;
        const r = radioLatencia(d.latency || 0.5, maxMs);
        const x = CX + Math.cos(ang) * r;
        const y = CY + Math.sin(ang) * r * 0.86;
        this.puntos.set(d.ip, { x, y, d });
        const est = estadoHost(d);
        return `<g class="mm-pin est-${est}" data-ip="${esc(d.ip)}"><title>${esc(d.ip)} ${esc(d.device)}: ${ESTADO_TEXTO[est]}</title>
          <circle class="mm-hit" cx="${x}" cy="${y}" r="10"/><circle class="mm-halo" cx="${x}" cy="${y}" r="9"/>${forma(est, x, y)}</g>`;
      })
      .join("");
    this.svg.innerHTML = `
      <g class="mm-terreno">${finos.join("")}${bandas}</g>
      <g class="mm-centro"><circle cx="${CX}" cy="${CY}" r="3"/><line x1="${CX - 10}" y1="${CY}" x2="${CX + 10}" y2="${CY}"/><line x1="${CX}" y1="${CY - 10}" x2="${CX}" y2="${CY + 10}"/></g>
      <circle class="mm-barrido" cx="${CX}" cy="${CY}" r="${R_MAX}"/>
      <g class="mm-pins">${pins}</g>
      <g class="mm-etq" aria-hidden="true"></g>`;
    this.etiqueta = this.svg.querySelector(".mm-etq");
    this.svg.querySelectorAll<SVGGElement>(".mm-pin").forEach((g) => {
      g.addEventListener("click", () => this.onSelect(g.dataset.ip!));
      g.addEventListener("pointerenter", () => this.rotular(g.dataset.ip!));
      g.addEventListener("pointerleave", () => this.rotular(this.seleccionado));
    });
    this.select(this.seleccionado);
  }

  // Una sola etiqueta a la vez (elegido o bajo el cursor), dentro del dibujo.
  private rotular(ip: string | null) {
    if (!this.etiqueta) return;
    const p = ip ? this.puntos.get(ip) : null;
    if (!p) {
      this.etiqueta.innerHTML = "";
      return;
    }
    const nombre = (p.d.device || "Sin nombre").slice(0, 26);
    const w = Math.max(p.d.ip.length * 7, nombre.length * 6) + 14;
    const x = Math.min(W - w - 4, Math.max(4, p.x + 12));
    const y = Math.min(H - 36, Math.max(4, p.y - 16));
    this.etiqueta.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="32" rx="4"/>
      <text class="mm-etq-ip" x="${x + 7}" y="${y + 13}">${esc(p.d.ip)}</text>
      <text class="mm-etq-nombre" x="${x + 7}" y="${y + 26}">${esc(nombre)}</text>`;
  }
}
