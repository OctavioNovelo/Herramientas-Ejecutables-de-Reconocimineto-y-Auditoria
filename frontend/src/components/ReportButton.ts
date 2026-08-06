// Archivo: frontend/src/components/ReportButton.ts
// Razón: Botón secundario independiente que aparece solo cuando existen resultados previos.
// Permite acceder al informe más reciente, con transición de hover hacia NUEVO ESCANEO.

import { scanState } from "../state/scanState";
import "../styles/ScanButton.css"; /* Reutiliza los estilos del botón principal */

export class ReportButton {
  private element: HTMLElement;
  private buttonEl: HTMLButtonElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hera-scan-btn-container";
    this.element.style.display = "none"; // Oculto hasta que haya resultados

    this.buttonEl = document.createElement("button");
    this.buttonEl.className = "hera-scan-btn hera-report-btn";
    this.element.appendChild(this.buttonEl);

    // Al hacer clic actúa como NUEVO ESCANEO (igual que el botón principal)
    this.buttonEl.addEventListener("click", () => {
      const state = scanState.getState();
      if (state.isScanning) return;
      scanState.startScan("full_pack");
    });

    this.render(false);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  updateState(hasResults: boolean, isScanning: boolean) {
    this.element.style.display = hasResults && !isScanning ? "flex" : "none";
    this.render(hasResults);
  }

  private render(_hasResults: boolean) {
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
  }
}
