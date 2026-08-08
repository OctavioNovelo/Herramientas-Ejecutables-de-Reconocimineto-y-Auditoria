// Menú horizontal fijo de navegación entre pestañas. Orden: Escaneo | Opción 2 |
// LOGO HERA (home) | Opción 3 | Opción 4. Las Opciones 2/3/4 quedan visualmente presentes
// pero inertes (reservadas para futuro), tal como se acordó en el diseño.

import { viewState } from "../state/viewState";
import "../styles/NavBar.css";

export class NavBar {
  private element: HTMLElement;
  private btnEscaneo: HTMLButtonElement;

  constructor() {
    this.element = document.createElement("nav");
    this.element.className = "hera-navbar";

    // Grupo izquierdo: Escaneo | Opción 2
    const leftGroup = document.createElement("div");
    leftGroup.className = "hera-navbar-group";

    this.btnEscaneo = document.createElement("button");
    this.btnEscaneo.className = "hera-navbar-item";
    this.btnEscaneo.textContent = "ESCANEO";
    this.btnEscaneo.addEventListener("click", () => viewState.goToScan());
    leftGroup.appendChild(this.btnEscaneo);

    const opcion2 = document.createElement("span");
    opcion2.className = "hera-navbar-item is-disabled";
    opcion2.textContent = "OPCIÓN 2";
    leftGroup.appendChild(opcion2);

    // Centro: Logo HERA (home). Usa el mismo ícono y estilo de gradiente que Header.ts
    // (capas + wordmark con gradient-clip), a escala reducida para caber en el nav de 56px.
    const logoBtn = document.createElement("button");
    logoBtn.className = "hera-navbar-logo";
    logoBtn.innerHTML = `
      <svg class="hera-navbar-logo-icon" viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
      </svg>
      <span class="hera-navbar-logo-text">HERA</span>
    `;
    logoBtn.addEventListener("click", () => viewState.goToDashboard());

    // Grupo derecho: Opción 3 | Opción 4
    const rightGroup = document.createElement("div");
    rightGroup.className = "hera-navbar-group hera-navbar-right";

    const opcion3 = document.createElement("span");
    opcion3.className = "hera-navbar-item is-disabled";
    opcion3.textContent = "OPCIÓN 3";
    rightGroup.appendChild(opcion3);

    const opcion4 = document.createElement("span");
    opcion4.className = "hera-navbar-item is-disabled";
    opcion4.textContent = "OPCIÓN 4";
    rightGroup.appendChild(opcion4);

    this.element.appendChild(leftGroup);
    this.element.appendChild(logoBtn);
    this.element.appendChild(rightGroup);

    // Reflejar la pestaña activa
    viewState.subscribe(() => {
      const isScanView = viewState.getView() === "scan";
      this.btnEscaneo.classList.toggle("is-active", isScanView);
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }
}