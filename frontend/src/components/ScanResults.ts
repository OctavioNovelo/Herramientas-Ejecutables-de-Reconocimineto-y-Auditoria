// Dirección B "Lámina": resultados de una categoría como hojas de especificación, una por
// host, con su tabla de puertos y sus hallazgos. Se leen como la ficha técnica de una pieza.

import type { ScanCategory } from "../state/viewState";
import { VULN_VIEW_IDS } from "../state/viewState";
import type { CategoryDevice, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";
import { esc, estadoHost, ESTADO_FORMA, ESTADO_TEXTO } from "../utils/security";

function hoja(cat: ScanCategory, d: CategoryDevice): string {
  const admin = cat.id === "admin";
  const vulnView = VULN_VIEW_IDS.has(cat.id);
  const est = estadoHost(d);
  const os = d.os_info;
  const so = os?.exact_match
    ? os.running ?? os.details
    : os?.guesses.length
    ? `${os.guesses[0].name} (${os.guesses[0].accuracy} %), sin coincidencia exacta`
    : null;

  const filas = d.service_details
    .filter((s) => !admin || s.state === "open")
    .map((s) => {
      const raro = admin && !isAdminPortStandard(s.port);
      const v = d.vulnerabilities.find((x) => String(x.port) === String(s.port));
      const prod = [s.product, s.version, s.extrainfo].filter(Boolean).join(" ") || (s.title ? `“${s.title}”` : !s.reconocido ? "no reconocido" : "—");
      return `<tr class="${s.state === "filtered" ? "filtrado" : ""}${v ? " con-h" : ""}${raro ? " raro" : ""}">
        <td class="m">${s.port}</td><td class="m">${esc(s.protocol ?? "tcp")}</td>
        <td>${s.state === "open" ? "abierto" : "filtrado"}</td>
        <td>${esc(admin ? adminPortLabel(s.port) : s.service)}${raro ? `<span class="nota">no estándar</span>` : ""}</td>
        <td>${esc(prod)}${v ? `<span class="nota nota-h">${esc(v.id)}</span>` : ""}</td></tr>`;
    })
    .join("");

  const hall = (titulo: string, items: string) => `<div class="h-bloque"><p class="h-t">${titulo}</p>${items || `<p class="vacio">Ninguno.</p>`}</div>`;
  const conf = d.vulnerabilities
    .map(
      (v) => `<div class="h-item sev-${v.severity}"><p><span class="h-sev">${esc(v.sev_label)}</span> <span class="m">${esc(v.id)}${v.cve_count ? `, ${v.cve_count} CVE` : ""}</span></p>
      <p class="h-txt">${esc(v.output)}</p>${v.remediation ? `<p class="h-fix">${esc(v.remediation)}</p>` : ""}</div>`
    )
    .join("");
  const pos = d.possible_vulnerabilities
    .map((v) => `<div class="h-item sev-posible"><p><span class="h-sev">Sin confirmar</span> <span class="m">${esc(v.id)}</span></p><p class="h-txt">${esc(v.output)}</p></div>`)
    .join("");

  return `<article class="hoja-host est-${est}">
    <header>
      <p class="hh-est">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
      <h3>${esc(d.ip)}</h3>
      <p class="hh-nombre">${esc(d.device || "Sin nombre")}</p>
    </header>
    <dl class="hh-specs">
      <div><dt>mac</dt><dd>${esc(d.mac || "—")}</dd></div>
      <div><dt>sistema</dt><dd>${esc(so ?? "—")}</dd></div>
      <div><dt>latencia</dt><dd>${d.latency.toFixed(1)} ms</dd></div>
    </dl>
    ${
      filas
        ? `<table class="hh-tabla"><thead><tr><th>puerto</th><th>proto</th><th>estado</th><th>servicio</th><th>producto</th></tr></thead><tbody>${filas}</tbody></table>`
        : `<p class="vacio">${admin ? "Sin puertos de gestión abiertos." : "Sin puertos abiertos."}</p>`
    }
    ${vulnView ? `<div class="hh-hall">${hall(`Confirmados (${d.vulnerabilities.length})`, conf)}${hall(`Posibles, sin confirmar (${d.possible_vulnerabilities.length})`, pos)}</div>` : conf ? `<div class="hh-hall">${hall(`Hallazgos (${d.vulnerabilities.length})`, conf)}</div>` : ""}
    ${d.location_urls.length ? `<p class="hh-urls">UPnP: ${d.location_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join(" ")}</p>` : ""}
  </article>`;
}

export function renderCategoryResults(cat: ScanCategory, devices: CategoryDevice[], lastScanTime: ScanTimeInfo | null): HTMLElement {
  const el = document.createElement("div");
  el.className = "resultados";
  const peso = { riesgo: 0, alerta: 1, seguro: 2, "sin-datos": 3 } as const;
  const orden = [...devices].sort((a, b) => peso[estadoHost(a)] - peso[estadoHost(b)]);
  el.innerHTML = `
    <p class="res-resumen">${devices.length} ${devices.length === 1 ? "dispositivo" : "dispositivos"}, ordenados de más a menos urgente${
      lastScanTime && lastScanTime.duracion_str !== "N/D" ? `. Escaneo de ${esc(lastScanTime.duracion_str)}` : ""
    }.</p>
    <div class="hojas">${orden.map((d) => hoja(cat, d)).join("")}</div>`;
  return el;
}
