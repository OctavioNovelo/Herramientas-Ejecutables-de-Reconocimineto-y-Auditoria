// Placeholder de la pestaña "Vulnerar" (explotación/pentesting). Según el README raíz,
// esta categoría de herramientas todavía no está implementada — solo existe el escaneo de
// reconocimiento (Mapear) y detección de vulnerabilidades (Detectar). Este componente
// se reemplaza cuando la herramienta de explotación esté lista; hasta entonces, muestra un
// estado "próximamente" honesto en vez de una pestaña vacía sin explicación.

import "../styles/VulnerarView.css";

export class VulnerarView {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hera-vulnerar-placeholder";
    this.element.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="hera-vulnerar-icon">
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"></path>
        <path d="M9.5 12l1.8 1.8L15 10"></path>
      </svg>
      <h2>Próximamente</h2>
      <p>
        Las herramientas de explotación y pentesting todavía están en desarrollo.
        Por ahora, la detección de vulnerabilidades está disponible en la
        pestaña <strong>Detectar</strong>.
      </p>
    `;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}