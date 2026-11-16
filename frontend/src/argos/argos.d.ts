// Tipos de la vista Argos (app.js y pluma.js son JavaScript: el código del prototipo aprobado, casi sin tocar).
declare module "*/argos/app.js" {
  import type { Modelo, Categoria } from "./datos";
  import type { CustomScanParams } from "../api/heraApi";
  export interface Puente {
    lanzar(cat: Categoria, objetivo: string, opciones?: Partial<Omit<CustomScanParams, "target">>): void;   // Personalizado manda todas; las cartas con evasión, solo esa
    cancelar(): void;
    pestana(id: string): void;   // "" vuelve a Todo
    instalar(herramienta: string): Promise<unknown>;
  }
  export interface Vista {
    escaneando(o: { grupo: string; nombre: string; t0: number; previo: number; previoTxt: string }): void;
    enCurso(o: { grupo: string; nombre: string; t0: number }): void;   // el escaneo sigue en segundo plano mientras se miran otros resultados
    revelar(o: { grupo: string; nombre: string; ms: number }): void;
    terminado(error?: string): void;
    avisar(texto: string, ms?: number): void;
    destruir(): void;
  }
  export function montar(H: Modelo, puente: Puente): Vista;
}
