// Archivo: frontend/src/api/heraApi.ts
// Razón: Puente hacia los comandos nativos de Tauri. El análisis de XML, clasificación de
// vulnerabilidades y cálculo de estadísticas YA NO vive aquí: todo eso pasa por
// utils/parser.py (invocado por el comando Rust get_dashboard_data), que es la misma lógica
// que usa el CLI. Este archivo solo transporta datos, no los interpreta.

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

export interface Device {
  ip: string;
  device: string; // Hostname o fabricante (vendor)
  mac: string;
  services: string[];
  ports: number[];
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
}

const EMPTY_STATS: ScanStats = {
  active_devices: 0,
  total_vulns: 0,
  risk_level: "BAJO",
  vulns_by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
  last_scan: "N/A",
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
  });
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

  // Obtiene dispositivos + estadísticas ya procesados por utils/parser.py, combinando
  // TODOS los escaneos disponibles para el sistema operativo actual (dashboard combinado).
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
  async startScan(scanType: string): Promise<string> {
    if (!isTauri()) {
      throw new Error("Los escaneos solo están disponibles dentro de la aplicación nativa de HERA.");
    }
    return await invoke<string>("trigger_nmap_scan", { scanType });
  },

  startCustomScan,
};
