// Contenedor visual base con bordes redondeados y sombra suave, reutilizado para estructurar las secciones del dashboard.

import "../styles/Card.css";

export class Card {
  protected element: HTMLElement;
  protected contentElement: HTMLElement;

  constructor(title: string, iconHtml?: string) {
    this.element = document.createElement("div");
    this.element.className = "hera-card";

    // Encabezado de la tarjeta con título e icono opcional
    const titleEl = document.createElement("div");
    titleEl.className = "hera-card-title";
    titleEl.innerHTML = `${iconHtml || ""} <span>${title}</span>`;
    this.element.appendChild(titleEl);

    // Contenedor de contenido
    this.contentElement = document.createElement("div");
    this.contentElement.className = "hera-card-content";
    this.element.appendChild(this.contentElement);
  }

  // Retorna el elemento del DOM de la tarjeta
  getElement(): HTMLElement {
    return this.element;
  }

  // Actualiza el contenido de la tarjeta
  setContent(htmlContent: string | HTMLElement) {
    this.contentElement.innerHTML = "";
    if (typeof htmlContent === "string") {
      this.contentElement.innerHTML = htmlContent;
    } else {
      this.contentElement.appendChild(htmlContent);
    }
  }
}
