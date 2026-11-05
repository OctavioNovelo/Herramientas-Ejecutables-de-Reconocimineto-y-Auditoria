// Búsqueda y filtros de dispositivos, compartidos por todas las vistas (inicio, Mapear,
// Detectar): lo que se busca en una se mantiene al cambiar a otra. Solo filtra lo que ya
// devolvió utils/parser.py; no vuelve a pedir datos.

import type { Device, CategoryDevice } from "../api/heraApi";
import { estadoHost, Estado } from "../utils/security";

export type EstadoFiltrable = Exclude<Estado, "sin-datos">;

export interface Filtro {
  texto: string;
  estados: Set<EstadoFiltrable>; // vacío = todos
  conHallazgos: boolean;
}

// Minúsculas y sin acentos, para que "camara" encuentre "Cámara".
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Todo el texto por el que se puede encontrar un dispositivo.
function textoDe(d: Device): string {
  const so = d.os_info ? [d.os_info.running, d.os_info.details, ...d.os_info.device_types, ...d.os_info.guesses.map((g) => g.name)] : [];
  const servicios = d.service_details.flatMap((s) => [s.service, s.product, s.version, s.extrainfo, s.title]);
  const hallazgos = [
    ...d.vulnerabilities.flatMap((v) => [v.id, v.output, ...(v.cve_ids ?? [])]),
    ...((d as CategoryDevice).possible_vulnerabilities ?? []).flatMap((v) => [v.id, v.output]),
  ];
  return normalizar([d.ip, d.device, d.mac, ...so, ...servicios, ...hallazgos].filter(Boolean).join("\n"));
}

// Cada palabra de la búsqueda tiene que aparecer (AND). Formas especiales:
//   ".13"       termina en .13 (último octeto de la IP)
//   "443"       tiene ese puerto abierto o filtrado (además de buscarlo como texto)
//   "puerto:22" solo ese puerto
function coincideTermino(d: Device, termino: string, texto: string): boolean {
  const puerto = /^puerto:(\d+)$/.exec(termino);
  if (puerto) return d.ports.includes(+puerto[1]) || d.filtered_ports.includes(+puerto[1]);
  if (/^\.\d{1,3}$/.test(termino)) return d.ip.endsWith(termino);
  if (/^\d+$/.test(termino) && (d.ports.includes(+termino) || d.filtered_ports.includes(+termino))) return true;
  return texto.includes(termino);
}

export function tieneHallazgos(d: Device): boolean {
  return d.vulnerabilities.length > 0 || ((d as CategoryDevice).possible_vulnerabilities?.length ?? 0) > 0;
}

export function coincide(d: Device, f: Filtro): boolean {
  if (f.conHallazgos && !tieneHallazgos(d)) return false;
  if (f.estados.size) {
    const e = estadoHost(d);
    if (e === "sin-datos" || !f.estados.has(e)) return false;
  }
  const terminos = normalizar(f.texto).split(/\s+/).filter(Boolean);
  if (!terminos.length) return true;
  const texto = textoDe(d);
  return terminos.every((t) => coincideTermino(d, t, texto));
}

export function filtroActivo(f: Filtro): boolean {
  return f.texto.trim() !== "" || f.estados.size > 0 || f.conHallazgos;
}

type Oyente = (f: Filtro) => void;

class FiltroState {
  private f: Filtro = { texto: "", estados: new Set(), conHallazgos: false };
  private oyentes = new Set<Oyente>();

  get(): Filtro {
    return this.f;
  }

  setTexto(texto: string) {
    this.f = { ...this.f, texto };
    this.avisar();
  }

  alternarEstado(e: EstadoFiltrable) {
    const estados = new Set(this.f.estados);
    if (estados.has(e)) estados.delete(e);
    else estados.add(e);
    this.f = { ...this.f, estados };
    this.avisar();
  }

  alternarHallazgos() {
    this.f = { ...this.f, conHallazgos: !this.f.conHallazgos };
    this.avisar();
  }

  limpiar() {
    this.f = { texto: "", estados: new Set(), conHallazgos: false };
    this.avisar();
  }

  subscribe(fn: Oyente): () => void {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  private avisar() {
    this.oyentes.forEach((fn) => fn(this.f));
  }
}

export const filtroState = new FiltroState();
