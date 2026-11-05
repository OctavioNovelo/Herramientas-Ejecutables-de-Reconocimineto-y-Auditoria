// Maqueta de la red: las láminas de la ficha llevadas a toda la red. Cada tipo de dispositivo
// tiene su plataforma isométrica (como una placa del despiece) y cada dispositivo es una torre
// sobre ella: la ALTURA es su exposición (puertos abiertos y hallazgos) y el color de la cara
// superior, su estado. Al pasar el cursor la torre se levanta, igual que las capas.
//
// Es un dibujo estático: se arma una vez por escaneo. El único movimiento es el de la torre bajo
// el cursor (CSS), así que no hay trabajo por cuadro.

import type { Device, CategoryDevice } from "../api/heraApi";
import { esc, estadoHost, ESTADO_TEXTO } from "../utils/security";
import { tipoDe, TIPOS, ORDEN_TIPOS, Tipo, iconoEnSvg } from "../utils/tipos";

const NS = "http://www.w3.org/2000/svg";
const S = 34; // tamaño de una celda en pantalla
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const ANCHO_MAX = 13; // celdas por fila de plataformas
const LADO = 0.62; // lado de la base de una torre (en celdas)

// Proyección isométrica: x a la derecha-abajo, y a la izquierda-abajo, z hacia arriba.
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * COS * S, (x + y) * SIN * S - z];
const pt = ([a, b]: [number, number]) => `${a.toFixed(1)},${b.toFixed(1)}`;

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function altura(d: Device): number {
  const pesos = { critical: 7, high: 5, medium: 3, low: 1 } as const;
  const score =
    d.ports.length + d.filtered_ports.length * 0.3 + d.vulnerabilities.reduce((s, v) => s + pesos[v.severity], 0) + ((d as CategoryDevice).possible_vulnerabilities?.length ?? 0);
  return 10 + 74 * (1 - Math.exp(-score / 7));
}

// Prisma de base cuadrada (x, y, lado l) y altura h: tres caras visibles.
function prisma(x: number, y: number, l: number, h: number, z0 = 0) {
  const a = iso(x, y, z0), b = iso(x + l, y, z0), c = iso(x + l, y + l, z0), d = iso(x, y + l, z0);
  const up = (p: [number, number]): [number, number] => [p[0], p[1] - h];
  return {
    top: [up(a), up(b), up(c), up(d)].map(pt).join(" "),
    izq: [d, c, up(c), up(d)].map(pt).join(" "),
    der: [c, b, up(b), up(c)].map(pt).join(" "),
    centroTop: ((): [number, number] => { const p = iso(x + l / 2, y + l / 2, z0); return [p[0], p[1] - h]; })(),
  };
}

const recortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

interface Distrito { tipo: Tipo; ds: Device[]; cols: number; filas: number; x: number; y: number; w: number; h: number }

export class Maqueta {
  private el: HTMLElement;
  private svg: SVGSVGElement;
  private seleccionado: string | null = null;
  private onSelect: (ip: string) => void;

  constructor(onSelect: (ip: string) => void) {
    this.onSelect = onSelect;
    this.el = document.createElement("div");
    this.el.className = "maqueta";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("role", "group");
    this.svg.setAttribute("aria-label", "Maqueta de la red: una plataforma por tipo de dispositivo; la altura de cada torre es su exposición");
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
    this.svg.querySelectorAll<SVGGElement>(".mq-torre").forEach((g) => {
      const on = g.dataset.ip === ip;
      g.classList.toggle("is-selected", on);
      g.setAttribute("aria-pressed", String(on));
    });
  }

  setVisibles(ips: Set<string> | null) {
    this.svg.querySelectorAll<SVGGElement>(".mq-torre").forEach((g) => g.classList.toggle("is-fuera", !!ips && !ips.has(g.dataset.ip!)));
  }

  update(devices: Device[]) {
    // Distritos: uno por tipo, con sus torres en una cuadrícula casi cuadrada.
    const distritos: Distrito[] = ORDEN_TIPOS.map((tipo) => {
      const ds = devices.filter((d) => tipoDe(d) === tipo).sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
      const cols = Math.max(2, Math.ceil(Math.sqrt(ds.length)));
      const filas = Math.max(1, Math.ceil(ds.length / cols));
      return { tipo, ds, cols, filas, x: 0, y: 0, w: cols + 0.8, h: filas + 0.8 };
    }).filter((d) => d.ds.length);

    // Acomodo en estantes: se llenan filas de plataformas de izquierda a derecha.
    let cx = 0, cy = 0, altoFila = 0;
    for (const d of distritos) {
      if (cx > 0 && cx + d.w > ANCHO_MAX) {
        cx = 0;
        cy += altoFila + 1.1;
        altoFila = 0;
      }
      d.x = cx;
      d.y = cy;
      cx += d.w + 1.1;
      altoFila = Math.max(altoFila, d.h);
    }

    // Se dibuja de atrás hacia delante (x + y creciente) para que lo cercano tape lo lejano.
    let plataformas = "";
    let rotulos = "";
    const torres: { orden: number; svg: string }[] = [];
    for (const d of distritos) {
      const a = iso(d.x, d.y), b = iso(d.x + d.w, d.y), c = iso(d.x + d.w, d.y + d.h), e = iso(d.x, d.y + d.h);
      const G = 7;
      const baja = (q: [number, number]): [number, number] => [q[0], q[1] + G];
      plataformas += `<g class="mq-plataforma">
        <polygon class="mq-p-izq" points="${[e, c, baja(c), baja(e)].map(pt).join(" ")}"/>
        <polygon class="mq-p-der" points="${[c, b, baja(b), baja(c)].map(pt).join(" ")}"/>
        <polygon class="mq-p-top" points="${[a, b, c, e].map(pt).join(" ")}"/>
      </g>`;
      // Rótulo en el borde frontal izquierdo de la plataforma, inclinado como ese borde.
      const [rx, ry] = iso(d.x, d.y + d.h);
      const ang = (Math.atan2(c[1] - e[1], c[0] - e[0]) * 180) / Math.PI;
      rotulos += `<g class="mq-rotulo" transform="translate(${(rx + 8).toFixed(1)} ${(ry + 22).toFixed(1)}) rotate(${ang.toFixed(1)})">
        ${iconoEnSvg(d.tipo, 7, -4, 13, "mq-rotulo-ico")}
        <text x="18" y="0">${esc(TIPOS[d.tipo].plural)} <tspan>${d.ds.length}</tspan></text></g>`;

      d.ds.forEach((dev, i) => {
        const col = i % d.cols;
        const fila = Math.floor(i / d.cols);
        const x = d.x + 0.4 + col + (1 - LADO) / 2;
        const y = d.y + 0.4 + fila + (1 - LADO) / 2;
        const h = altura(dev);
        const est = estadoHost(dev);
        const pr = prisma(x, y, LADO, h);
        const [tx, ty] = pr.centroTop;
        const hall = dev.vulnerabilities.length;
        const lectura = `${ESTADO_TEXTO[est]}, ${dev.ports.length} puertos abiertos${hall ? `, ${hall} hallazgos` : ""}`;
        torres.push({
          orden: x + y,
          svg: `<g class="mq-torre est-${est}" data-ip="${esc(dev.ip)}" tabindex="0" role="button" aria-label="${esc(dev.ip)} ${esc(dev.device || "sin nombre")} (${TIPOS[d.tipo].nombre}): ${lectura}">
            <polygon class="mq-hit" points="${pr.izq} ${pr.der} ${pr.top}"/>
            <g class="mq-cuerpo">
              <polygon class="mq-t-izq" points="${pr.izq}"/>
              <polygon class="mq-t-der" points="${pr.der}"/>
              <polygon class="mq-t-top" points="${pr.top}"/>
              ${iconoEnSvg(d.tipo, tx, ty, 12, "mq-t-ico")}
              <g class="mq-etq" transform="translate(${tx.toFixed(1)} ${(ty - 16).toFixed(1)})">
                <rect x="${-Math.max(dev.ip.length * 3.9, recortar(dev.device || "Sin nombre", 22).length * 3.4) - 7}" y="-30" width="${Math.max(dev.ip.length * 7.8, recortar(dev.device || "Sin nombre", 22).length * 6.8) + 14}" height="34" rx="3"/>
                <text class="mq-etq-ip" y="-15">${esc(dev.ip)}</text>
                <text class="mq-etq-nombre" y="-2">${esc(recortar(dev.device || "Sin nombre", 22))}</text>
              </g>
            </g>
          </g>`,
        });
      });
    }
    torres.sort((a, b) => a.orden - b.orden);

    // Los rótulos van encima de las torres (con contorno oscuro) para que una torre de la fila de
    // delante no tape el nombre de la plataforma de atrás.
    this.svg.innerHTML = `<g class="mq-plataformas">${plataformas}</g><g class="mq-torres">${torres.map((t) => t.svg).join("")}</g><g class="mq-rotulos" aria-hidden="true">${rotulos}</g>
      ${devices.length === 0 ? `<text class="mq-vacio" x="0" y="0" text-anchor="middle">Sin dispositivos todavía. Escanea la red para levantar la maqueta.</text>` : ""}`;

    // Encuadre: el viewBox se ajusta a lo dibujado (más margen arriba para torres y etiquetas).
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of distritos) {
      for (const [px, py] of [iso(d.x, d.y), iso(d.x + d.w, d.y), iso(d.x + d.w, d.y + d.h), iso(d.x, d.y + d.h)]) {
        xs.push(px);
        ys.push(py);
      }
    }
    if (!xs.length) {
      this.svg.setAttribute("viewBox", "-300 -200 600 400");
    } else {
      const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30;
      const minY = Math.min(...ys) - 130, maxY = Math.max(...ys) + 50;
      this.svg.setAttribute("viewBox", `${minX.toFixed(0)} ${minY.toFixed(0)} ${(maxX - minX).toFixed(0)} ${(maxY - minY).toFixed(0)}`);
    }

    this.svg.querySelectorAll<SVGGElement>(".mq-torre").forEach((g) => {
      const ip = g.dataset.ip!;
      g.addEventListener("click", () => this.onSelect(ip));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.onSelect(ip);
        }
      });
      // La torre bajo el cursor pasa al frente para que su etiqueta no quede tapada.
      g.addEventListener("pointerenter", () => g.parentElement?.appendChild(g));
      g.addEventListener("focus", () => g.parentElement?.appendChild(g));
    });
    this.select(this.seleccionado);
  }
}

