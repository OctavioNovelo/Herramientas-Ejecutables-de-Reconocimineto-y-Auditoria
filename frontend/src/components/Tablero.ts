// Tablero de trabajo: "Qué hacer ahora" convertido en columnas (Hoy, Esta semana, Cuando puedas,
// Hecho). Cada tarjeta es una acción del plan; se arrastra entre columnas o se mueve con sus
// botones (también con teclado). Lo que el usuario decide (columna y "hecho") se guarda en este
// equipo y sobrevive a nuevos escaneos: la acción se reconoce por su id. Si algo marcado como
// hecho vuelve a aparecer en el escaneo siguiente, la tarjeta lo avisa.
//
// Se guarda en localStorage porque es una preferencia de esta persona en este equipo, no un dato
// de la auditoría (los resultados siguen viniendo solo de utils/parser.py).

import type { Accion, Prioridad } from "../synthesis/plan";
import { PRIORIDAD_TEXTO } from "../synthesis/plan";
import { esc, ESTADO_FORMA } from "../utils/security";

type Columna = "hoy" | "semana" | "luego" | "hecho";

const COLUMNAS: { id: Columna; titulo: string; nota: string }[] = [
  { id: "hoy", titulo: "Hoy", nota: "Riesgos que alguien de fuera podría aprovechar ya." },
  { id: "semana", titulo: "Esta semana", nota: "Exposiciones que conviene cerrar pronto." },
  { id: "luego", titulo: "Cuando puedas", nota: "Mejoras sin urgencia." },
  { id: "hecho", titulo: "Hecho", nota: "Se comprueba en el próximo escaneo." },
];

const POR_PRIORIDAD: Record<Prioridad, Columna> = { riesgo: "hoy", alerta: "semana", info: "luego" };
const CLAVE = "hera.tablero.v1";

interface Guardado {
  columna: Columna;
  hechoEn?: string; // fecha del escaneo en que se marcó como hecha
}

function leer(): Record<string, Guardado> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "{}");
  } catch {
    return {};
  }
}

function guardar(datos: Record<string, Guardado>) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Sin almacenamiento (modo privado, disco lleno): el tablero sigue funcionando en memoria.
  }
}

export class Tablero {
  private el: HTMLElement;
  private acciones: Accion[] = [];
  private estado: Record<string, Guardado> = leer();
  private ultimoEscaneo = "";
  private onHost: (ip: string) => void;
  private arrastrando: string | null = null;

  constructor(onHost: (ip: string) => void) {
    this.onHost = onHost;
    this.el = document.createElement("div");
    this.el.className = "tablero";
  }

  getElement() {
    return this.el;
  }

  update(acciones: Accion[], ultimoEscaneo: string, hayDatos: boolean) {
    this.acciones = acciones;
    // Acciones hechas en un escaneo anterior que este escaneo vuelve a encontrar.
    if (ultimoEscaneo && ultimoEscaneo !== this.ultimoEscaneo) {
      for (const a of acciones) {
        const g = this.estado[a.id];
        if (g?.columna === "hecho" && g.hechoEn && g.hechoEn !== ultimoEscaneo) g.hechoEn = `volvió:${g.hechoEn}`;
      }
      guardar(this.estado);
    }
    this.ultimoEscaneo = ultimoEscaneo;
    this.pintar(hayDatos);
  }

  private columnaDe(a: Accion): Columna {
    return this.estado[a.id]?.columna ?? POR_PRIORIDAD[a.prioridad];
  }

  private mover(id: string, columna: Columna) {
    const a = this.acciones.find((x) => x.id === id);
    if (!a) return;
    if (columna === POR_PRIORIDAD[a.prioridad] && columna !== "hecho") delete this.estado[id];
    else this.estado[id] = { columna, hechoEn: columna === "hecho" ? this.ultimoEscaneo : undefined };
    guardar(this.estado);
    this.pintar(true);
    // Mantener el foco en la tarjeta movida, para seguir con el teclado.
    this.el.querySelector<HTMLElement>(`.tarjeta[data-id="${CSS.escape(id)}"] .tj-mover`)?.focus();
  }

  private pintar(hayDatos: boolean) {
    if (!hayDatos) {
      this.el.innerHTML = `<div class="tablero-vacio"><h2>El tablero se arma con el primer escaneo</h2><p>Cada hallazgo y cada puerto delicado se convierte en una tarjeta con los pasos para resolverlo. Arrástralas entre columnas a medida que avances.</p></div>`;
      return;
    }
    const total = this.acciones.length;
    const hechas = this.acciones.filter((a) => this.columnaDe(a) === "hecho").length;
    const pct = total ? Math.round((hechas / total) * 100) : 100;
    this.el.innerHTML = `
      <header class="tablero-cab">
        <div>
          <h2>Plan de trabajo</h2>
          <p class="tablero-sub">${total ? `${hechas} de ${total} ${total === 1 ? "acción resuelta" : "acciones resueltas"}` : "Nada pendiente en el último escaneo"}</p>
        </div>
        <div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avance del plan"><span style="width:${pct}%"></span></div>
      </header>
      <div class="columnas">${COLUMNAS.map((c) => this.columna(c)).join("")}</div>
      <p class="tablero-origen">Plan generado con reglas a partir del último escaneo. Tu avance se guarda en este equipo.</p>`;
    this.conectar();
  }

  private columna(c: { id: Columna; titulo: string; nota: string }): string {
    const tarjetas = this.acciones.filter((a) => this.columnaDe(a) === c.id);
    return `<section class="columna col-${c.id}" data-col="${c.id}" aria-label="${c.titulo}">
      <h3 class="col-t">${c.titulo} <span>${tarjetas.length}</span></h3>
      <p class="col-nota">${c.nota}</p>
      <ol class="col-lista">${tarjetas.map((a) => this.tarjeta(a, c.id)).join("") || `<li class="col-vacia">Suelta aquí una tarjeta</li>`}</ol>
    </section>`;
  }

  private tarjeta(a: Accion, col: Columna): string {
    const est = a.prioridad === "info" ? "sin-datos" : a.prioridad;
    const volvio = this.estado[a.id]?.hechoEn?.startsWith("volvió:");
    const opciones = COLUMNAS.filter((c) => c.id !== col)
      .map((c) => `<option value="${c.id}">${c.titulo}</option>`)
      .join("");
    return `<li class="tarjeta est-${est}${col === "hecho" ? " is-hecha" : ""}" data-id="${esc(a.id)}" draggable="true">
      <p class="tj-prio">${ESTADO_FORMA[est]} ${PRIORIDAD_TEXTO[a.prioridad]}${volvio ? `<span class="tj-volvio">volvió a aparecer</span>` : ""}</p>
      <p class="tj-t">${esc(a.titulo)}</p>
      <details class="tj-det"><summary>Cómo resolverlo</summary>
        <p class="tj-m">${esc(a.motivo)}</p>
        <ul class="tj-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      </details>
      <div class="tj-pie">
        <p class="tj-hosts">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button type="button" data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
        ${col === "hecho" ? "" : `<button type="button" class="tj-hecho" data-hecho>Hecho</button>`}
        <label class="tj-mover-l"><span class="sr">Mover a</span><select class="tj-mover" aria-label="Mover a otra columna"><option value="">Mover a…</option>${opciones}</select></label>
      </div>
    </li>`;
  }

  private conectar() {
    this.el.querySelectorAll<HTMLElement>(".tarjeta").forEach((t) => {
      const id = t.dataset.id!;
      t.addEventListener("dragstart", (e) => {
        this.arrastrando = id;
        t.classList.add("is-arrastrando");
        e.dataTransfer?.setData("text/plain", id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      t.addEventListener("dragend", () => {
        this.arrastrando = null;
        t.classList.remove("is-arrastrando");
        this.el.querySelectorAll(".columna").forEach((c) => c.classList.remove("is-destino"));
      });
      t.querySelector("[data-hecho]")?.addEventListener("click", () => this.mover(id, "hecho"));
      t.querySelector<HTMLSelectElement>(".tj-mover")!.addEventListener("change", (e) => {
        const v = (e.target as HTMLSelectElement).value as Columna;
        if (v) this.mover(id, v);
      });
      t.querySelectorAll<HTMLButtonElement>(".tj-hosts button").forEach((b) => b.addEventListener("click", () => this.onHost(b.dataset.ip!)));
    });
    this.el.querySelectorAll<HTMLElement>(".columna").forEach((c) => {
      c.addEventListener("dragover", (e) => {
        if (!this.arrastrando) return;
        e.preventDefault();
        c.classList.add("is-destino");
      });
      c.addEventListener("dragleave", (e) => {
        if (!c.contains(e.relatedTarget as Node)) c.classList.remove("is-destino");
      });
      c.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = this.arrastrando ?? e.dataTransfer?.getData("text/plain");
        if (id) this.mover(id, c.dataset.col as Columna);
      });
    });
  }
}
