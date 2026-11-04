// Render de los resultados de UNA categoría (pestaña Mapear/Detectar). Separado de ScanView
// para que cada dirección visual pueda sustituirlo sin tocar la lógica de formularios,
// instalación de herramientas ni cancelación. Recibe datos ya procesados por utils/parser.py.

import type { ScanCategory } from "../state/viewState";
import { VULN_VIEW_IDS } from "../state/viewState";
import type { CategoryDevice, Vulnerability, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";

export function renderCategoryResults(cat: ScanCategory, devices: CategoryDevice[], lastScanTime: ScanTimeInfo | null): HTMLElement {
  const resultsArea = document.createElement("div");

  // Duración del escaneo que generó estos resultados (ausente si el backend no la manda
  // todavía para esta categoría, o si el XML no traía <runstats><finished>).
  if (lastScanTime && lastScanTime.duracion_str !== "N/D") {
    const timeNote = document.createElement("p");
    timeNote.className = "hera-scan-time-note";
    timeNote.textContent = `Duración del escaneo: ${lastScanTime.duracion_str}`;
    resultsArea.appendChild(timeNote);
  }

  const grid = document.createElement("div");
  // La categoría 'vuln' necesita más ancho por card: cada una se divide en 2 columnas
  // (Confirmadas/Posibles) que no caben cómodamente en el ancho mínimo genérico de 300px.
  const isVulnView = VULN_VIEW_IDS.has(cat.id);
  grid.className = "hera-scan-devices-grid" + (isVulnView ? " is-vuln-grid" : "");

  devices.forEach((dev) => {
    const card = document.createElement("div");
    card.className = "hera-scan-device-card";

    const header = document.createElement("div");
    header.className = "hera-scan-device-header";
    header.innerHTML = `
      <span class="hera-scan-device-ip">${dev.ip}</span>
      <span class="hera-scan-device-name">${dev.device || "N/D"}</span>
    `;
    card.appendChild(header);

    // Detección de SO (si la categoría corrió -O y Nmap logró algo). Se muestra para
    // cualquier categoría excepto las de hallazgos (VULN_VIEW_IDS), que tienen su presentación propia.
    if (!isVulnView) {
      const osBlock = renderOsInfo(dev);
      if (osBlock) card.appendChild(osBlock);
    }

    if (cat.id === "admin") {
      card.appendChild(renderAdminPorts(dev));
    } else {
      card.appendChild(renderGenericBadges(dev));
    }

    // Puertos filtrados (probable firewall).
    const filteredBlock = renderFilteredPorts(dev);
    if (filteredBlock) card.appendChild(filteredBlock);

    // URLs "Location:" (SSDP/UPnP) — pistas de identificación del dispositivo.
    if (!isVulnView) {
      const locBlock = renderLocationUrls(dev);
      if (locBlock) card.appendChild(locBlock);
    }

    if (isVulnView) {
      card.appendChild(renderVulnSplit(dev));
    } else if (dev.vulnerabilities.length > 0) {
      // Otras categorías (ej. full_pack) también pueden traer hallazgos confirmados:
      // se muestran como badges simples, sin el desglose de dos columnas de "vuln".
      card.appendChild(renderSimpleVulnBadges(dev.vulnerabilities));
    }

    grid.appendChild(card);
  });

  resultsArea.appendChild(grid);
  return resultsArea;
}

// Resume la detección de SO de un dispositivo (Device type / Running / OS details, o los
// "guesses" más probables cuando no hay match exacto). Devuelve null si no hay nada que
// mostrar (categoría no corrió -O, o Nmap no encontró ningún osmatch).
function renderOsInfo(dev: CategoryDevice): HTMLElement | null {
  const os = dev.os_info;
  if (!os) return null;

  const wrap = document.createElement("div");
  wrap.className = "hera-scan-os-info";

  if (os.exact_match) {
    const parts: string[] = [];
    if (os.device_types.length > 0) parts.push(os.device_types.join(", "));
    if (os.running) parts.push(os.running);
    if (parts.length === 0 && os.details) parts.push(os.details);
    if (parts.length === 0) return null;
    wrap.innerHTML = `<span class="hera-scan-os-label">SO:</span> ${parts.join(" — ")}`;
    if (os.details) wrap.title = os.details;
  } else {
    if (os.guesses.length === 0) return null;
    const guessText = os.guesses
      .map((g) => `${g.name ?? "?"} (${g.accuracy ?? "?"}%)`)
      .join(", ");
    wrap.innerHTML = `<span class="hera-scan-os-label">SO (sin match exacto):</span> ${guessText}`;
  }

  return wrap;
}

// Puertos que respondieron "filtered" en vez de "open"/"closed" — probable firewall
// bloqueando la respuesta. Se muestran en naranja, sin emoji, distintos al estilo de los
// puertos abiertos.
function renderFilteredPorts(dev: CategoryDevice): HTMLElement | null {
  if (dev.filtered_ports.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "hera-scan-badges hera-scan-filtered-badges";
  dev.filtered_services.forEach((srv) => {
    const badge = document.createElement("span");
    badge.className = "hera-scan-badge is-filtered";
    badge.textContent = srv;
    wrap.appendChild(badge);
  });
  return wrap;
}

// URLs "Location:" (SSDP/UPnP) capturadas por scripts NSE — suelen apuntar a un XML de
// descripción del dispositivo (fabricante, modelo). Se listan como enlaces clicables.
function renderLocationUrls(dev: CategoryDevice): HTMLElement | null {
  if (dev.location_urls.length === 0) return null;

  const wrap = document.createElement("div");
  wrap.className = "hera-scan-location-urls";
  dev.location_urls.forEach((url) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = url;
    wrap.appendChild(link);
  });
  return wrap;
}

function renderGenericBadges(dev: CategoryDevice): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "hera-scan-badges";
  if (dev.services.length === 0) {
    wrap.innerHTML = `<span class="hera-scan-empty-note">Sin puertos abiertos detectados</span>`;
    return wrap;
  }
  dev.ports.forEach((port, i) => {
    const badge = document.createElement("span");
    badge.className = "hera-scan-badge";
    badge.textContent = dev.services[i] ?? `${port}`;
    const detail = dev.service_details.find((d) => d.port === port && d.state === "open");
    if (detail) {
      const bits = [detail.product, detail.version, detail.extrainfo].filter(Boolean);
      if (bits.length > 0) {
        badge.title = bits.join(" ");
      } else if (!detail.reconocido && detail.fingerprint) {
        badge.title = "Servicio no reconocido — fingerprint disponible";
      }
    }
    wrap.appendChild(badge);
  });
  return wrap;
}

function renderAdminPorts(dev: CategoryDevice): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "hera-scan-badges";
  if (dev.ports.length === 0) {
    wrap.innerHTML = `<span class="hera-scan-empty-note">Sin puertos de gestión abiertos</span>`;
    return wrap;
  }
  dev.ports.forEach((port) => {
    const badge = document.createElement("span");
    const standard = isAdminPortStandard(port);
    badge.className = "hera-scan-badge" + (standard ? "" : " is-warning");
    // Título de la página (http-title): dice QUÉ panel es, no solo que el puerto está abierto.
    const title = dev.service_details.find((d) => d.port === port && d.state === "open" && d.title)?.title;
    const base = title ? `${port}/${adminPortLabel(port)} "${title}"` : `${port}/${adminPortLabel(port)}`;
    badge.textContent = standard ? base : `${base} (no estándar)`;
    if (title) badge.title = title;
    wrap.appendChild(badge);
  });
  return wrap;
}

function renderSimpleVulnBadges(vulns: Vulnerability[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "hera-scan-badges";
  wrap.style.marginTop = "8px";
  vulns.slice(0, 4).forEach((v) => {
    const badge = document.createElement("span");
    badge.className = `hera-vuln-row-sev ${v.severity}`;
    badge.title = v.output;
    badge.textContent = v.cve_count ? `${v.id} (${v.cve_count})` : v.id;
    wrap.appendChild(badge);
  });
  return wrap;
}

function renderVulnSplit(dev: CategoryDevice): HTMLElement {
  // Si el dispositivo no tiene NINGÚN hallazgo (ni confirmado ni posible), no vale la pena
  // ocupar espacio con dos bloques vacíos repitiendo "Ninguna" — se muestra una sola nota.
  if (dev.vulnerabilities.length === 0 && dev.possible_vulnerabilities.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hera-scan-empty-note";
    empty.style.marginTop = "10px";
    empty.textContent = "Sin hallazgos de vulnerabilidades en este dispositivo.";
    return empty;
  }

  const wrap = document.createElement("div");
  wrap.className = "hera-vuln-split";

  const confirmadasBlock = document.createElement("div");
  confirmadasBlock.className = "hera-vuln-block confirmadas";
  confirmadasBlock.innerHTML = `<div class="hera-vuln-block-title">Confirmadas (${dev.vulnerabilities.length})</div>`;
  if (dev.vulnerabilities.length === 0) {
    confirmadasBlock.innerHTML += `<span class="hera-scan-empty-note">Ninguna</span>`;
  } else {
    dev.vulnerabilities.forEach((v) => {
      const detalle = v.remediation ? `${v.output}\n\nSolución: ${v.remediation}` : v.output;
      confirmadasBlock.appendChild(buildVulnRow(v.id, v.severity, v.sev_label, detalle, v.cve_count));
    });
  }

  const posiblesBlock = document.createElement("div");
  posiblesBlock.className = "hera-vuln-block posibles";
  posiblesBlock.innerHTML = `<div class="hera-vuln-block-title">Posibles, sin confirmar (${dev.possible_vulnerabilities.length})</div>`;
  if (dev.possible_vulnerabilities.length === 0) {
    posiblesBlock.innerHTML += `<span class="hera-scan-empty-note">Ninguna</span>`;
  } else {
    dev.possible_vulnerabilities.forEach((v) => {
      const row = buildVulnRow(v.id, "posible", "Sin confirmar", v.output);
      posiblesBlock.appendChild(row);
    });
  }

  wrap.appendChild(confirmadasBlock);
  wrap.appendChild(posiblesBlock);
  return wrap;
}

function buildVulnRow(id: string, sevClass: string, sevLabel: string, output: string, cveCount?: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "hera-vuln-row";
  row.title = output;
  const title = document.createElement("span");
  title.className = "hera-vuln-row-title";
  title.textContent = cveCount ? `${id} (${cveCount})` : id;
  const sev = document.createElement("span");
  sev.className = `hera-vuln-row-sev ${sevClass}`;
  sev.textContent = sevLabel;
  row.appendChild(title);
  row.appendChild(sev);
  return row;
}
