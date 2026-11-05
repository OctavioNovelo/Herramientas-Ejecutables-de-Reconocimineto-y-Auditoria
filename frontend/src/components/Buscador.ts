// Campo de búsqueda + filtros por estado. Puede haber varios en pantalla (inicio y vista de
// escaneo); todos leen y escriben el mismo filtroState. "/" o Ctrl+K enfocan el que esté
// visible; Esc lo vacía. Cada dirección visual lo estila con sus propias clases .bus-*.

import { filtroState, filtroActivo, EstadoFiltrable, Filtro } from "../state/filtro";
import { ESTADO_FORMA } from "../utils/security";

const CHIPS: { estado: EstadoFiltrable; texto: string }[] = [
  { estado: "riesgo", texto: "En riesgo" },
  { estado: "alerta", texto: "En alerta" },
  { estado: "seguro", texto: "Seguros" },
];

export class Buscador {
  private el: HTMLElement;
  private input: HTMLInputElement;
  private conteo: HTMLElement;
  private quitar: () => void;

  constructor(placeholder = "Buscar IP, nombre, MAC, puerto, servicio o CVE") {
    this.el = document.createElement("div");
    this.el.className = "bus";
    this.el.setAttribute("role", "search");
    this.el.innerHTML = `
      <label class="bus-campo">
        <svg class="bus-lupa" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>
        <input class="bus-input" type="search" autocomplete="off" spellcheck="false" aria-label="Buscar dispositivos" placeholder="${placeholder}">
        <kbd class="bus-tecla" aria-hidden="true">/</kbd>
      </label>
      <div class="bus-chips" role="group" aria-label="Filtrar por estado">
        ${CHIPS.map((c) => `<button type="button" class="bus-chip est-${c.estado}" data-estado="${c.estado}" aria-pressed="false">${ESTADO_FORMA[c.estado]}${c.texto}</button>`).join("")}
        <button type="button" class="bus-chip bus-chip-h" data-hallazgos aria-pressed="false">Con hallazgos</button>
      </div>
      <p class="bus-n" aria-live="polite"></p>
      <button type="button" class="bus-limpiar" hidden>Quitar filtros</button>`;

    this.input = this.el.querySelector(".bus-input")!;
    this.conteo = this.el.querySelector(".bus-n")!;
    this.input.addEventListener("input", () => filtroState.setTexto(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        filtroState.setTexto("");
        this.input.blur();
      }
    });
    this.el.querySelectorAll<HTMLButtonElement>("[data-estado]").forEach((b) =>
      b.addEventListener("click", () => filtroState.alternarEstado(b.dataset.estado as EstadoFiltrable))
    );
    this.el.querySelector("[data-hallazgos]")!.addEventListener("click", () => filtroState.alternarHallazgos());
    this.el.querySelector(".bus-limpiar")!.addEventListener("click", () => filtroState.limpiar());

    this.quitar = filtroState.subscribe((f) => this.pintar(f));
    this.pintar(filtroState.get());
  }

  getElement(): HTMLElement {
    return this.el;
  }

  // Lo llama quien filtra: cuántos dispositivos quedan visibles de cuántos hay.
  setConteo(visibles: number, total: number) {
    const f = filtroState.get();
    this.conteo.textContent = filtroActivo(f) ? `${visibles} de ${total}` : total ? `${total} ${total === 1 ? "dispositivo" : "dispositivos"}` : "";
  }

  destruir() {
    this.quitar();
  }

  private pintar(f: Filtro) {
    if (document.activeElement !== this.input && this.input.value !== f.texto) this.input.value = f.texto;
    this.el.querySelectorAll<HTMLButtonElement>("[data-estado]").forEach((b) => {
      const on = f.estados.has(b.dataset.estado as EstadoFiltrable);
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const h = this.el.querySelector<HTMLButtonElement>("[data-hallazgos]")!;
    h.classList.toggle("is-on", f.conHallazgos);
    h.setAttribute("aria-pressed", String(f.conHallazgos));
    (this.el.querySelector(".bus-limpiar") as HTMLElement).hidden = !filtroActivo(f);
  }
}

// Atajo global: "/" o Ctrl+K enfoca el buscador visible (salvo que ya se esté escribiendo).
document.addEventListener("keydown", (e) => {
  const escribiendo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
  const atajo = (e.key === "/" && !escribiendo) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey));
  if (!atajo) return;
  const visible = [...document.querySelectorAll<HTMLInputElement>(".bus-input")].find((i) => i.offsetParent !== null);
  if (!visible) return;
  e.preventDefault();
  visible.focus();
  visible.select();
});
