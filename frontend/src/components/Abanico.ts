// Abanico de la red: el plumaje del logo convertido en carta. Este equipo está en la base; cada
// host tiene su pluma (un rayo) y su ocelo sobre ella, más lejos cuanto más tarda en responder.
// La etiqueta (IP y nombre) se escribe a lo largo de la pluma, así que nunca se enciman: cada
// host tiene su propio ángulo. Los arcos punteados son las bandas de latencia.

import type { Device } from "../api/heraApi";
import { esc, estadoHost, ESTADO_TEXTO, Estado } from "../utils/security";

const W = 1200;
const H = 700;
const CX = W / 2;
const CY = 628;
const R_MIN = 96;
const R_MAX = 330;
const R_ETIQUETA = 352;
const ABRE = (12 * Math.PI) / 180; // margen a cada lado del semicírculo
const BANDAS_MS = [1, 2, 4, 8];
const NS = "http://www.w3.org/2000/svg";

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 8));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function forma(estado: Estado, x: number, y: number, s = 5): string {
  if (estado === "riesgo") return `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z"/>`;
  if (estado === "alerta") return `<path d="M${x} ${y - s} L${x + s * 0.95} ${y + s * 0.72} H${x - s * 0.95} Z"/>`;
  return `<circle cx="${x}" cy="${y}" r="${s * 0.78}"/>`;
}

export class Abanico {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private seleccionado: string | null = null;
  private onSelect: (ip: string) => void;

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "abanico";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-label", "Abanico de la red: cada pluma es un host; más lejos, más latencia");
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
    this.svg.querySelectorAll<SVGGElement>(".pluma").forEach((g) => {
      g.classList.toggle("is-selected", g.dataset.ip === ip);
      g.setAttribute("aria-pressed", String(g.dataset.ip === ip));
    });
  }

  setVisibles(ips: Set<string> | null) {
    this.svg.querySelectorAll<SVGGElement>(".pluma").forEach((g) => g.classList.toggle("is-fuera", !!ips && !ips.has(g.dataset.ip!)));
  }

  update(devices: Device[], red: string) {
    const maxMs = Math.max(8, ...devices.map((d) => d.latency || 0));
    const ordenados = [...devices].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    const n = ordenados.length;
    // Cuántos caracteres caben en la etiqueta sin salirse del dibujo (más plumas = letra igual,
    // pero el nombre se recorta antes para no invadir el margen).
    const maxNombre = n > 30 ? 22 : 30;

    const arcos = BANDAS_MS.map((ms) => {
      const r = radioLatencia(ms, maxMs);
      return `<path class="ab-banda" d="M${CX - r} ${CY} A${r} ${r} 0 0 1 ${CX + r} ${CY}"/>
        <text class="ab-banda-txt" x="${CX - r}" y="${CY + 18}" text-anchor="middle">${ms} ms</text>`;
    }).join("");
    // Arcos finos de construcción, como en un plano.
    const finos: string[] = [];
    for (let r = 40; r <= R_MAX + 20; r += 22) finos.push(`<path class="ab-fino" d="M${CX - r} ${CY} A${r} ${r} 0 0 1 ${CX + r} ${CY}"/>`);

    const plumas = ordenados
      .map((d, i) => {
        // De izquierda (π + ABRE) a derecha (2π - ABRE), pasando por arriba.
        const t = n === 1 ? 0.5 : i / (n - 1);
        const ang = Math.PI + ABRE + t * (Math.PI - 2 * ABRE);
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const r = radioLatencia(d.latency || 0.5, maxMs);
        const x = CX + cos * r;
        const y = CY + sin * r;
        const est = estadoHost(d);
        const grados = (ang * 180) / Math.PI;
        // En la mitad izquierda el texto se gira 180° para leerse de izquierda a derecha.
        const izquierda = cos < 0;
        const lx = CX + cos * R_ETIQUETA;
        const ly = CY + sin * R_ETIQUETA;
        const rot = izquierda ? grados + 180 : grados;
        const nombre = d.device || "Sin nombre";
        const corto = nombre.length > maxNombre ? nombre.slice(0, maxNombre - 1) + "…" : nombre;
        const hall = d.vulnerabilities.length;
        return `<g class="pluma est-${est}" data-ip="${esc(d.ip)}" tabindex="0" role="button"
            aria-label="${esc(d.ip)} ${esc(nombre)}: ${ESTADO_TEXTO[est]}, ${d.ports.length} puertos abiertos${hall ? `, ${hall} hallazgos` : ""}">
          <line class="pl-raquis" x1="${CX + cos * 28}" y1="${CY + sin * 28}" x2="${CX + cos * (R_ETIQUETA - 8)}" y2="${CY + sin * (R_ETIQUETA - 8)}"/>
          <line class="pl-hit" x1="${CX + cos * 60}" y1="${CY + sin * 60}" x2="${CX + cos * (R_ETIQUETA + 200)}" y2="${CY + sin * (R_ETIQUETA + 200)}"/>
          <ellipse class="pl-ocelo" cx="${x}" cy="${y}" rx="13" ry="8.5" transform="rotate(${grados} ${x} ${y})"/>
          <g class="pl-forma">${forma(est, x, y)}</g>
          <text class="pl-txt" x="${lx}" y="${ly}" transform="rotate(${rot} ${lx} ${ly})" text-anchor="${izquierda ? "end" : "start"}" dominant-baseline="middle"><tspan class="pl-ip">${esc(d.ip)}</tspan><tspan class="pl-nombre" dx="8">${esc(corto)}</tspan></text>
        </g>`;
      })
      .join("");

    this.svg.innerHTML = `
      <g class="ab-construccion">${finos.join("")}</g>
      <line class="ab-base" x1="40" y1="${CY}" x2="${W - 40}" y2="${CY}"/>
      ${[...Array(23)].map((_, k) => `<line class="ab-tick" x1="${60 + k * 49}" y1="${CY - 4}" x2="${60 + k * 49}" y2="${CY + 4}"/>`).join("")}
      <g class="ab-bandas">${arcos}</g>
      <path class="ab-barrido" d="M${CX} ${CY} L${CX - R_MAX - 20} ${CY} A${R_MAX + 20} ${R_MAX + 20} 0 0 1 ${CX - (R_MAX + 20) * Math.cos(0.5)} ${CY - (R_MAX + 20) * Math.sin(0.5)} Z"/>
      <g class="ab-plumas">${plumas}</g>
      <g class="ab-centro">
        <circle cx="${CX}" cy="${CY}" r="7"/><circle cx="${CX}" cy="${CY}" r="2.5"/>
        <text x="${CX}" y="${CY + 40}" text-anchor="middle">${esc(red)}</text>
        <text class="ab-centro-sub" x="${CX}" y="${CY + 56}" text-anchor="middle">este equipo</text>
      </g>
      ${n === 0 ? `<text class="ab-vacio" x="${CX}" y="${CY - 170}" text-anchor="middle">Sin dispositivos todavía. Escanea la red para desplegar el abanico.</text>` : ""}`;

    this.svg.querySelectorAll<SVGGElement>(".pluma").forEach((g) => {
      const ip = g.dataset.ip!;
      g.addEventListener("click", () => this.onSelect(ip));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(ip);
        }
      });
    });
    this.select(this.seleccionado);
  }
}
