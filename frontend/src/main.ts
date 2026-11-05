// HERA, dirección E "Relieve" (segunda ronda). La carta de A pasa a 3D: cada host es un pico
// cuya altura es su exposición, sobre anillos de latencia. Al elegir un pico, la columna
// derecha cambia del plan a la ficha del host (inspector de A + despiece de B). El logo es el
// botón de inicio; no hay pestaña de resumen.

import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/martian-mono/wdth.css";
import "./styles/relieve.css";
import logo from "./assets/hera-logo.png";

import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { filtroState, coincide, filtroActivo } from "./state/filtro";
import { ScanView } from "./components/ScanView";
import { Relieve } from "./components/Relieve";
import { Buscador } from "./components/Buscador";
import { fichaHost, conectarFicha } from "./components/FichaHost";
import { generarPlan, PRIORIDAD_TEXTO, Accion } from "./synthesis/plan";
import { esc, estadoRed, ESTADO_FORMA, ESTADO_TEXTO, formatoReloj, contarHasta } from "./utils/security";

type Vista = "inicio" | "mapear" | "detectar" | "vulnerar";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="fondo" aria-hidden="true"><span class="fondo-a"></span><span class="fondo-b"></span></div>
  <header class="barra">
    <button class="marca" data-vista="inicio" aria-label="HERA, ir al inicio">
      <img src="${logo}" alt="" width="34" height="22">
      <span>HERA</span>
    </button>
    <nav class="nav" aria-label="Secciones">
      <button data-vista="mapear">Mapear</button>
      <button data-vista="detectar">Detectar</button>
      <button data-vista="vulnerar" class="es-futuro">Vulnerar <span class="pronto">pronto</span></button>
    </nav>
    <p class="barra-red" id="barra-red"></p>
    <div class="control" id="control"></div>
  </header>
  <div class="aviso-error" id="aviso-error" role="alert" hidden></div>

  <main id="vista-inicio" class="inicio">
    <section class="diag" id="diag" aria-live="polite"></section>

    <section class="mapa" aria-label="Relieve de la red">
      <div class="mapa-cab">
        <div>
          <h2>Relieve de la red</h2>
          <p class="leyenda">
            <span class="est-seguro">${ESTADO_FORMA.seguro} seguro</span>
            <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
            <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
            <span class="leyenda-nota">altura = exposición, anillos = latencia</span>
          </p>
        </div>
        <div id="buscador-inicio"></div>
      </div>
      <div class="mapa-lienzo" id="lienzo"></div>
      <div class="mapa-pie">
        <p>Arrastra para girar, rueda para acercar, doble clic para la vista inicial.</p>
        <div class="mapa-botones">
          <button type="button" id="giro"></button>
          <button type="button" id="vista-inicial">Vista inicial</button>
        </div>
      </div>
    </section>

    <aside class="lado" id="lado" aria-live="polite"></aside>
  </main>

  <main id="vista-escaneo" class="escaneo" hidden></main>
  <main id="vista-futuro" class="futuro" hidden></main>
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
  document.body.dataset.vista = v;
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
        <img src="${logo}" alt="" width="120" height="79">
        <h2>Vulnerar está en camino.</h2>
        <p>Comprobará si los hallazgos de Detectar se pueden aprovechar de verdad, para que sepas cuáles corregir primero. Todavía no hay nada que ejecutar aquí.</p>
        <button class="btn-sec" id="ir-detectar">Ir a Detectar</button>
      </div>`;
    el.querySelector("#ir-detectar")!.addEventListener("click", () => irA("detectar"));
  }
}

// ── Barra: red auditada y control del escaneo completo ─────────────────────
const control = document.getElementById("control")!;
function pintarControl(st: AppState) {
  document.getElementById("barra-red")!.innerHTML = st.hostInfo ? `<span>red</span> ${esc(st.hostInfo.ip)}` : "";
  control.innerHTML = st.isScanning
    ? `<button class="btn-sec btn-cancelar" id="cancelar">Cancelar escaneo</button>`
    : `<button class="btn-pri" id="escanear">${st.hasResults ? "Volver a escanear" : "Escanear la red"}</button>`;
  control.querySelector("#cancelar")?.addEventListener("click", () => scanState.cancelScan());
  control.querySelector("#escanear")?.addEventListener("click", () => scanState.startScan("full_pack", undefined, false, "Full pack"));
}

// ── Diagnóstico: una frase y cuatro lecturas. Durante un escaneo, el reloj. ──
let relojDiag: number | null = null;
function pintarDiag(st: AppState, acciones: Accion[]) {
  const el = document.getElementById("diag")!;
  if (relojDiag !== null) clearInterval(relojDiag);
  relojDiag = null;

  if (st.isScanning) {
    el.className = "diag is-escaneando";
    el.innerHTML = `
      <p class="diag-sello"><span class="pulso" aria-hidden="true"></span>${esc(st.scanLabel ?? "Escaneo")} en curso</p>
      <h1>Levantando el relieve de ${esc(st.hostInfo?.ip ?? "tu red")}.</h1>
      <p class="diag-reloj" id="diag-reloj">00:00</p>`;
    const r = el.querySelector("#diag-reloj")!;
    const t = () => (r.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
    t();
    relojDiag = window.setInterval(t, 1000);
    return;
  }

  const est = estadoRed(st.stats, st.hasResults);
  el.className = `diag est-${est}`;
  if (est === "sin-datos") {
    el.innerHTML = `
      <p class="diag-sello">${ESTADO_FORMA["sin-datos"]} ${ESTADO_TEXTO["sin-datos"]}</p>
      <h1>Aún no hay relieve de tu red.</h1>
      <p class="diag-bajada">Un escaneo completo levanta cada dispositivo con sus puertos y lo que conviene revisar. Tarda entre 5 y 30 minutos y puedes cancelarlo cuando quieras.</p>`;
    return;
  }
  const s = st.stats!;
  const sev = s.vulns_by_severity;
  const hoy = acciones.filter((a) => a.prioridad === "riesgo").length;
  const semana = acciones.filter((a) => a.prioridad === "alerta").length;
  const frase = { riesgo: "Tu red está en riesgo.", alerta: "Tu red necesita una revisión.", seguro: "Tu red está en orden." }[est];
  el.innerHTML = `
    <div class="diag-texto">
      <p class="diag-sello">${ESTADO_FORMA[est]} ${ESTADO_TEXTO[est]}</p>
      <h1>${frase}</h1>
      <p class="diag-bajada">${
        hoy || semana
          ? `${hoy ? `${hoy} ${hoy === 1 ? "cosa" : "cosas"} para hoy` : ""}${hoy && semana ? " y " : ""}${semana ? `${semana} para esta semana` : ""}.`
          : "Nada urgente. Repite el escaneo cuando conectes equipos nuevos."
      }</p>
    </div>
    <dl class="lecturas">
      <div><dt>dispositivos</dt><dd data-n="${s.active_devices}">0</dd></div>
      <div><dt>hallazgos</dt><dd data-n="${s.total_vulns}">0</dd></div>
      <div class="est-riesgo"><dt>críticos y altos</dt><dd data-n="${sev.critical + sev.high}">0</dd></div>
      <div class="est-alerta"><dt>medios</dt><dd data-n="${sev.medium}">0</dd></div>
      <div class="lect-tiempo"><dt>último escaneo</dt><dd>${esc(s.last_scan)}</dd></div>
    </dl>`;
  el.querySelectorAll<HTMLElement>("[data-n]").forEach((dd) => contarHasta(dd, Number(dd.dataset.n)));
}

// ── Relieve + buscador ─────────────────────────────────────────────────────
const relieve = new Relieve((ip) => seleccionar(ip === seleccionado ? null : ip));
document.getElementById("lienzo")!.appendChild(relieve.getElement());
const buscador = new Buscador("Buscar host, puerto, servicio o CVE");
document.getElementById("buscador-inicio")!.appendChild(buscador.getElement());

const btnGiro = document.getElementById("giro") as HTMLButtonElement;
const pintarGiro = () => (btnGiro.textContent = relieve.getGiro() ? "Pausar giro" : "Reanudar giro");
btnGiro.addEventListener("click", () => {
  relieve.setGiro(!relieve.getGiro());
  pintarGiro();
});
pintarGiro();
document.getElementById("vista-inicial")!.addEventListener("click", () => relieve.vistaInicial());

function aplicarFiltro() {
  const devs = ultimo?.devices ?? [];
  const f = filtroState.get();
  const visibles = devs.filter((d) => coincide(d, f));
  buscador.setConteo(visibles.length, devs.length);
  relieve.setVisibles(filtroActivo(f) ? new Set(visibles.map((d) => d.ip)) : null);
}
filtroState.subscribe(aplicarFiltro);

function seleccionar(ip: string | null) {
  seleccionado = ip;
  relieve.select(ip);
  pintarLado(true);
}

// ── Columna derecha: el plan, o la ficha del host elegido ──────────────────
let acciones: Accion[] = [];
function pintarLado(animar = false) {
  const el = document.getElementById("lado")!;
  const d = ultimo?.devices.find((x) => x.ip === seleccionado) ?? null;
  document.body.classList.toggle("con-ficha", !!d);
  if (d) {
    el.innerHTML = `<button type="button" class="lado-volver" id="volver">Volver a “Qué hacer ahora”</button>${fichaHost(d, { animar })}`;
    el.querySelector("#volver")!.addEventListener("click", () => seleccionar(null));
    conectarFicha(el, () => seleccionar(null));
    return;
  }
  if (!ultimo?.hasResults) {
    el.innerHTML = `<h2 class="lado-t">Qué hacer ahora</h2><p class="vacio">Cuando termine el primer escaneo, aquí aparecerá lo más urgente, en orden y con los pasos para resolverlo.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="lado-cab"><h2 class="lado-t">Qué hacer ahora</h2><span class="lado-n">${acciones.length}</span></div>
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
        : `<p class="vacio">No hay nada pendiente. Elige un pico para ver el detalle de cualquier dispositivo.</p>`
    }
    <p class="lado-origen">Plan preliminar generado con reglas a partir del último escaneo.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".accion-h button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

// ── Reactividad ─────────────────────────────────────────────────────────────
let firma = "";
let escaneando: boolean | null = null;
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  pintarControl(st);
  relieve.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    relieve.update(st.devices, st.hostInfo?.ip ?? "esta red");
    aplicarFiltro();
    pintarLado();
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarDiag(st, acciones);
  }
});

irA("inicio");
