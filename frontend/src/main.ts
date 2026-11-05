// HERA, dirección J "Tablero" (tercera ronda). La base es G (buscador arriba, índice a la
// izquierda); al centro, "Qué hacer ahora" convertido en un tablero de trabajo (Hoy, Esta
// semana, Cuando puedas, Hecho) cuyo avance se guarda entre escaneos. La ficha del host, con las
// láminas de F, se abre como un panel lateral sobre el tablero. El logo es el botón de inicio.

import "@fontsource-variable/onest";
import "@fontsource-variable/azeret-mono";
import "./styles/comun.css";
import "./styles/tablero.css";
import logo from "./assets/hera-logo.png";

import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { filtroState, coincide, tieneHallazgos } from "./state/filtro";
import { ScanView } from "./components/ScanView";
import { Tablero } from "./components/Tablero";
import { Buscador } from "./components/Buscador";
import { fichaHost, conectarFicha } from "./components/FichaHost";
import { generarPlan, Accion } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, formatoReloj, contarHasta, Estado } from "./utils/security";
import { tipoDe, iconoSvg, TIPOS } from "./utils/tipos";

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
      <section class="centro" id="tablero" aria-label="Plan de trabajo"></section>
      <aside class="cajon" id="cajon" aria-live="polite" hidden></aside>
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
      <div><dt>último escaneo</dt><dd>${esc(s.last_scan)}</dd></div>
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
  if (!devs.length) {
    el.innerHTML = `<p class="vacio indice-vacio">El índice se llena con el primer escaneo.</p>`;
    return;
  }
  if (!visibles.length) {
    el.innerHTML = `<p class="vacio indice-vacio">Ningún dispositivo coincide. Prueba con otra palabra o quita los filtros.</p>`;
    return;
  }
  visibles = GRUPOS.flatMap((g) => visibles.filter((d) => estadoHost(d) === g.est));
  el.innerHTML = GRUPOS.map((g) => {
    const delGrupo = visibles.filter((d) => estadoHost(d) === g.est);
    if (!delGrupo.length) return "";
    return `<section class="grupo est-${g.est}">
      <h3 class="grupo-t">${ESTADO_FORMA[g.est]} ${g.titulo} <span>${delGrupo.length}</span></h3>
      <ul>${delGrupo
        .map((d) => {
          const h = d.vulnerabilities.length;
          const tipo = tipoDe(d);
          return `<li><button type="button" class="fila${d.ip === seleccionado ? " is-sel" : ""}" data-ip="${esc(d.ip)}" aria-current="${d.ip === seleccionado}">
            <span class="fila-ico" title="${TIPOS[tipo].nombre}">${iconoSvg(tipo, "ico", 16)}</span>
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

// ── Tablero + panel lateral con la ficha ──────────────────────────────────
const tablero = new Tablero((ip) => seleccionar(ip));
document.getElementById("tablero")!.appendChild(tablero.getElement());

let acciones: Accion[] = [];
function seleccionar(ip: string | null) {
  seleccionado = ip;
  pintarIndice();
  pintarCajon(true);
}

function pintarCajon(animar = false) {
  const el = document.getElementById("cajon")!;
  const d = ultimo?.devices.find((x) => x.ip === seleccionado) ?? null;
  el.hidden = !d;
  document.body.classList.toggle("con-ficha", !!d);
  if (!d) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<p class="cajon-tipo">${iconoSvg(tipoDe(d), "ico", 15)} ${TIPOS[tipoDe(d)].nombre}</p>${fichaHost(d, { animar })}`;
  conectarFicha(el, () => seleccionar(null));
  el.scrollTop = 0;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && seleccionado && !(e.target instanceof HTMLInputElement)) seleccionar(null);
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
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    tablero.update(acciones, st.hasResults ? st.stats?.last_scan ?? "" : "", st.hasResults);
    pintarIndice();
    pintarCajon();
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarDiag(st);
  }
});

irA("inicio");
