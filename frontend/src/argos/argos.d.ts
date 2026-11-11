// Tipos de la vista Argos (app.js y pluma.js son JavaScript: el código del prototipo aprobado, casi sin tocar).
declare module "*/argos/app.js" {
  import type { Modelo, Categoria } from "./datos";
  export interface Puente {
    lanzar(cat: Categoria, objetivo: string): void;
    cancelar(): void;
    instalar(herramienta: string): Promise<unknown>;
  }
  export interface Vista {
    escaneando(o: { grupo: string; nombre: string; t0: number; previo: number; previoTxt: string }): void;
    revelar(o: { grupo: string; nombre: string; ms: number }): void;
    terminado(error?: string): void;
    avisar(texto: string, ms?: number): void;
    destruir(): void;
  }
  export function montar(H: Modelo, puente: Puente): Vista;
}
