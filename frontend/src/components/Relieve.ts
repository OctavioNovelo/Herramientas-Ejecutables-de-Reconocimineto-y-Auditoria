// Relieve de la red: la carta de A llevada a 3D. El centro es este equipo; cada host es un pico
// en su anillo de latencia (más lejos = responde más lento) y la ALTURA del pico es su
// exposición: puertos abiertos y hallazgos. Lo que hay que mirar primero sobresale.
//
// La proyección 3D se calcula aquí y se dibuja en SVG plano, sin transformaciones 3D de CSS:
// main.rs desactiva la composición acelerada de WebKitGTK (WEBKIT_DISABLE_COMPOSITING_MODE),
// y sin ella preserve-3d no funciona.
//
// Se gira arrastrando, se inclina arrastrando en vertical, se acerca con la rueda y se vuelve a
// la vista inicial con doble clic o la tecla 0. Las flechas y +/- hacen lo mismo con teclado.

import type { Device, CategoryDevice } from "../api/heraApi";
import { estadoHost, ESTADO_TEXTO, Estado } from "../utils/security";

const NS = "http://www.w3.org/2000/svg";
const R_MIN = 70;
const R_MAX = 262;
const R_BORDE = R_MAX + 46;
const BANDAS_MS = [1, 2, 4, 8];
const FOCAL = 1000;
const VISTA_INICIAL = { yaw: -0.5, pitch: 0.95, zoom: 1 };

interface Pico {
  d: Device;
  x: number;
  y: number;
  h: number;
  z: number;
  est: Estado;
  g: SVGGElement;
  etiqueta: SVGGElement;
  tallo: SVGLineElement;
  sx: number;
  sy: number;
  p: number;
}

function radioLatencia(ms: number, maxMs: number): number {
  const k = Math.log2(1 + ms) / Math.log2(1 + Math.max(maxMs, 8));
  return R_MIN + (R_MAX - R_MIN) * Math.min(1, k);
}

// Exposición → altura del pico (satura para que un host con 40 puertos no tape la carta).
function altura(d: Device): number {
  const pesos = { critical: 7, high: 5, medium: 3, low: 1 } as const;
  const score =
    d.ports.length +
    d.filtered_ports.length * 0.3 +
    d.vulnerabilities.reduce((s, v) => s + pesos[v.severity], 0) +
    ((d as CategoryDevice).possible_vulnerabilities?.length ?? 0);
  return 14 + 92 * (1 - Math.exp(-score / 6));
}

// Color de una curva según su altura: del gris azulado del terreno al verde de la pluma.
const BAJO = [42, 61, 80];
const ALTO = [50, 217, 186];
function mezclar(k: number): string {
  const c = BAJO.map((b, i) => Math.round(b + (ALTO[i] - b) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function forma(est: Estado, s: number): string {
  if (est === "riesgo") return `<path d="M0 ${-s} L${s} 0 L0 ${s} L${-s} 0 Z"/>`;
  if (est === "alerta") return `<path d="M0 ${-s} L${s * 0.95} ${s * 0.72} H${-s * 0.95} Z"/>`;
  return `<circle r="${s * 0.8}"/>`;
}

const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export class Relieve {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private capaTerreno: SVGGElement;
  private capaBarrido: SVGPathElement;
  private capaBandas: SVGGElement;
  private capaPicos: SVGGElement;
  private capaEtiquetas: SVGGElement;
  private centro: SVGGElement;
  private picos: Pico[] = [];
  private anillos: { r: number; pts: { x: number; y: number; z: number }[]; banda: boolean }[] = [];
  private caminos: SVGPathElement[] = [];
  private vista = { ...VISTA_INICIAL };
  private destino: typeof VISTA_INICIAL | null = null;
  private seleccionado: string | null = null;
  private encima: string | null = null;
  private visibles: Set<string> | null = null;
  private escaneando = false;
  private ultimaInteraccion = 0;
  private girando = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  private raf: number | null = null;
  private t0 = performance.now();
  private ancho = 900;
  private alto = 560;
  private onSelect: (ip: string) => void;

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "relieve";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("tabindex", "0");
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-label", "Relieve de la red. Flechas para girar e inclinar, + y - para acercar, 0 para la vista inicial.");
    this.svg.innerHTML = `
      <g class="r-terreno"></g>
      <path class="r-barrido"/>
      <g class="r-bandas"></g>
      <g class="r-centro"><circle r="4"/><line x1="-14" x2="14"/><line y1="-14" y2="14"/><text class="r-centro-txt" y="30" text-anchor="middle"></text></g>
      <g class="r-picos"></g>
      <g class="r-etiquetas" aria-hidden="true"></g>`;
    this.capaTerreno = this.svg.querySelector(".r-terreno")!;
    this.capaBarrido = this.svg.querySelector(".r-barrido")!;
    this.capaBandas = this.svg.querySelector(".r-bandas")!;
    this.centro = this.svg.querySelector(".r-centro")!;
    this.capaPicos = this.svg.querySelector(".r-picos")!;
    this.capaEtiquetas = this.svg.querySelector(".r-etiquetas")!;
    this.el.appendChild(this.svg);
    this.conectarControles();
    new ResizeObserver(() => this.medir()).observe(this.el);
  }

  getElement() {
    return this.el;
  }

  setScanning(on: boolean) {
    this.escaneando = on;
    this.el.classList.toggle("is-scanning", on);
    this.pedirCuadro();
  }

  setGiro(on: boolean) {
    this.girando = on;
    this.pedirCuadro();
  }

  getGiro() {
    return this.girando;
  }

  select(ip: string | null) {
    this.seleccionado = ip;
    this.picos.forEach((p) => {
      p.g.classList.toggle("is-selected", p.d.ip === ip);
      p.g.setAttribute("aria-pressed", String(p.d.ip === ip));
    });
    this.pintar();
  }

  // Hosts que cumplen el buscador (null = todos). Los demás se atenúan y pierden la etiqueta.
  setVisibles(ips: Set<string> | null) {
    this.visibles = ips;
    this.picos.forEach((p) => p.g.classList.toggle("is-fuera", !!ips && !ips.has(p.d.ip)));
    this.pintar();
  }

  vistaInicial() {
    this.destino = { ...VISTA_INICIAL };
    this.ultimaInteraccion = performance.now();
    this.pedirCuadro();
  }

  update(devices: Device[], red: string) {
    const maxMs = Math.max(8, ...devices.map((d) => d.latency || 0));
    const ordenados = [...devices].sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    const n = ordenados.length;
    // Picos angostos cuando la red está concurrida, para que no se fundan entre sí.
    const sigma = Math.max(13, Math.min(32, ((2 * Math.PI * (R_MIN + R_MAX)) / 2 / Math.max(n, 1)) * 0.42));

    this.capaPicos.innerHTML = "";
    this.capaEtiquetas.innerHTML = "";
    const base = ordenados.map((d, i) => {
      const ang = (i / Math.max(n, 1)) * Math.PI * 2 + 0.35;
      const r = radioLatencia(d.latency || 0.5, maxMs);
      return { d, x: Math.cos(ang) * r, y: Math.sin(ang) * r, h: altura(d) };
    });
    const terreno = (x: number, y: number) =>
      base.reduce((s, b) => s + b.h * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * sigma * sigma)), 0);

    this.picos = base.map((b) => {
      const est = estadoHost(b.d);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", `r-pico est-${est}`);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      const hall = b.d.vulnerabilities.length;
      g.setAttribute(
        "aria-label",
        `${b.d.ip} ${b.d.device || "sin nombre"}: ${ESTADO_TEXTO[est]}, ${b.d.ports.length} puertos abiertos${hall ? `, ${hall} hallazgos` : ""}`
      );
      g.dataset.ip = b.d.ip;
      g.innerHTML = `<circle class="r-pico-hit" r="18"/><circle class="r-pico-mira" r="13"/><g class="r-pico-forma">${forma(est, 7)}</g>`;
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onSelect(b.d.ip);
      });
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(b.d.ip);
        }
      });
      g.addEventListener("pointerenter", () => {
        this.encima = b.d.ip;
        this.pintar();
      });
      g.addEventListener("pointerleave", () => {
        this.encima = null;
        this.pintar();
      });
      g.addEventListener("focus", () => {
        this.encima = b.d.ip;
        this.pintar();
      });
      g.addEventListener("blur", () => {
        this.encima = null;
        this.pintar();
      });
      const tallo = document.createElementNS(NS, "line");
      tallo.setAttribute("class", `r-tallo est-${est}`);
      this.capaPicos.appendChild(tallo);
      this.capaPicos.appendChild(g);
      const etiqueta = document.createElementNS(NS, "g");
      etiqueta.setAttribute("class", `r-etq est-${est}`);
      etiqueta.innerHTML = `<rect class="r-etq-fondo" rx="3"/><text class="r-etq-ip"></text><text class="r-etq-nombre"></text>`;
      etiqueta.querySelector(".r-etq-ip")!.textContent = b.d.ip;
      etiqueta.querySelector(".r-etq-nombre")!.textContent = recortar(b.d.device || "Sin nombre", 24);
      this.capaEtiquetas.appendChild(etiqueta);
      return { ...b, z: terreno(b.x, b.y), est, g, etiqueta, tallo, sx: 0, sy: 0, p: 1 };
    });

    // Malla: anillos concéntricos muestreados sobre el terreno.
    this.anillos = [];
    for (let r = 8; r <= R_BORDE; r += 11) {
      const pts = [];
      for (let k = 0; k <= 160; k++) {
        const t = (k / 160) * Math.PI * 2;
        const x = Math.cos(t) * r;
        const y = Math.sin(t) * r;
        pts.push({ x, y, z: terreno(x, y) });
      }
      this.anillos.push({ r, pts, banda: false });
    }
    for (const ms of BANDAS_MS) {
      const r = radioLatencia(ms, maxMs);
      const pts = [];
      for (let k = 0; k <= 160; k++) {
        const t = (k / 160) * Math.PI * 2;
        pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r, z: terreno(Math.cos(t) * r, Math.sin(t) * r) });
      }
      this.anillos.push({ r, pts, banda: true });
    }
    // Cada anillo se parte en tramos para darles opacidad según profundidad (lo de atrás se apaga).
    this.capaTerreno.innerHTML = "";
    this.caminos = [];
    for (const a of this.anillos) {
      for (let s = 0; s < 8; s++) {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("class", a.banda ? "r-banda" : "r-curva");
        (a.banda ? this.capaBandas : this.capaTerreno).appendChild(path);
        this.caminos.push(path);
      }
    }
    this.capaBandas.querySelectorAll("text").forEach((t) => t.remove());
    BANDAS_MS.forEach((ms) => {
      const t = document.createElementNS(NS, "text");
      t.setAttribute("class", "r-banda-txt");
      t.textContent = `${ms} ms`;
      this.capaBandas.appendChild(t);
    });
    this.centro.querySelector("text")!.textContent = red;
    this.el.classList.toggle("is-vacio", devices.length === 0);
    this.select(this.seleccionado && devices.some((d) => d.ip === this.seleccionado) ? this.seleccionado : null);
    if (this.visibles) this.setVisibles(this.visibles);
    this.pedirCuadro();
  }

  // ── Proyección ─────────────────────────────────────────────────────────────
  private proyectar(x: number, y: number, z: number) {
    const { yaw, pitch, zoom } = this.vista;
    const xr = x * Math.cos(yaw) - y * Math.sin(yaw);
    const yr = x * Math.sin(yaw) + y * Math.cos(yaw);
    // pitch = ángulo de la cámara sobre el plano (π/2 = vista cenital). Lo lejano (yr > 0)
    // sube hacia el horizonte y se achica; lo alto (z) sube y se acerca.
    const arriba = yr * Math.sin(pitch) + z * Math.cos(pitch);
    const prof = yr * Math.cos(pitch) - z * Math.sin(pitch);
    const p = FOCAL / (FOCAL + prof);
    // Cabe el borde del terreno con margen para la perspectiva (lo cercano se agranda) y las etiquetas.
    const escala = (Math.min(this.ancho / (R_BORDE * 2.5), this.alto / (R_BORDE * 1.95)) || 1) * zoom;
    return { sx: this.ancho / 2 + xr * p * escala, sy: this.alto * 0.48 - arriba * p * escala, p: p * escala, prof };
  }

  private medir() {
    const r = this.el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.ancho = r.width;
    this.alto = r.height;
    this.svg.setAttribute("viewBox", `0 0 ${this.ancho} ${this.alto}`);
    this.pintar();
  }

  private pintar() {
    if (!this.anillos.length) return;
    // Terreno
    let i = 0;
    const tramos = 8;
    for (const a of this.anillos) {
      const proy = a.pts.map((q) => this.proyectar(q.x, q.y, q.z));
      const porTramo = (proy.length - 1) / tramos;
      for (let s = 0; s < tramos; s++) {
        const desde = Math.round(s * porTramo);
        const hasta = Math.round((s + 1) * porTramo);
        const seg = proy.slice(desde, hasta + 1);
        const prof = seg.reduce((acc, q) => acc + q.prof, 0) / seg.length;
        const alto = a.pts.slice(desde, hasta + 1).reduce((acc, q) => acc + q.z, 0) / seg.length;
        const path = this.caminos[i++];
        path.setAttribute("d", "M" + seg.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(" L"));
        // Atrás = más tenue; las laderas altas se encienden con el color de la marca.
        const cerca = Math.max(0, Math.min(1, 0.5 - prof / (R_BORDE * 1.4)));
        path.style.opacity = String(a.banda ? 0.35 + cerca * 0.5 : 0.12 + cerca * 0.45);
        if (!a.banda) path.style.stroke = mezclar(Math.min(1, alto / 70));
      }
    }
    // Etiquetas de las bandas de latencia, en el borde más cercano de cada anillo
    const textos = this.capaBandas.querySelectorAll<SVGTextElement>(".r-banda-txt");
    this.anillos
      .filter((a) => a.banda)
      .forEach((a, k) => {
        const q = a.pts[0];
        const pr = this.proyectar(q.x + 6, q.y, q.z);
        textos[k]?.setAttribute("x", pr.sx.toFixed(1));
        textos[k]?.setAttribute("y", (pr.sy - 6).toFixed(1));
      });
    // Centro
    const c = this.proyectar(0, 0, this.picos.length ? 0 : 0);
    this.centro.setAttribute("transform", `translate(${c.sx.toFixed(1)} ${c.sy.toFixed(1)})`);
    // Barrido durante un escaneo: un anillo que recorre el terreno de dentro hacia fuera.
    if (this.escaneando) {
      const k = ((performance.now() - this.t0) / 2600) % 1;
      const r = 10 + k * R_BORDE;
      const pts = [];
      for (let s = 0; s <= 96; s++) {
        const t = (s / 96) * Math.PI * 2;
        const q = this.proyectar(Math.cos(t) * r, Math.sin(t) * r, 0);
        pts.push(`${q.sx.toFixed(1)},${q.sy.toFixed(1)}`);
      }
      this.capaBarrido.setAttribute("d", `M${pts.join(" L")} Z`);
      this.capaBarrido.style.opacity = String(0.8 * (1 - k));
    } else {
      this.capaBarrido.removeAttribute("d");
    }
    // Picos (orden por profundidad: lo cercano encima)
    for (const p of this.picos) {
      const top = this.proyectar(p.x, p.y, p.z + 6);
      const pie = this.proyectar(p.x, p.y, 0);
      p.sx = top.sx;
      p.sy = top.sy;
      p.p = top.p;
      p.g.setAttribute("transform", `translate(${top.sx.toFixed(1)} ${top.sy.toFixed(1)}) scale(${Math.max(0.7, Math.min(1.3, top.p)).toFixed(2)})`);
      p.g.dataset.prof = String(top.prof);
      p.tallo.setAttribute("x1", pie.sx.toFixed(1));
      p.tallo.setAttribute("y1", pie.sy.toFixed(1));
      p.tallo.setAttribute("x2", top.sx.toFixed(1));
      p.tallo.setAttribute("y2", top.sy.toFixed(1));
    }
    [...this.picos]
      .sort((a, b) => Number(b.g.dataset.prof) - Number(a.g.dataset.prof))
      .forEach((p) => this.capaPicos.appendChild(p.g));
    this.colocarEtiquetas();
  }

  // Etiquetas sin encimarse: se colocan de la más importante a la menos (seleccionada, bajo el
  // cursor, en riesgo, en alerta, el resto de delante hacia atrás) probando cuatro posiciones.
  // Si no cabe completa, queda solo el último octeto; si ni eso, se omite (el pico sigue
  // teniendo su nombre accesible y lo muestra al pasar el cursor).
  private colocarEtiquetas() {
    const ocupado: { x: number; y: number; w: number; h: number }[] = [];
    const choca = (r: { x: number; y: number; w: number; h: number }) =>
      r.x < 4 || r.y < 4 || r.x + r.w > this.ancho - 4 || r.y + r.h > this.alto - 4 ||
      ocupado.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
    const peso = (p: Pico) =>
      p.d.ip === this.seleccionado ? -3 : p.d.ip === this.encima ? -2 : p.est === "riesgo" ? -1 : p.est === "alerta" ? 0 : 1;
    const orden = [...this.picos].sort((a, b) => peso(a) - peso(b) || a.sy - b.sy);
    // Los picos y el rótulo del centro también ocupan sitio, para que ninguna etiqueta los tape.
    for (const p of this.picos) ocupado.push({ x: p.sx - 9, y: p.sy - 9, w: 18, h: 18 });
    const c = this.proyectar(0, 0, 0);
    const anchoRed = (this.centro.querySelector("text")?.textContent?.length ?? 0) * 7;
    ocupado.push({ x: c.sx - anchoRed / 2 - 4, y: c.sy - 16, w: anchoRed + 8, h: 52 });

    for (const p of orden) {
      const fuera = !!this.visibles && !this.visibles.has(p.d.ip);
      const destacada = p.d.ip === this.seleccionado || p.d.ip === this.encima;
      const ipTxt = p.etiqueta.querySelector<SVGTextElement>(".r-etq-ip")!;
      const nomTxt = p.etiqueta.querySelector<SVGTextElement>(".r-etq-nombre")!;
      const fondo = p.etiqueta.querySelector<SVGRectElement>(".r-etq-fondo")!;
      p.etiqueta.classList.toggle("is-destacada", destacada);
      if (fuera && !destacada) {
        p.etiqueta.style.display = "none";
        continue;
      }
      const nombre = nomTxt.textContent ?? "";
      const anchoIp = p.d.ip.length * 7.4;
      const anchoNom = nombre.length * 6.3;
      const completa = { w: Math.max(anchoIp, anchoNom) + 10, h: 32 };
      const corta = { w: (p.d.ip.split(".").pop()!.length + 1) * 7.4 + 8, h: 17 };
      const candidatos = (t: { w: number; h: number }) => [
        { x: p.sx + 13, y: p.sy - t.h / 2 },
        { x: p.sx - 13 - t.w, y: p.sy - t.h / 2 },
        { x: p.sx - t.w / 2, y: p.sy - 14 - t.h },
        { x: p.sx - t.w / 2, y: p.sy + 14 },
      ];
      let puesto: { x: number; y: number; w: number; h: number } | null = null;
      let modo: "completa" | "corta" = "completa";
      for (const c of candidatos(completa)) {
        const r = { ...c, ...completa };
        if (destacada || !choca(r)) {
          puesto = r;
          break;
        }
      }
      if (!puesto) {
        modo = "corta";
        for (const c of candidatos(corta)) {
          const r = { ...c, ...corta };
          if (!choca(r)) {
            puesto = r;
            break;
          }
        }
      }
      if (!puesto) {
        p.etiqueta.style.display = "none";
        continue;
      }
      ocupado.push(puesto);
      p.etiqueta.style.display = "";
      ipTxt.textContent = modo === "completa" ? p.d.ip : `.${p.d.ip.split(".").pop()}`;
      nomTxt.style.display = modo === "completa" ? "" : "none";
      ipTxt.setAttribute("x", String(puesto.x + 5));
      ipTxt.setAttribute("y", String(puesto.y + 13));
      nomTxt.setAttribute("x", String(puesto.x + 5));
      nomTxt.setAttribute("y", String(puesto.y + 27));
      fondo.setAttribute("x", String(puesto.x));
      fondo.setAttribute("y", String(puesto.y));
      fondo.setAttribute("width", String(puesto.w));
      fondo.setAttribute("height", String(puesto.h));
      if (destacada) this.capaEtiquetas.appendChild(p.etiqueta);
    }
  }

  // ── Animación: solo corre mientras hace falta (giro, transición a la vista inicial o barrido) ──
  private pedirCuadro() {
    if (this.raf === null) this.raf = requestAnimationFrame((t) => this.cuadro(t));
  }

  private cuadro(t: number) {
    this.raf = null;
    let seguir = this.escaneando;
    if (this.destino) {
      const k = 0.14;
      this.vista.yaw += (this.destino.yaw - this.vista.yaw) * k;
      this.vista.pitch += (this.destino.pitch - this.vista.pitch) * k;
      this.vista.zoom += (this.destino.zoom - this.vista.zoom) * k;
      if (Math.abs(this.destino.yaw - this.vista.yaw) + Math.abs(this.destino.pitch - this.vista.pitch) + Math.abs(this.destino.zoom - this.vista.zoom) < 0.002) {
        this.vista = { ...this.destino };
        this.destino = null;
      } else seguir = true;
    }
    // Giro lento en reposo: se detiene mientras el usuario interactúa o tiene un host elegido.
    const reposo = t - this.ultimaInteraccion > 6000 && !this.seleccionado && !this.encima && !this.arrastre;
    if (this.girando && reposo && this.picos.length && document.visibilityState === "visible") {
      this.vista.yaw += 0.0012;
      seguir = true;
    }
    this.pintar();
    if (seguir) this.pedirCuadro();
    // Giro en pausa por interacción o selección: se vuelve a mirar cada medio segundo, sin
    // repintar a 60 cuadros por segundo mientras tanto.
    else if (this.girando && this.picos.length && this.reintento === null)
      this.reintento = window.setTimeout(() => {
        this.reintento = null;
        this.pedirCuadro();
      }, 500);
  }

  private arrastre: { x: number; y: number } | null = null;
  private reintento: number | null = null;

  private conectarControles() {
    this.svg.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest(".r-pico")) return;
      this.arrastre = { x: e.clientX, y: e.clientY };
      this.destino = null;
      this.svg.setPointerCapture(e.pointerId);
      this.el.classList.add("is-arrastrando");
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!this.arrastre) return;
      this.vista.yaw += (e.clientX - this.arrastre.x) * 0.006;
      this.vista.pitch = Math.max(0.42, Math.min(1.45, this.vista.pitch + (e.clientY - this.arrastre.y) * 0.004));
      this.arrastre = { x: e.clientX, y: e.clientY };
      this.ultimaInteraccion = performance.now();
      this.pintar();
    });
    const soltar = () => {
      this.arrastre = null;
      this.el.classList.remove("is-arrastrando");
      this.ultimaInteraccion = performance.now();
    };
    this.svg.addEventListener("pointerup", soltar);
    this.svg.addEventListener("pointercancel", soltar);
    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.destino = null;
        this.vista.zoom = Math.max(0.6, Math.min(2.4, this.vista.zoom * Math.exp(-e.deltaY * 0.0012)));
        this.ultimaInteraccion = performance.now();
        this.pintar();
      },
      { passive: false }
    );
    this.svg.addEventListener("dblclick", () => this.vistaInicial());
    this.svg.addEventListener("keydown", (e) => {
      if ((e.target as Element).closest(".r-pico") && (e.key === "Enter" || e.key === " ")) return;
      const paso: Record<string, () => void> = {
        ArrowLeft: () => (this.vista.yaw -= 0.12),
        ArrowRight: () => (this.vista.yaw += 0.12),
        ArrowUp: () => (this.vista.pitch = Math.min(1.45, this.vista.pitch + 0.08)),
        ArrowDown: () => (this.vista.pitch = Math.max(0.42, this.vista.pitch - 0.08)),
        "+": () => (this.vista.zoom = Math.min(2.4, this.vista.zoom * 1.12)),
        "=": () => (this.vista.zoom = Math.min(2.4, this.vista.zoom * 1.12)),
        "-": () => (this.vista.zoom = Math.max(0.6, this.vista.zoom / 1.12)),
        "0": () => this.vistaInicial(),
      };
      if (!paso[e.key]) return;
      e.preventDefault();
      this.destino = null;
      paso[e.key]();
      this.ultimaInteraccion = performance.now();
      this.pintar();
    });
  }
}

