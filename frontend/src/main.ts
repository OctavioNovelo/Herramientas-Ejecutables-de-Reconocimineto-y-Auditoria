// HERA, dirección G "Índice" (segunda ronda). Pensada para redes grandes: el buscador es la
// pieza principal, a la izquierda un índice de todos los hosts agrupado por estado (se recorre
// con las flechas), al centro la ficha del host elegido (inspector de A + despiece de B) o el
// plan, y a la derecha una carta pequeña que marca dónde caen los resultados de la búsqueda.
// El logo es el botón de inicio; no hay pestaña de resumen.

import "@fontsource-variable/onest";
import "@fontsource-variable/martian-mono/wdth.css";
import "./styles/indice.css";
import logo from "./assets/hera-logo.png";

import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { filtroState, coincide, filtroActivo, tieneHallazgos } from "./state/filtro";
import { ScanView } from "./components/ScanView";
import { Minimapa } from "./components/Minimapa";
import { Buscador } from "./components/Buscador";
import { fichaHost, conectarFicha } from "./components/FichaHost";
import { generarPlan, PRIORIDAD_TEXTO, Accion } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, formatoReloj, contarHasta, Estado } from "./utils/security";

type Vista = "inicio" | "mapear" | "detectar" | "vulnerar";
let seleccionado: string | null = null;
let ultimo: AppState | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="fondo" aria-hidden="true"></div>
  <header class="barra">
    <button class="marca" data-vista="inicio" aria-label="HERA, ir al inicio">
      <img src="${logo}" alt="" width="32" height="21">
      <span>HERA</span>
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
    <section class="mando">
      <div class="mando-bus" id="buscador-inicio"></div>
      <div class="diag" id="diag" aria-live="polite"></div>
    </section>
    <section class="trabajo">
      <nav class="indice" id="indice" aria-label="Índice de dispositivos" tabindex="0"></nav>
      <section class="centro" id="centro" aria-live="polite"></section>
      <aside class="derecha">
        <div class="derecha-cab">
          <h2>Carta de la red</h2>
          <p class="leyenda">
            <span class="est-seguro">${ESTADO_FORMA.seguro} seguro</span>
            <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
            <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
          </p>
        </div>
        <div id="minimapa"></div>
        <p class="derecha-nota">Anillos = latencia. Al buscar, los hosts que coinciden se iluminan aquí y en el índice.</p>
        <dl class="derecha-datos" id="derecha-datos"></dl>
      </aside>
    </section>
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
        <img src="${logo}" alt="" width="110" height="72">
        <h2>Vulnerar está en camino</h2>
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

// ── Diagnóstico compacto junto al buscador ────────────────────────────────
let relojDiag: number | null = null;
function pintarDiag(st: AppState) {
  const el = document.getElementById("diag")!;
  if (relojDiag !== null) clearInterval(relojDiag);
  relojDiag = null;
  if (st.isScanning) {
    el.className = "diag is-escaneando";
    el.innerHTML = `<p class="diag-frase"><span class="pulso" aria-hidden="true"></span>${esc(st.scanLabel ?? "Escaneo")} en curso sobre ${esc(st.hostInfo?.ip ?? "la red local")}</p><p class="diag-reloj" id="diag-reloj">00:00</p>`;
    const r = el.querySelector("#diag-reloj")!;
    const t = () => (r.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
    t();
    relojDiag = window.setInterval(t, 1000);
    return;
  }
  const est = estadoRed(st.stats, st.hasResults);
  el.className = `diag est-${est}`;
  if (est === "sin-datos") {
    el.innerHTML = `<p class="diag-frase">${ESTADO_FORMA["sin-datos"]} Aún no hay escaneos. Pulsa “Escanear la red” para empezar.</p>`;
    return;
  }
  const s = st.stats!;
  const sev = s.vulns_by_severity;
  const frase = { riesgo: "Tu red está en riesgo", alerta: "Tu red necesita una revisión", seguro: "Tu red está en orden" }[est];
  el.innerHTML = `
    <p class="diag-frase">${ESTADO_FORMA[est]} ${frase}</p>
    <dl class="lecturas">
      <div><dt>dispositivos</dt><dd data-n="${s.active_devices}">0</dd></div>
      <div><dt>hallazgos</dt><dd data-n="${s.total_vulns}">0</dd></div>
      <div class="est-riesgo"><dt>críticos y altos</dt><dd data-n="${sev.critical + sev.high}">0</dd></div>
      <div class="est-alerta"><dt>medios</dt><dd data-n="${sev.medium}">0</dd></div>
    </dl>`;
  el.querySelectorAll<HTMLElement>("[data-n]").forEach((dd) => contarHasta(dd, Number(dd.dataset.n)));
}

// ── Índice: todos los hosts, agrupados por estado, filtrados por el buscador ──
const GRUPOS: { est: Estado; titulo: string }[] = [
  { est: "riesgo", titulo: "En riesgo" },
  { est: "alerta", titulo: "En alerta" },
  { est: "seguro", titulo: "Seguros" },
];
const buscador = new Buscador("Busca un host por IP, nombre, MAC, puerto, servicio o CVE");
document.getElementById("buscador-inicio")!.appendChild(buscador.getElement());
let visibles: Device[] = [];

function ipNum(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + (parseInt(o, 10) || 0), 0);
}

function pintarIndice() {
  const el = document.getElementById("indice")!;
  const devs = ultimo?.devices ?? [];
  const f = filtroState.get();
  visibles = devs.filter((d) => coincide(d, f)).sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
  buscador.setConteo(visibles.length, devs.length);
  minimapa.setVisibles(filtroActivo(f) ? new Set(visibles.map((d) => d.ip)) : null);
  if (!devs.length) {
    el.innerHTML = `<p class="vacio indice-vacio">El índice se llena con el primer escaneo.</p>`;
    return;
  }
  if (!visibles.length) {
    el.innerHTML = `<p class="vacio indice-vacio">Ningún dispositivo coincide. Prueba con otra palabra o quita los filtros.</p>`;
    return;
  }
  // El orden del índice (por grupo y luego por IP) es el que siguen las flechas.
  visibles = GRUPOS.flatMap((g) => visibles.filter((d) => estadoHost(d) === g.est));
  el.innerHTML = GRUPOS.map((g) => {
    const delGrupo = visibles.filter((d) => estadoHost(d) === g.est);
    if (!delGrupo.length) return "";
    return `<section class="grupo est-${g.est}">
      <h3 class="grupo-t">${ESTADO_FORMA[g.est]} ${g.titulo} <span>${delGrupo.length}</span></h3>
      <ul>${delGrupo
        .map((d) => {
          const h = d.vulnerabilities.length;
          return `<li><button type="button" class="fila${d.ip === seleccionado ? " is-sel" : ""}" data-ip="${esc(d.ip)}" aria-current="${d.ip === seleccionado}">
            <span class="fila-ip">${esc(d.ip)}</span>
            <span class="fila-nombre">${esc(d.device || "Sin nombre")}</span>
            <span class="fila-n">${d.ports.length} ${d.ports.length === 1 ? "puerto" : "puertos"}</span>
            ${h ? `<span class="fila-h">${h} ${h === 1 ? "hallazgo" : "hallazgos"}</span>` : tieneHallazgos(d) ? `<span class="fila-p">posibles</span>` : ""}
          </button></li>`;
        })
        .join("")}</ul>
    </section>`;
  }).join("");
  el.querySelectorAll<HTMLButtonElement>(".fila").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip === seleccionado ? null : b.dataset.ip!)));
  el.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" });
}
filtroState.subscribe(pintarIndice);

// Flechas arriba/abajo recorren el índice (con el foco en el índice o en el buscador).
function moverSeleccion(paso: number) {
  if (!visibles.length) return;
  const i = visibles.findIndex((d) => d.ip === seleccionado);
  const sig = i < 0 ? (paso > 0 ? 0 : visibles.length - 1) : Math.max(0, Math.min(visibles.length - 1, i + paso));
  seleccionar(visibles[sig].ip);
}
document.addEventListener("keydown", (e) => {
  if (document.getElementById("vista-inicio")!.hidden) return;
  const enIndice = (e.target as Element).closest?.(".indice, .mando-bus");
  if (!enIndice || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
  e.preventDefault();
  moverSeleccion(e.key === "ArrowDown" ? 1 : -1);
});

// ── Centro: ficha del host o plan ─────────────────────────────────────────
const minimapa = new Minimapa((ip) => seleccionar(ip === seleccionado ? null : ip));
document.getElementById("minimapa")!.appendChild(minimapa.getElement());

let acciones: Accion[] = [];
function seleccionar(ip: string | null) {
  seleccionado = ip;
  minimapa.select(ip);
  pintarIndice();
  pintarCentro(true);
}

function pintarCentro(animar = false) {
  const el = document.getElementById("centro")!;
  const d = ultimo?.devices.find((x) => x.ip === seleccionado) ?? null;
  if (d) {
    el.innerHTML = fichaHost(d, { animar });
    conectarFicha(el, () => seleccionar(null));
    el.scrollTop = 0;
    return;
  }
  if (!ultimo?.hasResults) {
    el.innerHTML = `<div class="centro-vacio">
      <img src="${logo}" alt="" width="120" height="79">
      <h2>Empieza con un escaneo completo</h2>
      <p>HERA encuentra cada dispositivo de tu red, sus puertos y lo que conviene revisar. Tarda entre 5 y 30 minutos y puedes cancelarlo cuando quieras.</p>
    </div>`;
    return;
  }
  el.innerHTML = `
    <div class="centro-cab"><h2>Qué hacer ahora</h2><span>${acciones.length} ${acciones.length === 1 ? "acción" : "acciones"}</span></div>
    ${
      acciones.length
        ? `<ol class="acciones">${acciones
            .map((a, i) => {
              const est = a.prioridad === "info" ? "sin-datos" : a.prioridad;
              return `<li class="accion est-${est}"><details ${i < 3 ? "open" : ""}>
                <summary><span class="accion-prio">${ESTADO_FORMA[est]} ${PRIORIDAD_TEXTO[a.prioridad]}</span><span class="accion-t">${esc(a.titulo)}</span></summary>
                <div class="accion-cuerpo">
                  <p class="accion-m">${esc(a.motivo)}</p>
                  <ul class="accion-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
                  <p class="accion-h">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button type="button" data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
                </div>
              </details></li>`;
            })
            .join("")}</ol>`
        : `<p class="vacio">No hay nada pendiente. Elige un host del índice para ver su detalle.</p>`
    }
    <p class="centro-origen">Plan preliminar generado con reglas a partir del último escaneo. Elige un host del índice o de la carta para ver su ficha.</p>`;
  el.querySelectorAll<HTMLButtonElement>(".accion-h button").forEach((b) => b.addEventListener("click", () => seleccionar(b.dataset.ip!)));
}

function pintarDatos(st: AppState) {
  const s = st.stats;
  const filas: [string, string][] = [
    ["red", st.hostInfo?.ip ?? "—"],
    ["equipo", st.hostInfo?.hostname ?? "—"],
    ["último escaneo", st.hasResults ? s?.last_scan ?? "—" : "sin escanear"],
    ["tiempo escaneando", st.hasResults ? s?.scan_time_total_str ?? "—" : "—"],
  ];
  document.getElementById("derecha-datos")!.innerHTML = filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
}

// ── Fondo: la retícula de puntos sigue un poco al cursor ───────────────────
const fondo = document.querySelector<HTMLElement>(".fondo")!;
let pendiente = false;
document.addEventListener("pointermove", (e) => {
  if (pendiente || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  pendiente = true;
  requestAnimationFrame(() => {
    fondo.style.setProperty("--mx", (e.clientX / window.innerWidth - 0.5).toFixed(3));
    fondo.style.setProperty("--my", (e.clientY / window.innerHeight - 0.5).toFixed(3));
    pendiente = false;
  });
});

// ── Reactividad ─────────────────────────────────────────────────────────────
let firma = "";
let escaneando: boolean | null = null;
scanState.subscribe((st) => {
  ultimo = st;
  const err = document.getElementById("aviso-error")!;
  err.hidden = !st.error;
  err.textContent = st.error ? `No se pudo completar la operación: ${st.error}` : "";
  pintarControl(st);
  minimapa.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    minimapa.update(st.devices);
    pintarIndice();
    pintarCentro();
    pintarDatos(st);
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarDiag(st);
  }
});

irA("inicio");
