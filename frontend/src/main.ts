// HERA, dirección F "Cianotipo" (segunda ronda). El plano técnico de B pasado a papel azul de
// cianotipo (nunca blanco), con la voz editorial en minúsculas de B, la carta convertida en el
// abanico del logo y la ficha del host con su despiece en capas. El cajetín del plano va al pie.
// El logo es el botón de inicio; no hay pestaña de resumen.

import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/azeret-mono";
import "./styles/cianotipo.css";
import logo from "./assets/hera-logo.png";

import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { filtroState, coincide, filtroActivo } from "./state/filtro";
import { ScanView } from "./components/ScanView";
import { Abanico } from "./components/Abanico";
import { Buscador } from "./components/Buscador";
import { fichaHost, conectarFicha } from "./components/FichaHost";
import { generarPlan, PRIORIDAD_TEXTO, Accion } from "./synthesis/plan";
import { esc, estadoRed, ESTADO_FORMA, ESTADO_TEXTO, formatoReloj, contarHasta } from "./utils/security";

type Vista = "inicio" | "mapear" | "detectar" | "vulnerar";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="fondo" aria-hidden="true"></div>
  <header class="barra">
    <button class="marca" data-vista="inicio" aria-label="HERA, ir al inicio">
      <img src="${logo}" alt="" width="36" height="24">
      <span>hera</span>
    </button>
    <nav class="nav" aria-label="Secciones">
      <button data-vista="mapear">Mapear</button>
      <button data-vista="detectar">Detectar</button>
      <button data-vista="vulnerar" class="es-futuro">Vulnerar <span class="pronto">pronto</span></button>
    </nav>
    <div class="control" id="control"></div>
  </header>
  <div class="aviso-error" id="aviso-error" role="alert" hidden></div>

  <main id="vista-inicio" class="inicio">
    <section class="titular" id="titular" aria-live="polite"></section>
    <section class="campo" aria-label="Abanico de la red">
      <div class="campo-cab">
        <div class="campo-t">
          <h2>Abanico de la red</h2>
          <p class="leyenda">
            <span class="est-seguro">${ESTADO_FORMA.seguro} seguro</span>
            <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
            <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
            <span class="leyenda-nota">cada pluma es un host; más lejos, más latencia</span>
          </p>
        </div>
        <div id="buscador-inicio"></div>
      </div>
      <div class="campo-dibujo" id="dibujo"></div>
    </section>
    <aside class="lado" id="lado" aria-live="polite"></aside>
  </main>

  <main id="vista-escaneo" class="escaneo" hidden></main>
  <main id="vista-futuro" class="futuro" hidden></main>

  <footer class="cajetin" id="cajetin"></footer>
`;

app.querySelectorAll<HTMLButtonElement>("[data-vista]").forEach((b) => b.addEventListener("click", () => irA(b.dataset.vista as Vista)));
const scanView = new ScanView();
document.getElementById("vista-escaneo")!.appendChild(scanView.getElement());

function irA(v: Vista) {
  if (v === "inicio") viewState.goToDashboard();
  else if (v === "mapear") viewState.goToMapear();
  else if (v === "detectar") viewState.goToDetectar();
  else viewState.goToVulnerar();
  const esEscaneo = v === "mapear" || v === "detectar";
  (document.getElementById("vista-inicio") as HTMLElement).hidden = v !== "inicio";
  (document.getElementById("vista-escaneo") as HTMLElement).hidden = !esEscaneo;
  (document.getElementById("vista-futuro") as HTMLElement).hidden = v !== "vulnerar";
  app.querySelectorAll<HTMLButtonElement>(".nav [data-vista]").forEach((b) => {
    b.classList.toggle("is-activo", b.dataset.vista === v);
    if (b.dataset.vista === v) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (esEscaneo) scanView.activate();
  else scanView.deactivate();
  if (v === "vulnerar") {
    const el = document.getElementById("vista-futuro")!;
    el.innerHTML = `
      <div class="futuro-caja">
        <img src="${logo}" alt="" width="140" height="92">
        <h2>vulnerar está en camino.</h2>
        <p>Comprobará si los hallazgos de Detectar se pueden aprovechar de verdad, para que sepas cuáles corregir primero. Todavía no hay nada que ejecutar aquí.</p>
        <button class="btn-sec" id="ir-detectar">Ir a Detectar</button>
      </div>`;
    el.querySelector("#ir-detectar")!.addEventListener("click", () => irA("detectar"));
  }
}

const control = document.getElementById("control")!;
function pintarControl(st: AppState) {
  control.innerHTML = st.isScanning
    ? `<button class="btn-sec btn-cancelar" id="cancelar">Cancelar escaneo</button>`
    : `<button class="btn-pri" id="escanear">${st.hasResults ? "Volver a escanear" : "Escanear la red"}</button>`;
  control.querySelector("#cancelar")?.addEventListener("click", () => scanState.cancelScan());
  control.querySelector("#escanear")?.addEventListener("click", () => scanState.startScan("full_pack", undefined, false, "Full pack"));
}

// ── Titular editorial: el diagnóstico en una frase; durante un escaneo, el progreso ──
let relojTitular: number | null = null;
function pintarTitular(st: AppState, acciones: Accion[]) {
  const el = document.getElementById("titular")!;
  if (relojTitular !== null) clearInterval(relojTitular);
  relojTitular = null;
  if (st.isScanning) {
    el.className = "titular is-escaneando";
    el.innerHTML = `
      <div class="tit-texto">
        <p class="sello"><span class="pulso" aria-hidden="true"></span>${esc(st.scanLabel ?? "Escaneo")} sobre ${esc(st.hostInfo?.ip ?? "la red local")}</p>
        <h1>trazando el plano de tu red.</h1>
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
        <p class="bajada">Un escaneo completo traza cada dispositivo, sus puertos y lo que conviene revisar. Tarda entre 5 y 30 minutos y puedes cancelarlo cuando quieras.</p>
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
      <div class="est-riesgo"><dt>críticos y altos</dt><dd data-n="${sev.critical + sev.high}">0</dd></div>
      <div class="est-alerta"><dt>medios</dt><dd data-n="${sev.medium}">0</dd></div>
    </dl>`;
  el.querySelectorAll<HTMLElement>("[data-n]").forEach((dd) => contarHasta(dd, Number(dd.dataset.n)));
}

// ── Abanico + buscador ─────────────────────────────────────────────────────
const abanico = new Abanico((ip) => seleccionar(ip === seleccionado ? null : ip));
document.getElementById("dibujo")!.appendChild(abanico.getElement());
const buscador = new Buscador("Buscar host, puerto, servicio o CVE");
document.getElementById("buscador-inicio")!.appendChild(buscador.getElement());

function aplicarFiltro() {
  const devs = ultimo?.devices ?? [];
  const f = filtroState.get();
  const visibles = devs.filter((d) => coincide(d, f));
  buscador.setConteo(visibles.length, devs.length);
  abanico.setVisibles(filtroActivo(f) ? new Set(visibles.map((d) => d.ip)) : null);
}
filtroState.subscribe(aplicarFiltro);

function seleccionar(ip: string | null) {
  seleccionado = ip;
  abanico.select(ip);
  pintarLado(true);
}

// ── Columna derecha: plan o ficha ──────────────────────────────────────────
let acciones: Accion[] = [];
function pintarLado(animar = false) {
  const el = document.getElementById("lado")!;
  const d = ultimo?.devices.find((x) => x.ip === seleccionado) ?? null;
  document.body.classList.toggle("con-ficha", !!d);
  if (d) {
    el.innerHTML = `<button type="button" class="lado-volver" id="volver">Volver a “qué hacer ahora”</button>${fichaHost(d, { animar })}`;
    el.querySelector("#volver")!.addEventListener("click", () => seleccionar(null));
    conectarFicha(el, () => seleccionar(null));
    el.scrollTop = 0;
    return;
  }
  if (!ultimo?.hasResults) {
    el.innerHTML = `<h2 class="lado-t">qué hacer ahora</h2><p class="vacio">Cuando termine el primer escaneo, aquí aparecerá lo más urgente, en orden y con los pasos para resolverlo.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="lado-cab"><h2 class="lado-t">qué hacer ahora</h2><span class="lado-n">${acciones.length}</span></div>
    ${
      acciones.length
        ? `<ol class="acciones">${acciones
            .map((a, i) => {
              const est = a.prioridad === "info" ? "sin-datos" : a.prioridad;
              return `<li class="accion est-${est}"><details ${i < 2 ? "open" : ""}>
                <summary><span class="accion-prio">${ESTADO_FORMA[est]} ${PRIORIDAD_TEXTO[a.prioridad]}</span><span class="accion-t">${esc(a.titulo)}</span></summary>
                <p class="accion-m">${esc(a.motivo)}</p>
                <ul class="accion-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
                <p class="accion-h">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button type="button" data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
              </details></li>`;
            })
            .join("")}</ol>`
        : `<p class="vacio">No hay nada pendiente. Elige una pluma para ver el detalle de cualquier dispositivo.</p>`
    }
    <p class="lado-origen">Plan preliminar generado con reglas a partir del último escaneo.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".accion-h button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

// ── Cajetín: el bloque de título del plano ─────────────────────────────────
function pintarCajetin(st: AppState) {
  const s = st.stats;
  const celdas: [string, string, string?][] = [
    ["red", st.hostInfo?.ip ?? "—"],
    ["equipo", st.hostInfo?.hostname ?? "—"],
    ["dispositivos", st.hasResults ? String(s?.active_devices ?? 0) : "—"],
    ["último escaneo", st.hasResults ? s?.last_scan ?? "—" : "sin escanear"],
    ["tiempo escaneando", st.hasResults ? s?.scan_time_total_str ?? "—" : "—"],
    ["hora local", "—", "caj-hora"],
  ];
  document.getElementById("cajetin")!.innerHTML = `
    <div class="caj-marca"><img src="${logo}" alt="" width="26" height="17"><span>hera</span><span class="caj-k">plano de auditoría de red</span></div>
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
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  pintarControl(st);
  abanico.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    abanico.update(st.devices, st.hostInfo?.ip ?? "esta red");
    aplicarFiltro();
    pintarLado();
    pintarCajetin(st);
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarTitular(st, acciones);
  }
});

irA("inicio");
