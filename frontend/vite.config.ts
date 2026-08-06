// Archivo: frontend/vite.config.ts
// Razón: Configura Vite como empaquetador para compilar y recargar en caliente el frontend dentro del WebView de Tauri.

import { defineConfig } from "vite";

export default defineConfig({
  // Evita que Vite limpie la pantalla de la consola para no ocultar errores de Rust/Tauri
  clearScreen: false,
  // Tauri se comunica con un puerto fijo durante el desarrollo
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Ignora los cambios en la carpeta de Rust src-tauri para evitar recargas del frontend innecesarias
      ignored: ["**/src-tauri/**"],
    },
  },
});
