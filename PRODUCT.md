# Product

HERA (Herramientas Ejecutables de Reconocimiento y Auditoría): herramienta defensiva de auditoría de red. Orquesta Nmap, Nuclei y testssl.sh, procesa su salida y la presenta de forma legible. Audita y reporta; no ataca ni explota. El nombre es la diosa griega: guardiana, vigilancia, protección.

## Platform

web (interfaz HTML dentro de una ventana de escritorio Tauri; Windows, Linux y macOS). No es un sitio público.

## Stack

Tauri 2 + TypeScript sin framework + Vite. Backend Python (`tools/` -> `core/executor.py`), que no se rediseña. Three.js y d3-force ya se han usado en propuestas anteriores.

## Users

Persona técnico-curiosa que quiere entender y proteger su propia red (casa o trabajo). Sabe leer una salida de Nmap pero agradece la traducción. El experto ya tiene la CLI.

## Product Purpose

Que de un vistazo se entienda qué tan segura está la red ahora mismo y qué es lo más urgente que revisar. La acción clave es confiar en el diagnóstico y saber el siguiente paso.

## Positioning

Instrumento de precisión, no consola de hacker. Lo contrario de verde neón sobre negro, terminal falsa, glitch y calaveras.

## Operating Context

Sesiones de escritorio. Los escaneos tardan minutos y son cancelables; el backend no emite avance, solo inicio, fin y duración. Redes de 5 a 50 equipos, a veces más.

## Capabilities and Constraints

- Hoy: ocho escaneos en dos grupos. Mapear: escaneo rápido, dispositivos ocultos, auditoría admin, identificación, full pack, personalizado. Detectar: vulnerabilidades (Nuclei, instalable desde la app) y seguridad TLS (testssl).
- Por equipo: IP, nombre, MAC, fabricante, tipo, sistema, latencia, puertos abiertos y filtrados, servicios con versión, hallazgos confirmados y posibles con severidad, CVE y corrección.
- Plan "Qué hacer ahora": acciones ordenadas por urgencia, hoy por reglas, mañana por una IA de síntesis. Espacio de primera clase.
- Vulnerar: planeado, sin desarrollo; aparece como "pronto". No existe "Penetrar" ni "Resumen".
- El logo con el título HERA es el botón de inicio. Búsqueda y filtros de equipos.
- Español. Cero emojis.
- WebKitGTK en Linux: desde el 2026-11-11 la app arranca con composición por GPU (`WEBKIT_DMABUF_RENDERER_FORCE_SHM=1`), 63 fps medidos en todas las vistas de Argos en Wayland con NVIDIA. Sin composición (`WEBKIT_DISABLE_COMPOSITING_MODE=1`) no hay CSS 3D y el SVG animado, el blur y las cartas salen caros. Sin probar en WebView2 ni WKWebView.

## Brand Commitments

Nombre HERA y logo actual (`frontend/src/assets/hera-logo.png`). Todo lo demás (paleta, tipografía, composición, estructura de la app) es reemplazable: el dueño lo declaró el 2026-11-09, "nada es sagrado", ambición visual sin límite.

## Evidence on Hand

Datos de demostración en `frontend/src/api/demoData.ts` (red pequeña, vacía y de 43 equipos). Dieciséis direcciones visuales anteriores en ramas `ui/a-*` a `ui/p-*`.

## Product Principles

- Precisa, serena, legible. Ni alarmista ni gamer.
- La red es un objeto que se desarma e inspecciona, no una tabla inerte.
- Rechazos del dueño: 3D tipo lidar poco realista, giros trabados, fondos blancos que lastiman, líneas decorativas sin significado, titulares gigantes, exceso de texto, lo que se siente genérico de IA.
- Rechazo más reciente: una propuesta que conservaba el esqueleto de siempre (barra, paneles laterales, mapa radial plano) fue "terrible": lo mismo de siempre, plana y sin vida.

## Accessibility & Inclusion

Semáforo de tres estados (seguro, alerta, riesgo) con contraste AA y nunca solo por color: forma o texto. Teclado completo. Respetar movimiento reducido.
