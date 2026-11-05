// Señal: la red como la ve el router. La puerta de enlace está al centro y emite ondas; cada
// dispositivo se conecta a ella con una línea, a una distancia que crece con la latencia (lo
// inalámbrico y lo lejano responde más lento), y se agrupa en un sector según su tipo
// (computadoras, teléfonos, TV...). Cada nodo lleva el ícono de su tipo y el color de su estado.
//
// La posición se calcula UNA vez por escaneo con una simulación de fuerzas (d3-force) que
// separa los nodos para que no se encimen; luego se dibuja como SVG estático. Lo único que se
// mueve solo son las ondas del centro (CSS).
//
// Zoom y arrastre (ronda final): se cambia el viewBox, nada más. Los nodos y los rótulos se
// contraescalan para conservar su tamaño en pantalla, así que al acercarse la red se abre y
// caben más nombres; los trazos usan vector-effect para no engordar.

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
const K_MAX = 5;
// Caja base: más ancha que el dibujo para que los rótulos de los sectores laterales no se corten.
const BASE = { x: -60, y: 0, w: W + 120, h: H };
const NS = "http://www.w3.org/2000/svg";

interface Nodo extends SimulationNodeDatum {
  d: Device;
  tipo: Tipo;
  est: Estado;
  r: number;
  ang: number;
}
interface Zoom {
  s: number;
  tx: number;
  ty: number;
}
interface Margenes {
  izq: number;
  der: number;
  arriba: number;
  abajo: number;
}

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 16));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// Ancho aproximado de la etiqueta (nombre en sans 13 px, IP en mono 11.5 px). Se calcula del
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

// Corona del host elegido: una marca por puerto alrededor del disco. Las de puertos con
// hallazgo van en el color de riesgo y las filtradas, punteadas. Se dibuja solo al elegirlo.
function corona(d: Device, r: number): string {
  const conH = new Set(d.vulnerabilities.map((v) => String(v.port)));
  const filtrados = new Set(d.filtered_ports.map(String));
  const puertos = [...new Set([...d.ports.map(String), ...filtrados])].slice(0, 40);
  if (!puertos.length) return "";
  const hueco = puertos.length > 1 ? Math.min(0.12, (Math.PI * 2) / puertos.length / 3) : 0;
  const paso = (Math.PI * 2) / puertos.length;
  const p = (a: number) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  return `<g class="sn-corona" aria-hidden="true">${puertos
    .map((pt, i) => {
      const a0 = -Math.PI / 2 + i * paso + hueco / 2;
      const a1 = a0 + paso - hueco;
      const clase = conH.has(pt) ? "con-h" : filtrados.has(pt) ? "filtrado" : "";
      return `<path class="${clase}" d="M${p(a0)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}"><title>puerto ${pt}</title></path>`;
    })
    .join("")}</g>`;
}

const VE = `vector-effect="non-scaling-stroke"`;
const ICONO_MAS = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>`;
const ICONO_MENOS = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10"/></svg>`;
const ICONO_ENCUADRE = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>`;

export class Senal {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private seleccionado: string | null = null;
  private onSelect: (ip: string) => void;
  private onHover: (ip: string | null) => void;
  private z: Zoom = { s: 1, tx: -BASE.x, ty: -BASE.y };
  private ajustado = true;
  private margenes: Margenes = { izq: 0, der: 0, arriba: 0, abajo: 0 };
  private relojEtq: number | null = null;
  private animacion: number | null = null;
  private arrastre: { id: number; x: number; y: number; z: Zoom; movio: boolean } | null = null;
  private recienArrastrado = false;
  private porIp = new Map<string, Device>();

  constructor(onSelect: (ip: string) => void, onHover: (ip: string | null) => void = () => {}) {
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.el = document.createElement("div");
    this.el.className = "senal";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", `${BASE.x} ${BASE.y} ${BASE.w} ${BASE.h}`);
    this.svg.setAttribute("preserveAspectRatio", "none");
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("tabindex", "-1");
    this.svg.setAttribute("aria-label", "Mapa de la red: dispositivos agrupados por tipo alrededor del router; más lejos, más latencia. Rueda o + y − para acercar, arrastra para moverte, 0 para encuadrar.");
    this.el.appendChild(this.svg);

    const zoom = document.createElement("div");
    zoom.className = "sn-zoom";
    zoom.innerHTML = `
      <button type="button" data-z="mas" title="Acercar (+)" aria-label="Acercar">${ICONO_MAS}</button>
      <button type="button" data-z="menos" title="Alejar (−)" aria-label="Alejar">${ICONO_MENOS}</button>
      <button type="button" data-z="encuadrar" title="Ver toda la red (0)" aria-label="Ver toda la red">${ICONO_ENCUADRE}</button>`;
    zoom.addEventListener("click", (e) => {
      const z = (e.target as Element).closest<HTMLButtonElement>("[data-z]")?.dataset.z;
      if (z === "mas") this.zoomEn(1.5);
      else if (z === "menos") this.zoomEn(1 / 1.5);
      else if (z === "encuadrar") this.encuadrar();
    });
    this.el.appendChild(zoom);
    this.conectarZoom();
    // Al cambiar el tamaño de la ventana: si se veía toda la red, se vuelve a encajar.
    new ResizeObserver(() => {
      if (this.ajustado) this.z = this.ajuste();
      this.aplicarVista(true);
    }).observe(this.svg);
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
    this.svg.querySelector(".sn-corona")?.remove();
    const d = ip ? this.porIp.get(ip) : undefined;
    const cuerpo = ip ? this.svg.querySelector(`.sn-nodo[data-ip="${CSS.escape(ip)}"] .sn-cuerpo`) : null;
    if (d && cuerpo) cuerpo.insertAdjacentHTML("afterbegin", corona(d, cuerpo.closest(".sn-hub") ? 31 : 24));
  }

  // Resalta un nodo sin elegirlo (al pasar el cursor por su fila en el índice).
  resaltar(ip: string | null) {
    this.svg.querySelectorAll<SVGGElement>(".sn-nodo.is-resaltado").forEach((g) => g.classList.remove("is-resaltado"));
    this.svg.querySelectorAll<SVGLineElement>(".sn-enlace.is-resaltado").forEach((g) => g.classList.remove("is-resaltado"));
    if (!ip) return;
    this.svg.querySelector(`.sn-nodo[data-ip="${CSS.escape(ip)}"]`)?.classList.add("is-resaltado");
    this.svg.querySelector(`.sn-enlace[data-ip="${CSS.escape(ip)}"]`)?.classList.add("is-resaltado");
  }

  setVisibles(ips: Set<string> | null) {
    this.svg.querySelectorAll<SVGGElement>(".sn-nodo").forEach((g) => g.classList.toggle("is-fuera", !!ips && !ips.has(g.dataset.ip!)));
    this.svg.querySelectorAll<SVGLineElement>(".sn-enlace").forEach((l) => l.classList.toggle("is-fuera", !!ips && !ips.has(l.dataset.ip!)));
  }

  // Espacio del lienzo que tapan paneles flotantes (en píxeles). "Ver toda la red" encaja el
  // mapa en lo que queda libre, y elegir un host lo lleva al centro de esa zona.
  setMargenes(m: Partial<Margenes>, animar = true) {
    this.margenes = { ...this.margenes, ...m };
    if (this.ajustado) this.irA(this.ajuste(), animar);
  }

  // Lleva el nodo al centro de la zona libre, acercando hasta kMin si hace falta.
  centrarEn(ip: string, kMin = 1) {
    const g = this.svg.querySelector<SVGGElement>(`.sn-nodo[data-ip="${CSS.escape(ip)}"]`);
    if (!g) return;
    const { w, h } = this.tam();
    const { s0 } = this.ajuste();
    const s = Math.max(this.z.s, kMin * s0);
    const cx = this.margenes.izq + (w - this.margenes.izq - this.margenes.der) / 2;
    const cy = this.margenes.arriba + (h - this.margenes.arriba - this.margenes.abajo) / 2;
    this.ajustado = false;
    this.irA({ s, tx: cx - +g.dataset.x! * s, ty: cy - +g.dataset.y! * s }, true);
  }

  // ¿El nodo se ve en la zona libre (no tapado por un panel ni fuera del lienzo)?
  estaALaVista(ip: string): boolean {
    const g = this.svg.querySelector<SVGGElement>(`.sn-nodo[data-ip="${CSS.escape(ip)}"]`);
    if (!g) return false;
    const { w, h } = this.tam();
    const x = +g.dataset.x! * this.z.s + this.z.tx;
    const y = +g.dataset.y! * this.z.s + this.z.ty;
    const m = this.margenes;
    return x > m.izq + 30 && x < w - m.der - 30 && y > m.arriba + 30 && y < h - m.abajo - 30;
  }

  encuadrar() {
    this.ajustado = true;
    this.irA(this.ajuste(), true);
  }

  update(devices: Device[], red: string) {
    // El router del centro: el dispositivo tipo router con la IP más baja (normalmente .1).
    this.porIp = new Map(devices.map((d) => [d.ip, d]));
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
      return `<circle class="sn-banda" cx="${CX}" cy="${CY}" r="${r}" ${VE}/>
        <g class="sn-fijo" transform="translate(${CX + 4} ${CY - r - 4})"><g class="sn-cuerpo"><text class="sn-banda-txt">${ms} ms</text></g></g>`;
    }).join("");

    const rotulos = sectores
      .map((s) => {
        const medio = (s.a0 + s.a1) / 2;
        const x = CX + Math.cos(medio) * (R_SECTOR + 22);
        const y = CY + Math.sin(medio) * (R_SECTOR + 22);
        const anchor = Math.abs(Math.cos(medio)) < 0.25 ? "middle" : Math.cos(medio) > 0 ? "start" : "end";
        const ancho = (TIPOS[s.t].plural.length + 3) * 7.6;
        const bx = anchor === "start" ? 0 : anchor === "end" ? -ancho : -ancho / 2;
        return `<path class="sn-sector" d="${arco(R_SECTOR, s.a0, s.a1)}" ${VE}/>
          <g class="sn-fijo sn-rotulo" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-caja="${bx.toFixed(0)},-14,${ancho.toFixed(0)},18" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="sn-cuerpo">
            <text class="sn-sector-txt" y="4" text-anchor="${anchor}">${esc(TIPOS[s.t].plural)} <tspan>${s.ds.length}</tspan></text>
          </g></g>`;
      })
      .join("");

    const enlaces = nodos
      .map((n) => `<line class="sn-enlace est-${n.est}" data-ip="${esc(n.d.ip)}" x1="${CX}" y1="${CY}" x2="${n.x!.toFixed(1)}" y2="${n.y!.toFixed(1)}" style="--lat:${Math.min(1, (n.d.latency || 0) / maxMs).toFixed(2)}" ${VE}/>`)
      .join("");

    const nodosSvg = nodos
      .map((n) => {
        const x = n.x!;
        const y = n.y!;
        const hall = n.d.vulnerabilities.length;
        const lectura = `${ESTADO_TEXTO[n.est]}, ${n.d.ports.length} puertos abiertos${hall ? `, ${hall} hallazgos` : ""}`;
        const fuera = Math.cos(Math.atan2(y - CY, x - CX)) >= 0;
        const lx = fuera ? 22 : -22;
        const w = anchoEtq(n.d);
        return `<g class="sn-nodo est-${n.est}" data-ip="${esc(n.d.ip)}" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(n.d.ip)} ${esc(n.d.device || "sin nombre")} (${TIPOS[n.tipo].nombre}): ${lectura}">
          <g class="sn-cuerpo">
            <circle class="sn-halo" r="25"/>
            <circle class="sn-disco" r="18"/>
            ${iconoEnSvg(n.tipo, 0, 0, 18, "sn-ico")}
            ${insignia(n.est, 12, -12)}
            <g class="sn-etq" data-caja="${(fuera ? lx : lx - w).toFixed(0)},-13,${w.toFixed(0)},30">
              <text class="sn-nombre" x="${lx}" y="-1" text-anchor="${fuera ? "start" : "end"}">${esc(recortar(n.d.device || "Sin nombre", 20))}</text>
              <text class="sn-ip" x="${lx}" y="13" text-anchor="${fuera ? "start" : "end"}">${esc(n.d.ip)}</text>
            </g>
          </g>
        </g>`;
      })
      .join("");

    const centro = hub
      ? `<g class="sn-nodo sn-hub est-${estadoHost(hub)}" data-ip="${esc(hub.ip)}" data-x="${CX}" data-y="${CY}" transform="translate(${CX} ${CY})" tabindex="0" role="button" aria-label="${esc(hub.ip)} ${esc(hub.device || "router")} (router, centro de la red): ${ESTADO_TEXTO[estadoHost(hub)]}">
          <g class="sn-cuerpo">
            <circle class="sn-halo" r="34"/>
            <circle class="sn-disco" r="26"/>
            ${iconoEnSvg("router", 0, 0, 24, "sn-ico")}
            ${insignia(estadoHost(hub), 20, -20)}
            <text class="sn-hub-nombre" y="44" text-anchor="middle">${esc(recortar(hub.device || "Router", 24))}</text>
            <text class="sn-ip" y="57" text-anchor="middle">${esc(hub.ip)}</text>
          </g>
        </g>`
      : `<g class="sn-hub sn-hub-virtual" transform="translate(${CX} ${CY})"><g class="sn-cuerpo"><circle class="sn-disco" r="22"/>${iconoEnSvg("router", 0, 0, 20, "sn-ico")}
          <text class="sn-hub-nombre" y="40" text-anchor="middle">${esc(red)}</text></g></g>`;

    this.svg.innerHTML = `
      <rect class="sn-fondo" x="${-W * 4}" y="${-H * 4}" width="${W * 9}" height="${H * 9}"/>
      <g class="sn-ondas" aria-hidden="true">${[0, 1, 2].map((i) => `<circle cx="${CX}" cy="${CY}" r="${R_MAX + 30}" style="--k:${i}" ${VE}/>`).join("")}</g>
      <g class="sn-bandas" aria-hidden="true">${bandas}</g>
      <g class="sn-sectores" aria-hidden="true">${rotulos}</g>
      <g class="sn-enlaces" aria-hidden="true">${enlaces}</g>
      <g class="sn-nodos">${nodosSvg}</g>
      ${centro}
      ${devices.length === 0 ? `<text class="sn-vacio" x="${CX}" y="${CY - 120}" text-anchor="middle">Sin dispositivos todavía. Escanea la red para verla.</text>` : ""}`;

    this.svg.querySelectorAll<SVGGElement>("g[data-ip]").forEach((g) => {
      const ip = g.dataset.ip!;
      g.addEventListener("click", () => {
        if (!this.recienArrastrado) this.onSelect(ip);
      });
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(ip);
        }
      });
      g.addEventListener("mouseenter", () => this.onHover(ip));
      g.addEventListener("mouseleave", () => this.onHover(null));
      g.addEventListener("focus", () => this.onHover(ip));
      g.addEventListener("blur", () => this.onHover(null));
    });
    this.aplicarVista();
    this.select(this.seleccionado);
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────
  // El estado es una escala (píxeles por unidad del dibujo) y un desplazamiento en píxeles; el
  // viewBox se deduce de eso y del tamaño real del lienzo, así que nunca hay bandas vacías.
  private tam() {
    const r = this.svg.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { w: r.width, h: r.height } : { w: BASE.w, h: BASE.h };
  }

  // Escala y desplazamiento que encajan toda la red en la zona libre.
  private ajuste(): Zoom & { s0: number } {
    const { w, h } = this.tam();
    const m = this.margenes;
    const fw = Math.max(120, w - m.izq - m.der);
    const fh = Math.max(120, h - m.arriba - m.abajo);
    const s0 = Math.min(fw / BASE.w, fh / BASE.h);
    return { s: s0, s0, tx: m.izq + (fw - BASE.w * s0) / 2 - BASE.x * s0, ty: m.arriba + (fh - BASE.h * s0) / 2 - BASE.y * s0 };
  }

  private limitar(z: Zoom): Zoom {
    const { w, h } = this.tam();
    const s0 = this.ajuste().s0;
    const s = Math.max(s0, Math.min(s0 * K_MAX, z.s));
    // La red no puede salir del todo: al menos un 30 % del lienzo la sigue mostrando.
    const tx = Math.min(w * 0.7 - BASE.x * s, Math.max(w * 0.3 - (BASE.x + BASE.w) * s, z.tx));
    const ty = Math.min(h * 0.7 - BASE.y * s, Math.max(h * 0.3 - (BASE.y + BASE.h) * s, z.ty));
    return { s, tx, ty };
  }

  private irA(destino: Zoom, animar: boolean) {
    const fin = this.ajustado ? destino : this.limitar(destino);
    if (this.animacion !== null) cancelAnimationFrame(this.animacion);
    this.animacion = null;
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animar || quieto) {
      this.z = { s: fin.s, tx: fin.tx, ty: fin.ty };
      this.aplicarVista();
      return;
    }
    // Transición corta y solo cuando la pide el usuario (botón, elegir un host).
    const ini = { ...this.z };
    const t0 = performance.now();
    const DUR = 260;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / DUR);
      const e = 1 - Math.pow(1 - p, 3);
      this.z = { s: ini.s + (fin.s - ini.s) * e, tx: ini.tx + (fin.tx - ini.tx) * e, ty: ini.ty + (fin.ty - ini.ty) * e };
      this.aplicarVista(p < 1);
      this.animacion = p < 1 ? requestAnimationFrame(paso) : null;
    };
    this.animacion = requestAnimationFrame(paso);
  }

  // Acerca o aleja manteniendo fijo el punto (px, py) del lienzo (por defecto, el centro libre).
  private zoomEn(factor: number, px?: number, py?: number, animar = true) {
    const { w, h } = this.tam();
    const m = this.margenes;
    const x = px ?? m.izq + (w - m.izq - m.der) / 2;
    const y = py ?? m.arriba + (h - m.arriba - m.abajo) / 2;
    const s0 = this.ajuste().s0;
    const s = Math.max(s0, Math.min(s0 * K_MAX, this.z.s * factor));
    if (s <= s0 * 1.001 && factor < 1) {
      this.encuadrar();
      return;
    }
    this.ajustado = false;
    this.irA({ s, tx: x - ((x - this.z.tx) * s) / this.z.s, ty: y - ((y - this.z.ty) * s) / this.z.s }, animar);
  }

  // enCurso: durante el gesto solo se mueve el viewBox; las etiquetas se recalculan al final.
  private aplicarVista(enCurso = false) {
    const { w, h } = this.tam();
    const { s, tx, ty } = this.z;
    this.svg.setAttribute("viewBox", `${(-tx / s).toFixed(2)} ${(-ty / s).toFixed(2)} ${(w / s).toFixed(2)} ${(h / s).toFixed(2)}`);
    const ik = this.escalaCuerpo().toFixed(4);
    this.svg.querySelectorAll<SVGGElement>(".sn-cuerpo").forEach((g) => g.setAttribute("transform", `scale(${ik})`));
    this.el.classList.toggle("is-acercado", !this.ajustado);
    if (this.relojEtq !== null) clearTimeout(this.relojEtq);
    this.relojEtq = window.setTimeout(() => this.ocultarEtiquetasEncimadas(), enCurso ? 140 : 0);
  }

  // Tamaño de nodos y rótulos en pantalla: fijo al acercarse (así la red se abre y caben más
  // nombres) y nunca menor de 0.95 px por unidad, para que el texto siga siendo legible.
  private escalaCuerpo() {
    const s0 = this.ajuste().s0;
    return Math.min(1.3 * s0, Math.max(s0, 0.95)) / this.z.s;
  }

  private conectarZoom() {
    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = this.svg.getBoundingClientRect();
        this.zoomEn(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top, false);
      },
      { passive: false }
    );
    this.svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, z: { ...this.z }, movio: false };
    });
    this.svg.addEventListener("pointermove", (e) => {
      const a = this.arrastre;
      if (!a || a.id !== e.pointerId) return;
      const dx = e.clientX - a.x;
      const dy = e.clientY - a.y;
      if (!a.movio && Math.hypot(dx, dy) < 4) return;
      if (!a.movio) {
        a.movio = true;
        this.svg.setPointerCapture(e.pointerId);
        this.el.classList.add("is-arrastrando");
      }
      this.ajustado = false;
      this.z = this.limitar({ s: a.z.s, tx: a.z.tx + dx, ty: a.z.ty + dy });
      this.aplicarVista(true);
    });
    const soltar = (e: PointerEvent) => {
      const a = this.arrastre;
      if (!a || a.id !== e.pointerId) return;
      this.arrastre = null;
      this.el.classList.remove("is-arrastrando");
      if (a.movio) {
        // El clic que sigue a un arrastre no debe elegir el nodo donde se soltó.
        this.recienArrastrado = true;
        setTimeout(() => (this.recienArrastrado = false), 0);
      }
    };
    this.svg.addEventListener("pointerup", soltar);
    this.svg.addEventListener("pointercancel", soltar);
    this.svg.addEventListener("dblclick", (e) => {
      if ((e.target as Element).closest(".sn-nodo")) return;
      const r = this.svg.getBoundingClientRect();
      this.zoomEn(e.shiftKey ? 1 / 2 : 2, e.clientX - r.left, e.clientY - r.top);
    });
    this.el.addEventListener("keydown", (e) => {
      if ((e.target as Element).closest("input, textarea, select")) return;
      if (e.key === "+" || e.key === "=") this.zoomEn(1.5);
      else if (e.key === "-" || e.key === "_") this.zoomEn(1 / 1.5);
      else if (e.key === "0") this.encuadrar();
      else return;
      e.preventDefault();
    });
  }

  // Si dos etiquetas se tocan, se queda la del dispositivo más importante (riesgo > alerta >
  // seguro); la otra aparece al pasar el cursor o al elegir el nodo. Las cajas se guardan
  // relativas al nodo y se dividen entre el zoom, porque el texto conserva su tamaño en pantalla.
  private ocultarEtiquetasEncimadas() {
    this.relojEtq = null;
    const ik = this.escalaCuerpo();
    const peso: Record<Estado, number> = { riesgo: 0, alerta: 1, seguro: 2, "sin-datos": 3 };
    const caja = (g: SVGGElement, rel: string | undefined) => {
      const [x, y, w, h] = (rel ?? "0,0,0,0").split(",").map(Number);
      return new DOMRect(+g.dataset.x! + x * ik, +g.dataset.y! + y * ik, w * ik, h * ik);
    };
    const nodos = [...this.svg.querySelectorAll<SVGGElement>(".sn-nodos .sn-nodo")];
    const cajas: DOMRect[] = [];
    for (const g of this.svg.querySelectorAll<SVGGElement>(".sn-rotulo")) cajas.push(caja(g, g.dataset.caja));
    for (const g of nodos) cajas.push(caja(g, "-19,-19,38,38"));
    const hub = this.svg.querySelector<SVGGElement>(".sn-hub[data-x]");
    if (hub) cajas.push(caja(hub, "-60,-30,120,92"));
    const conCaja = nodos
      .map((g) => {
        const est = (g.className.baseVal.match(/est-(\w+)/)?.[1] ?? "seguro") as Estado;
        const etq = g.querySelector<SVGGElement>(".sn-etq")!;
        return { etq, est, caja: caja(g, etq.dataset.caja) };
      })
      .sort((a, b) => peso[a.est] - peso[b.est]);
    for (const { etq, caja: c } of conCaja) {
      const choca = cajas.some((o) => c.x < o.x + o.width && c.x + c.width > o.x && c.y < o.y + o.height && c.y + c.height > o.y);
      etq.classList.toggle("is-oculta", choca);
      if (!choca) cajas.push(c);
    }
  }
}
