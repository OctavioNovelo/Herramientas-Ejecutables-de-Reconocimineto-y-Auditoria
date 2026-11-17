// Arranque de HERA. La interfaz es Argos (src/argos): aquí solo se une con los datos reales.
// Cada vez que cambian los equipos (al cargar y al terminar un escaneo) se monta una vista
// nueva sobre el mismo esqueleto de index.html; mientras tanto, la vista montada solo recibe
// avisos del escaneo (empezó, se canceló, falló).

import "./argos/argos.css";
import "./argos/esfera.css";
import { montar, type Vista } from "./argos/app.js";
import { armar } from "./argos/datos";
import { heraApi, type CategoryResult } from "./api/heraApi";
import { scanState, type AppState } from "./state/scanState";
import { SCAN_CATEGORIES } from "./state/viewState";

const capa = document.querySelector<HTMLElement>("#capa")!;
const esqueleto = capa.innerHTML; // la vista escribe dentro; al remontar se parte de limpio

const plano = heraApi.sinComposicion().catch(() => false);
let vista: Vista | null = null;
let categorias: Record<string, CategoryResult | undefined> = {};
let faltan: Record<string, string> = {};
let pestana: string | null = null; // resultados de un solo escaneo (id de categoría); null es Todo
let nueva: string | null = null; // el escaneo que acaba de terminar, hasta que se abre su pestaña
let escaneo: { id: string; grupo: string; nombre: string; t0: number; cancelado: boolean } | null = null;

async function leerCategorias() {
  const r = await Promise.all(SCAN_CATEGORIES.map((c) => heraApi.getCategoryResults(c.file_base).catch(() => undefined)));
  categorias = Object.fromEntries(SCAN_CATEGORIES.map((c, i) => [c.id, r[i]]));
}

async function herramientasQueFaltan() {
  const faltan: Record<string, string> = {};
  for (const tool of new Set(SCAN_CATEGORIES.flatMap((c) => c.requiresTool ?? []))) {
    const s = await heraApi.getToolStatus(tool).catch(() => null);
    if (s && !s.installed) faltan[tool] = s.download_size ?? "tamaño sin dato";
  }
  return faltan;
}

// leer = false: solo cambió la pestaña, los datos son los mismos
async function remontar(st: AppState, leer = true) {
  if (leer) [, faltan] = await Promise.all([leerCategorias(), herramientasQueFaltan()]);
  vista?.destruir();
  capa.innerHTML = esqueleto;
  const viejo = document.querySelector("#gl")!, lienzo = viejo.cloneNode() as HTMLCanvasElement; // un lienzo nuevo: el contexto WebGL anterior se soltó
  viejo.replaceWith(lienzo);
  vista = montar({ ...armar({ devices: st.devices, stats: st.stats, hostInfo: st.hostInfo, categorias, faltan, pestana, nueva }), plano: await plano }, {
    lanzar(cat, objetivo, opciones) {
      if (escaneo) return vista!.avisar("Ya hay un escaneo en curso.");
      const previo = categorias[cat.id]?.scan_time;
      escaneo = { id: cat.id, grupo: cat.group === "detectar" ? "Detectar" : "Mapear", nombre: cat.label, t0: performance.now(), cancelado: false };
      vista!.escaneando({ ...escaneo, previo: previo?.segundos ?? 0, previoTxt: previo?.duracion_str ?? "" });
      if (cat.id === "custom") scanState.startCustomScan({ protocol: "tcp", tcpType: "syn", timing: 4, portMode: "top", portValue: "1000", ...opciones, target: objetivo });
      else scanState.startScan(cat.id, objetivo, opciones?.evasion ?? false, cat.label);
    },
    cancelar() {
      if (escaneo) escaneo.cancelado = true;
      scanState.cancelScan();
    },
    instalar: (herramienta) => heraApi.installTool(herramienta),
    pestana(id) {
      pestana = id || null;
      if (id === nueva) nueva = null;
      remontar(scanState.getState(), false).then(() => {
        if (escaneo) vista!.enCurso(escaneo); // se eligió durante un escaneo: sigue en segundo plano
        document.querySelector<HTMLElement>('#pestanas .pest[aria-pressed="true"]')?.focus();
      });
    },
  });
}

let corriendo = false;
function alCambiar(st: AppState) {
  if (st.isScanning) { corriendo = true; return; }
  if (!corriendo) return;
  corriendo = false;
  const e = escaneo;
  escaneo = null;
  if (st.error) return vista?.terminado(st.error);
  if (!e || e.cancelado) return vista?.terminado();
  pestana = null; nueva = e.id;   // se vuelve a Todo; la pestaña del escaneo queda marcada
  remontar(st).then(() => {
    if (st.devices.length) vista!.revelar({ grupo: e.grupo, nombre: e.nombre, ms: performance.now() - e.t0 });
    else vista!.avisar("El escaneo terminó sin encontrar equipos.", 8000);
  });
}

scanState.refreshData().then(async () => {
  const st = scanState.getState();
  await remontar(st);
  if (st.error) vista!.avisar(st.error, 12000);
  scanState.subscribe(alCambiar);
});
