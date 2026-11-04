// HERA, dirección B "Lámina": la red como un plano técnico. Claro, editorial, con la vista
// explotada del host elegido en el centro y el plan de acción como columna propia.

import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/azeret-mono";
import "./styles/lamina.css";

import { scanState, AppState } from "./state/scanState";
import { viewState, ViewName } from "./state/viewState";
import { ScanView } from "./components/ScanView";
import { dibujarHost, specsHost } from "./components/ExplodedHost";
import { generarPlan, PRIORIDAD_TEXTO } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, ESTADO_TEXTO, formatoReloj } from "./utils/security";

type Vista = ViewName | "penetrar";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="cabecera">
    <button class="marca" data-vista="dashboard" aria-label="HERA, ir al resumen">hera</button>
    <nav class="nav" aria-label="Secciones">
      <button data-vista="dashboard">Resumen</button>
      <button data-vista="mapear">Mapear</button>
      <button data-vista="detectar">Detectar</button>
      <button data-vista="vulnerar" class="es-futuro">Vulnerar</button>
      <button data-vista="penetrar" class="es-futuro">Penetrar</button>
    </nav>
    <div class="control" id="control"></div>
  </header>
  <div class="aviso-error" id="aviso-error" role="alert" hidden></div>

  <main id="vista-dashboard" class="hoja">
    <section class="titular" id="titular"></section>

    <section class="mesa">
      <div class="col piezas">
        <h2 class="col-t">Dispositivos</h2>
        <ul class="lista-piezas" id="piezas"></ul>
      </div>
      <div class="col lamina">
        <div class="lamina-dibujo" id="dibujo"></div>
        <div class="lamina-specs" id="specs"></div>
      </div>
      <div class="col plan" id="plan"></div>
    </section>

    <footer class="cajetin" id="cajetin"></footer>
  </main>

  <main id="vista-escaneo" class="hoja hoja-escaneo" hidden></main>
  <main id="vista-futuro" class="hoja futuro" hidden></main>
`;

app.querySelectorAll<HTMLButtonElement>("[data-vista]").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista as Vista)));

const scanView = new ScanView();
document.getElementById("vista-escaneo")!.appendChild(scanView.getElement());

function irA(v: Vista) {
  if (v === "dashboard") viewState.goToDashboard();
  else if (v === "mapear") viewState.goToMapear();
  else if (v === "detectar") viewState.goToDetectar();
  else viewState.goToVulnerar();
  const esEscaneo = v === "mapear" || v === "detectar";
  (document.getElementById("vista-dashboard") as HTMLElement).hidden = v !== "dashboard";
  (document.getElementById("vista-escaneo") as HTMLElement).hidden = !esEscaneo;
  (document.getElementById("vista-futuro") as HTMLElement).hidden = !(v === "vulnerar" || v === "penetrar");
  app.querySelectorAll<HTMLButtonElement>(".nav [data-vista]").forEach((b) => {
    b.classList.toggle("is-activo", b.dataset.vista === v);
    if (b.dataset.vista === v) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (esEscaneo) scanView.activate();
  else scanView.deactivate();
  if (v === "vulnerar" || v === "penetrar") {
    const el = document.getElementById("vista-futuro")!;
    el.innerHTML = `
      <div class="futuro-caja">
        <p class="futuro-k">En preparación</p>
        <h2>${v}</h2>
        <p>${
          v === "vulnerar"
            ? "Comprobará si los hallazgos de Detectar se pueden aprovechar de verdad, para saber cuáles corregir primero."
            : "Pruebas de penetración controladas sobre tu propia red, siempre con confirmación previa."
        } Todavía no hay nada que ejecutar aquí.</p>
        <button class="btn-sec" id="ir-detectar">Ir a Detectar</button>
      </div>`;
    el.querySelector("#ir-detectar")!.addEventListener("click", () => irA("detectar"));
  }
}

// ── Control de escaneo ──────────────────────────────────────────────────────
const control = document.getElementById("control")!;
let reloj: number | null = null;
function pintarControl(st: AppState) {
  if (reloj !== null) clearInterval(reloj);
  reloj = null;
  if (!st.isScanning) {
    control.innerHTML = `<button class="btn-pri" id="escanear">${st.hasResults ? "Volver a escanear" : "Escanear la red"}</button>`;
    control.querySelector("#escanear")!.addEventListener("click", () => scanState.startScan("full_pack", undefined, false, "Full pack"));
    return;
  }
  control.innerHTML = `<span class="en-curso" role="status">Escaneando la red <span class="reloj" id="reloj">00:00</span></span><button class="btn-sec" id="cancelar">Cancelar escaneo</button>`;
  const r = control.querySelector("#reloj")!;
  const t = () => (r.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
  t();
  reloj = window.setInterval(t, 1000);
  control.querySelector("#cancelar")!.addEventListener("click", () => scanState.cancelScan());
}

// ── Resumen ─────────────────────────────────────────────────────────────────
function pintarTitular(st: AppState) {
  const est = estadoRed(st.stats, st.hasResults);
  const el = document.getElementById("titular")!;
  if (est === "sin-datos") {
    el.className = "titular est-sin-datos";
    el.innerHTML = `
      <h1>aún no hay plano de tu red.</h1>
      <p class="bajada">Un escaneo completo dibuja cada dispositivo, sus puertos y lo que conviene revisar. Tarda entre 5 y 30 minutos y puedes cancelarlo en cualquier momento.</p>`;
    return;
  }
  const plan = generarPlan(st.devices);
  const hoy = plan.acciones.filter((a) => a.prioridad === "riesgo").length;
  const semana = plan.acciones.filter((a) => a.prioridad === "alerta").length;
  const frase: Record<string, string> = {
    riesgo: "tu red está en riesgo.",
    alerta: "tu red necesita una revisión.",
    seguro: "tu red está en orden.",
  };
  el.className = `titular est-${est}`;
  el.innerHTML = `
    <p class="sello">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
    <h1>${frase[est]}</h1>
    <p class="bajada">${
      hoy || semana
        ? `${hoy ? `${hoy} ${hoy === 1 ? "cosa" : "cosas"} para hoy` : ""}${hoy && semana ? " y " : ""}${semana ? `${semana} para esta semana` : ""}. Empieza por la primera de la columna de la derecha.`
        : "No hay nada urgente. Repite el escaneo cuando conectes equipos nuevos."
    }</p>`;
}

function pintarPiezas(devices: Device[]) {
  const ul = document.getElementById("piezas")!;
  if (!devices.length) {
    ul.innerHTML = `<li class="vacio">Los dispositivos aparecerán aquí tras el primer escaneo.</li>`;
    return;
  }
  // Primero lo que está en riesgo: la lista es también un orden de revisión.
  const peso = { riesgo: 0, alerta: 1, seguro: 2, "sin-datos": 3 } as const;
  const orden = [...devices].sort((a, b) => peso[estadoHost(a)] - peso[estadoHost(b)]);
  ul.innerHTML = orden
    .map((d) => {
      const est = estadoHost(d);
      const n = d.vulnerabilities.length;
      return `<li><button class="pieza est-${est}${d.ip === seleccionado ? " is-sel" : ""}" data-ip="${esc(d.ip)}" aria-pressed="${d.ip === seleccionado}">
        <span class="pieza-est">${ESTADO_FORMA[est]}<span class="sr">${ESTADO_TEXTO[est]}</span></span>
        <span class="pieza-ip">${esc(d.ip)}</span>
        <span class="pieza-n">${n ? `${n} ${n === 1 ? "hallazgo" : "hallazgos"}` : `${d.ports.length} puertos`}</span>
        <span class="pieza-nombre">${esc(d.device || "Sin nombre")}</span>
      </button></li>`;
    })
    .join("");
  ul.querySelectorAll<HTMLButtonElement>(".pieza").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

function seleccionar(ip: string) {
  seleccionado = ip;
  if (!ultimo) return;
  pintarPiezas(ultimo.devices);
  pintarLamina(ultimo.devices, true);
}

function pintarLamina(devices: Device[], animar = false) {
  const d = devices.find((x) => x.ip === seleccionado) ?? null;
  const dib = document.getElementById("dibujo")!;
  dib.innerHTML = `
    <div class="lamina-cab">
      <p class="lamina-t">${d ? esc(d.ip) : "vista explotada"}</p>
      <p class="lamina-sub">${d ? `${esc(d.device || "sin nombre")}, vista explotada` : devices.length ? "elige un dispositivo de la lista" : "se dibuja tras el primer escaneo"}</p>
    </div>
    ${dibujarHost(d)}`;
  if (animar) {
    dib.classList.remove("explota");
    void dib.offsetWidth;
    dib.classList.add("explota");
  }
  document.getElementById("specs")!.innerHTML = d ? specsHost(d) : `<p class="vacio">La lámina muestra un dispositivo separado en capas, de lo físico a lo expuesto.</p>`;
}

function pintarPlan(devices: Device[]) {
  const el = document.getElementById("plan")!;
  const plan = generarPlan(devices);
  if (!devices.length) {
    el.innerHTML = `<h2 class="col-t">Qué hacer</h2><p class="vacio">Tras el escaneo, aquí tendrás los pasos ordenados por urgencia.</p>`;
    return;
  }
  el.innerHTML = `
    <h2 class="col-t">Qué hacer</h2>
    <ol class="acciones">${plan.acciones
      .map(
        (a, i) => `<li class="accion est-${a.prioridad === "info" ? "sin-datos" : a.prioridad}"><details ${i < 3 ? "open" : ""}>
          <summary><span class="accion-prio">${ESTADO_FORMA[a.prioridad === "info" ? "sin-datos" : a.prioridad]} ${PRIORIDAD_TEXTO[a.prioridad]}</span>
          <span class="accion-t">${esc(a.titulo)}</span></summary>
          <p class="accion-m">${esc(a.motivo)}</p>
          <ul class="accion-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          <p class="accion-h">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
        </details></li>`
      )
      .join("")}</ol>
    <p class="origen">Plan preliminar generado por reglas. La síntesis con IA ocupará esta columna.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".accion-h button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

function pintarCajetin(st: AppState) {
  const s = st.stats;
  const celdas: [string, string][] = [
    ["red", st.hostInfo?.ip ?? "—"],
    ["equipo", st.hostInfo?.hostname ?? "—"],
    ["dispositivos", st.hasResults ? String(s?.active_devices ?? 0) : "—"],
    ["hallazgos", st.hasResults ? String(s?.total_vulns ?? 0) : "—"],
    ["tiempo escaneando", st.hasResults ? s?.scan_time_total_str ?? "—" : "—"],
    ["revisión", st.hasResults ? s?.last_scan ?? "—" : "sin escanear"],
  ];
  document.getElementById("cajetin")!.innerHTML = `
    <div class="caj-marca"><span>hera</span><span class="caj-sub">auditoría de red</span></div>
    ${celdas.map(([k, v]) => `<div class="caj-celda"><span class="caj-k">${k}</span><span class="caj-v">${esc(v)}</span></div>`).join("")}`;
}

// ── Reactividad ─────────────────────────────────────────────────────────────
let firma = "";
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  pintarControl(st);
  document.body.classList.toggle("escaneando", st.isScanning);
  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  if (f === firma) return;
  firma = f;
  if (!seleccionado || !st.devices.some((d) => d.ip === seleccionado)) {
    // Por defecto se dibuja el dispositivo más urgente.
    const peor = st.devices.find((d) => estadoHost(d) === "riesgo") ?? st.devices[0];
    seleccionado = peor?.ip ?? null;
  }
  pintarTitular(st);
  pintarPiezas(st.devices);
  pintarLamina(st.devices, true);
  pintarPlan(st.devices);
  pintarCajetin(st);
});

irA("dashboard");
