// Resultados de una categoría (Mapear / Detectar): una hoja por host, agrupadas por estado como
// el índice. Cada hoja lleva la corona de puertos del mapa como emblema, los puertos como teclas
// y los hallazgos con su corrección. Encima, el
// buscador: filtra las hojas sin volver a leer los resultados.

import type { ScanCategory } from "../state/viewState";
import { VULN_VIEW_IDS } from "../state/viewState";
import type { CategoryDevice, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";
import { esc, estadoHost, ESTADO_TEXTO, Estado, respuestaSvg, PUERTOS_SENSIBLES } from "../utils/security";
import { filtroState, coincide } from "../state/filtro";
import { Buscador } from "./Buscador";
import { tipoDe, iconoSvg, TIPOS } from "../utils/tipos";

// Emblema del equipo: su ícono dentro de la misma corona de puertos que se ve en el mapa (una
// marca por puerto; en color de riesgo las que tienen hallazgo, punteadas las filtradas).
function emblema(d: CategoryDevice): string {
  const conH = new Set(d.vulnerabilities.map((v) => String(v.port)));
  const filtrados = new Set(d.filtered_ports.map(String));
  const puertos = [...new Set([...d.ports.map(String), ...filtrados])].slice(0, 40);
  const R = 25;
  const paso = (Math.PI * 2) / Math.max(1, puertos.length);
  const hueco = puertos.length > 1 ? Math.min(0.14, paso / 3) : 0;
  const p = (a: number) => `${(30 + Math.cos(a) * R).toFixed(2)} ${(30 + Math.sin(a) * R).toFixed(2)}`;
  const arcos = puertos.length
    ? puertos
        .map((pt, i) => {
          const a0 = -Math.PI / 2 + i * paso + hueco / 2;
          const a1 = a0 + paso - hueco;
          const clase = conH.has(pt) ? "con-h" : filtrados.has(pt) ? "filtrado" : "";
          return puertos.length === 1
            ? `<circle class="${clase}" cx="30" cy="30" r="${R}"/>`
            : `<path class="${clase}" d="M${p(a0)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}"/>`;
        })
        .join("")
    : `<circle class="vacia" cx="30" cy="30" r="${R}"/>`;
  return `<div class="hh-emblema" title="${TIPOS[tipoDe(d)].nombre}">
    <svg viewBox="0 0 60 60" aria-hidden="true"><g class="hh-corona">${arcos}</g><circle class="hh-disco" cx="30" cy="30" r="19"/></svg>
    ${iconoSvg(tipoDe(d), "ico", 18)}
  </div>`;
}

function hoja(cat: ScanCategory, d: CategoryDevice): string {
  const admin = cat.id === "admin";
  const vulnView = VULN_VIEW_IDS.has(cat.id);
  const est = estadoHost(d);
  const os = d.os_info;
  const so = os?.exact_match
    ? os.running ?? os.details
    : os?.guesses.length
    ? `${os.guesses[0].name} (${os.guesses[0].accuracy} %)`
    : null;

  // Puertos como teclas: número grande, servicio y producto; con hallazgo, en color de riesgo.
  const teclas = d.service_details
    .filter((s) => !admin || s.state === "open")
    .map((s) => {
      const raro = admin && !isAdminPortStandard(s.port);
      const v = d.vulnerabilities.find((x) => String(x.port) === String(s.port));
      const prod = [s.product, s.version, s.extrainfo].filter(Boolean).join(" ") || (s.title ? `“${s.title}”` : !s.reconocido ? "no reconocido" : "");
      const sensible = !v && s.state === "open" && PUERTOS_SENSIBLES.has(Number(s.port));
      const proto = s.protocol && s.protocol !== "tcp" ? `<small>/${esc(s.protocol)}</small>` : "";
      return `<li class="tecla${s.state === "filtered" ? " filtrado" : ""}${v ? " con-h" : ""}${raro ? " raro" : ""}${sensible ? " sensible" : ""}" title="${esc([s.port + "/" + (s.protocol ?? "tcp"), s.state === "open" ? "abierto" : "filtrado", prod].filter(Boolean).join(" · "))}">
        <span class="tc-n">${s.port}${proto}</span>
        <span class="tc-s">${esc(admin ? adminPortLabel(s.port) : s.service)}</span>
        ${prod ? `<span class="tc-p">${esc(prod)}</span>` : ""}
        ${v ? `<span class="tc-h">${esc(v.id)}</span>` : sensible ? `<span class="tc-a">revisar</span>` : s.state === "filtered" ? `<span class="tc-f">filtrado</span>` : raro ? `<span class="tc-f">no estándar</span>` : ""}
      </li>`;
    })
    .join("");

  const confirmados = d.vulnerabilities
    .map(
      (v) => `<li class="hl sev-${v.severity}">
        <p class="hl-cab"><span class="hl-sev">${esc(v.sev_label)}</span><span class="hl-id">${esc(v.id)}${v.cve_count ? ` · ${v.cve_count} CVE` : ""}</span>${v.port ? `<span class="hl-pt">puerto ${esc(v.port)}</span>` : ""}</p>
        <p class="hl-txt">${esc(v.output)}</p>
        ${v.remediation ? `<p class="hl-fix"><span>Cómo se corrige</span>${esc(v.remediation)}</p>` : ""}
      </li>`
    )
    .join("");
  const posibles = d.possible_vulnerabilities
    .map((v) => `<li class="hl sev-posible"><p class="hl-cab"><span class="hl-id">${esc(v.id)}</span>${v.port ? `<span class="hl-pt">puerto ${esc(v.port)}</span>` : ""}</p><p class="hl-txt">${esc(v.output)}</p></li>`)
    .join("");
  const hallazgos =
    confirmados || (vulnView && posibles)
      ? `<section class="hh-hall">
          ${confirmados ? `<ul class="hl-lista">${confirmados}</ul>` : ""}
          ${vulnView && posibles ? `<details class="hl-posibles"><summary>${d.possible_vulnerabilities.length} ${d.possible_vulnerabilities.length === 1 ? "posible hallazgo" : "posibles hallazgos"} sin confirmar</summary><ul class="hl-lista">${posibles}</ul></details>` : ""}
        </section>`
      : vulnView
      ? `<p class="hh-limpio">Sin hallazgos en este escaneo.</p>`
      : "";

  const nPuertos = d.ports.length;
  return `<article class="hoja-host est-${est}">
    <header class="hh-cab">
      ${emblema(d)}
      <div class="hh-ident">
        <h3>${esc(d.ip)}</h3>
        <p class="hh-nombre">${esc(d.device || "Sin nombre")}</p>
      </div>
      <p class="hh-est">${ESTADO_TEXTO[est]}</p>
    </header>
    <dl class="hh-specs">
      <div><dt>tipo</dt><dd>${TIPOS[tipoDe(d)].nombre}</dd></div>
      <div><dt>sistema</dt><dd>${esc(so ?? "sin detectar")}</dd></div>
      <div><dt>mac</dt><dd class="m">${esc(d.mac || "—")}</dd></div>
      <div><dt>respuesta</dt><dd class="m">${respuestaSvg(d.latency || 0)} ${d.latency.toFixed(1)} ms</dd></div>
    </dl>
    ${
      teclas
        ? `<div class="hh-puertos"><p class="hh-sub">${admin ? "Puertos de gestión" : "Puertos"} <span>${nPuertos} ${nPuertos === 1 ? "abierto" : "abiertos"}${d.filtered_ports.length ? `, ${d.filtered_ports.length} filtrados` : ""}</span></p><ul class="teclas">${teclas}</ul></div>`
        : `<p class="hh-limpio">${admin ? "Sin puertos de gestión abiertos." : "Sin puertos abiertos."}</p>`
    }
    ${hallazgos}
    ${d.location_urls.length ? `<p class="hh-urls">UPnP: ${d.location_urls.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join(" ")}</p>` : ""}
  </article>`;
}

const GRUPOS: { est: Estado; titulo: string }[] = [
  { est: "riesgo", titulo: "En riesgo" },
  { est: "alerta", titulo: "En alerta" },
  { est: "seguro", titulo: "Seguros" },
  { est: "sin-datos", titulo: "Sin diagnóstico" },
];

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
      ? GRUPOS.map((g) => {
          const del = visibles.filter((d) => estadoHost(d) === g.est);
          return del.length
            ? `<section class="hojas-grupo est-${g.est}"><h2 class="hojas-t">${g.titulo} <span>${del.length}</span></h2><div class="hojas-rejilla">${del.map((d) => hoja(cat, d)).join("")}</div></section>`
            : "";
        }).join("")
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
