// Tipo de cada dispositivo (router, teléfono, computadora, TV...), deducido de lo que ya trae el
// escaneo: fabricante o nombre, puertos abiertos y tipo de sistema que detectó Nmap. Es una
// estimación para agrupar y dibujar la red; nunca reemplaza al dato real, que sigue en la ficha.
// Los íconos son de Lucide (ISC); Vite deja en el bundle solo los que se importan aquí.

import { Router, Smartphone, Laptop, Tv, Gamepad2, Printer, Cctv, Server, Lightbulb, CircleHelp } from "lucide";
import type { Device } from "../api/heraApi";

type IconNode = [string, Record<string, string>][];

export type Tipo = "router" | "telefono" | "computadora" | "tv" | "consola" | "impresora" | "camara" | "servidor" | "domotica" | "desconocido";

export const TIPOS: Record<Tipo, { nombre: string; plural: string; icono: IconNode }> = {
  router: { nombre: "Router o red", plural: "Red", icono: Router as IconNode },
  computadora: { nombre: "Computadora", plural: "Computadoras", icono: Laptop as IconNode },
  telefono: { nombre: "Teléfono o tableta", plural: "Teléfonos", icono: Smartphone as IconNode },
  tv: { nombre: "TV o streaming", plural: "TV y streaming", icono: Tv as IconNode },
  consola: { nombre: "Consola", plural: "Consolas", icono: Gamepad2 as IconNode },
  impresora: { nombre: "Impresora", plural: "Impresoras", icono: Printer as IconNode },
  camara: { nombre: "Cámara", plural: "Cámaras", icono: Cctv as IconNode },
  servidor: { nombre: "Servidor o NAS", plural: "Servidores", icono: Server as IconNode },
  domotica: { nombre: "Hogar inteligente", plural: "Hogar inteligente", icono: Lightbulb as IconNode },
  desconocido: { nombre: "Sin identificar", plural: "Sin identificar", icono: CircleHelp as IconNode },
};

// Orden en que se agrupan y se dibujan.
export const ORDEN_TIPOS: Tipo[] = ["router", "computadora", "servidor", "telefono", "tv", "consola", "impresora", "camara", "domotica", "desconocido"];

// Pistas por fabricante o nombre (en minúsculas). La primera que coincide gana.
const POR_NOMBRE: [RegExp, Tipo][] = [
  [/router|mikrotik|routeros|netgear|tp-?link|ubiquiti|unifi|arris|technicolor|huawei.*(hg|b\d)|zyxel|cisco|asus.*rt|linksys|d-?link|sagemcom|eero|openwrt|switch|access point/, "router"],
  [/iphone|ipad|galaxy|pixel|android|xiaomi.*(mi \d|redmi)|oneplus|motorola|oppo|vivo|realme|smartphone/, "telefono"],
  [/nintendo|playstation|sony interactive|xbox|steam deck|valve/, "consola"],
  [/printer|laserjet|officejet|deskjet|epson|brother|canon|lexmark|kyocera|ricoh|xerox|impresora/, "impresora"],
  [/hikvision|dahua|axis comm|reolink|wyze|camera|cámara|camara|ezviz|amcrest/, "camara"],
  [/synology|qnap|nas|truenas|unraid|raspberry|server|servidor|proxmox|esxi/, "servidor"],
  [/roku|webos|lg electronics|samsung.*tv|tizen|chromecast|apple tv|fire ?tv|mi box|android tv|sonos|bose|airplay|gaoshengda|vizio|hisense|tcl|tv\b/, "tv"],
  [/hue|philips lighting|nest|amazon|echo|alexa|google home|tuya|shelly|sonoff|espressif|tasmota|ring|smartthings|ecobee|wemo|meross|ikea/, "domotica"],
  [/thinkpad|optiplex|latitude|macbook|imac|dell|lenovo|hp (elite|pro)book|surface|workstation|desktop|laptop|pc\b|intel corporate|micro-star|asustek|gigabyte/, "computadora"],
];

// Pistas por puertos abiertos cuando el nombre no dice nada.
function porPuertos(p: Set<number>): Tipo | null {
  if (p.has(554) || p.has(8000) && p.has(80) && p.size <= 4) return "camara";
  if (p.has(9100) || p.has(631) || p.has(515)) return "impresora";
  if (p.has(62078)) return "telefono";
  if (p.has(7000) || p.has(8008) || p.has(8009) || p.has(1400)) return "tv";
  if (p.has(5000) && p.has(5001)) return "servidor";
  if (p.has(445) || p.has(135) || p.has(3389) || p.has(139)) return "computadora";
  if (p.has(53) && (p.has(80) || p.has(443))) return "router";
  if (p.has(22) && p.size <= 2) return "servidor";
  return null;
}

export function tipoDe(d: Device): Tipo {
  const tiposOs = (d.os_info?.device_types ?? []).join(" ").toLowerCase();
  if (/router|switch|wap|firewall|broadband/.test(tiposOs)) return "router";
  if (/printer/.test(tiposOs)) return "impresora";
  if (/webcam|camera/.test(tiposOs)) return "camara";
  if (/phone/.test(tiposOs)) return "telefono";
  if (/game console/.test(tiposOs)) return "consola";
  if (/media device/.test(tiposOs)) return "tv";
  if (/storage/.test(tiposOs)) return "servidor";

  const texto = [d.device, d.os_info?.running, d.os_info?.details].filter(Boolean).join(" ").toLowerCase();
  for (const [re, tipo] of POR_NOMBRE) if (re.test(texto)) return tipo;
  const porPuerto = porPuertos(new Set(d.ports));
  if (porPuerto) return porPuerto;
  // "Apple" a secas: los iPhone ya salieron por el puerto 62078; el resto suele ser una Mac.
  if (/apple/.test(texto)) return "computadora";
  // La puerta de enlace típica de una red doméstica.
  if (/\.(1|254)$/.test(d.ip)) return "router";
  return "desconocido";
}

const atributos = (a: Record<string, string>) =>
  Object.entries(a)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

// Ícono del tipo como SVG en línea (24×24, trazo con currentColor).
export function iconoSvg(tipo: Tipo, clase = "ico", tam = 18): string {
  const hijos = TIPOS[tipo].icono.map(([tag, a]) => `<${tag} ${atributos(a)}/>`).join("");
  return `<svg class="${clase}" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${hijos}</svg>`;
}

// Lo mismo pero como grupo SVG para meterlo dentro de otro dibujo, centrado en (x, y).
export function iconoEnSvg(tipo: Tipo, x: number, y: number, tam = 16, clase = "ico"): string {
  const k = tam / 24;
  const hijos = TIPOS[tipo].icono.map(([tag, a]) => `<${tag} ${atributos(a)}/>`).join("");
  return `<g class="${clase}" transform="translate(${x - tam / 2} ${y - tam / 2}) scale(${k})" fill="none" stroke="currentColor" stroke-width="${1.75}" stroke-linecap="round" stroke-linejoin="round">${hijos}</g>`;
}
