// Arma el modelo que dibuja Argos a partir de lo que entrega el backend: los equipos en el orden
// del abanico, el plan, las cartas de escaneo y los textos del diagnóstico. No inventa nada: lo
// que no viene del escaneo (tipo, familia de servicio) es una estimación y así se rotula.

import type { CategoryResult, Device, HostInfo, PossibleVulnerability, ScanStats, ServiceDetail, Vulnerability } from "../api/heraApi";
import { SCAN_CATEGORIES, type ScanCategory } from "../state/viewState";
import { generarPlan, type Prioridad } from "../synthesis/plan";
import { ADMIN_PORT_LABELS } from "../utils/portLabels";
import { estadoHost, PUERTOS_SENSIBLES } from "../utils/security";
import { iconoSvg, tipoDe, TIPOS, type Tipo } from "../utils/tipos";

export type EstadoEquipo = "riesgo" | "alerta" | "seguro";

export interface Equipo {
  i: number; // lugar en el abanico
  ip: string;
  nombre: string;
  mac: string;
  os: string | null;
  tipo: Tipo;
  estado: EstadoEquipo;
  ports: number[];
  filtered: number[];
  sds: ServiceDetail[]; // solo los abiertos
  vulns: (Vulnerability & { sev: string })[];
  posibles: PossibleVulnerability[];
  latency: number;
  familias: { nombre: string; sds: ServiceDetail[] }[];
}

// 'falta': la herramienta que necesita la categoría no está instalada (texto con el tamaño de la descarga).
export type Categoria = ScanCategory & { falta: string | null };
type Carta = [nombre: string, descripcion: string, ultimaVez: string, cat: Categoria];

export interface Modelo {
  equipos: Equipo[];
  plan: { id: string; prioridad: Prioridad; titulo: string; motivo: string; pasos: string[]; hosts: Equipo[] }[];
  TIPOS: [k: Tipo, plural: string, icono: string, nombre: string][];
  ETIQ: Record<number, string>;
  SENSIBLES: Set<number>;
  cuenta(e: EstadoEquipo): number;
  ESCANEOS: { mapear: Carta[]; detectar: Carta[] };
  titulo: string;
  pie: string;
  red: string;
  pestanas: { id: string; label: string; cuando: string; activa: boolean; nueva: boolean }[];   // "" es Todo; el resto, un escaneo con resultados
  plano?: boolean;   // el webview no pinta CSS 3D: la rueda de cartas usa su respaldo en 2D
}

// Orden del abanico: la red (con el router) queda al centro.
const ORDEN_ABANICO: Tipo[] = ["tv", "consola", "telefono", "computadora", "router", "servidor", "impresora", "camara", "domotica", "desconocido"];

// Familias de servicio: cada una es un anillo del ocelo. Regla propia de la interfaz, no viene del backend.
const FAMILIAS: [string, RegExp][] = [
  ["Acceso remoto", /ssh|telnet|ms-wbt|winbox|vnc/], ["Web", /http|ajp/], ["Archivos", /netbios|microsoft-ds|nfs|ftp|msrpc|rpcbind/], ["Correo", /smtp|pop3|imap/],
  ["Datos", /mysql|postgres|redis|mongo|ms-sql/], ["Impresión", /ipp|jetdirect|printer/], ["Medios", /rtsp|upnp/], ["Otros", /./],
];

const DESCRIPCION: Record<string, string> = {
  rapido: "Qué equipos hay y sus puertos más comunes.",
  ocultos: "Busca equipos que no responden al ping.",
  admin: "Paneles y puertos de administración a la vista.",
  id: "Sistema y versión de cada servicio.",
  full: "Todo lo anterior, de una vez.",
  custom: "Tú eliges el rango o el equipo.",
  vuln: "Fallos conocidos (CVE) con Nuclei.",
  tls: "Certificados y cifrados con testssl.",
};
const ORDEN_CARTAS = ["rapido", "ocultos", "admin", "id", "full", "custom", "vuln", "tls"];

const ipNum = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + (+o || 0), 0);

function sistema(d: Device): string | null {
  const os = d.os_info;
  if (!os) return null;
  return os.running ?? os.details ?? (os.guesses[0]?.name ? `${os.guesses[0].name} (${os.guesses[0].accuracy} %, sin coincidencia exacta)` : null);
}

function familias(sds: ServiceDetail[]) {
  const m = new Map<string, ServiceDetail[]>();
  for (const s of sds) {
    const f = FAMILIAS.find(([, re]) => re.test(s.service || ""))![0];
    m.set(f, [...(m.get(f) ?? []), s]);
  }
  return [...m].map(([nombre, sds]) => ({ nombre, sds }));
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// "2026-11-04 09:12" se lee "4 nov 09:12"; cualquier otra forma se deja como llega.
function fechaCorta(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(s);
  return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[4]}` : s;
}

export interface Fuentes {
  devices: Device[];
  stats: ScanStats | null;
  hostInfo: HostInfo | null;
  categorias: Record<string, CategoryResult | undefined>; // por id de categoría
  faltan: Record<string, string>; // herramienta sin instalar: tamaño de la descarga
  pestana?: string | null; // id de categoría: el abanico se arma solo con lo que vio ese escaneo
  nueva?: string | null; // id de la categoría que acaba de terminar
}

export function armar({ devices: combinados, stats, hostInfo, categorias, faltan, pestana, nueva }: Fuentes): Modelo {
  // shortcut: un escaneo que terminó sin equipos no tiene pestaña (se vuelve a Todo); darle una si hace falta decir "no encontró nada".
  const conDatos = (id: string) => !!categorias[id]?.devices.length;
  const solo = pestana && conDatos(pestana) ? categorias[pestana]! : null;
  const devices: Device[] = solo ? solo.devices : combinados;
  // Las vulnerabilidades sin confirmar solo vienen en los resultados por categoría.
  const posibles = new Map<string, PossibleVulnerability[]>();
  for (const r of solo ? [solo] : Object.values(categorias))
    for (const d of r?.devices ?? [])
      for (const v of d.possible_vulnerabilities ?? []) {
        const l = posibles.get(d.ip) ?? [];
        if (!l.some((p) => p.id === v.id && p.port === v.port)) l.push(v);
        posibles.set(d.ip, l);
      }

  const todos = devices.map((d): Equipo => {
    const sds = d.service_details.filter((s) => s.state === "open");
    return {
      i: 0, ip: d.ip, mac: d.mac, os: sistema(d), tipo: tipoDe(d), estado: estadoHost(d) as EstadoEquipo,
      nombre: !d.device || /^dispositivo desconocido$/i.test(d.device) ? "Sin nombre" : d.device,
      ports: d.ports, filtered: d.filtered_ports ?? [], sds, latency: d.latency,
      vulns: d.vulnerabilities.map((v) => ({ ...v, sev: v.sev_label })), posibles: posibles.get(d.ip) ?? [], familias: familias(sds),
    };
  });

  // Dentro del abanico: por tipo y, en cada tipo, por IP. El router va en medio de su grupo: es la base.
  const equipos = ORDEN_ABANICO.flatMap((k) => {
    const g = todos.filter((d) => d.tipo === k).sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    if (k === "router" && g.length > 2) g.splice(Math.floor((g.length - 1) / 2), 0, g.shift()!);
    return g;
  });
  equipos.forEach((d, i) => (d.i = i));
  const porIp = new Map(equipos.map((d) => [d.ip, d]));

  const plan = generarPlan(devices).acciones.map((a) => ({ ...a, hosts: [...new Set(a.hosts.map((h) => porIp.get(h.ip)!))].filter(Boolean) }));
  const cuenta = (e: EstadoEquipo) => equipos.filter((d) => d.estado === e).length;

  const carta = (id: string): Carta => {
    const c = SCAN_CATEGORIES.find((c) => c.id === id)!;
    return [c.label, DESCRIPCION[id], categorias[id]?.scan_time?.duracion_str ?? "", { ...c, falta: (c.requiresTool && faltan[c.requiresTool]) || null }];
  };
  const cartas = ORDEN_CARTAS.map(carta);
  const etiqueta = (id: string) => SCAN_CATEGORIES.find((c) => c.id === id)!.label;
  const pestanas = [{ id: "", label: "Todo", cuando: "", activa: !solo, nueva: false },
    ...ORDEN_CARTAS.filter(conDatos).map((id) => ({ id, label: etiqueta(id), cuando: fechaCorta(categorias[id]!.scan_time?.fin ?? ""), activa: !!solo && id === pestana, nueva: id === nueva }))];
  const n = equipos.length, ultimo = stats?.last_scan && stats.last_scan !== "N/A" ? ` Último escaneo, ${fechaCorta(stats.last_scan)}.` : "";

  return {
    equipos, plan, cuenta,
    TIPOS: ORDEN_ABANICO.map((k) => [k, TIPOS[k].plural, iconoSvg(k, "", 14).replace('stroke-width="1.75"', 'stroke-width="1.5"'), TIPOS[k].nombre]),
    ETIQ: ADMIN_PORT_LABELS,
    SENSIBLES: PUERTOS_SENSIBLES,
    ESCANEOS: { mapear: cartas.filter((c) => c[3].group === "mapear"), detectar: cartas.filter((c) => c[3].group === "detectar") },
    titulo: solo ? etiqueta(pestana!) : cuenta("riesgo") ? "Tu red está en riesgo" : cuenta("alerta") ? "Tu red está en alerta" : "Tu red no tiene pendientes",
    pie: `${n} ${n === 1 ? "equipo" : "equipos"}.${solo ? (solo.scan_time?.fin ? ` Terminó el ${fechaCorta(solo.scan_time.fin)}, tardó ${solo.scan_time.duracion_str}.` : "") : ultimo}`,
    pestanas,
    red: hostInfo?.ip ?? "",
  };
}
