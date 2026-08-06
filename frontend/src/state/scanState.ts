// Archivo: frontend/src/state/scanState.ts
// Razón: Administra la reactividad del sistema (estado del botón de escaneo, datos de la tabla,
// estadísticas actuales) y notifica a los componentes cuando hay cambios. Los datos de
// dispositivos/estadísticas llegan ya procesados desde heraApi.getDashboardData()
// (que a su vez viene de utils/parser.py — una sola fuente de verdad, compartida con el CLI).

import { heraApi, Device, ScanStats, HostInfo, CustomScanParams } from "../api/heraApi";

export interface AppState {
  isScanning: boolean;
  hasResults: boolean;
  devices: Device[];
  stats: ScanStats | null;
  hostInfo: HostInfo | null;
  error: string | null;
}

type Subscriber = (state: AppState) => void;

class ScanStateManager {
  private state: AppState = {
    isScanning: false,
    hasResults: false,
    devices: [],
    stats: null,
    hostInfo: null,
    error: null,
  };

  private subscribers: Set<Subscriber> = new Set();

  constructor() {
    this.refreshData();
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    this.subscribers.forEach((callback) => callback(this.state));
  }

  getState(): AppState {
    return { ...this.state };
  }

  // Refresca la información leyendo el dashboard combinado (dispositivos + estadísticas).
  // Si algo falla de verdad (no simplemente "no hay escaneos"), se refleja en state.error
  // y NO se simula que hay resultados.
  async refreshData() {
    try {
      this.state.hostInfo = await heraApi.getHostInfo();

      const { devices, stats } = await heraApi.getDashboardData();
      this.state.devices = devices;
      this.state.hasResults = devices.length > 0;
      this.state.stats = stats;
      this.state.error = null;
    } catch (err: any) {
      console.error("Error al refrescar estado global:", err);
      this.state.error = typeof err === "string" ? err : (err?.message ?? "Error al leer los datos de red.");
      this.state.hasResults = false;
    } finally {
      this.notify();
    }
  }

  // Inicia un escaneo de red real
  async startScan(scanType: string = "full_pack") {
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.error = null;
    this.notify();

    try {
      await heraApi.startScan(scanType);
      // trigger_nmap_scan es síncrono del lado de Rust/Python (await bloqueante),
      // así que al volver aquí el escaneo ya terminó: recargamos datos de inmediato.
      await this.refreshData();
    } catch (err: any) {
      console.error("Error al iniciar el escaneo:", err);
      this.state.error = typeof err === "string" ? err : (err?.message ?? "Fallo en el escaneo.");
    } finally {
      this.state.isScanning = false;
      this.notify();
    }
  }

  // Inicia el escaneo "Personalizado" con parámetros explícitos (pestaña Escaneo).
  // Comparte el mismo guard 'isScanning' que startScan(): nunca deben correr dos escaneos
  // nmap al mismo tiempo, porque ambos escriben sobre el mismo hosts.txt.
  async startCustomScan(params: CustomScanParams) {
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.error = null;
    this.notify();

    try {
      await heraApi.startCustomScan(params);
      await this.refreshData();
    } catch (err: any) {
      console.error("Error al iniciar el escaneo personalizado:", err);
      this.state.error = typeof err === "string" ? err : (err?.message ?? "Fallo en el escaneo personalizado.");
    } finally {
      this.state.isScanning = false;
      this.notify();
    }
  }
}

export const scanState = new ScanStateManager();
