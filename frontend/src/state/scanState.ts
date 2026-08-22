// Archivo: frontend/src/state/scanState.ts

// Razón: Administra la reactividad del sistema (estado del botón de escaneo, datos de la tabla,
// estadísticas actuales) y notifica a los componentes cuando hay cambios. Los datos de
// dispositivos/estadísticas llegan ya procesados desde heraApi.getDashboardData()
// (que a su vez viene de utils/parser.py — una sola fuente de verdad, compartida con el CLI).

import {
  heraApi,
  Device,
  ScanStats,
  HostInfo,
  CustomScanParams,
} from "../api/heraApi";

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

  // Refresca la información leyendo el dashboard combinado.
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

      this.state.error =
        typeof err === "string"
          ? err
          : (err?.message ?? "Error al leer los datos de red.");

      this.state.hasResults = false;
    } finally {
      this.notify();
    }
  }

  // Inicia un escaneo de red real.
  async startScan(scanType: string = "full_pack", target?: string) {
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.error = null;
    this.notify();

    try {
      await heraApi.startScan(scanType, target);

      // Cuando Rust/Python termina el escaneo, recargamos los datos.
      await this.refreshData();

    } catch (err: any) {
      console.error("Error al iniciar el escaneo:", err);

      const mensaje =
        typeof err === "string"
          ? err
          : (err?.message ?? "Fallo en el escaneo.");

      // Si fue una cancelación, no mostramos un error.
      if (mensaje !== "ESCANEO_CANCELADO") {
        this.state.error = mensaje;
      }

    } finally {
      this.state.isScanning = false;
      this.notify();
    }
  }

  // Inicia el escaneo "Personalizado".
  async startCustomScan(params: CustomScanParams) {
    if (this.state.isScanning) return;

    this.state.isScanning = true;
    this.state.error = null;
    this.notify();

    try {
      await heraApi.startCustomScan(params);

      await this.refreshData();

    } catch (err: any) {
      console.error(
        "Error al iniciar el escaneo personalizado:",
        err
      );

      const mensaje =
        typeof err === "string"
          ? err
          : (err?.message ?? "Fallo en el escaneo personalizado.");

      // Si fue una cancelación, no mostramos un error.
      if (mensaje !== "ESCANEO_CANCELADO") {
        this.state.error = mensaje;
      }

    } finally {
      this.state.isScanning = false;
      this.notify();
    }
  }

  // Cancela el escaneo actualmente en ejecución.
  async cancelScan() {
    if (!this.state.isScanning) return;

    try {
      await heraApi.cancelScan();

    } catch (err: any) {
      console.error("Error al cancelar el escaneo:", err);

      this.state.error =
        typeof err === "string"
          ? err
          : (err?.message ?? "No se pudo cancelar el escaneo.");

      this.notify();
    }
  }
}

export const scanState = new ScanStateManager();