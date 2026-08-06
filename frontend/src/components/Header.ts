// Archivo: frontend/src/components/Header.ts
// Razón: Muestra el branding de HERA de forma minimalista en la parte superior sin barra de navegación tradicional.

import "../styles/Header.css";

export class Header {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement("header");
    this.element.className = "hera-header";

    // Branding principal centrado sin navegación
    this.element.innerHTML = `
      <div class="hera-logo-container">
        <div class="hera-title-wrap">
          <svg class="hera-logo-icon" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          <span class="hera-logo">HERA</span>
        </div>
        <span class="hera-subtitle">Auditoría & Análisis de Red</span>
      </div>
    `;
  }

  // Retorna el elemento del DOM del encabezado
  getElement(): HTMLElement {
    return this.element;
  }
}
