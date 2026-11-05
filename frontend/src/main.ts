// HERA, dirección H "Señal" (tercera ronda). La base es G (buscador arriba, índice a la
// izquierda); al centro, la red como la ve el router: dispositivos agrupados por tipo, con su
// ícono, a una distancia que crece con la latencia. A la derecha, el plan o la ficha del host
// con las láminas de F. El logo es el botón de inicio.

import "@fontsource-variable/onest";
import "@fontsource-variable/martian-mono/wdth.css";
import "./styles/comun.css";
import "./styles/senal.css";
import "./styles/temas.css";
import logo from "./assets/hera-logo.png";

import { scanState, AppState } from "./state/scanState";
import { viewState } from "./state/viewState";
import { filtroState, coincide, filtroActivo, tieneHallazgos } from "./state/filtro";
import { ScanView } from "./components/ScanView";
import { Senal } from "./components/Senal";
import { Buscador } from "./components/Buscador";
import { fichaHost, conectarFicha } from "./components/FichaHost";
import { generarPlan, PRIORIDAD_TEXTO, Accion } from "./synthesis/plan";
import type { Device } from "./api/heraApi";
import { esc, estadoRed, estadoHost, ESTADO_FORMA, formatoReloj, contarHasta, Estado, respuestaSvg } from "./utils/security";
import { tipoDe, iconoSvg, TIPOS } from "./utils/tipos";
import { Temas, iniciarTema } from "./components/Temas";

const temaInicial = iniciarTema("abismo");

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
    <div class="control"><div id="temas"></div><div id="control"></div></div>
  </header>
  <div class="aviso-error" id="aviso-error" role="alert" hidden></div>

  <main id="vista-inicio" class="inicio">
    <section class="mando">
      <div class="mando-bus" id="buscador-inicio"></div>
      <div class="diag" id="diag" aria-live="polite"></div>
    </section>
    <section class="trabajo">
      <nav class="indice" id="indice" aria-label="Índice de dispositivos" tabindex="0"></nav>
      <section class="mapa" aria-label="Mapa de la red">
        <div class="mapa-cab">
          <h2>Tu red desde el router</h2>
          <p class="leyenda">
            <span class="est-seguro">${ESTADO_FORMA.seguro} seguro</span>
            <span class="est-alerta">${ESTADO_FORMA.alerta} revisar</span>
            <span class="est-riesgo">${ESTADO_FORMA.riesgo} riesgo</span>
            <span class="leyenda-nota">agrupados por tipo; más lejos del router, más latencia</span>
          </p>
        </div>
        <div class="mapa-lienzo" id="senal"></div>
      </section>
      <aside class="lado" id="lado" aria-live="polite"></aside>
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

document.getElementById("temas")!.appendChild(new Temas(temaInicial).getElement());
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
  senal.setVisibles(filtroActivo(f) ? new Set(visibles.map((d) => d.ip)) : null);
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
            <span class="fila-nombre">${respuestaSvg(d.latency || 0)}${esc(d.device || "Sin nombre")}</span>
            <span class="fila-n">${d.ports.length} ${d.ports.length === 1 ? "puerto" : "puertos"}</span>
            ${h ? `<span class="fila-h">${h} ${h === 1 ? "hallazgo" : "hallazgos"}</span>` : tieneHallazgos(d) ? `<span class="fila-p">posibles</span>` : ""}
          </button></li>`;
        })
        .join("")}</ul>
    </section>`;
  }).join("");
  el.querySelectorAll<HTMLButtonElement>(".fila").forEach((b) => {
    b.addEventListener("click", () => seleccionar(b.dataset.ip === seleccionado ? null : b.dataset.ip!));
    b.addEventListener("mouseenter", () => senal.resaltar(b.dataset.ip!));
    b.addEventListener("mouseleave", () => senal.resaltar(null));
  });
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

// ── Mapa + columna derecha (plan o ficha) ───────────────────────────────────
// Pasar el cursor por un nodo marca su fila en el índice, y al revés.
const senal = new Senal(
  (ip) => seleccionar(ip === seleccionado ? null : ip),
  (ip) => {
    document.querySelectorAll(".fila.is-resaltada").forEach((f) => f.classList.remove("is-resaltada"));
    if (ip) document.querySelector(`.fila[data-ip="${CSS.escape(ip)}"]`)?.classList.add("is-resaltada");
  }
);
document.getElementById("senal")!.appendChild(senal.getElement());

let acciones: Accion[] = [];
function seleccionar(ip: string | null) {
  seleccionado = ip;
  senal.select(ip);
  pintarIndice();
  pintarLado(true);
}

function pintarLado(animar = false) {
  const el = document.getElementById("lado")!;
  const d = ultimo?.devices.find((x) => x.ip === seleccionado) ?? null;
  document.body.classList.toggle("con-ficha", !!d);
  if (d) {
    el.innerHTML = `<p class="lado-tipo">${iconoSvg(tipoDe(d), "ico", 15)} ${TIPOS[tipoDe(d)].nombre}<span class="lado-resp">${respuestaSvg(d.latency || 0)} ${(d.latency || 0).toFixed(1)} ms</span></p>${fichaHost(d, { animar })}`;
    conectarFicha(el, () => seleccionar(null));
    el.scrollTop = 0;
    return;
  }
  if (!ultimo?.hasResults) {
    el.innerHTML = `<h2 class="lado-t">Qué hacer ahora</h2><p class="vacio">Cuando termine el primer escaneo, aquí aparecerá lo más urgente, en orden y con los pasos para resolverlo.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="lado-cab"><h2 class="lado-t">Qué hacer ahora</h2><span>${acciones.length}</span></div>
    ${
      acciones.length
        ? `<ol class="acciones">${acciones
            .map((a, i) => {
              const est = a.prioridad === "info" ? "sin-datos" : a.prioridad;
              return `<li class="accion est-${est}"><details ${i < 2 ? "open" : ""}>
                <summary><span class="accion-prio">${ESTADO_FORMA[est]} ${PRIORIDAD_TEXTO[a.prioridad]}</span><span class="accion-t">${esc(a.titulo)}</span></summary>
                <div class="accion-cuerpo">
                  <p class="accion-m">${esc(a.motivo)}</p>
                  <ul class="accion-p">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
                  <p class="accion-h">${[...new Set(a.hosts.map((h) => h.ip))].map((ip) => `<button type="button" data-ip="${esc(ip)}">${esc(ip)}</button>`).join("")}</p>
                </div>
              </details></li>`;
            })
            .join("")}</ol>`
        : `<p class="vacio">No hay nada pendiente. Elige un dispositivo para ver su detalle.</p>`
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
  senal.setScanning(st.isScanning);
  document.body.classList.toggle("escaneando", st.isScanning);

  const f = JSON.stringify([st.stats, st.devices.length, st.hostInfo, st.hasResults]);
  const cambioDatos = f !== firma;
  if (cambioDatos) {
    firma = f;
    acciones = generarPlan(st.devices).acciones;
    if (seleccionado && !st.devices.some((d) => d.ip === seleccionado)) seleccionado = null;
    senal.update(st.devices, st.hostInfo?.ip ?? "esta red");
    pintarIndice();
    pintarLado();
  }
  if (cambioDatos || escaneando !== st.isScanning) {
    escaneando = st.isScanning;
    pintarDiag(st);
  }
});

irA("inicio");
