// Estado de navegación entre "pestañas" de la app (dashboard combinado vs. pestaña de
// Escaneo por categoría). Separado de scanState.ts a propósito: scanState gestiona DATOS de
// red (dispositivos, estadísticas, escaneos en curso); viewState solo gestiona QUÉ VISTA se
// muestra. Un escaneo en curso sigue corriendo igual sin importar qué pestaña esté activa,
// porque ambos estados son independientes y el escaneo vive en scanState.

export type ViewName = "dashboard" | "scan";

// Las 8 categorías de escaneo que ya existen en el CLI (frontend/CLI.py::nmap_cli).
// El 'file_base' debe coincidir EXACTAMENTE con el nombre base que usa tools/nmap.py
// al generar los archivos (ver file_number() en cada función de nmap.py).
export interface ScanCategory {
  id: string;
  label: string;
  file_base: string;
}

export const SCAN_CATEGORIES: ScanCategory[] = [
  { id: "rapido", label: "Escaneo rápido", file_base: "escaneo_rapido" },
  { id: "vuln", label: "Vulnerabilidades", file_base: "vulnerabilidades" },
  { id: "ocultos", label: "Dispositivos ocultos", file_base: "dispositivos_ocultos" },
  { id: "admin", label: "Auditoría admin", file_base: "admin_audit" },
  { id: "id", label: "Identificación", file_base: "ind_disp" },
  { id: "consumo", label: "Monitor consumo", file_base: "consumo" },
  { id: "full", label: "Full pack", file_base: "full_pack" },
  { id: "custom", label: "Personalizado", file_base: "personalizado" },
];

type Subscriber = () => void;

class ViewStateManager {
  private currentView: ViewName = "dashboard";
  private selectedCategory: ScanCategory = SCAN_CATEGORIES[0];
  private subscribers: Set<Subscriber> = new Set();

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    callback();
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify() {
    this.subscribers.forEach((cb) => cb());
  }

  getView(): ViewName {
    return this.currentView;
  }

  goToDashboard() {
    this.currentView = "dashboard";
    this.notify();
  }

  goToScan() {
    this.currentView = "scan";
    this.notify();
  }

  getSelectedCategory(): ScanCategory {
    return this.selectedCategory;
  }

  selectCategory(id: string) {
    const found = SCAN_CATEGORIES.find((c) => c.id === id);
    if (found) {
      this.selectedCategory = found;
      this.notify();
    }
  }
}

export const viewState = new ViewStateManager();
