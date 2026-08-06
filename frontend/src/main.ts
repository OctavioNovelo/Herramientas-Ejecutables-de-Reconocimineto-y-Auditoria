// Archivo: frontend/src/main.ts
// Razón: Punto de entrada principal. Monta el menú horizontal fijo, el dashboard combinado
// (vista por defecto) y la pestaña de Escaneo por categoría, alternando entre ambas según
// viewState sin usar una librería de rutas — todo vanilla, consistente con el resto del proyecto.

import "./index.css";
import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { Card } from "./components/Card";
import { SecurityCard } from "./components/SecurityCard";
import { NetworkChart } from "./components/NetworkChart";
import { ScanButton } from "./components/ScanButton";
import { ResultsTable } from "./components/ResultsTable";
import { NavBar } from "./components/NavBar";
import { ScanView } from "./components/ScanView";

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (!app) return;

  // ── 0. MENÚ HORIZONTAL (siempre visible, controla la vista activa) ────────
  const navBar = new NavBar();
  app.appendChild(navBar.getElement());

  // ── 0b. BANNER DE ERROR (global: visible sin importar la vista activa,
  // porque un escaneo puede lanzarse desde el dashboard O desde la pestaña Escaneo) ──
  const errorBanner = document.createElement("div");
  errorBanner.className = "hera-error-banner";
  errorBanner.style.display = "none";
  app.appendChild(errorBanner);

  // ── 1. VISTA: DASHBOARD COMBINADO (contenido existente, sin cambios de lógica) ──
  // El branding "HERA" ya vive en el NavBar (arriba); no se duplica aquí.
  const dashboardContainer = document.createElement("div");
  dashboardContainer.style.padding = "0 20px";
  app.appendChild(dashboardContainer);

  const dashGrid = document.createElement("div");
  dashGrid.className = "hera-dashboard-grid";
  dashGrid.style.marginBottom = "24px";
  dashboardContainer.appendChild(dashGrid);

  const leftCol = document.createElement("div");
  leftCol.className = "hera-dashboard-left";
  dashGrid.appendChild(leftCol);

  // "Dirección de Red": muestra la subred auditada (leída de hosts.txt), no la IP local.
  const hostCard = new Card(
    "Dirección de Red",
    `<svg class="card-icon" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="8" rx="2"></rect>
      <rect x="2" y="14" width="20" height="8" rx="2"></rect>
      <line x1="6" y1="6" x2="6.01" y2="6"></line>
      <line x1="6" y1="18" x2="6.01" y2="18"></line>
    </svg>`
  );
  leftCol.appendChild(hostCard.getElement());

  const securityCard = new SecurityCard();
  leftCol.appendChild(securityCard.getElement());

  const networkChart = new NetworkChart();
  networkChart.getElement().style.height = "100%";
  dashGrid.appendChild(networkChart.getElement());

  // Botón único del dashboard: SIEMPRE dispara full_pack (confirmado), sin importar
  // qué categoría esté seleccionada en la pestaña Escaneo.
  const scanButton = new ScanButton();
  scanButton.getElement().style.marginBottom = "24px";
  dashboardContainer.appendChild(scanButton.getElement());

  const summaryBar = document.createElement("div");
  summaryBar.className = "hera-summary-bar";
  summaryBar.innerHTML = `
    <div class="hera-summary-item">
      <span class="hera-summary-value" id="stat-last-scan">—</span>
      <span class="hera-summary-label">Último Escaneo</span>
    </div>
    <div style="width:1px;height:36px;background:var(--color-border-inactive);"></div>
    <div class="hera-summary-item">
      <span class="hera-summary-value" id="stat-hosts">—</span>
      <span class="hera-summary-label">Hosts Activos</span>
    </div>
    <div style="width:1px;height:36px;background:var(--color-border-inactive);"></div>
    <div class="hera-summary-item">
      <span class="hera-summary-value" id="stat-vulns">—</span>
      <span class="hera-summary-label">Vulnerabilidades</span>
    </div>
  `;
  dashboardContainer.appendChild(summaryBar);
  summaryBar.style.marginBottom = "24px";

  const resultsTable = new ResultsTable();
  dashboardContainer.appendChild(resultsTable.getElement());

  // ── 2. VISTA: ESCANEO POR CATEGORÍA (nueva pestaña) ────────────────────────
  const scanView = new ScanView();
  const scanViewContainer = scanView.getElement();
  scanViewContainer.style.display = "none";
  app.appendChild(scanViewContainer);

  // ── 3. ALTERNAR ENTRE VISTAS ────────────────────────────────────────────────
  viewState.subscribe(() => {
    const view = viewState.getView();
    const isScan = view === "scan";

    dashboardContainer.style.display = isScan ? "none" : "block";
    scanViewContainer.style.display = isScan ? "block" : "none";

    if (isScan) {
      scanView.activate();
    } else {
      scanView.deactivate();
    }
  });

  // ── 4. REACTIVIDAD DEL DASHBOARD: Suscripción al estado global de escaneo ───
  scanState.subscribe((state: AppState) => {

    // A. Banner de error (solo se muestra si hubo un fallo real, no por falta de datos).
    // Visible en cualquier vista: un escaneo lanzado desde "Escaneo" también puede fallar.
    if (state.error) {
      errorBanner.textContent = `⚠ ${state.error}`;
      errorBanner.style.display = "block";
    } else {
      errorBanner.style.display = "none";
    }

    // B. Tarjeta de "Dirección de Red"
    if (state.hostInfo) {
      hostCard.setContent(`
        <div style="display:flex;flex-direction:column;justify-content:center;gap:12px;height:100%;padding:6px 0;">
          <div style="font-size:1.85rem;font-weight:900;color:var(--color-primary);font-family:monospace;letter-spacing:1px;">
            ${state.hostInfo.ip}
          </div>
          <div style="font-size:0.75rem;opacity:0.6;display:flex;align-items:center;gap:6px;">
            <svg style="width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Hostname:&nbsp;<strong style="color:var(--color-text-light);">${state.hostInfo.hostname}</strong>
          </div>
        </div>`);
    } else {
      hostCard.setContent(`
        <div style="font-size:0.75rem;opacity:0.45;display:flex;align-items:center;gap:8px;">
          <div class="hera-btn-spinner" style="width:14px;height:14px;border-width:2px;"></div>
          Obteniendo dirección de red...
        </div>`);
    }

    // C. Tarjeta de seguridad: si NO hay resultados previos, se pasa null explícitamente.
    securityCard.updateState(state.hasResults ? state.stats : null);

    // D. Gráfico de red
    networkChart.updateState(state.devices);

    // E. Botón único del dashboard (siempre full_pack)
    scanButton.updateState(state.isScanning, state.hasResults);

    // F. Barra de estadísticas: "—" explícito cuando no hay resultados previos.
    const lastScanEl = document.getElementById("stat-last-scan");
    const hostsEl    = document.getElementById("stat-hosts");
    const vulnsEl    = document.getElementById("stat-vulns");

    if (lastScanEl) lastScanEl.textContent = state.hasResults ? (state.stats?.last_scan ?? "—") : "—";
    if (hostsEl)    hostsEl.textContent    = state.hasResults ? (state.stats?.active_devices.toString() ?? "—") : "—";
    if (vulnsEl) {
      vulnsEl.textContent = state.hasResults ? (state.stats?.total_vulns ?? 0).toString() : "—";
      if (state.hasResults) {
        const sev = state.stats?.vulns_by_severity;
        if (sev?.critical || sev?.high)   vulnsEl.style.color = "var(--color-security-risk)";
        else if (sev?.medium)             vulnsEl.style.color = "var(--color-security-warn)";
        else                              vulnsEl.style.color = "var(--color-security-safe)";
      } else {
        vulnsEl.style.color = "";
      }
    }

    // G. Tabla de resultados
    resultsTable.updateState(state.devices);
  });
});