// Muestra visualmente el nivel de riesgo de seguridad (BAJO, MEDIO, ALTO) con colores e iconos coherentes con los datos del XML.

import { Card } from "./Card";
import { ScanStats } from "../api/heraApi";
import "../styles/SecurityCard.css";

export class SecurityCard extends Card {
  constructor() {
    // Inicializar tarjeta base con título e icono de escudo
    super(
      "Estado de Seguridad",
      `<svg class="card-icon" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`
    );
    this.updateState(null);
  }

  // Actualiza la tarjeta con los últimos resultados de escaneo
  updateState(stats: ScanStats | null) {
    if (!stats) {
      // Estado predeterminado o vacío
      this.setContent(`
        <div class="hera-security-container hera-status-safe">
          <div class="hera-security-icon-wrap hera-status-safe-bg">
            <svg class="hera-security-icon" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div class="hera-security-text">
            <div class="hera-security-label">SEGURO</div>
            <div class="hera-security-desc">Sin reportes cargados. Todo en orden.</div>
          </div>
        </div>
      `);
      return;
    }

    const level = stats.risk_level;
    let statusClass = "hera-status-safe";
    let bgClass = "hera-status-safe-bg";
    // Icono Check
    let iconPath = `
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    `;
    let desc = "No se encontraron vulnerabilidades en los escaneos.";
    let label = "SEGURO";

    if (level === "CRÍTICO" || level === "ALTO") {
      statusClass = "hera-status-risk";
      bgClass = "hera-status-risk-bg";
      // Icono de Alerta de Peligro
      iconPath = `
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      `;
      desc = `¡Atención! Se detectaron ${stats.total_vulns} brechas de severidad crítica/alta.`;
      label = "RIESGO";
    } else if (level === "MEDIO") {
      statusClass = "hera-status-warn";
      bgClass = "hera-status-warn-bg";
      // Icono de Advertencia Circular
      iconPath = `
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      `;
      desc = `Advertencia: Se detectaron fallas de severidad media en la red.`;
      label = "ADVERTENCIA";
    }

    this.setContent(`
      <div class="hera-security-container ${statusClass}">
        <div class="hera-security-icon-wrap ${bgClass}">
          <svg class="hera-security-icon" viewBox="0 0 24 24">
            ${iconPath}
          </svg>
        </div>
        <div class="hera-security-text">
          <div class="hera-security-label">${label}</div>
          <div class="hera-security-desc">${desc}</div>
        </div>
      </div>
    `);
  }
}
