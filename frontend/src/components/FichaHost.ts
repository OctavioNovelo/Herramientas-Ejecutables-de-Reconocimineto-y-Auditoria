// Ficha de un dispositivo, la que se abre al elegirlo en la carta o en una lista. Junta lo que
// mejor funcionó de la primera ronda: la cabecera, los datos y la tabla de puertos del
// inspector de A, y la vista explotada en capas de B (cada capa se levanta al pasar el cursor
// y se ilumina su descripción, y al revés).

import type { Device, CategoryDevice } from "../api/heraApi";
import { dibujarHost, specsHost } from "./ExplodedHost";
import { esc, estadoHost, ESTADO_TEXTO } from "../utils/security";

function sistema(d: Device): string {
  const os = d.os_info;
  if (!os) return "sin detectar";
  return os.running ?? os.details ?? (os.guesses[0]?.name ? `${os.guesses[0].name} (${os.guesses[0].accuracy} %)` : "sin detectar");
}

function hallazgos(d: Device): string {
  const posibles = (d as CategoryDevice).possible_vulnerabilities ?? [];
  if (!d.vulnerabilities.length && !posibles.length) return "";
  const item = (sev: string, sevTexto: string, id: string, txt: string, fix?: string | null, puerto?: string) =>
    `<li class="fh-item sev-${sev}">
      <p class="fh-item-cab"><span class="fh-sev">${esc(sevTexto)}</span><span class="fh-id">${esc(id)}</span>${puerto ? `<span class="fh-puerto">puerto ${esc(puerto)}</span>` : ""}</p>
      <p class="fh-txt">${esc(txt)}</p>${fix ? `<p class="fh-fix"><span>Solución</span> ${esc(fix)}</p>` : ""}
    </li>`;
  return `<section class="fh-hallazgos" aria-label="Hallazgos">
    ${d.vulnerabilities.length ? `<h4>Confirmados (${d.vulnerabilities.length})</h4><ul>${d.vulnerabilities.map((v) => item(v.severity, v.sev_label, v.id, v.output, v.remediation, v.port)).join("")}</ul>` : ""}
    ${posibles.length ? `<h4>Posibles, sin confirmar (${posibles.length})</h4><ul>${posibles.map((v) => item("posible", "Sin confirmar", v.id, v.output, null, v.port)).join("")}</ul>` : ""}
  </section>`;
}

// Cabecera de la ficha (IP, nombre, estado y cerrar). Se exporta para que el panel del plan de
// un host use la misma.
export function cabeceraHost(d: Device): string {
  const est = estadoHost(d);
  return `<header class="fh-cab est-${est}">
      <div class="fh-ident">
        <p class="fh-ip">${esc(d.ip)}</p>
        <p class="fh-nombre">${esc(d.device || "Sin nombre")}</p>
      </div>
      <p class="fh-estado">${ESTADO_TEXTO[est]}</p>
      <button type="button" class="fh-cerrar">Cerrar</button>
    </header>`;
}

export function fichaHost(d: Device, opciones: { animar?: boolean; cabecera?: boolean } = {}): string {
  const est = estadoHost(d);
  const filas = d.service_details.length
    ? d.service_details
        .map((s) => {
          const v = d.vulnerabilities.find((x) => String(x.port) === String(s.port));
          const producto = [s.product, s.version].filter(Boolean).join(" ") || (s.title ? `“${s.title}”` : "—");
          return `<tr class="${v ? "con-h" : ""}${s.state === "filtered" ? " filtrado" : ""}">
            <td class="fh-m">${s.port}/${esc(s.protocol ?? "tcp")}</td>
            <td>${esc(s.service)}${s.state === "filtered" ? ` <span class="fh-nota">filtrado</span>` : ""}</td>
            <td>${esc(producto)}${v ? `<span class="fh-tag">${esc(v.id)}</span>` : ""}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="fh-vacio">Ningún puerto abierto</td></tr>`;

  return `<article class="ficha est-${est}" data-ip="${esc(d.ip)}">
    ${opciones.cabecera === false ? "" : cabeceraHost(d)}
    <dl class="fh-datos">
      <div><dt>mac</dt><dd>${esc(d.mac || "—")}</dd></div>
      <div><dt>sistema</dt><dd>${esc(sistema(d))}</dd></div>
      <div><dt>latencia</dt><dd>${d.latency.toFixed(1)} ms</dd></div>
      <div><dt>filtrados</dt><dd>${d.filtered_ports.length ? esc(d.filtered_ports.join(", ")) : "ninguno"}</dd></div>
    </dl>
    <div class="fh-despiece">
      <div class="fh-lamina${opciones.animar ? " explota" : ""}">${dibujarHost(d)}</div>
      <div class="fh-capas">${specsHost(d)}</div>
    </div>
    <table class="fh-puertos">
      <thead><tr><th>puerto</th><th>servicio</th><th>producto</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    ${hallazgos(d)}
  </article>`;
}

// Conecta la ficha ya insertada: cerrar y el enlace capa ↔ descripción al pasar el cursor.
export function conectarFicha(raiz: HTMLElement, onCerrar: () => void) {
  raiz.querySelector(".fh-cerrar")?.addEventListener("click", onCerrar);
  const marcar = (n: string | null) => {
    raiz.querySelectorAll<Element>("[data-capa]").forEach((x) => x.classList.toggle("is-hover", x.getAttribute("data-capa") === n));
  };
  raiz.querySelectorAll<Element>("[data-capa]").forEach((x) => {
    x.addEventListener("mouseenter", () => marcar(x.getAttribute("data-capa")));
    x.addEventListener("mouseleave", () => marcar(null));
  });
}
