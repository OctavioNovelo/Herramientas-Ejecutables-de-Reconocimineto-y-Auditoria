// Carta de red: la red como un terreno. El centro es este equipo; cada anillo de contorno es
// una banda de latencia (más lejos = responde más lento), y cada host es un pin cuya forma y
// color dicen su estado. Se explora con ratón o teclado; al elegir un pin se inspecciona.

import type { Device } from "../api/heraApi";
import { esc, estadoHost, ESTADO_TEXTO, Estado } from "../utils/security";

const W = 760;
const H = 560;
const CX = W / 2;
const CY = H / 2 + 6;
const R_MIN = 64;
const R_MAX = 252;
const BANDAS_MS = [1, 2, 4, 8];

const NS = "http://www.w3.org/2000/svg";

function forma(estado: Estado, x: number, y: number, s = 7): string {
  if (estado === "riesgo") return `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z"/>`;
  if (estado === "alerta") return `<path d="M${x} ${y - s} L${x + s * 0.95} ${y + s * 0.7} H${x - s * 0.95} Z"/>`;
  return `<circle cx="${x}" cy="${y}" r="${s * 0.78}"/>`;
}

// Contorno ligeramente irregular (tipo curva de nivel) para un radio dado.
function contorno(r: number, semilla: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const k = 1 + 0.028 * Math.sin(3 * t + semilla) + 0.016 * Math.sin(5 * t + semilla * 1.7) + 0.01 * Math.sin(9 * t);
    pts.push(`${(CX + Math.cos(t) * r * k).toFixed(1)},${(CY + Math.sin(t) * r * k * 0.86).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 8));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

export class NetworkMap {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private selected: string | null = null;
  private onSelect: (ip: string) => void;
  private revealed = false;

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "carta";
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
    this.selected = ip;
    this.svg.querySelectorAll<SVGGElement>(".pin").forEach((g) => {
      g.classList.toggle("is-selected", g.dataset.ip === ip);
      g.setAttribute("aria-pressed", String(g.dataset.ip === ip));
    });
  }

  update(devices: Device[], red: string) {

    const maxMs = Math.max(8, ...devices.map((d) => d.latency || 0));
    const finos: string[] = [];
    for (let r = R_MIN - 30; r <= R_MAX + 40; r += 13) finos.push(`<path class="c-fino" d="${contorno(r, r * 0.07)}"/>`);
    const bandas = BANDAS_MS.map((ms) => {
      const r = radioLatencia(ms, maxMs);
      return `<path class="c-banda" d="${contorno(r, r * 0.07)}"/>
        <text class="c-banda-txt" x="${CX + r * 1.03 + 4}" y="${CY - 4}">${ms} ms</text>`;
    }).join("");

    // Reparto angular estable: orden por IP, repartidos de forma pareja y sin caer sobre el eje
    // horizontal derecho, donde van las etiquetas de los anillos.
    const ordenados = [...devices].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    const pins = ordenados
      .map((d, i) => {
        const n = ordenados.length;
        const ang = -Math.PI / 2 + (Math.PI / n) * (n % 2 ? 0.5 : 1) + (i * 2 * Math.PI) / n;
        const r = radioLatencia(d.latency || 0.5, maxMs);
        const x = CX + Math.cos(ang) * r;
        const y = CY + Math.sin(ang) * r * 0.86;
        const est = estadoHost(d);
        const derecha = Math.cos(ang) >= 0;
        const lx = x + (derecha ? 16 : -16);
        const anchor = derecha ? "start" : "end";
        const hall = d.vulnerabilities.length;
        const lectura = `${d.ports.length} ${d.ports.length === 1 ? "puerto" : "puertos"}${hall ? `  ${hall} ${hall === 1 ? "hallazgo" : "hallazgos"}` : ""}`;
        return `<g class="pin est-${est}" data-ip="${esc(d.ip)}" tabindex="0" role="button"
            aria-label="${esc(d.ip)} ${esc(d.device)}: ${ESTADO_TEXTO[est]}, ${lectura}" style="--orden:${Math.round(r)}">
          <circle class="pin-hit" cx="${x}" cy="${y}" r="20"/>
          <circle class="pin-mira" cx="${x}" cy="${y}" r="14"/>
          <g class="pin-forma">${forma(est, x, y)}</g>
          <text class="pin-ip" x="${lx}" y="${y - 2}" text-anchor="${anchor}">.${esc(d.ip.split(".").pop())}</text>
          <text class="pin-lectura" x="${lx}" y="${y + 12}" text-anchor="${anchor}">${esc(lectura)}</text>
        </g>`;
      })
      .join("");

    this.svg.innerHTML = `
      <g class="c-terreno">${finos.join("")}${bandas}</g>
      <g class="c-barrido" aria-hidden="true">
        <path d="M${CX} ${CY} L${CX} ${CY - R_MAX - 40} A${R_MAX + 40} ${(R_MAX + 40) * 0.86} 0 0 1 ${CX + (R_MAX + 40) * 0.5} ${CY - (R_MAX + 40) * 0.86 * 0.866} Z"/>
      </g>
      <g class="c-centro">
        <circle cx="${CX}" cy="${CY}" r="4"/>
        <line x1="${CX - 14}" y1="${CY}" x2="${CX + 14}" y2="${CY}"/>
        <line x1="${CX}" y1="${CY - 14}" x2="${CX}" y2="${CY + 14}"/>
        <text x="${CX}" y="${CY + 30}" text-anchor="middle">${esc(red)}</text>
      </g>
      <g class="c-pins${this.revealed ? "" : " is-revealing"}">${pins}</g>
      ${devices.length === 0 ? `<text class="c-vacio" x="${CX}" y="${CY - 40}" text-anchor="middle">Sin hosts en la carta todavía</text>` : ""}
    `;
    if (devices.length) this.revealed = true;

    this.svg.querySelectorAll<SVGGElement>(".pin").forEach((g) => {
      const ip = g.dataset.ip!;
      g.addEventListener("click", () => this.onSelect(ip));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(ip);
        }
      });
    });
    this.select(this.selected);
  }
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}
