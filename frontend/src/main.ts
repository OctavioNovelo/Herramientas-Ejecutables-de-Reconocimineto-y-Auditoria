// Arranque de HERA. La interfaz es Argos (src/argos): aquí solo se une con los datos reales.
// Cada vez que cambian los equipos (al cargar y al terminar un escaneo) se monta una vista
// nueva sobre el mismo esqueleto de index.html; mientras tanto, la vista montada solo recibe
// avisos del escaneo (empezó, se canceló, falló).

import "./argos/argos.css";
import { montar, type Vista } from "./argos/app.js";
import { armar } from "./argos/datos";
import { heraApi, type CategoryResult } from "./api/heraApi";
import { scanState, type AppState } from "./state/scanState";
import { SCAN_CATEGORIES } from "./state/viewState";

const capa = document.querySelector<HTMLElement>("#capa")!;
const esqueleto = capa.innerHTML; // la vista escribe dentro; al remontar se parte de limpio

let vista: Vista | null = null;
let categorias: Record<string, CategoryResult | undefined> = {};
let escaneo: { grupo: string; nombre: string; t0: number; cancelado: boolean } | null = null;

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

async function remontar(st: AppState) {
  const [, faltan] = await Promise.all([leerCategorias(), herramientasQueFaltan()]);
  vista?.destruir();
  capa.innerHTML = esqueleto;
  const viejo = document.querySelector("#gl")!, lienzo = viejo.cloneNode() as HTMLCanvasElement; // un lienzo nuevo: el contexto WebGL anterior se soltó
  viejo.replaceWith(lienzo);
  vista = montar(armar({ devices: st.devices, stats: st.stats, hostInfo: st.hostInfo, categorias, faltan }), {
    lanzar(cat, objetivo) {
      const previo = categorias[cat.id]?.scan_time;
      escaneo = { grupo: cat.group === "detectar" ? "Detectar" : "Mapear", nombre: cat.label, t0: performance.now(), cancelado: false };
      vista!.escaneando({ ...escaneo, previo: previo?.segundos ?? 0, previoTxt: previo?.duracion_str ?? "" });
      // Personalizado usa los valores por defecto del formulario anterior (TCP SYN, T4, los 1000 puertos más comunes).
      if (cat.id === "custom") scanState.startCustomScan({ protocol: "tcp", tcpType: "syn", timing: 4, portMode: "top", portValue: "1000", target: objetivo });
      else scanState.startScan(cat.id, objetivo, false, cat.label);
    },
    cancelar() {
      if (escaneo) escaneo.cancelado = true;
      scanState.cancelScan();
    },
    instalar: (herramienta) => heraApi.installTool(herramienta),
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
