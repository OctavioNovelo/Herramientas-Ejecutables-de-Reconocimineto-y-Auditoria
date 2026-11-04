// Dirección D "Levantamiento" (heredado de A): resultados de una categoría como filas de
// instrumento con una regla de puertos logarítmica (1–65535); al desplegar la fila se ve la
// ficha completa del host, con la tabla de puertos y los hallazgos.

import type { ScanCategory } from "../state/viewState";
import { VULN_VIEW_IDS } from "../state/viewState";
import type { CategoryDevice, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";
import { esc, estadoHost, ESTADO_FORMA, ESTADO_TEXTO } from "../utils/security";

const RW = 420;
const xPuerto = (p: number) => 6 + ((RW - 12) * Math.log10(Math.max(1, p))) / Math.log10(65535);

function regla(dev: CategoryDevice, admin: boolean): string {
  const escala = [1, 10, 100, 1000, 10000, 65535]
    .map((p) => `<line class="r-tick" x1="${xPuerto(p)}" x2="${xPuerto(p)}" y1="30" y2="36"/><text class="r-esc" x="${xPuerto(p)}" y="46">${p === 65535 ? "65k" : p >= 1000 ? p / 1000 + "k" : p}</text>`)
    .join("");
  // Puertos casi contiguos (5000/5001) caen en el mismo píxel: se agrupan en una sola marca.
  const grupos: number[][] = [];
  for (const p of dev.ports.slice().sort((a, b) => a - b)) {
    const g = grupos[grupos.length - 1];
    if (g && xPuerto(p) - xPuerto(g[0]) < 6) g.push(p);
    else grupos.push([p]);
  }
  let ultimoX = -99;
  let fila = 0;
  const marcas = grupos
    .map((g) => {
      const x = xPuerto(g[0]);
      fila = x - ultimoX < 30 ? (fila + 1) % 2 : 0;
      ultimoX = x;
      const raro = admin && g.some((p) => !isAdminPortStandard(p));
      const v = dev.vulnerabilities.some((x) => g.map(String).includes(String(x.port)));
      return `<g class="r-marca${v ? " con-hallazgo" : ""}${raro ? " no-estandar" : ""}">
        <line x1="${x}" x2="${x}" y1="${16 - fila * 11}" y2="34"/>
        <text x="${x}" y="${12 - fila * 11}">${g.length > 2 ? `${g[0]}…${g[g.length - 1]}` : g.join(",")}</text></g>`;
    })
    .join("");
  const filtrados = dev.filtered_ports.map((p) => `<circle class="r-filtrado" cx="${xPuerto(p)}" cy="34" r="2.6"/>`).join("");
  return `<svg class="regla" viewBox="0 -22 ${RW} 72" role="img" aria-label="Puertos abiertos: ${dev.ports.join(", ") || "ninguno"}">
    <line class="r-base" x1="6" x2="${RW - 6}" y1="34" y2="34"/>${escala}${marcas}${filtrados}</svg>`;
}

function ficha(cat: ScanCategory, dev: CategoryDevice): string {
  const admin = cat.id === "admin";
  const os = dev.os_info;
  const so = os?.exact_match
    ? [os.device_types.join(", "), os.running].filter(Boolean).join("  ") || os.details
    : os?.guesses.length
    ? os.guesses.map((g) => `${g.name ?? "?"} (${g.accuracy ?? "?"} %)`).join(", ") + "  sin coincidencia exacta"
    : null;

  const puertos = dev.service_details.length
    ? `<table class="ficha-puertos"><thead><tr><th>puerto</th><th>estado</th><th>servicio</th><th>producto y versión</th></tr></thead><tbody>
      ${dev.service_details
        .map((s) => {
          const raro = admin && s.state === "open" && !isAdminPortStandard(s.port);
          const prod = [s.product, s.version, s.extrainfo].filter(Boolean).join(" ") || (s.title ? `“${s.title}”` : !s.reconocido && s.fingerprint ? "no reconocido, hay fingerprint" : "—");
          return `<tr class="${s.state === "filtered" ? "es-filtrado" : ""}${raro ? " no-estandar" : ""}">
            <td>${s.port}/${esc(s.protocol ?? "tcp")}</td>
            <td>${s.state === "open" ? "abierto" : "filtrado"}</td>
            <td>${esc(admin ? adminPortLabel(s.port) : s.service)}${raro ? ` <span class="tag-raro">no estándar</span>` : ""}</td>
            <td>${esc(prod)}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="ficha-vacia">${admin ? "Sin puertos de gestión abiertos." : "Sin puertos abiertos."}</p>`;

  const conf = dev.vulnerabilities
    .map(
      (v) => `<li class="hall sev-${v.severity}">
        <span class="hall-sev">${esc(v.sev_label)}</span>
        <span class="hall-id">${esc(v.id)}${v.cve_count ? ` (${v.cve_count} CVE)` : ""}${v.port ? `  puerto ${esc(v.port)}` : ""}</span>
        <span class="hall-txt">${esc(v.output)}</span>
        ${v.remediation ? `<span class="hall-fix">Qué hacer: ${esc(v.remediation)}</span>` : ""}
      </li>`
    )
    .join("");
  const pos = (dev.possible_vulnerabilities ?? [])
    .map((v) => `<li class="hall sev-posible"><span class="hall-sev">Sin confirmar</span><span class="hall-id">${esc(v.id)}</span><span class="hall-txt">${esc(v.output)}</span></li>`)
    .join("");

  const hallazgos =
    VULN_VIEW_IDS.has(cat.id) || conf
      ? `<div class="ficha-hall">
          <div><h4>Confirmados (${dev.vulnerabilities.length})</h4>${conf ? `<ul>${conf}</ul>` : `<p class="ficha-vacia">Ninguno.</p>`}</div>
          ${VULN_VIEW_IDS.has(cat.id) ? `<div><h4>Posibles, sin confirmar (${dev.possible_vulnerabilities.length})</h4>${pos ? `<ul>${pos}</ul>` : `<p class="ficha-vacia">Ninguno.</p>`}</div>` : ""}
        </div>`
      : "";

  const urls = dev.location_urls.length
    ? `<p class="ficha-urls">Descripción UPnP: ${dev.location_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join(" ")}</p>`
    : "";

  return `<dl class="ficha-specs">
      <div><dt>mac</dt><dd>${esc(dev.mac || "—")}</dd></div>
      <div><dt>sistema</dt><dd>${esc(so ?? "no detectado en esta categoría")}</dd></div>
      <div><dt>latencia</dt><dd>${dev.latency.toFixed(1)} ms</dd></div>
    </dl>${puertos}${hallazgos}${urls}`;
}

export function renderCategoryResults(cat: ScanCategory, devices: CategoryDevice[], lastScanTime: ScanTimeInfo | null): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "resultados";
  const total = devices.reduce((n, d) => n + d.vulnerabilities.length, 0);
  wrap.innerHTML = `
    <div class="res-cab">
      <dl class="lecturas lecturas-compactas">
        <div><dt>hosts</dt><dd>${devices.length}</dd></div>
        <div><dt>puertos abiertos</dt><dd>${devices.reduce((n, d) => n + d.ports.length, 0)}</dd></div>
        <div><dt>hallazgos</dt><dd>${total}</dd></div>
        ${lastScanTime && lastScanTime.duracion_str !== "N/D" ? `<div><dt>duración</dt><dd>${esc(lastScanTime.duracion_str)}</dd></div>` : ""}
      </dl>
      <p class="res-nota">Marcas llenas: puertos abiertos. Círculos: filtrados por un firewall. Despliega un host para ver su ficha.</p>
    </div>
    <div class="filas">${devices
      .map((d) => {
        const est = estadoHost(d);
        return `<details class="fila est-${est}">
          <summary>
            <span class="fila-est">${ESTADO_FORMA[est]}<span class="sr">${ESTADO_TEXTO[est]}</span></span>
            <span class="fila-id"><span class="fila-ip">${esc(d.ip)}</span><span class="fila-nombre">${esc(d.device || "Sin nombre")}</span></span>
            ${regla(d, cat.id === "admin")}
            <span class="fila-n">${d.vulnerabilities.length ? `${d.vulnerabilities.length} ${d.vulnerabilities.length === 1 ? "hallazgo" : "hallazgos"}` : ""}</span>
          </summary>
          <div class="ficha">${ficha(cat, d)}</div>
        </details>`;
      })
      .join("")}</div>`;
  return wrap;
}
