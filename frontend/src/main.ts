// HERA, dirección A "Carta": la red como un terreno que se inspecciona.
// Shell (barra superior con reloj y control de escaneo) + Resumen (carta, diagnóstico,
// plan de acción, tabla de hosts) + Mapear/Detectar (ScanView) + secciones futuras.

import "@fontsource-variable/onest";
import "@fontsource-variable/martian-mono/wdth.css";
import "./styles/carta.css";

import { scanState, AppState } from "./state/scanState";
import { viewState, ViewName } from "./state/viewState";
import { ScanView } from "./components/ScanView";
import { NetworkMap } from "./components/NetworkMap";
import { generarPlan, PRIORIDAD_TEXTO } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, ESTADO_TEXTO, formatoReloj, contarHasta } from "./utils/security";

type Vista = ViewName | "penetrar";
let vista: Vista = "dashboard";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="barra">
    <button class="marca" data-vista="dashboard" aria-label="HERA, ir al resumen">
      <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><circle cx="10" cy="10" r="4.5"/><circle cx="10" cy="10" r="1.3" class="punto"/></svg>
      <span>hera</span>
    </button>
    <nav class="nav" aria-label="Secciones">
      <button data-vista="dashboard">Resumen</button>
      <button data-vista="mapear">Mapear</button>
      <button data-vista="detectar">Detectar</button>
      <button data-vista="vulnerar" class="es-futuro">Vulnerar</button>
      <button data-vista="penetrar" class="es-futuro">Penetrar</button>
    </nav>
    <div class="lecturas-barra">
      <span class="lb"><span class="lb-k">red</span> <span class="lb-v" id="lb-red">—</span></span>
      <span class="lb"><span class="lb-k">hora local</span> <span class="lb-v" id="lb-hora">—</span></span>
    </div>
    <div class="control-escaneo" id="control-escaneo"></div>
  </header>
  <div class="aviso-error" id="aviso-error" role="alert" hidden></div>

  <main id="vista-dashboard" class="resumen">
    <section class="panel panel-carta" aria-labelledby="t-carta">
      <div class="panel-cab">
        <h2 id="t-carta">Carta de la red</h2>
        <p class="leyenda">
          <span>${ESTADO_FORMA.seguro} segura</span>
          <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
          <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
          <span class="leyenda-nota">anillos = latencia</span>
        </p>
      </div>
      <div id="carta"></div>
      <div class="inspector" id="inspector" aria-live="polite"></div>
    </section>

    <aside class="panel panel-diag" aria-labelledby="t-diag">
      <div id="diagnostico"></div>
      <div class="plan" id="plan"></div>
    </aside>

    <section class="panel panel-tabla" aria-labelledby="t-tabla">
      <div class="panel-cab"><h2 id="t-tabla">Hosts</h2><span class="panel-meta" id="tabla-meta"></span></div>
      <div class="tabla-wrap"><table class="tabla" id="tabla"></table></div>
    </section>
  </main>

  <main id="vista-escaneo" class="escaneo" hidden></main>
  <main id="vista-futuro" class="futuro" hidden></main>
`;

// ── Navegación ──────────────────────────────────────────────────────────────
app.querySelectorAll<HTMLButtonElement>("[data-vista]").forEach((b) =>
  b.addEventListener("click", () => irA(b.dataset.vista as Vista))
);

const scanView = new ScanView();
document.getElementById("vista-escaneo")!.appendChild(scanView.getElement());

function irA(v: Vista) {
  vista = v;
  if (v === "dashboard") viewState.goToDashboard();
  else if (v === "mapear") viewState.goToMapear();
  else if (v === "detectar") viewState.goToDetectar();
  else if (v === "vulnerar") viewState.goToVulnerar();
  else viewState.goToVulnerar(); // "penetrar" aún no existe en viewState: solo presentación
  pintarVista();
}

function pintarVista() {
  const esEscaneo = vista === "mapear" || vista === "detectar";
  (document.getElementById("vista-dashboard") as HTMLElement).hidden = vista !== "dashboard";
  (document.getElementById("vista-escaneo") as HTMLElement).hidden = !esEscaneo;
  (document.getElementById("vista-futuro") as HTMLElement).hidden = !(vista === "vulnerar" || vista === "penetrar");
  app.querySelectorAll<HTMLButtonElement>(".nav [data-vista]").forEach((b) => {
    const activo = b.dataset.vista === vista;
    b.classList.toggle("is-activo", activo);
    if (activo) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (esEscaneo) scanView.activate();
  else scanView.deactivate();
  if (vista === "vulnerar" || vista === "penetrar") pintarFuturo(vista);
}

function pintarFuturo(v: "vulnerar" | "penetrar") {
  const el = document.getElementById("vista-futuro")!;
  const txt =
    v === "vulnerar"
      ? "Buscará vulnerabilidades explotables en lo que Mapear y Detectar encuentren. Mientras tanto, la detección con Nuclei y testssl está en Detectar."
      : "Pruebas de penetración controladas sobre tu propia red, siempre con confirmación. Todavía no hay nada que ejecutar aquí.";
  el.innerHTML = `
    <div class="futuro-caja">
      <svg viewBox="0 0 120 120" aria-hidden="true">${[54, 42, 30, 18].map((r) => `<circle cx="60" cy="60" r="${r}"/>`).join("")}</svg>
      <h2>${v === "vulnerar" ? "Vulnerar" : "Penetrar"} está en camino</h2>
      <p>${txt}</p>
      <button class="btn-sec" data-ir="detectar">Ir a Detectar</button>
    </div>`;
  el.querySelector<HTMLButtonElement>("[data-ir]")!.addEventListener("click", () => irA("detectar"));
}

// ── Reloj local (detalle tipo instrumento) ─────────────────────────────────
const hora = document.getElementById("lb-hora")!;
const tickHora = () =>
  (hora.textContent = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
tickHora();
setInterval(tickHora, 1000);

// ── Control de escaneo (siempre en la barra: un escaneo sigue vivo en cualquier vista) ──
const control = document.getElementById("control-escaneo")!;
let relojEscaneo: number | null = null;
function pintarControl(st: AppState) {
  if (relojEscaneo !== null) clearInterval(relojEscaneo);
  relojEscaneo = null;
  if (!st.isScanning) {
    control.innerHTML = `<button class="btn-pri" id="btn-escanear">${st.hasResults ? "Volver a escanear" : "Escanear la red"}</button>`;
    control.querySelector("#btn-escanear")!.addEventListener("click", () => scanState.startScan("full_pack", undefined, false, "Full pack"));
    return;
  }
  control.innerHTML = `
    <div class="en-curso" role="status">
      <span class="en-curso-txt">${esc(st.scanLabel ?? "Escaneo")}</span>
      <span class="en-curso-reloj" id="reloj-escaneo">00:00</span>
    </div>
    <button class="btn-sec" id="btn-cancelar">Cancelar</button>`;
  const r = control.querySelector("#reloj-escaneo")!;
  const t = () => (r.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
  t();
  relojEscaneo = window.setInterval(t, 1000);
  control.querySelector("#btn-cancelar")!.addEventListener("click", () => scanState.cancelScan());
}

// ── Resumen ─────────────────────────────────────────────────────────────────
const mapa = new NetworkMap((ip) => seleccionar(ip));
document.getElementById("carta")!.appendChild(mapa.getElement());

function seleccionar(ip: string | null) {
  seleccionado = ip;
  mapa.select(ip);
  document.querySelectorAll<HTMLTableRowElement>("#tabla tbody tr").forEach((tr) => tr.classList.toggle("is-sel", tr.dataset.ip === ip));
  if (ultimo) pintarInspector(ultimo.devices);
}

function pintarDiagnostico(st: AppState) {
  const est = estadoRed(st.stats, st.hasResults);
  const el = document.getElementById("diagnostico")!;
  const s = st.stats;
  if (est === "sin-datos") {
    el.innerHTML = `
      <div class="diag est-sin-datos">
        <p class="diag-k">Diagnóstico</p>
        <p class="diag-estado">${ESTADO_FORMA["sin-datos"]} Sin diagnóstico</p>
        <p class="diag-txt">HERA todavía no ha escaneado esta red. Un primer escaneo completo tarda entre 5 y 30 minutos según el tamaño de la red, y puedes cancelarlo cuando quieras.</p>
      </div>`;
    return;
  }
  const sev = s!.vulns_by_severity;
  el.innerHTML = `
    <div class="diag est-${est}">
      <p class="diag-k">Diagnóstico</p>
      <p class="diag-estado">${ESTADO_FORMA[est]} Tu red está ${ESTADO_TEXTO[est].toLowerCase()}</p>
      <dl class="lecturas">
        <div><dt>hosts</dt><dd data-n="${s!.active_devices}">0</dd></div>
        <div><dt>hallazgos</dt><dd data-n="${s!.total_vulns}">0</dd></div>
        <div><dt>crít. + altos</dt><dd data-n="${sev.critical + sev.high}" class="v-riesgo">0</dd></div>
        <div><dt>medios</dt><dd data-n="${sev.medium}" class="v-alerta">0</dd></div>
      </dl>
      <p class="diag-pie"><span>último escaneo ${esc(s!.last_scan)}</span><span>tiempo escaneando ${esc(s!.scan_time_total_str)}</span></p>
    </div>`;
  el.querySelectorAll<HTMLElement>("[data-n]").forEach((dd) => contarHasta(dd, Number(dd.dataset.n)));
}

function pintarPlan(devices: Device[]) {
  const el = document.getElementById("plan")!;
  const plan = generarPlan(devices);
  if (devices.length === 0) {
    el.innerHTML = `<h2 class="plan-t">Qué hacer ahora</h2><p class="plan-vacio">Cuando termine el primer escaneo, aquí aparecerá la lista de lo más urgente, ordenada y con los pasos para resolverlo.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="plan-cab">
      <h2 class="plan-t">Qué hacer ahora</h2>
      <span class="plan-n">${plan.acciones.length} ${plan.acciones.length === 1 ? "acción" : "acciones"}</span>
    </div>
    <ol class="acciones">
      ${plan.acciones
        .map(
          (a, i) => `
        <li class="accion est-${a.prioridad === "info" ? "seguro" : a.prioridad}">
          <details ${i < 2 ? "open" : ""}>
            <summary>
              <span class="accion-prio">${ESTADO_FORMA[a.prioridad === "info" ? "sin-datos" : a.prioridad]} ${PRIORIDAD_TEXTO[a.prioridad]}</span>
              <span class="accion-t">${esc(a.titulo)}</span>
            </summary>
            <p class="accion-motivo">${esc(a.motivo)}</p>
            <ul class="accion-pasos">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
            <p class="accion-hosts">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button class="chip-host" data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
          </details>
        </li>`
        )
        .join("")}
    </ol>
    <p class="plan-origen">Plan preliminar generado por reglas a partir del último escaneo. La síntesis con IA ocupará este mismo lugar.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".chip-host").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

function pintarInspector(devices: Device[]) {
  const el = document.getElementById("inspector")!;
  const d = devices.find((x) => x.ip === seleccionado);
  if (!d) {
    el.innerHTML = devices.length
      ? `<p class="insp-vacio">Elige un host en la carta o en la tabla para desarmarlo: sistema, puertos, servicios y hallazgos.</p>`
      : "";
    el.classList.remove("is-abierto");
    return;
  }
  el.classList.add("is-abierto");
  const est = estadoHost(d);
  const so = d.os_info?.running ?? d.os_info?.details ?? (d.os_info?.guesses[0] ? `${d.os_info.guesses[0].name} (${d.os_info.guesses[0].accuracy} %)` : "sin detectar");
  el.innerHTML = `
    <div class="insp-cab est-${est}">
      <div>
        <p class="insp-ip">${esc(d.ip)}</p>
        <p class="insp-nombre">${esc(d.device || "Sin nombre")}</p>
      </div>
      <p class="insp-estado">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
      <button class="insp-cerrar" aria-label="Cerrar inspector">Cerrar</button>
    </div>
    <dl class="insp-specs">
      <div><dt>mac</dt><dd>${esc(d.mac || "—")}</dd></div>
      <div><dt>sistema</dt><dd>${esc(so)}</dd></div>
      <div><dt>latencia</dt><dd>${d.latency.toFixed(1)} ms</dd></div>
      <div><dt>filtrados</dt><dd>${d.filtered_ports.length ? esc(d.filtered_ports.join(", ")) : "ninguno"}</dd></div>
    </dl>
    <table class="insp-puertos">
      <thead><tr><th>puerto</th><th>servicio</th><th>producto</th></tr></thead>
      <tbody>${
        d.service_details.length
          ? d.service_details
              .map((s) => {
                const v = d.vulnerabilities.find((x) => String(x.port) === String(s.port));
                return `<tr class="${v ? "con-hallazgo" : ""}"><td>${s.port}/${esc(s.protocol ?? "tcp")}</td><td>${esc(s.service)}</td><td>${esc([s.product, s.version].filter(Boolean).join(" ") || s.title || "—")}${v ? `<span class="tag-h">${esc(v.id)}</span>` : ""}</td></tr>`;
              })
              .join("")
          : `<tr><td colspan="3">Ningún puerto abierto</td></tr>`
      }</tbody>
    </table>`;
  el.querySelector(".insp-cerrar")!.addEventListener("click", () => seleccionar(null));
}

function pintarTabla(devices: Device[]) {
  const tabla = document.getElementById("tabla")!;
  document.getElementById("tabla-meta")!.textContent = devices.length ? `${devices.length} activos` : "";
  if (!devices.length) {
    tabla.innerHTML = `<tbody><tr><td class="tabla-vacia">Todavía no hay hosts. Escanea la red para poblar la carta y esta tabla.</td></tr></tbody>`;
    return;
  }
  tabla.innerHTML = `
    <thead><tr><th>estado</th><th>ip</th><th>dispositivo</th><th>sistema</th><th class="num">puertos</th><th class="num">hallazgos</th><th class="num">latencia</th></tr></thead>
    <tbody>${devices
      .map((d) => {
        const est = estadoHost(d);
        return `<tr data-ip="${esc(d.ip)}" tabindex="0" class="${d.ip === seleccionado ? "is-sel" : ""}">
          <td class="est-${est}">${ESTADO_FORMA[est]}<span class="sr">${ESTADO_TEXTO[est]}</span></td>
          <td class="mono">${esc(d.ip)}</td>
          <td>${esc(d.device || "—")}</td>
          <td class="tenue">${esc(d.os_info?.running ?? "—")}</td>
          <td class="num mono">${d.ports.length}</td>
          <td class="num mono">${d.vulnerabilities.length || "—"}</td>
          <td class="num mono">${d.latency.toFixed(1)}</td>
        </tr>`;
      })
      .join("")}</tbody>`;
  tabla.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => seleccionar(tr.dataset.ip!));
    tr.addEventListener("keydown", (e) => e.key === "Enter" && seleccionar(tr.dataset.ip!));
  });
}

// ── Reactividad ─────────────────────────────────────────────────────────────
let firmaDatos = "";
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  document.getElementById("lb-red")!.textContent = st.hostInfo?.ip ?? "—";
  pintarControl(st);
  mapa.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  // Solo se repinta el resumen si cambian los datos (no en cada tic del escaneo).
  const firma = JSON.stringify([st.stats, st.devices.length, st.hostInfo?.ip, st.hasResults]);
  if (firma === firmaDatos) return;
  firmaDatos = firma;
  mapa.update(st.devices, st.hostInfo?.ip ?? "esta red");
  pintarDiagnostico(st);
  pintarPlan(st.devices);
  pintarTabla(st.devices);
  pintarInspector(st.devices);
});

pintarVista();
