// Datos de demostración para revisar la interfaz en un navegador (fuera de Tauri), con
// `?demo` en la URL. NO se usan nunca dentro de la app nativa: allí todo viene de
// utils/parser.py. La forma es exactamente la de DashboardData / CategoryResult.

import type { CategoryDevice, DashboardData, CategoryResult, ScanStats } from "./heraApi";

export const isDemoMode = (): boolean =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

// `?demo=vacio` simula una instalación sin escaneos previos (primer arranque).
export const isDemoEmpty = (): boolean =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "vacio";

const sd = (port: number, service: string, extra: Partial<CategoryDevice["service_details"][number]> = {}) => ({
  port,
  protocol: "tcp",
  state: "open",
  service,
  reconocido: true,
  ...extra,
});

const noOs = null;

export const DEMO_DEVICES: CategoryDevice[] = [
  {
    ip: "192.168.1.1",
    device: "MikroTik (router)",
    mac: "48:8F:5A:3C:11:02",
    services: ["23/telnet", "53/domain", "80/http", "8291/winbox"],
    ports: [23, 53, 80, 8291],
    filtered_ports: [],
    filtered_services: [],
    service_details: [
      sd(23, "telnet", { product: "MikroTik router telnetd" }),
      sd(53, "domain", { product: "MikroTik RouterOS named" }),
      sd(80, "http", { product: "MikroTik router config httpd", title: "RouterOS router configuration page" }),
      sd(8291, "winbox", { product: "MikroTik WinBox" }),
    ],
    os_info: {
      device_types: ["router"],
      exact_match: true,
      running: "MikroTik RouterOS 6.X",
      cpe: "cpe:/o:mikrotik:routeros:6",
      cpes: ["cpe:/o:mikrotik:routeros:6"],
      details: "MikroTik RouterOS 6.40 - 6.48",
      guesses: [],
      sin_match_exacto_msg: null,
    },
    location_urls: [],
    vulnerabilities: [
      {
        id: "CVE-2018-14847",
        output: "RouterOS Winbox permite leer archivos arbitrarios sin autenticación (incluida la base de usuarios).",
        severity: "critical",
        sev_label: "Crítica",
        device: "192.168.1.1",
        port: "8291",
        status: "confirmada",
        remediation: "Actualiza RouterOS a 6.42.1 o superior y restringe Winbox a la LAN de gestión.",
      },
    ],
    latency: 0.6,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.20",
    device: "Synology DS220+",
    mac: "00:11:32:AB:CD:20",
    services: ["22/ssh", "139/netbios-ssn", "445/microsoft-ds", "5000/http", "5001/https"],
    ports: [22, 139, 445, 5000, 5001],
    filtered_ports: [],
    filtered_services: [],
    service_details: [
      sd(22, "ssh", { product: "OpenSSH", version: "8.2" }),
      sd(139, "netbios-ssn", { product: "Samba smbd", version: "4.10" }),
      sd(445, "microsoft-ds", { product: "Samba smbd", version: "4.10" }),
      sd(5000, "http", { product: "nginx", title: "Synology DiskStation" }),
      sd(5001, "https", { product: "nginx" }),
    ],
    os_info: {
      device_types: ["storage-misc"],
      exact_match: true,
      running: "Linux 4.X",
      cpe: null,
      cpes: [],
      details: "Synology DiskStation Manager 7",
      guesses: [],
      sin_match_exacto_msg: null,
    },
    location_urls: [],
    vulnerabilities: [
      {
        id: "Samba 4.10",
        output: "Varias vulnerabilidades conocidas en Samba 4.10 (desbordamientos y omisión de autenticación).",
        severity: "high",
        sev_label: "Alta",
        device: "192.168.1.20",
        port: "445",
        status: "confirmada",
        cve_count: 6,
        cve_ids: ["CVE-2021-44142", "CVE-2020-25719", "CVE-2020-25717", "CVE-2021-20254", "CVE-2020-14318", "CVE-2020-14383"],
        remediation: "Actualiza DSM a la última versión desde Panel de control → Actualizar y restaurar.",
      },
    ],
    latency: 1.4,
    possible_vulnerabilities: [
      { id: "smb-vuln-ms17-010", output: "No se pudo confirmar: el host cerró la sesión.", sev_label: "Sin confirmar", device: "192.168.1.20", port: "445", status: "posible" },
    ],
  },
  {
    ip: "192.168.1.31",
    device: "Hikvision DS-2CD2043",
    mac: "C0:56:E3:77:10:31",
    services: ["80/http", "554/rtsp", "8000/http-alt"],
    ports: [80, 554, 8000],
    filtered_ports: [],
    filtered_services: [],
    service_details: [
      sd(80, "http", { product: "Hikvision Web", title: "Hikvision login" }),
      sd(554, "rtsp", { product: "Hikvision RTSP" }),
      sd(8000, "http-alt", { reconocido: false, fingerprint: "SF-Port8000-TCP:V=7.94..." }),
    ],
    os_info: {
      device_types: ["webcam"],
      exact_match: false,
      running: null,
      cpe: null,
      cpes: [],
      details: null,
      guesses: [{ name: "Linux 3.X (embebido)", accuracy: "91" }, { name: "Hikvision IP camera", accuracy: "88" }],
      sin_match_exacto_msg: "Sin coincidencia exacta",
    },
    location_urls: [],
    vulnerabilities: [
      {
        id: "CVE-2021-36260",
        output: "Inyección de comandos en el servidor web de la cámara (sin autenticación).",
        severity: "critical",
        sev_label: "Crítica",
        device: "192.168.1.31",
        port: "80",
        status: "confirmada",
        remediation: "Instala el firmware 5.5.800 o superior y saca la cámara de la red principal (VLAN aparte).",
      },
    ],
    latency: 3.1,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.42",
    device: "HP LaserJet M404",
    mac: "A0:B3:CC:42:00:42",
    services: ["80/http", "443/https", "631/ipp", "9100/jetdirect"],
    ports: [80, 443, 631, 9100],
    filtered_ports: [],
    filtered_services: [],
    service_details: [sd(80, "http"), sd(443, "https"), sd(631, "ipp", { product: "CUPS", version: "2.3" }), sd(9100, "jetdirect")],
    os_info: noOs,
    location_urls: [],
    vulnerabilities: [
      {
        id: "Certificado TLS caducado",
        output: "El certificado del panel web caducó el 2025-03-02.",
        severity: "medium",
        sev_label: "Media",
        device: "192.168.1.42",
        port: "443",
        status: "confirmada",
        remediation: "Regenera el certificado desde el panel web de la impresora.",
      },
    ],
    latency: 2.2,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.57",
    device: "LG webOS TV",
    mac: "64:95:6C:01:57:57",
    services: ["1900/upnp", "3000/http", "3001/https"],
    ports: [1900, 3000, 3001],
    filtered_ports: [],
    filtered_services: [],
    service_details: [sd(1900, "upnp", { protocol: "udp" }), sd(3000, "http"), sd(3001, "https")],
    os_info: noOs,
    location_urls: ["http://192.168.1.57:1857/rootDesc.xml"],
    vulnerabilities: [],
    latency: 4.8,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.64",
    device: "workstation-ana",
    mac: "3C:52:82:64:64:64",
    services: ["135/msrpc", "445/microsoft-ds", "3389/ms-wbt-server"],
    ports: [135, 445, 3389],
    filtered_ports: [139],
    filtered_services: ["139/netbios-ssn"],
    service_details: [sd(135, "msrpc"), sd(445, "microsoft-ds"), sd(3389, "ms-wbt-server", { product: "Microsoft Terminal Services" })],
    os_info: {
      device_types: ["general purpose"],
      exact_match: true,
      running: "Microsoft Windows 11",
      cpe: "cpe:/o:microsoft:windows_11",
      cpes: [],
      details: "Microsoft Windows 11 22H2",
      guesses: [],
      sin_match_exacto_msg: null,
    },
    location_urls: [],
    vulnerabilities: [],
    latency: 0.9,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.77",
    device: "Pixel 8",
    mac: "DA:A1:19:77:77:77",
    services: [],
    ports: [],
    filtered_ports: [],
    filtered_services: [],
    service_details: [],
    os_info: noOs,
    location_urls: [],
    vulnerabilities: [],
    latency: 6.5,
    possible_vulnerabilities: [],
  },
  {
    ip: "192.168.1.80",
    device: "raspberrypi",
    mac: "DC:A6:32:80:80:80",
    services: ["22/ssh", "8080/http-proxy"],
    ports: [22, 8080],
    filtered_ports: [],
    filtered_services: [],
    service_details: [sd(22, "ssh", { product: "OpenSSH", version: "9.2p1" }), sd(8080, "http-proxy", { title: "Home Assistant" })],
    os_info: {
      device_types: ["general purpose"],
      exact_match: true,
      running: "Linux 6.X",
      cpe: null,
      cpes: [],
      details: "Linux 6.1 (Debian 12)",
      guesses: [],
      sin_match_exacto_msg: null,
    },
    location_urls: [],
    vulnerabilities: [],
    latency: 1.1,
    possible_vulnerabilities: [],
  },
];

const DEMO_STATS: ScanStats = {
  active_devices: DEMO_DEVICES.length,
  total_vulns: 4,
  risk_level: "CRÍTICO",
  vulns_by_severity: { critical: 2, high: 1, medium: 1, low: 0 },
  last_scan: "2026-11-04 09:12",
  scan_time_total_seconds: 1874,
  scan_time_total_str: "31 min 14 s",
};

export function demoDashboard(): DashboardData {
  if (isDemoEmpty()) {
    return {
      devices: [],
      stats: { ...DEMO_STATS, active_devices: 0, total_vulns: 0, risk_level: "BAJO", vulns_by_severity: { critical: 0, high: 0, medium: 0, low: 0 }, last_scan: "N/A", scan_time_total_seconds: 0, scan_time_total_str: "N/D" },
    };
  }
  return { devices: DEMO_DEVICES, stats: DEMO_STATS };
}

export function demoCategory(fileBase: string): CategoryResult {
  if (isDemoEmpty()) return { devices: [], found: false };
  const scan_time = { segundos: 214, duracion_str: "3 min 34 s", inicio: "09:08:40", fin: "09:12:14" };
  if (fileBase === "dispositivos_ocultos") return { devices: [], found: true, scan_time };
  if (fileBase === "auditoria_admin") {
    const adminPorts = new Set([21, 22, 23, 80, 443, 3389, 5900, 8080, 8291, 8443, 5000, 5001]);
    const devices = DEMO_DEVICES.map((d) => ({ ...d, ports: d.ports.filter((p) => adminPorts.has(p)) })).filter((d) => d.ports.length > 0);
    return { devices, found: true, scan_time };
  }
  return { devices: DEMO_DEVICES, found: true, scan_time };
}

// Escaneo simulado: dura `ms` y se puede cancelar (rechaza con ESCANEO_CANCELADO, igual que Rust).
let cancelDemo: (() => void) | null = null;
export function demoScan(ms = 9000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cancelDemo = null;
      resolve("ok");
    }, ms);
    cancelDemo = () => {
      clearTimeout(t);
      cancelDemo = null;
      reject("ESCANEO_CANCELADO");
    };
  });
}
export function demoCancel(): string {
  cancelDemo?.();
  return "cancelado";
}
