// Representa la actividad de red por host usando un gráfico de líneas suavizadas (curvas Bézier cúbicas).
// Si no hay datos reales, muestra un placeholder con la misma forma de línea, preparado para datos futuros.

import { Card } from "./Card";
import { Device } from "../api/heraApi";
import "../styles/NetworkChart.css";

// Genera la curva Bézier cúbica suavizada como atributo 'd' de un <path> SVG
function buildSmoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Tensión de control: 0.3 produce un suavizado natural sin oscilaciones
    const cpX1 = prev[0] + (curr[0] - prev[0]) * 0.4;
    const cpY1 = prev[1];
    const cpX2 = curr[0] - (curr[0] - prev[0]) * 0.4;
    const cpY2 = curr[1];
    d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr[0]} ${curr[1]}`;
  }
  return d;
}

// Genera el área de relleno cerrada bajo la línea
function buildAreaPath(
  points: Array<[number, number]>,
  baseline: number
): string {
  if (points.length === 0) return "";
  const linePath = buildSmoothPath(points);
  // Cerrar hacia abajo al baseline y volver al origen
  return (
    linePath +
    ` L ${points[points.length - 1][0]} ${baseline}` +
    ` L ${points[0][0]} ${baseline} Z`
  );
}

export class NetworkChart extends Card {
  constructor() {
    super(
      "Actividad de Red (Puertos por Host)",
      `<svg class="card-icon" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>`
    );
    this.updateState([]);
  }

  updateState(devices: Device[]) {
    // Usar máximo 10 dispositivos para no saturar visualmente el eje X
    const visible = devices.filter((d) => d.ports.length > 0).slice(0, 10);
    const hasData = visible.length >= 2;

    // Dimensiones del viewport SVG
    const W = 1000;
    const H = 200;
    const PL = 48; // padding izquierdo (eje Y)
    const PR = 24;
    const PT = 16;
    const PB = 36; // padding inferior (eje X)
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;
    const baseline = PT + chartH;

    let points: Array<[number, number]> = [];
    let maxVal = 1;
    let labels: string[] = [];
    let yAxisLabel = "Puertos abiertos";

    if (hasData) {
      // Datos reales: eje Y = número de puertos abiertos por host
      maxVal = Math.max(...visible.map((d) => d.ports.length), 1);
      labels = visible.map((d) => {
        const parts = d.ip.split(".");
        return parts.slice(2).join(".");
      });
      points = visible.map((d, i): [number, number] => {
        const x = PL + (i / (visible.length - 1)) * chartW;
        const y = PT + chartH - (d.ports.length / maxVal) * chartH;
        return [x, y];
      });
    } else {
      // Placeholder: curva senoidal suave para indicar que el gráfico está listo
      yAxisLabel = "Esperando datos...";
      const steps = 9;
      labels = Array.from({ length: steps }, (_, i) => `0.${i}`);
      points = Array.from({ length: steps }, (_, i): [number, number] => {
        const t = i / (steps - 1);
        const x = PL + t * chartW;
        const raw = Math.sin(t * Math.PI * 2) * 0.3 + 0.5;
        const y = PT + chartH - raw * chartH * 0.7;
        return [x, y];
      });
    }

    const linePath = buildSmoothPath(points);
    const areaPath = buildAreaPath(points, baseline);

    // Líneas de rejilla horizontales (4 niveles)
    const gridLines = Array.from({ length: 4 }, (_, i) => {
      const y = PT + (chartH / 3) * i;
      const val = hasData
        ? Math.round((maxVal / 3) * (3 - i))
        : "";
      return `
        <line class="hera-chart-grid-line" x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" />
        <text style="font-size:8px;fill:var(--color-text-light);opacity:0.3;text-anchor:end;" x="${PL - 6}" y="${y + 3}">${val}</text>
      `;
    }).join("");

    // Etiquetas del eje X
    const xLabels = labels.map((label, i) => {
      const x =
        visible.length >= 2
          ? PL + (i / (visible.length - 1)) * chartW
          : PL + (i / (labels.length - 1)) * chartW;
      return `<text class="hera-chart-label-text" x="${x}" y="${H - 6}">${label}</text>`;
    }).join("");

    // Nodos en cada punto de dato
    const nodes = points.map(([x, y], i) => {
      const tooltipIp = hasData ? visible[i]?.ip : "";
      const tooltipPorts = hasData ? visible[i]?.ports.length : "";
      const latency = hasData ? visible[i]?.latency : 0;
      const title = hasData
        ? `IP: ${tooltipIp} | Puertos: ${tooltipPorts} | Latencia: ${latency}ms`
        : "Sin datos reales disponibles";
      return `
        <circle
          class="hera-chart-node${hasData ? "" : " hera-chart-node-placeholder"}"
          cx="${x}" cy="${y}" r="5"
        >
          <title>${title}</title>
        </circle>
      `;
    }).join("");

    const svgHtml = `
      <div class="hera-chart-container">
        <svg
          class="hera-chart-svg"
          viewBox="0 0 ${W} ${H}"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="hera-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-accent)" />
              <stop offset="100%" stop-color="var(--color-bg-window)" />
            </linearGradient>
            <linearGradient id="hera-area-grad-placeholder" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-border-active)" />
              <stop offset="100%" stop-color="var(--color-bg-window)" />
            </linearGradient>
          </defs>

          <!-- Rejilla -->
          ${gridLines}

          <!-- Eje X -->
          <line class="hera-chart-axis-line" x1="${PL}" y1="${baseline}" x2="${W - PR}" y2="${baseline}" />

          <!-- Área de relleno bajo la curva -->
          <path
            class="hera-chart-area${hasData ? "" : " hera-chart-area-placeholder"}"
            d="${areaPath}"
          />

          <!-- Línea suavizada principal -->
          <path
            class="hera-chart-line${hasData ? "" : " hera-chart-line-placeholder"}"
            d="${linePath}"
          />

          <!-- Nodos interactivos en cada IP -->
          ${nodes}

          <!-- Etiquetas eje X -->
          ${xLabels}
        </svg>

        <div class="hera-chart-legend">
          <span style="font-size:0.65rem;opacity:0.6;">
            ${hasData
              ? `* Eje X: últimos octetos de IP. Hover para detalles.`
              : "⬤ Placeholder — esperando datos reales de escaneo"}
          </span>
          <div class="hera-chart-legend-item">
            <div class="hera-chart-legend-indicator${hasData ? " line" : " placeholder-line"}"></div>
            <span style="font-size:0.65rem;opacity:0.6;">${yAxisLabel}</span>
          </div>
        </div>
      </div>
    `;

    this.setContent(svgHtml);
  }
}
