// Archivo: frontend/src/state/viewState.ts
// Razón: Estado de navegación entre las "pestañas" de la app (Dashboard, Mapear, Detectar,
// Vulnerar). Separado de scanState.ts a propósito: scanState gestiona DATOS de red
// (dispositivos, estadísticas, escaneos en curso); viewState solo gestiona QUÉ VISTA se
// muestra. Un escaneo en curso sigue corriendo igual sin importar qué pestaña esté activa,
// porque ambos estados son independientes y el escaneo vive en scanState.

export type ViewName = "dashboard" | "mapear" | "detectar" | "vulnerar";

// Las 8 categorías de escaneo, espejo de frontend/option.py::CATEGORIAS (catálogo del CLI).
// El 'file_base' debe coincidir EXACTAMENTE con el nombre base que usa tools/nmap.py
// al generar los archivos (<file_base>_<fecha>_<hora>, ver ruta_con_fecha() en nmap.py).
//
// 'group' determina en qué pestaña del menú horizontal aparece cada categoría:
//   - "mapear": reconocimiento de red (descubrir dispositivos, puertos, servicios)
//   - "detectar": categorías enfocadas específicamente en encontrar vulnerabilidades
// En "detectar" están Vulnerabilidades (Nuclei) y Seguridad TLS (testssl); el resto (incluido
// Full Pack, que combina varias técnicas pero se mantiene como la opción "hazlo todo"
// de un clic) queda en "mapear". Esta separación es solo de PRESENTACIÓN: el componente
// ScanView es el mismo para ambas pestañas, filtra qué chips mostrar según 'group'.
export interface ScanCategory {
  id: string;
  label: string;
  file_base: string;
  group: "mapear" | "detectar";
  // true si la categoría ofrece la opción de evasión de firewall/IDS (apagada por defecto,
  // ver tools/nmap.py::_args_evasion). Mismo flag que 'admite_evasion' en frontend/option.py.
  supportsEvasion?: boolean;
  // Herramienta extra que necesita la categoría y que HERA puede instalar con permiso del
  // usuario (ver ScanView.ts::renderInstallPrompt). Mismo campo que 'requiere' en option.py.
  requiresTool?: string;
}

// Categorías cuyo resultado es una lista de hallazgos y se muestran con la vista de
// vulnerabilidades (Confirmadas/Posibles). Mismo conjunto que VISTA_HALLAZGOS en frontend/option.py.
export const VULN_VIEW_IDS = new Set(["vuln", "tls"]);

export const SCAN_CATEGORIES: ScanCategory[] = [
  { id: "rapido", label: "Escaneo rápido", file_base: "escaneo_rapido", group: "mapear" },
  { id: "vuln", label: "Vulnerabilidades", file_base: "vulnerabilidades", group: "detectar", requiresTool: "Nuclei" },
  { id: "tls", label: "Seguridad TLS", file_base: "seguridad_tls", group: "detectar" },
  // NOTA: tools/nmap.py::dispositivos_ocultos() corre en 2 etapas; el sondeo intermedio se
  // guarda como "sondeo_ocultos" y el resultado final (el que se muestra) como "dispositivos_ocultos".
  { id: "ocultos", label: "Dispositivos ocultos", file_base: "dispositivos_ocultos", group: "mapear", supportsEvasion: true },
  { id: "admin", label: "Auditoría admin", file_base: "auditoria_admin", group: "mapear" },
  { id: "id", label: "Identificación", file_base: "identificacion_dispositivos", group: "mapear" },
  { id: "full", label: "Full pack", file_base: "full_pack", group: "mapear", supportsEvasion: true },
  { id: "custom", label: "Personalizado", file_base: "personalizado", group: "mapear", supportsEvasion: true },
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