// HERA, dirección D "Levantamiento": evolución de A (Carta) y B (Lámina).
// La red como un levantamiento topográfico: la carta de contornos de A y, al elegir un host,
// su despiece en capas de B, en el mismo panel. Titular editorial de B en un lienzo oscuro de
// instrumento, lecturas en Martian Mono, plan de acción como columna fija y cajetín al pie.
// Pensado como app de escritorio: ocupa la ventana, cada zona tiene su propio scroll, y se
// reorganiza cuando el gestor de ventanas la pone en un mosaico estrecho.

import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/martian-mono/wdth.css";
import "./styles/levantamiento.css";

import { scanState, AppState } from "./state/scanState";
import { viewState, ViewName } from "./state/viewState";
import { ScanView } from "./components/ScanView";
import { NetworkMap } from "./components/NetworkMap";
import { dibujarHost, specsHost } from "./components/ExplodedHost";
import { generarPlan, PRIORIDAD_TEXTO, Accion } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, ESTADO_TEXTO, formatoReloj, contarHasta } from "./utils/security";

type Vista = ViewName | "penetrar";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <header class="barra">
    <button class="marca" data-vista="dashboard" aria-label="HERA, ir al resumen">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 13c3-1 4-5 8-5s5 4 8 3"/><path d="M2 16.5c3-1 4-4 8-4s5 3 8 2.5"/><circle cx="10" cy="4" r="1.6"/></svg>
      <span>hera</span>
    </button>
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

  <div class="cuerpo">
    <main id="vista-dashboard" class="resumen">
      <section class="titular" id="titular" aria-live="polite"></section>

      <section class="campo" id="campo" aria-label="Carta de la red">
        <div class="campo-carta">
          <div class="campo-cab">
            <h2>Carta de la red</h2>
            <p class="leyenda">
              <span class="est-seguro">${ESTADO_FORMA.seguro} segura</span>
              <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
              <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
              <span class="leyenda-nota">anillos = latencia</span>
            </p>
          </div>
          <div id="carta"></div>
          <p class="campo-pista" id="campo-pista"></p>
        </div>
        <div class="campo-despiece" id="despiece" aria-live="polite"></div>
      </section>

      <aside class="plan" id="plan" aria-label="Qué hacer ahora"></aside>
    </main>

    <main id="vista-escaneo" class="escaneo" hidden></main>
    <main id="vista-futuro" class="futuro" hidden></main>
  </div>

  <footer class="cajetin" id="cajetin"></footer>
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
        <svg viewBox="0 0 160 90" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${70 - i * 12}c40-${8 + i * 2} 60 ${6 + i} 80 0s60-${10 + i} 80-${4 + i}"/>`).join("")}</svg>
        <h2>${v} está en camino.</h2>
        <p>${
          v === "vulnerar"
            ? "Comprobará si los hallazgos de Detectar se pueden aprovechar de verdad, para que sepas cuáles corregir primero."
            : "Pruebas de penetración controladas sobre tu propia red, siempre con tu confirmación antes de cada paso."
        } Todavía no hay nada que ejecutar aquí.</p>
        <button class="btn-sec" id="ir-detectar">Ir a Detectar</button>
      </div>`;
    el.querySelector("#ir-detectar")!.addEventListener("click", () => irA("detectar"));
  }
}

// ── Control de escaneo (barra) ──────────────────────────────────────────────
const control = document.getElementById("control")!;
function pintarControl(st: AppState) {
  control.innerHTML = st.isScanning
    ? `<button class="btn-sec btn-cancelar" id="cancelar">Cancelar escaneo</button>`
    : `<button class="btn-pri" id="escanear">${st.hasResults ? "Volver a escanear" : "Escanear la red"}</button>`;
  control.querySelector("#cancelar")?.addEventListener("click", () => scanState.cancelScan());
  control.querySelector("#escanear")?.addEventListener("click", () => scanState.startScan("full_pack", undefined, false, "Full pack"));
}

// ── Titular: el diagnóstico en una frase. Durante un escaneo, se convierte en el progreso. ──
let relojTitular: number | null = null;
function pintarTitular(st: AppState, acciones: Accion[]) {
  const el = document.getElementById("titular")!;
  if (relojTitular !== null) clearInterval(relojTitular);
  relojTitular = null;

  if (st.isScanning) {
    el.className = "titular is-escaneando";
    el.innerHTML = `
      <div class="tit-texto">
        <p class="sello"><span class="pulso" aria-hidden="true"></span> ${esc(st.scanLabel ?? "Escaneo")} sobre ${esc(st.hostInfo?.ip ?? "la red local")}</p>
        <h1>levantando el plano de tu red.</h1>
        <p class="bajada">Nmap no informa del avance, así que HERA cuenta el tiempo. Puedes seguir usando la app o cancelar cuando quieras.</p>
      </div>
      <p class="tit-reloj" id="tit-reloj">00:00</p>`;
    const r = el.querySelector("#tit-reloj")!;
    const t = () => (r.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
    t();
    relojTitular = window.setInterval(t, 1000);
    return;
  }

  const est = estadoRed(st.stats, st.hasResults);
  el.className = `titular est-${est}`;
  if (est === "sin-datos") {
    el.innerHTML = `
      <div class="tit-texto">
        <p class="sello">${ESTADO_FORMA["sin-datos"]} ${ESTADO_TEXTO["sin-datos"]}</p>
        <h1>aún no hay plano de tu red.</h1>
        <p class="bajada">Un escaneo completo dibuja cada dispositivo, sus puertos y lo que conviene revisar. Tarda entre 5 y 30 minutos y puedes cancelarlo en cualquier momento.</p>
      </div>`;
    return;
  }
  const s = st.stats!;
  const sev = s.vulns_by_severity;
  const hoy = acciones.filter((a) => a.prioridad === "riesgo").length;
  const semana = acciones.filter((a) => a.prioridad === "alerta").length;
  const frase = { riesgo: "tu red está en riesgo.", alerta: "tu red necesita una revisión.", seguro: "tu red está en orden." }[est];
  el.innerHTML = `
    <div class="tit-texto">
      <p class="sello">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
      <h1>${frase}</h1>
      <p class="bajada">${
        hoy || semana
          ? `${hoy ? `${hoy} ${hoy === 1 ? "cosa" : "cosas"} para hoy` : ""}${hoy && semana ? " y " : ""}${semana ? `${semana} para esta semana` : ""}. Empieza por la primera de “Qué hacer ahora”.`
          : "No hay nada urgente. Repite el escaneo cuando conectes equipos nuevos."
      }</p>
    </div>
    <dl class="lecturas">
      <div><dt>dispositivos</dt><dd data-n="${s.active_devices}">0</dd></div>
      <div><dt>hallazgos</dt><dd data-n="${s.total_vulns}">0</dd></div>
      <div class="est-riesgo"><dt>crít. + altos</dt><dd data-n="${sev.critical + sev.high}">0</dd></div>
      <div class="est-alerta"><dt>medios</dt><dd data-n="${sev.medium}">0</dd></div>
    </dl>`;
  el.querySelectorAll<HTMLElement>("[data-n]").forEach((dd) => contarHasta(dd, Number(dd.dataset.n)));
}

// ── Carta + despiece ────────────────────────────────────────────────────────
const mapa = new NetworkMap((ip) => seleccionar(ip === seleccionado ? null : ip));
document.getElementById("carta")!.appendChild(mapa.getElement());

function seleccionar(ip: string | null) {
  seleccionado = ip;
  mapa.select(ip);
  if (ultimo) pintarDespiece(ultimo.devices, true);
}

function pintarDespiece(devices: Device[], animar = false) {
  const campo = document.getElementById("campo")!;
  const el = document.getElementById("despiece")!;
  const pista = document.getElementById("campo-pista")!;
  const d = devices.find((x) => x.ip === seleccionado) ?? null;
  campo.classList.toggle("con-despiece", !!d);
  pista.textContent = devices.length
    ? d
      ? "Elige otro pin para cambiar de dispositivo, o el mismo para cerrar el despiece."
      : "Elige un pin para despiezar ese dispositivo: equipo, sistema, puertos, servicios y hallazgos."
    : "";
  if (!d) {
    el.innerHTML = "";
    return;
  }
  const est = estadoHost(d);
  el.innerHTML = `
    <div class="desp-cab est-${est}">
      <div>
        <p class="desp-ip">${esc(d.ip)}</p>
        <p class="desp-nombre">${esc(d.device || "Sin nombre")}</p>
      </div>
      <p class="desp-est">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
      <button class="desp-cerrar" id="desp-cerrar">Cerrar</button>
    </div>
    <div class="desp-cuerpo">
      <div class="desp-dibujo${animar ? " explota" : ""}">${dibujarHost(d)}</div>
      <div class="desp-specs">${specsHost(d)}</div>
    </div>`;
  el.querySelector("#desp-cerrar")!.addEventListener("click", () => seleccionar(null));
}

// ── Plan ────────────────────────────────────────────────────────────────────
function pintarPlan(acciones: Accion[], hayDatos: boolean) {
  const el = document.getElementById("plan")!;
  if (!hayDatos) {
    el.innerHTML = `<h2 class="plan-t">Qué hacer ahora</h2><p class="vacio">Cuando termine el primer escaneo, aquí aparecerá lo más urgente, ordenado y con los pasos para resolverlo.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="plan-cab"><h2 class="plan-t">Qué hacer ahora</h2><span class="plan-n">${acciones.length}</span></div>
    <ol class="acciones">${acciones
      .map((a, i) => {
        const est = a.prioridad === "info" ? "sin-datos" : a.prioridad;
        return `<li class="accion est-${est}"><details ${i < 2 ? "open" : ""}>
          <summary><span class="accion-prio">${ESTADO_FORMA[est]} ${PRIORIDAD_TEXTO[a.prioridad]}</span><span class="accion-t">${esc(a.titulo)}</span></summary>
          <p class="accion-m">${esc(a.motivo)}</p>
          <ul class="accion-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          <p class="accion-h">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
        </details></li>`;
      })
      .join("")}</ol>
    <p class="plan-origen">Plan preliminar generado por reglas a partir del último escaneo. La síntesis con IA ocupará esta columna.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".accion-h button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

// ── Cajetín con hora local en vivo ──────────────────────────────────────────
function pintarCajetin(st: AppState) {
  const s = st.stats;
  const celdas: [string, string, string?][] = [
    ["red", st.hostInfo?.ip ?? "—"],
    ["equipo", st.hostInfo?.hostname ?? "—"],
    ["último escaneo", st.hasResults ? s?.last_scan ?? "—" : "sin escanear"],
    ["tiempo escaneando", st.hasResults ? s?.scan_time_total_str ?? "—" : "—"],
    ["hora local", "—", "caj-hora"],
  ];
  document.getElementById("cajetin")!.innerHTML = `
    <div class="caj-marca"><span>hera</span><span class="caj-k">auditoría de red</span></div>
    ${celdas.map(([k, v, id]) => `<div class="caj-celda"><span class="caj-k">${k}</span><span class="caj-v"${id ? ` id="${id}"` : ""}>${esc(v)}</span></div>`).join("")}`;
  tickHora();
}
function tickHora() {
  const el = document.getElementById("caj-hora");
  if (el) el.textContent = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
setInterval(tickHora, 1000);

// ── Reactividad ─────────────────────────────────────────────────────────────
let firma = "";
let escaneando: boolean | null = null;
let acciones: Accion[] = [];
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  pintarControl(st);
  mapa.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    mapa.update(st.devices, st.hostInfo?.ip ?? "esta red");
    pintarDespiece(st.devices);
    pintarPlan(acciones, st.hasResults);
    pintarCajetin(st);
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarTitular(st, acciones);
  }
});

irA("dashboard");
