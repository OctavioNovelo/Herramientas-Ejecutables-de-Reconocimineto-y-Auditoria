# HERA — Auditoría y Análisis de Red

Herramienta de auditoría de red que orquesta escaneos con Nmap, procesa sus resultados y
los presenta de dos formas: una interfaz de línea de comandos (CLI) y una aplicación de
escritorio nativa (Tauri). Ambas interfaces comparten exactamente la misma lógica de
escaneo, elevación de privilegios y análisis de vulnerabilidades — no hay dos
implementaciones divergentes del mismo comportamiento.

El software actúa como un orquestador: recoge la entrada del usuario a través de una UI,
la valida y sanitiza, detecta el sistema operativo (Windows/Linux/macOS) y ajusta la
ejecución en consecuencia, ejecuta las herramientas de seguridad internamente, captura y
procesa su salida, y la presenta al usuario. Una etapa futura contempla analizar esa
salida con IA para dar información más enfocada y accionable sobre la auditoría de red.

## Estado actual del proyecto

El proyecto está en desarrollo activo. HERA está pensado como un orquestador de
**varias categorías de herramientas de seguridad**, no solo de reconocimiento de red:

| Categoría | Herramienta(s) | Estado |
|---|---|---|
| Escaneo / reconocimiento | Nmap | **Implementado** — 8 modalidades de escaneo, dashboard y pestaña dedicada |
| Vulnerar (explotación) | Por definir | **No implementado** — planeado, sin desarrollo iniciado |
| Pentesting | Por definir | **No implementado** — planeado, sin desarrollo iniciado |

Todo lo construido hasta ahora (CLI, interfaz nativa, elevación de privilegios, parseo de
resultados) está diseñado sobre el módulo de Nmap, pero la arquitectura de `tools/`
(un archivo por herramienta, cada una expuesta a `core/executor.py`) está pensada para
que sumar una nueva categoría de herramienta no requiera rediseñar el resto del sistema.

Ambas interfaces actuales son funcionales:

- **CLI** (`HERA.py`): la interfaz original, la más probada. Se ha probado activamente en
  **Linux y Windows**.
- **Interfaz nativa** (Tauri + TypeScript vanilla): operativa, incluye dashboard combinado
  y una pestaña de escaneo por categoría con ejecución y visualización de resultados. El
  desarrollo y las pruebas de la interfaz gráfica se han hecho en **Linux (CachyOS)**;
  todavía no se ha probado la GUI en Windows ni macOS, aunque el código contempla ambos
  (detección de OS, elevación de privilegios específica por sistema, empaquetado NSIS
  para Windows).

Lo que **no** está implementado todavía:

- Herramientas de explotación/vulneración y pentesting (ver tabla arriba) — HERA hoy
  solo audita y reporta, no ataca ni explota nada.
- Análisis de resultados asistido por IA (mencionado como visión futura del proyecto,
  no iniciado).
- Pruebas de la interfaz gráfica en Windows y macOS (el CLI sí se ha probado en Windows).

**Nota sobre "Personalizado"**: el escaneo personalizado (protocolo, tipo TCP, timing,
puertos) **está completamente implementado y validado** en ambas interfaces — no es una
funcionalidad pendiente ni tiene limitaciones conocidas de validación.

## ¿Qué hace HERA hoy?

De las 3 categorías de herramientas planeadas (ver tabla de estado arriba), solo
**Escaneo** está implementada. HERA le pide a Nmap que audite una red local (no una IP
pública — ver nota de diseño más abajo) bajo distintas modalidades:

| Categoría | Qué hace |
|---|---|
| Escaneo rápido | Descubre hosts activos y sus 100 puertos más comunes |
| Vulnerabilidades | Corre los scripts NSE de la categoría `vuln` + `vulners` (CVEs conocidos por versión) |
| Dispositivos ocultos | Escaneo sigiloso (fragmentado, sin ping) pensado para evadir firewalls/IDS |
| Auditoría admin | Busca puertos de gestión expuestos (SSH, RDP, VNC, paneles web, bases de datos) |
| Identificación de dispositivos | Fingerprinting agresivo (SO, marca/modelo) |
| Monitor de consumo | Detecta puertos de streaming, gaming y VoIP |
| Full Pack | Combina todas las técnicas anteriores en un solo escaneo exhaustivo |
| Personalizado | Control manual de protocolo (TCP/UDP/SCTP), tipo de escaneo TCP, timing y puertos — implementado en ambas interfaces |

**Nota de diseño importante:** por defecto, HERA audita la **subred local** (ej.
`192.168.1.0/24`), detectada automáticamente vía `ip route` (Linux/macOS) o `ipconfig`
(Windows) — el objetivo es mapear los dispositivos de tu propia red (routers, IoT,
laptops, etc.). Las 8 categorías de escaneo también aceptan un **objetivo específico**
opcional (una IP, un rango, un CIDR o un hostname — cualquier formato que Nmap acepte),
que reemplaza la subred local detectada solo para esa ejecución. Sigue aplicando el mismo
principio: escanea únicamente sistemas de tu propiedad o con autorización explícita —
escanear una IP pública desde dentro de la LAN no revela nada útil por el NAT, y escanear
redes ajenas sin autorización es ilegal (ver Aviso Ético al final).

## Por qué Tauri (y cómo funciona)

La interfaz nativa se construyó sobre **Tauri** (shell de escritorio en Rust + WebView del
sistema operativo) en vez de alternativas como Electron. Las razones concretas:

- **No hay que reescribir la lógica de negocio ya probada.** Todo el análisis de red
  (parseo de XML, clasificación de vulnerabilidades, elevación de privilegios) ya existía
  en Python y funcionaba bien en el CLI. Con Tauri, los comandos de Rust simplemente
  invocan `python3` como subproceso y le piden que corra ese mismo código — no hubo que
  portar `utils/parser.py` ni `utils/elevation.py` a Rust o TypeScript. Esto redujo
  drásticamente el trabajo de construir la GUI y, más importante, evita que CLI e
  interfaz gráfica diverjan en su comportamiento (ver más abajo, "Por qué el análisis
  vive en Python").
- **Binarios mucho más livianos que Electron.** Tauri no empaqueta un motor Chromium
  completo dentro de la app — usa el WebView que el sistema operativo ya trae
  (WebKitGTK en Linux, WebView2 en Windows, WebKit en macOS). Esto resulta en
  instaladores de unos pocos MB en vez de cientos de MB.
- **Rust como capa de seguridad entre la interfaz web y el sistema.** El frontend
  (TypeScript, corriendo en el WebView) no tiene acceso directo al sistema de archivos ni
  puede lanzar procesos por sí mismo. Todo pasa por comandos explícitos que Rust expone
  (`#[tauri::command]`) y controla — el mismo patrón de "capa de protección" que ya
  describía este README para `core/executor.py` en el CLI.

### Cómo funciona en la práctica

1. El frontend (TypeScript) llama a `invoke("nombre_comando", {...})` — por ejemplo,
   `invoke("trigger_nmap_scan", { scanType: "vuln" })`.
2. Ese `invoke` cruza el puente de Tauri hacia Rust, donde `frontend/src-tauri/src/main.rs`
   tiene una función marcada `#[tauri::command]` con ese nombre exacto.
3. La función de Rust arma un bloque de código Python (idéntico en espíritu a lo que hace
   `HERA.py`/`CLI.py`) y lo ejecuta con `std::process::Command::new("python3")`, pasando
   parámetros como argumentos de proceso (`sys.argv`) — nunca interpolados directamente en
   el código, para evitar inyección.
4. Python corre exactamente la misma lógica que usa el CLI (`core/executor.py`,
   `tools/nmap.py`, `utils/parser.py`), escribe resultados en `utils/Resultados/`, o
   devuelve JSON por `stdout` si el comando es de lectura.
5. Rust captura esa salida y la devuelve al frontend como la respuesta de la promesa que
   originó el `invoke`.

Esto significa que, en términos estrictos, **la interfaz nativa no es más que un shell
gráfico sobre el mismo CLI** — no hay una segunda implementación del "motor" de HERA.

## Arquitectura

```
HERA.py                    → punto de entrada del CLI
frontend/CLI.py            → menús y flujo del CLI
frontend/option.py         → mapea la selección del usuario a parámetros de herramienta
frontend/src-tauri/        → aplicación nativa (Rust/Tauri) — shell de la interfaz gráfica
frontend/src/              → interfaz gráfica (TypeScript vanilla, sin framework)
core/executor.py           → detección de red local, localización del binario de Nmap
tools/nmap.py               → construye y ejecuta los comandos de Nmap por categoría
tools/tools_bin/            → binarios de Nmap embebidos, organizados por SO
utils/system_info.py        → detección de sistema operativo
utils/elevation.py          → elevación de privilegios multiplataforma (ver abajo)
utils/parser.py              → interpreta los XML de Nmap (ÚNICA fuente de verdad)
utils/vuln_classification.py → clasifica hallazgos: confirmados / posibles / informativos
utils/Resultados/            → salida de cada escaneo (XML, grepable, normal), por SO
```

### Descripción de las capas principales

- **`core/`** — lógica central que **protege al sistema de ejecuciones inválidas o
  inseguras**: es la capa de protección frente a entradas, flags o abuso desde la UI.
  `core/executor.py` ejecuta los binarios de las herramientas y maneja la detección de OS
  y el descubrimiento de red tanto en Windows (`ipconfig`) como en Linux/macOS
  (`ip route`), además de localizar el binario de Nmap correspondiente.
- **`frontend/`** — contiene la interfaz de usuario. Incluye tanto el CLI (`CLI.py`,
  `option.py`) como la interfaz nativa Tauri (`src-tauri/`, `src/`). El frontend se
  comunica únicamente con `core` y `tools`; esta capa nunca ejecuta herramientas
  directamente.
- **`tools/`** — contiene las herramientas orquestadas por HERA. Cada herramienta vive en
  su propio archivo (hoy solo `nmap.py`) y se expone a `core/executor.py`, de modo que
  agregar una nueva categoría (explotación, pentesting) no requiere rediseñar el resto
  del sistema. `tools_bin/` guarda los binarios organizados por sistema operativo.
- **`utils/`** — funciones de soporte: parseo de resultados (`parser.py`), clasificación
  de vulnerabilidades (`vuln_classification.py`), detección de SO (`system_info.py`),
  elevación de privilegios (`elevation.py`) y el directorio de salida de resultados
  (`Resultados/`).

### Por qué el análisis vive en Python, no en TypeScript

La interfaz nativa (Tauri) **no reimplementa** el parseo de XML ni la clasificación de
vulnerabilidades en TypeScript. En su lugar, los comandos de Rust invocan directamente
`utils/parser.py` (el mismo código que usa el CLI) y devuelven JSON ya procesado al
frontend. Esto fue una decisión deliberada tras encontrar bugs de duplicación de lógica
entre TS y Python al inicio del proyecto — mantener una sola implementación evita que
CLI e interfaz gráfica muestren resultados distintos para los mismos datos.

### Elevación de privilegios

Nmap necesita privilegios administrativos para varios tipos de escaneo (`-sS`, detección
de SO, etc.). `utils/elevation.py` centraliza esto para los tres sistemas operativos:

- **Linux**: `sudo` si hay terminal interactiva (CLI), `pkexec` si no la hay (GUI).
- **macOS**: `sudo` si hay terminal, si no un diálogo nativo vía `osascript`.
- **Windows**: la aplicación debe declararse como "requiere Administrador" a nivel de
  manifest del instalador (NSIS) — Windows pide UAC una sola vez al abrir la app, no en
  cada escaneo.

Nunca se hardcodea `sudo` en `tools/nmap.py` directamente — todo pasa por
`elevation.ejecutar_elevado()`.

## Flujo de ejecución

1. El usuario selecciona una opción en la UI (CLI o interfaz nativa).
2. Los parámetros ya validados se pasan a la capa de ejecución (`core/executor.py`).
3. El sistema detecta el SO para ajustar los comandos (por ejemplo, quitar `sudo` en
   Windows y usar la elevación adecuada según la plataforma).
4. La herramienta se ejecuta internamente usando el binario local correspondiente.
5. La salida se captura y se procesa (`utils/parser.py`,
   `utils/vuln_classification.py`).
6. *(Futuro)* La IA analizará la salida y aportará información adicional.
7. Los resultados se muestran al usuario (CLI o dashboard de la interfaz nativa).

## Cómo ejecutar

### CLI

```bash
python3 HERA.py
```

### Interfaz nativa (desarrollo)

```bash
cd frontend
npm install
npm run tauri dev
```

### Interfaz nativa (build de producción)

```bash
cd frontend
npm run tauri build
```

## Guía de desarrollo del frontend

Para saber en qué archivo tocar algo específico de la interfaz gráfica (colores, el menú
horizontal, la gráfica, los parsers, etc.), ver [`frontend/DEVELOPMENT.md`](frontend/DEVELOPMENT.md).


## Aviso ético

Este software debe usarse únicamente en sistemas de tu propiedad o sobre los que tengas
autorización explícita para auditar. El escaneo de redes no autorizado es ilegal.