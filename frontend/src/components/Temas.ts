// Selector de paleta. Las paletas están en styles/temas.css; aquí solo se elige una, se aplica
// en <html data-tema> y se recuerda en este equipo. Si el almacenamiento no está disponible,
// la elección dura lo que dure la ventana.

export type Tema = "abismo" | "grafito" | "ocelo" | "niebla" | "pizarra";

const TEMAS: { id: Tema; nombre: string; nota: string; muestra: [string, string, string] }[] = [
  { id: "abismo", nombre: "Abismo", nota: "azul de medianoche", muestra: ["#0b1220", "#5ab4f5", "#ff6b6b"] },
  { id: "grafito", nombre: "Grafito", nota: "neutro, el color solo informa", muestra: ["#131416", "#e6e7ea", "#f2675a"] },
  { id: "ocelo", nombre: "Ocelo", nota: "ciruela y turquesa del pavo real", muestra: ["#14101c", "#2bcac7", "#ff6b8b"] },
  { id: "niebla", nombre: "Niebla", nota: "claro, gris azulado", muestra: ["#d3dae3", "#0f6dbf", "#bb3426"] },
  { id: "pizarra", nombre: "Pizarra", nota: "la de la ronda anterior", muestra: ["#161c23", "#32d9ba", "#f2735c"] },
];
const CLAVE = "hera.tema";

function leer(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return TEMAS.some((t) => t.id === v) ? (v as Tema) : null;
  } catch {
    return null;
  }
}

export function aplicarTema(t: Tema) {
  document.documentElement.dataset.tema = t;
  try {
    localStorage.setItem(CLAVE, t);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

// Aplica la paleta guardada (o la de la dirección) antes del primer pintado.
export function iniciarTema(porDefecto: Tema): Tema {
  const t = leer() ?? porDefecto;
  document.documentElement.dataset.tema = t;
  return t;
}

const muestra = (m: [string, string, string]) =>
  `<span class="tm-muestra" aria-hidden="true">${m.map((c) => `<i style="background:${c}"></i>`).join("")}</span>`;

export class Temas {
  private el: HTMLElement;
  private actual: Tema;

  constructor(actual: Tema) {
    this.actual = actual;
    this.el = document.createElement("div");
    this.el.className = "tm";
    this.pintar();
    document.addEventListener("click", (e) => {
      if (!this.el.contains(e.target as Node)) this.cerrar();
    });
    this.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.cerrar();
        this.el.querySelector<HTMLButtonElement>(".tm-boton")?.focus();
      }
    });
  }

  getElement() {
    return this.el;
  }

  private cerrar() {
    this.el.querySelector(".tm-menu")?.setAttribute("hidden", "");
    this.el.querySelector(".tm-boton")?.setAttribute("aria-expanded", "false");
  }

  private pintar() {
    const t = TEMAS.find((x) => x.id === this.actual)!;
    this.el.innerHTML = `
      <button type="button" class="tm-boton" aria-haspopup="true" aria-expanded="false" title="Cambiar colores">${muestra(t.muestra)}<span>Colores</span></button>
      <div class="tm-menu" role="menu" hidden>
        ${TEMAS.map(
          (x) => `<button type="button" role="menuitemradio" aria-checked="${x.id === this.actual}" class="tm-op" data-tema="${x.id}">
            ${muestra(x.muestra)}<span class="tm-nombre">${x.nombre}</span><span class="tm-nota">${x.nota}</span>
          </button>`
        ).join("")}
      </div>`;
    const boton = this.el.querySelector<HTMLButtonElement>(".tm-boton")!;
    const menu = this.el.querySelector<HTMLElement>(".tm-menu")!;
    boton.addEventListener("click", () => {
      const abrir = menu.hidden;
      menu.hidden = !abrir;
      boton.setAttribute("aria-expanded", String(abrir));
      if (abrir) menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    });
    menu.querySelectorAll<HTMLButtonElement>(".tm-op").forEach((b) =>
      b.addEventListener("click", () => {
        this.actual = b.dataset.tema as Tema;
        aplicarTema(this.actual);
        this.pintar();
        this.el.querySelector<HTMLButtonElement>(".tm-boton")?.focus();
      })
    );
    menu.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const ops = [...menu.querySelectorAll<HTMLButtonElement>(".tm-op")];
      const i = ops.indexOf(document.activeElement as HTMLButtonElement);
      ops[(i + (e.key === "ArrowDown" ? 1 : ops.length - 1)) % ops.length].focus();
    });
  }
}
