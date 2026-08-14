// Renderiza los dispositivos detectados, sus IPs, MACs, puertos y vulnerabilidades con scroll independiente y diseño fluido.

import { Device } from "../api/heraApi";
import "../styles/ResultsTable.css";

export class ResultsTable {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hera-table-card";
    this.updateState([]);
  }

  // Retorna el elemento del DOM de la tabla
  getElement(): HTMLElement {
    return this.element;
  }

  // Actualiza los datos de la tabla dinámicamente
  updateState(devices: Device[]) {
    this.element.innerHTML = "";

    // Título de la tabla
    const titleEl = document.createElement("div");
    titleEl.className = "hera-table-header";
    titleEl.innerHTML = `
      <div class="hera-table-title">
        <svg style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
          <line x1="15" y1="3" x2="15" y2="21"></line>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="3" y1="15" x2="21" y2="15"></line>
        </svg>
        Dispositivos y Vulnerabilidades Detectados
      </div>
      <div style="font-size: 0.7rem; opacity: 0.6;">Total: ${devices.length} hosts</div>
    `;
    this.element.appendChild(titleEl);

    // Si no existen dispositivos cargados, mostrar panel amigable
    if (devices.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "hera-table-empty";
      emptyEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>No se encontraron informes de escaneo en el sistema. Inicie un nuevo análisis para poblar la tabla.</span>
      `;
      this.element.appendChild(emptyEl);
      return;
    }

    // Contenedor scrollable
    const wrapper = document.createElement("div");
    wrapper.className = "hera-table-wrapper";

    const table = document.createElement("table");
    table.className = "hera-table";

    // Encabezados
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 12%">IP</th>
          <th style="width: 19%">Dispositivo</th>
          <th style="width: 12%">MAC</th>
          <th style="width: 12%">SO</th>
          <th style="width: 15%">Servicios</th>
          <th style="width: 9%">Puertos</th>
          <th style="width: 21%">Vulnerabilidades</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement("tbody");

    // Llenar filas
    devices.forEach((dev) => {
      const tr = document.createElement("tr");

      // Columna IP
      const tdIp = document.createElement("td");
      tdIp.style.fontWeight = "700";
      tdIp.style.color = "var(--color-accent)";
      tdIp.textContent = dev.ip;
      tr.appendChild(tdIp);

      // Columna Dispositivo
      const tdDevice = document.createElement("td");
      tdDevice.textContent = dev.device || "N/D";
      tr.appendChild(tdDevice);

      // Columna MAC
      const tdMac = document.createElement("td");
      tdMac.style.fontFamily = "monospace";
      tdMac.textContent = dev.mac;
      tr.appendChild(tdMac);

      // Columna SO (detección de sistema operativo, si la categoría que la generó corrió -O)
      const tdOs = document.createElement("td");
      tdOs.style.fontSize = "0.75rem";
      tdOs.style.opacity = "0.85";
      if (dev.os_info?.exact_match) {
        const label = dev.os_info.running || dev.os_info.device_types.join(", ") || "—";
        tdOs.textContent = label;
        if (dev.os_info.details) tdOs.title = dev.os_info.details;
      } else if (dev.os_info?.guesses.length) {
        tdOs.textContent = `${dev.os_info.guesses[0].name ?? "?"} (~${dev.os_info.guesses[0].accuracy ?? "?"}%)`;
        tdOs.style.opacity = "0.55";
      } else {
        tdOs.textContent = "—";
        tdOs.style.opacity = "0.35";
      }
      tr.appendChild(tdOs);

      // Columna Servicios
      const tdServices = document.createElement("td");
      const servicesContainer = document.createElement("div");
      servicesContainer.className = "hera-badges-container";
      if (dev.services.length > 0) {
        dev.services.slice(0, 4).forEach((srv) => {
          const srvBadge = document.createElement("span");
          srvBadge.className = "hera-port-badge";
          srvBadge.textContent = srv;
          servicesContainer.appendChild(srvBadge);
        });
        if (dev.services.length > 4) {
          const srvMore = document.createElement("span");
          srvMore.className = "hera-port-badge";
          srvMore.style.opacity = "0.6";
          srvMore.textContent = `+${dev.services.length - 4}`;
          servicesContainer.appendChild(srvMore);
        }
      } else {
        servicesContainer.innerHTML = `<span style="opacity:0.4;">Ninguno</span>`;
      }
      tdServices.appendChild(servicesContainer);
      tr.appendChild(tdServices);

      // Columna Puertos (Cantidad)
      const tdPorts = document.createElement("td");
      tdPorts.style.textAlign = "center";
      const portsBadge = document.createElement("span");
      portsBadge.className = "hera-port-badge";
      portsBadge.style.fontWeight = "700";
      portsBadge.style.background = "rgba(27, 161, 191, 0.15)";
      portsBadge.textContent = dev.ports.length.toString();
      if (dev.filtered_ports.length > 0) {
        portsBadge.title = `+${dev.filtered_ports.length} puerto(s) filtrado(s) (probable firewall)`;
      }
      tdPorts.appendChild(portsBadge);
      tr.appendChild(tdPorts);

      // Columna Vulnerabilidades
      const tdVulns = document.createElement("td");
      const vulnsContainer = document.createElement("div");
      vulnsContainer.className = "hera-badges-container";
      
      if (dev.vulnerabilities.length > 0) {
        dev.vulnerabilities.slice(0, 2).forEach((vuln) => {
          const vulnBadge = document.createElement("span");
          vulnBadge.className = `hera-vuln-badge hera-vuln-${vuln.severity}`;
          vulnBadge.title = vuln.output;
          vulnBadge.textContent = vuln.id;
          vulnsContainer.appendChild(vulnBadge);
        });
        if (dev.vulnerabilities.length > 2) {
          const vulnMore = document.createElement("span");
          vulnMore.className = "hera-vuln-badge hera-vuln-high";
          vulnMore.style.opacity = "0.7";
          vulnMore.textContent = `+${dev.vulnerabilities.length - 2}`;
          vulnsContainer.appendChild(vulnMore);
        }
      } else {
        const cleanBadge = document.createElement("span");
        cleanBadge.className = "hera-vuln-badge hera-vuln-low";
        cleanBadge.textContent = "Seguro";
        vulnsContainer.appendChild(cleanBadge);
      }
      
      tdVulns.appendChild(vulnsContainer);
      tr.appendChild(tdVulns);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    this.element.appendChild(wrapper);
  }
}