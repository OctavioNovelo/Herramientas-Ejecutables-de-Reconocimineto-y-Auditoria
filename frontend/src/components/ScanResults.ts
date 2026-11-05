// Resultados de una categoría (Mapear / Detectar) como hojas de especificación, una por host,
// con su tabla de puertos y sus hallazgos (las hojas de B de la primera ronda). Encima, el
// buscador: filtra las hojas sin volver a leer los resultados.

import type { ScanCategory } from "../state/viewState";
import { VULN_VIEW_IDS } from "../state/viewState";
import type { CategoryDevice, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";
import { esc, estadoHost, ESTADO_FORMA, ESTADO_TEXTO } from "../utils/security";
import { filtroState, coincide } from "../state/filtro";
import { Buscador } from "./Buscador";

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

  const bloque = (titulo: string, items: string) => `<div class="h-bloque"><p class="h-t">${titulo}</p>${items || `<p class="vacio">Ninguno.</p>`}</div>`;
  const conf = d.vulnerabilities
    .map(
      (v) => `<div class="h-item sev-${v.severity}"><p><span class="h-sev">${esc(v.sev_label)}</span> <span class="m">${esc(v.id)}${v.cve_count ? `, ${v.cve_count} CVE` : ""}</span></p>
      <p class="h-txt">${esc(v.output)}</p>${v.remediation ? `<p class="h-fix"><span>Solución</span> ${esc(v.remediation)}</p>` : ""}</div>`
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
    ${
      vulnView
        ? `<div class="hh-hall">${bloque(`Confirmados (${d.vulnerabilities.length})`, conf)}${bloque(`Posibles, sin confirmar (${d.possible_vulnerabilities.length})`, pos)}</div>`
        : conf
        ? `<div class="hh-hall">${bloque(`Hallazgos (${d.vulnerabilities.length})`, conf)}</div>`
        : ""
    }
    ${d.location_urls.length ? `<p class="hh-urls">UPnP: ${d.location_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join(" ")}</p>` : ""}
  </article>`;
}

// La vista de escaneo reemplaza los resultados en cada carga: se suelta la suscripción
// anterior para no seguir repintando hojas que ya no están en pantalla.
let soltarAnterior: (() => void) | null = null;

export function renderCategoryResults(cat: ScanCategory, devices: CategoryDevice[], lastScanTime: ScanTimeInfo | null): HTMLElement {
  soltarAnterior?.();
  const el = document.createElement("div");
  el.className = "resultados";

  const buscador = new Buscador();
  const resumen = document.createElement("p");
  resumen.className = "res-resumen";
  resumen.textContent = `Ordenados de más a menos urgente${lastScanTime && lastScanTime.duracion_str !== "N/D" ? `. Escaneo de ${lastScanTime.duracion_str}` : ""}.`;
  const hojas = document.createElement("div");
  hojas.className = "hojas";
  el.append(buscador.getElement(), resumen, hojas);

  const peso = { riesgo: 0, alerta: 1, seguro: 2, "sin-datos": 3 } as const;
  const orden = [...devices].sort((a, b) => peso[estadoHost(a)] - peso[estadoHost(b)]);

  const pintar = () => {
    const visibles = orden.filter((d) => coincide(d, filtroState.get()));
    buscador.setConteo(visibles.length, orden.length);
    hojas.innerHTML = visibles.length
      ? visibles.map((d) => hoja(cat, d)).join("")
      : `<p class="res-sin-coincidencias">Ningún dispositivo coincide con la búsqueda. Prueba con otra palabra o quita los filtros.</p>`;
  };
  const quitar = filtroState.subscribe(pintar);
  soltarAnterior = () => {
    quitar();
    buscador.destruir();
  };
  pintar();
  return el;
}
