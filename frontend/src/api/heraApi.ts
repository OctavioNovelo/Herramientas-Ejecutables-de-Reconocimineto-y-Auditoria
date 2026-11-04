// Puente hacia los comandos nativos de Tauri. Este archivo solo transporta datos, no los interpreta.

import { invoke } from "@tauri-apps/api/core";

// Interfaces de Datos de HERA (deben reflejar la forma exacta de lo que devuelve
// utils/parser.py — ver obtener_dispositivos_agrupados / obtener_estadisticas_dashboard)
export interface HostInfo {
  ip: string;
  hostname: string;
}

export interface Vulnerability {
  id: string;
  output: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  sev_label: string;
  device: string; // IP del dispositivo
  port?: string;  // puerto donde se detectó (si aplica)
  status: string;
  // Presentes solo en entradas agrupadas (varios CVEs del mismo producto/versión colapsados
  // en una sola fila para no inundar la tabla — ver utils/parser.py::agrupar_vulnerabilidades_para_mostrar)
  cve_count?: number;
  cve_ids?: string[];
  // Cómo corregirlo, si la herramienta lo indica (hoy: plantillas de Nuclei).
  remediation?: string | null;
}

// Vulnerabilidad "posible" (Nmap buscó pero no pudo confirmarla). Solo aparece en los
// resultados por categoría (pestaña Escaneo), nunca en el dashboard combinado.
export interface PossibleVulnerability {
  id: string;
  output: string;
  sev_label: string;
  device: string;
  port?: string;
  status: string;
}

// Detalle completo de un puerto (abierto o filtrado): protocolo, servicio detectado y,
// si Nmap lo obtuvo, producto/versión/fingerprint — ver generar_tabla_xml en parser.py.
export interface ServiceDetail {
  port: number;
  protocol?: string;
  state: string; // 'open' | 'filtered'
  reason?: string;
  service: string;
  reconocido: boolean; // false = nombre de servicio no confiable (vacío/unknown/tcpwrapped)
  product?: string;
  version?: string;
  extrainfo?: string;
  devicetype?: string;
  fingerprint?: string;
  title?: string; // título de la página web (script http-title), ej. "RouterOS router configuration page"
}

// Un "guess" individual cuando Nmap no logra un match exacto de SO (accuracy < 100%).
export interface OsGuess {
  name?: string;
  accuracy?: string;
}

// Detección de SO de un host — ver _extraer_os_info en parser.py. Puede venir vacía
// (todos los campos en null/[]) si la categoría de escaneo no corrió -O (ej. Auditoría admin).
export interface OsInfo {
  device_types: string[];
  exact_match: boolean;
  running: string | null;
  cpe: string | null;
  cpes: string[];
  details: string | null;
  guesses: OsGuess[];
  sin_match_exacto_msg: string | null;
}

// Duración de un escaneo — ver _extraer_info_escaneo en parser.py.
export interface ScanTimeInfo {
  segundos: number;
  duracion_str: string;
  inicio: string | null;
  fin: string | null;
}

export interface Device {
  ip: string;
  device: string; // Hostname o fabricante (vendor)
  mac: string;
  services: string[];
  ports: number[];
  // Puertos que respondieron "filtered" (probable firewall) en vez de "open"/"closed".
  // Separados de 'ports'/'services' para no romper lo que ya los consume; útiles para
  // saber qué está siendo bloqueado, no solo qué está expuesto.
  filtered_ports: number[];
  filtered_services: string[];
  // Detalle por puerto (abiertos y filtrados): protocolo, producto/versión, fingerprint, etc.
  service_details: ServiceDetail[];
  // Detección de SO del host. null si la categoría de escaneo no corrió -O.
  os_info: OsInfo | null;
  // URLs "Location:" (SSDP/UPnP) encontradas en scripts NSE — suelen apuntar a un XML de
  // descripción del dispositivo (fabricante, modelo, servicios).
  location_urls: string[];
  vulnerabilities: Vulnerability[];
  latency: number; // en milisegundos (srtt / 1000)
}

export interface ScanStats {
  active_devices: number;
  total_vulns: number;
  risk_level: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO';
  vulns_by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  last_scan: string;
  // Suma de la duración ('elapsed') de todos los XML combinados en el dashboard.
  scan_time_total_seconds: number;
  scan_time_total_str: string;
}

export interface DashboardData {
  devices: Device[];
  stats: ScanStats;
}

// Dispositivo dentro de los resultados de UNA categoría específica (pestaña Escaneo):
// además de las vulnerabilidades confirmadas, incluye las "posibles" (sin confirmar).
export interface CategoryDevice extends Device {
  possible_vulnerabilities: PossibleVulnerability[];
}

export interface CategoryResult {
  devices: CategoryDevice[];
  found: boolean;
  error?: string;
  // Duración del escaneo de ESTA categoría en particular (obtener_resultados_categoria
  // la saca de <runstats><finished> del propio XML). Ausente si el backend aún no la manda.
  scan_time?: ScanTimeInfo;
}

const EMPTY_STATS: ScanStats = {
  active_devices: 0,
  total_vulns: 0,
  risk_level: "BAJO",
  vulns_by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
  last_scan: "N/A",
  scan_time_total_seconds: 0,
  scan_time_total_str: "N/D",
};

// Verifica si la aplicación se está ejecutando dentro de Tauri
const isTauri = (): boolean => {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
};

export interface CustomScanParams {
  protocol: "tcp" | "udp" | "sctp";
  tcpType?: "syn" | "connect" | "fin" | "null" | "xmas"; // solo si protocol === "tcp"
  timing: number; // 1-5
  portMode: "specific" | "top" | "ratio" | "all";
  portValue: string; // depende de portMode: "80,443" | "1000" | "0.5" | ignorado si portMode==="all"
  target?: string; // IP/red/hostname específico. Si se omite, usa la red local detectada.
  evasion?: boolean; // técnicas de evasión de firewall/IDS (opcional, apagadas por defecto)
}

// Punto de conexión para iniciar el escaneo "Personalizado" con parámetros explícitos
// (equivalente a lo que el CLI pide por teclado en tools/nmap.py::personalizado).
async function startCustomScan(params: CustomScanParams): Promise<string> {
  if (!isTauri()) {
    throw new Error("Los escaneos solo están disponibles dentro de la aplicación nativa de HERA.");
  }
  return await invoke<string>("trigger_custom_scan", {
    protocol: params.protocol,
    tcpType: params.tcpType ?? null,
    timing: params.timing,
    portMode: params.portMode,
    portValue: params.portValue,
    target: params.target?.trim() || null,
    evasion: params.evasion ?? false,
  });
}

// Estado de una herramienta extra (get_tool_status en main.rs).
export interface ToolStatus {
  installed: boolean;
  version: string | null;
  download_size: string | null;
}

// Servicio API de HERA
export const heraApi = {
  // Obtiene la dirección de red auditada (desde hosts.txt) y el hostname local
  async getHostInfo(): Promise<HostInfo> {
    if (!isTauri()) {
      // Modo desarrollo en navegador (fuera de Tauri): no hay comandos nativos disponibles.
      return { ip: "N/D (modo navegador)", hostname: "N/D" };
    }
    return await invoke<HostInfo>("get_host_info");
  },

  // Obtiene dispositivos + estadísticas ya procesados por utils/parser.py, combinando el
  // escaneo más reciente de cada categoría (dashboard combinado, ver parser.ultimos_escaneos).
  // Devuelve datos vacíos explícitos si no hay escaneos previos (sin fallback simulado).
  async getDashboardData(): Promise<DashboardData> {
    if (!isTauri()) {
      return { devices: [], stats: EMPTY_STATS };
    }
    return await invoke<DashboardData>("get_dashboard_data");
  },

  // Resultados de una categoría específica (pestaña Escaneo), buscando el XML más reciente
  // de esa categoría. 'fileBase' debe coincidir con ScanCategory.file_base (viewState.ts).
  async getCategoryResults(fileBase: string): Promise<CategoryResult> {
    if (!isTauri()) {
      return { devices: [], found: false };
    }
    return await invoke<CategoryResult>("get_category_results", { fileBase });
  },

  // Punto de conexión para iniciar un escaneo de red.
  // No traga errores: si el escaneo falla (permisos, binario ausente, etc.),
  // el error se relanza para que scanState lo capture y lo muestre.
  // Punto de conexión para iniciar un escaneo de red.
  // 'target' es opcional: si se especifica (IP/red/hostname), Nmap escanea eso en vez de
  // la subred local detectada automáticamente. No traga errores: si el escaneo falla
  // (permisos, binario ausente, etc.), el error se relanza para que scanState lo muestre.
  // 'evasion' solo tiene efecto en las categorías con supportsEvasion (ocultos, full).
  async startScan(scanType: string, target?: string, evasion: boolean = false): Promise<string> {
    if (!isTauri()) {
      throw new Error("Los escaneos solo están disponibles dentro de la aplicación nativa de HERA.");
    }
    return await invoke<string>("trigger_nmap_scan", {
      scanType,
      target: target?.trim() || null,
      evasion,
    });
  },

  // ¿Está instalada la herramienta extra de una categoría? (ScanCategory.requiresTool)
  async getToolStatus(tool: string): Promise<ToolStatus> {
    if (!isTauri()) {
      return { installed: true, version: null, download_size: null };
    }
    return await invoke<ToolStatus>("get_tool_status", { tool });
  },

  // Descarga e instala la herramienta (instalar() de su módulo en tools/). Solo tras confirmación.
  async installTool(tool: string): Promise<string> {
    if (!isTauri()) {
      throw new Error("La instalación solo está disponible dentro de la aplicación nativa de HERA.");
    }
    return await invoke<string>("install_tool", { tool });
  },

async cancelScan(): Promise<string> {
    if (!isTauri()) {
        throw new Error("La cancelación solo está disponible dentro de la aplicación nativa de HERA.");
    }

    return await invoke<string>("cancel_nmap_scan");
},

  startCustomScan,
};