// Campo de búsqueda + un botón "Filtros" que abre un menú con los filtros por estado y "con
// hallazgos". Puede haber varios en pantalla (inicio y vista de escaneo); todos leen y escriben
// el mismo filtroState. "/" o Ctrl+K enfocan el que esté
// visible; Esc lo vacía. Cada dirección visual lo estila con sus propias clases .bus-*.

import { filtroState, filtroActivo, EstadoFiltrable, Filtro } from "../state/filtro";

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
      <div class="bus-pie">
        <p class="bus-n" aria-live="polite"></p>
        <div class="bus-filtros">
          <button type="button" class="bus-filtrar" aria-haspopup="true" aria-expanded="false">Filtros<span class="bus-cuenta" hidden></span></button>
          <div class="bus-menu" role="group" aria-label="Filtrar dispositivos" hidden>
            <p class="bus-menu-t">Estado</p>
            ${CHIPS.map((c) => `<button type="button" class="bus-op est-${c.estado}" data-estado="${c.estado}" aria-pressed="false"><span class="bus-caja" aria-hidden="true"></span>${c.texto}</button>`).join("")}
            <p class="bus-menu-t">Hallazgos</p>
            <button type="button" class="bus-op" data-hallazgos aria-pressed="false"><span class="bus-caja" aria-hidden="true"></span>Solo con hallazgos</button>
            <button type="button" class="bus-limpiar" hidden>Quitar filtros</button>
          </div>
        </div>
      </div>`;

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

    // El menú se abre con el botón y se cierra con Esc o al pulsar fuera.
    const boton = this.el.querySelector<HTMLButtonElement>(".bus-filtrar")!;
    const menu = this.el.querySelector<HTMLElement>(".bus-menu")!;
    const abrir = (si: boolean) => {
      menu.hidden = !si;
      boton.setAttribute("aria-expanded", String(si));
    };
    boton.addEventListener("click", () => abrir(menu.hidden));
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !this.el.querySelector(".bus-filtros")!.contains(e.target as Node)) abrir(false);
    });
    this.el.querySelector(".bus-filtros")!.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key !== "Escape" || menu.hidden) return;
      e.stopPropagation();
      abrir(false);
      boton.focus();
    });

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
    const n = f.estados.size + (f.conHallazgos ? 1 : 0);
    const cuenta = this.el.querySelector<HTMLElement>(".bus-cuenta")!;
    cuenta.hidden = n === 0;
    cuenta.textContent = String(n);
    this.el.querySelector(".bus-filtrar")!.classList.toggle("is-on", n > 0);
    (this.el.querySelector(".bus-limpiar") as HTMLElement).hidden = n === 0;
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
