// Menú horizontal fijo de navegación entre pestañas. Orden: Mapear | Detectar |
// LOGO HERA (home) | Vulnerar | Opción 4. Mapear/Detectar/Vulnerar están activas;
// Opción 4 queda visualmente presente pero inerte (reservada para futuro).

import { viewState } from "../state/viewState";
import "../styles/NavBar.css";
// Import de Vite: en build/dev, esto resuelve a la URL final del asset ya empaquetado
// (no es una ruta de texto literal — Vite copia el archivo y devuelve su URL real).
import logoImg from "../../images/logo.png";

export class NavBar {
  private element: HTMLElement;
  private btnMapear: HTMLButtonElement;
  private btnDetectar: HTMLButtonElement;
  private btnVulnerar: HTMLButtonElement;

  constructor() {
    this.element = document.createElement("nav");
    this.element.className = "hera-navbar";

    // Grupo izquierdo: Mapear | Detectar
    const leftGroup = document.createElement("div");
    leftGroup.className = "hera-navbar-group";

    this.btnMapear = document.createElement("button");
    this.btnMapear.className = "hera-navbar-item";
    this.btnMapear.textContent = "MAPEAR";
    this.btnMapear.addEventListener("click", () => viewState.goToMapear());
    leftGroup.appendChild(this.btnMapear);

    this.btnDetectar = document.createElement("button");
    this.btnDetectar.className = "hera-navbar-item";
    this.btnDetectar.textContent = "DETECTAR";
    this.btnDetectar.addEventListener("click", () => viewState.goToDetectar());
    leftGroup.appendChild(this.btnDetectar);

    // Centro: Logo HERA (home). Usa el mismo ícono y estilo de gradiente que Header.ts
    // (capas + wordmark con gradient-clip), a escala reducida para caber en el nav de 56px.
    const logoBtn = document.createElement("button");
    logoBtn.className = "hera-navbar-logo";
    logoBtn.innerHTML = `
      <img class="hera-navbar-logo-icon" src="${logoImg}" alt="HERA" />
      <span class="hera-navbar-logo-text">HERA</span>
    `;
    logoBtn.addEventListener("click", () => viewState.goToDashboard());

    // Grupo derecho: Vulnerar | Opción 4
    const rightGroup = document.createElement("div");
    rightGroup.className = "hera-navbar-group hera-navbar-right";

    this.btnVulnerar = document.createElement("button");
    this.btnVulnerar.className = "hera-navbar-item";
    this.btnVulnerar.textContent = "VULNERAR";
    this.btnVulnerar.addEventListener("click", () => viewState.goToVulnerar());
    rightGroup.appendChild(this.btnVulnerar);

    const opcion4 = document.createElement("span");
    opcion4.className = "hera-navbar-item is-disabled";
    opcion4.textContent = "OPCIÓN 4";
    rightGroup.appendChild(opcion4);

    this.element.appendChild(leftGroup);
    this.element.appendChild(logoBtn);
    this.element.appendChild(rightGroup);

    // Reflejar la pestaña activa
    viewState.subscribe(() => {
      const view = viewState.getView();
      this.btnMapear.classList.toggle("is-active", view === "mapear");
      this.btnDetectar.classList.toggle("is-active", view === "detectar");
      this.btnVulnerar.classList.toggle("is-active", view === "vulnerar");
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }
}