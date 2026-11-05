// Señal: la red como la ve el router. La puerta de enlace está al centro y emite ondas; cada
// dispositivo se conecta a ella con una línea, a una distancia que crece con la latencia (lo
// inalámbrico y lo lejano responde más lento), y se agrupa en un sector según su tipo
// (computadoras, teléfonos, TV...). Cada nodo lleva el ícono de su tipo y el color de su estado.
//
// La posición se calcula UNA vez por escaneo con una simulación de fuerzas (d3-force) que
// separa los nodos para que no se encimen; luego se dibuja como SVG estático. Lo único que se
// mueve son las ondas del centro (CSS), así que no hay trabajo por cuadro.

import { forceSimulation, forceRadial, forceX, forceY, forceCollide, SimulationNodeDatum } from "d3-force";
import type { Device } from "../api/heraApi";
import { esc, estadoHost, ESTADO_TEXTO, Estado } from "../utils/security";
import { tipoDe, TIPOS, ORDEN_TIPOS, Tipo, iconoEnSvg } from "../utils/tipos";

const W = 820;
const H = 700;
const CX = W / 2;
const CY = H / 2 + 6;
const R_MIN = 96;
const R_MAX = 262;
const R_SECTOR = 292;
const BANDAS_MS = [1, 4, 16];
const NS = "http://www.w3.org/2000/svg";

interface Nodo extends SimulationNodeDatum {
  d: Device;
  tipo: Tipo;
  est: Estado;
  r: number;
  ang: number;
}

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 16));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// Ancho aproximado de la etiqueta (nombre en sans 11.5 px, IP en mono 10.5 px). Se calcula del
// texto y no con getBBox(), que da cero si el mapa está oculto en ese momento.
const anchoEtq = (d: Device) => Math.max(recortar(d.device || "Sin nombre", 20).length * 7, d.ip.length * 7.6);

function insignia(est: Estado, x: number, y: number): string {
  const s = 5;
  if (est === "riesgo") return `<path class="sn-insignia" d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z"/>`;
  if (est === "alerta") return `<path class="sn-insignia" d="M${x} ${y - s} L${x + s * 0.95} ${y + s * 0.72} H${x - s * 0.95} Z"/>`;
  return "";
}

// Arco de un sector (para la banda con el nombre del grupo).
function arco(r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(CX + Math.cos(a) * r).toFixed(1)} ${(CY + Math.sin(a) * r).toFixed(1)}`;
  return `M${p(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

export class Senal {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private seleccionado: string | null = null;
  private onSelect: (ip: string) => void;

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "senal";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-label", "Mapa de la red: dispositivos agrupados por tipo alrededor del router; más lejos, más latencia");
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
    this.svg.querySelectorAll<SVGGElement>(".sn-nodo").forEach((g) => {
      const on = g.dataset.ip === ip;
      g.classList.toggle("is-selected", on);
      g.setAttribute("aria-pressed", String(on));
    });
    this.svg.querySelectorAll<SVGLineElement>(".sn-enlace").forEach((l) => l.classList.toggle("is-selected", l.dataset.ip === ip));
    this.svg.classList.toggle("con-seleccion", !!ip);
  }

  setVisibles(ips: Set<string> | null) {
    this.svg.querySelectorAll<SVGGElement>(".sn-nodo").forEach((g) => g.classList.toggle("is-fuera", !!ips && !ips.has(g.dataset.ip!)));
    this.svg.querySelectorAll<SVGLineElement>(".sn-enlace").forEach((l) => l.classList.toggle("is-fuera", !!ips && !ips.has(l.dataset.ip!)));
  }

  update(devices: Device[], red: string) {
    // El router del centro: el dispositivo tipo router con la IP más baja (normalmente .1).
    const ordenados = [...devices].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    const hub = ordenados.find((d) => tipoDe(d) === "router") ?? null;
    const resto = ordenados.filter((d) => d !== hub);
    const maxMs = Math.max(16, ...resto.map((d) => d.latency || 0));

    // Sectores: cada tipo recibe un ángulo proporcional a cuántos dispositivos tiene (con un
    // mínimo para que un grupo de uno no quede como una rebanada ilegible).
    const grupos = ORDEN_TIPOS.map((t) => ({ t, ds: resto.filter((d) => tipoDe(d) === t) })).filter((g) => g.ds.length);
    const pesoTotal = grupos.reduce((s, g) => s + Math.max(g.ds.length, 2), 0);
    const HUECO = grupos.length > 1 ? 0.07 : 0;
    let a = -Math.PI / 2 - Math.PI * 0.22;
    const sectores = grupos.map((g) => {
      const ancho = ((2 * Math.PI - HUECO * grupos.length) * Math.max(g.ds.length, 2)) / pesoTotal;
      const s = { ...g, a0: a, a1: a + ancho };
      a += ancho + HUECO;
      return s;
    });

    const nodos: Nodo[] = sectores.flatMap((s) =>
      s.ds.map((d, i) => {
        const ang = s.a0 + ((s.a1 - s.a0) * (i + 0.5)) / s.ds.length;
        const r = radioLatencia(d.latency || 0.5, maxMs);
        return { d, tipo: s.t, est: estadoHost(d), r, ang, x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r };
      })
    );

    // Simulación: cada nodo tira hacia su anillo de latencia y hacia el centro de su sector, y
    // los choques los separan. Se resuelve de una vez (sin animar) y el resultado es estable.
    const sim = forceSimulation(nodos)
      .force("radial", forceRadial<Nodo>((n) => n.r, CX, CY).strength(0.85))
      .force("x", forceX<Nodo>((n) => CX + Math.cos(n.ang) * n.r).strength(0.22))
      .force("y", forceY<Nodo>((n) => CY + Math.sin(n.ang) * n.r).strength(0.22))
      .force("choque", forceCollide<Nodo>(nodos.length > 30 ? 21 : 27).strength(1).iterations(3))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();

    const bandas = BANDAS_MS.map((ms) => {
      const r = radioLatencia(ms, maxMs);
      return `<circle class="sn-banda" cx="${CX}" cy="${CY}" r="${r}"/><text class="sn-banda-txt" x="${CX + 4}" y="${CY - r - 4}">${ms} ms</text>`;
    }).join("");

    const rotulos = sectores
      .map((s) => {
        const medio = (s.a0 + s.a1) / 2;
        const x = CX + Math.cos(medio) * (R_SECTOR + 22);
        const y = CY + Math.sin(medio) * (R_SECTOR + 22);
        const anchor = Math.abs(Math.cos(medio)) < 0.25 ? "middle" : Math.cos(medio) > 0 ? "start" : "end";
        return `<path class="sn-sector" d="${arco(R_SECTOR, s.a0, s.a1)}"/>
          <text class="sn-sector-txt" x="${x}" y="${y + 4}" text-anchor="${anchor}" data-caja="${(anchor === "start" ? x : anchor === "end" ? x - (TIPOS[s.t].plural.length + 3) * 7.6 : x - ((TIPOS[s.t].plural.length + 3) * 7.6) / 2).toFixed(0)},${(y - 10).toFixed(0)},${((TIPOS[s.t].plural.length + 3) * 7.6).toFixed(0)},18">${esc(TIPOS[s.t].plural)} <tspan>${s.ds.length}</tspan></text>`;
      })
      .join("");

    const enlaces = nodos
      .map((n) => `<line class="sn-enlace est-${n.est}" data-ip="${esc(n.d.ip)}" x1="${CX}" y1="${CY}" x2="${n.x!.toFixed(1)}" y2="${n.y!.toFixed(1)}" style="--lat:${Math.min(1, (n.d.latency || 0) / maxMs).toFixed(2)}"/>`)
      .join("");

    const nodosSvg = nodos
      .map((n) => {
        const x = n.x!;
        const y = n.y!;
        const hall = n.d.vulnerabilities.length;
        const lectura = `${ESTADO_TEXTO[n.est]}, ${n.d.ports.length} puertos abiertos${hall ? `, ${hall} hallazgos` : ""}`;
        const fuera = Math.cos(Math.atan2(y - CY, x - CX)) >= 0;
        const lx = x + (fuera ? 22 : -22);
        return `<g class="sn-nodo est-${n.est}" data-ip="${esc(n.d.ip)}" tabindex="0" role="button" aria-label="${esc(n.d.ip)} ${esc(n.d.device || "sin nombre")} (${TIPOS[n.tipo].nombre}): ${lectura}">
          <circle class="sn-halo" cx="${x}" cy="${y}" r="25"/>
          <circle class="sn-disco" cx="${x}" cy="${y}" r="18"/>
          ${iconoEnSvg(n.tipo, x, y, 18, "sn-ico")}
          ${insignia(n.est, x + 12, y - 12)}
          <g class="sn-etq" data-caja="${(fuera ? lx : lx - anchoEtq(n.d)).toFixed(0)},${(y - 13).toFixed(0)},${anchoEtq(n.d).toFixed(0)},30">
            <text class="sn-nombre" x="${lx}" y="${y - 1}" text-anchor="${fuera ? "start" : "end"}">${esc(recortar(n.d.device || "Sin nombre", 20))}</text>
            <text class="sn-ip" x="${lx}" y="${y + 13}" text-anchor="${fuera ? "start" : "end"}">${esc(n.d.ip)}</text>
          </g>
        </g>`;
      })
      .join("");

    const centro = hub
      ? `<g class="sn-nodo sn-hub est-${estadoHost(hub)}" data-ip="${esc(hub.ip)}" tabindex="0" role="button" aria-label="${esc(hub.ip)} ${esc(hub.device || "router")} (router, centro de la red): ${ESTADO_TEXTO[estadoHost(hub)]}">
          <circle class="sn-halo" cx="${CX}" cy="${CY}" r="34"/>
          <circle class="sn-disco" cx="${CX}" cy="${CY}" r="26"/>
          ${iconoEnSvg("router", CX, CY, 24, "sn-ico")}
          ${insignia(estadoHost(hub), CX + 20, CY - 20)}
          <text class="sn-hub-nombre" x="${CX}" y="${CY + 44}" text-anchor="middle">${esc(recortar(hub.device || "Router", 24))}</text>
          <text class="sn-ip" x="${CX}" y="${CY + 57}" text-anchor="middle">${esc(hub.ip)}</text>
        </g>`
      : `<g class="sn-hub sn-hub-virtual"><circle class="sn-disco" cx="${CX}" cy="${CY}" r="22"/>${iconoEnSvg("router", CX, CY, 20, "sn-ico")}
          <text class="sn-hub-nombre" x="${CX}" y="${CY + 40}" text-anchor="middle">${esc(red)}</text></g>`;

    this.svg.innerHTML = `
      <g class="sn-ondas" aria-hidden="true">${[0, 1, 2].map((i) => `<circle cx="${CX}" cy="${CY}" r="${R_MAX + 30}" style="--k:${i}"/>`).join("")}</g>
      <g class="sn-bandas" aria-hidden="true">${bandas}</g>
      <g class="sn-sectores" aria-hidden="true">${rotulos}</g>
      <g class="sn-enlaces" aria-hidden="true">${enlaces}</g>
      <g class="sn-nodos">${nodosSvg}</g>
      ${centro}
      ${devices.length === 0 ? `<text class="sn-vacio" x="${CX}" y="${CY - 120}" text-anchor="middle">Sin dispositivos todavía. Escanea la red para verla.</text>` : ""}`;

    this.ocultarEtiquetasEncimadas();
    this.svg.querySelectorAll<SVGGElement>("g[data-ip]").forEach((g) => {
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

  // Si dos etiquetas se tocan, se queda la del dispositivo más importante (riesgo > alerta >
  // seguro); la otra aparece al pasar el cursor o al elegir el nodo.
  private ocultarEtiquetasEncimadas() {
    const peso: Record<Estado, number> = { riesgo: 0, alerta: 1, seguro: 2, "sin-datos": 3 };
    const nodos = [...this.svg.querySelectorAll<SVGGElement>(".sn-nodos .sn-nodo")];
    const cajas: DOMRect[] = [];
    const conCaja = nodos
      .map((g) => {
        const est = (g.className.baseVal.match(/est-(\w+)/)?.[1] ?? "seguro") as Estado;
        const etq = g.querySelector<SVGGElement>(".sn-etq")!;
        const [x, y, w, h] = (etq.dataset.caja ?? "0,0,0,0").split(",").map(Number);
        return { g, etq, est, caja: new DOMRect(x, y, w, h) };
      })
      .sort((a, b) => peso[a.est] - peso[b.est]);
    // Los rótulos de los sectores y los discos también ocupan sitio.
    for (const t of this.svg.querySelectorAll<SVGTextElement>(".sn-sector-txt")) {
      const [x, y, w, h] = (t.dataset.caja ?? "0,0,0,0").split(",").map(Number);
      cajas.push(new DOMRect(x, y, w, h));
    }
    for (const g of nodos) {
      const c = g.querySelector<SVGCircleElement>(".sn-disco")!;
      const x = +c.getAttribute("cx")!;
      const y = +c.getAttribute("cy")!;
      cajas.push(new DOMRect(x - 19, y - 19, 38, 38));
    }
    for (const { etq, caja } of conCaja) {
      const choca = cajas.some((o) => caja.x < o.x + o.width && caja.x + caja.width > o.x && caja.y < o.y + o.height && caja.y + caja.height > o.y);
      etq.classList.toggle("is-oculta", choca);
      if (!choca) cajas.push(caja);
    }
  }
}
