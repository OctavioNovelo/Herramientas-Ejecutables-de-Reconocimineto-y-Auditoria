// Estado de navegación entre las "pestañas" de la app (Dashboard, Mapear, Detectar,
// Vulnerar). Separado de scanState.ts a propósito: scanState gestiona DATOS de red
// (dispositivos, estadísticas, escaneos en curso); viewState solo gestiona QUÉ VISTA se
// muestra. Un escaneo en curso sigue corriendo igual sin importar qué pestaña esté activa,
// porque ambos estados son independientes y el escaneo vive en scanState.

export type ViewName = "dashboard" | "mapear" | "detectar" | "vulnerar";

// Las 8 categorías de escaneo que ya existen en el CLI (frontend/CLI.py::nmap_cli).
// El 'file_base' debe coincidir EXACTAMENTE con el nombre base que usa tools/nmap.py
// al generar los archivos (ver file_number() en cada función de nmap.py).
//
// 'group' determina en qué pestaña del menú horizontal aparece cada categoría:
//   - "mapear": reconocimiento de red (descubrir dispositivos, puertos, servicios)
//   - "detectar": categorías enfocadas específicamente en encontrar vulnerabilidades
// Por ahora solo "Vulnerabilidades" está en el grupo "detectar" — el resto (incluido
// Full Pack, que combina varias técnicas pero se mantiene como la opción "hazlo todo"
// de un clic) queda en "mapear". Esta separación es solo de PRESENTACIÓN: el componente
// ScanView es el mismo para ambas pestañas, filtra qué chips mostrar según 'group'.
export interface ScanCategory {
  id: string;
  label: string;
  file_base: string;
  group: "mapear" | "detectar";
}

export const SCAN_CATEGORIES: ScanCategory[] = [
  { id: "rapido", label: "Escaneo rápido", file_base: "escaneo_rapido", group: "mapear" },
  { id: "vuln", label: "Vulnerabilidades", file_base: "vulnerabilidades", group: "detectar" },
  { id: "ocultos", label: "Dispositivos ocultos", file_base: "dispositivos_ocultos", group: "mapear" },
  { id: "admin", label: "Auditoría admin", file_base: "admin_audit", group: "mapear" },
  { id: "id", label: "Identificación", file_base: "ind_disp", group: "mapear" },
  { id: "consumo", label: "Monitor consumo", file_base: "consumo", group: "mapear" },
  { id: "full", label: "Full pack", file_base: "full_pack", group: "mapear" },
  { id: "custom", label: "Personalizado", file_base: "personalizado", group: "mapear" },
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

  goToMapear() {
    this.currentView = "mapear";
    // Si la categoría seleccionada no pertenece a este grupo (ej. veníamos de Detectar
    // con "Vulnerabilidades" activa), se cambia a la primera categoría de Mapear.
    if (this.selectedCategory.group !== "mapear") {
      this.selectedCategory = SCAN_CATEGORIES.find((c) => c.group === "mapear") ?? SCAN_CATEGORIES[0];
    }
    this.notify();
  }

  goToDetectar() {
    this.currentView = "detectar";
    if (this.selectedCategory.group !== "detectar") {
      this.selectedCategory = SCAN_CATEGORIES.find((c) => c.group === "detectar") ?? SCAN_CATEGORIES[0];
    }
    this.notify();
  }

  goToVulnerar() {
    this.currentView = "vulnerar";
    this.notify();
  }

  getSelectedCategory(): ScanCategory {
    return this.selectedCategory;
  }

  // Devuelve solo las categorías que pertenecen a la pestaña actualmente activa
  // (mapear o detectar). En cualquier otra vista devuelve un arreglo vacío.
  getCategoriesForCurrentView(): ScanCategory[] {
    if (this.currentView === "mapear" || this.currentView === "detectar") {
      return SCAN_CATEGORIES.filter((c) => c.group === this.currentView);
    }
    return [];
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