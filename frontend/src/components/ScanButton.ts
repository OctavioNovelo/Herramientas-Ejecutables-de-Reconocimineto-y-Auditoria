// Único botón de acción principal de HERA.
// - Sin resultados previos: muestra "ESCANEAR" → lanza FULL_PACK al hacer clic.
// - Con resultados previos: muestra "INFORME" → en hover transiciona a "NUEVO ESCANEO" → lanza FULL_PACK al hacer clic.
// - Durante el escaneo: muestra spinner "ESCANEANDO RED..." y se deshabilita.

import { scanState } from "../state/scanState";
import "../styles/ScanButton.css";

export class ScanButton {
  private element: HTMLElement;
  private buttonEl: HTMLButtonElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hera-scan-btn-container";

    this.buttonEl = document.createElement("button");
    this.buttonEl.className = "hera-scan-btn";
    this.element.appendChild(this.buttonEl);

    // Siempre lanza FULL_PACK, independientemente del estado actual
    this.buttonEl.addEventListener("click", () => {
      if (scanState.getState().isScanning) return;
      scanState.startScan("full_pack");
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  // Actualiza la apariencia del botón según el estado global
  updateState(isScanning: boolean, hasResults: boolean) {
    this.buttonEl.className = "hera-scan-btn";
    this.buttonEl.innerHTML = "";

    if (isScanning) {
      // Estado de escaneo en progreso
      this.buttonEl.classList.add("is-scanning");
      this.buttonEl.disabled = true;
      this.buttonEl.innerHTML = `
        <div class="hera-btn-text-wrapper">
          <span class="hera-btn-text-primary">
            <div class="hera-btn-spinner"></div>
            ESCANEANDO RED...
          </span>
        </div>`;

    } else if (hasResults) {
      // Ya existen resultados: mostrar INFORME con transición a NUEVO ESCANEO en hover
      this.buttonEl.classList.add("has-results");
      this.buttonEl.disabled = false;
      this.buttonEl.innerHTML = `
        <div class="hera-btn-text-wrapper">
          <span class="hera-btn-text-primary">
            <svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            INFORME
          </span>
          <span class="hera-btn-text-hover">
            <svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            NUEVO ESCANEO
          </span>
        </div>`;

    } else {
      // Estado inicial: sin resultados previos
      this.buttonEl.disabled = false;
      this.buttonEl.innerHTML = `
        <div class="hera-btn-text-wrapper">
          <span class="hera-btn-text-primary">
            <svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            ESCANEAR
          </span>
        </div>`;
    }
  }
}
