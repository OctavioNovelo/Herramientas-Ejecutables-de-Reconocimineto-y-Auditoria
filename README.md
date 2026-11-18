<p align="center">
  <img src="frontend/src/assets/hera-logo.png" alt="Logo de HERA" width="160">
</p>

<h1 align="center">HERA</h1>

<p align="center">
  <strong>Herramientas Ejecutables de Reconocimiento y Auditoría</strong><br>
  Auditoría defensiva de tu propia red: orquesta Nmap, Nuclei y testssl.sh y presenta los
  resultados de forma legible, desde la terminal o desde una aplicación de escritorio.
</p>

<p align="center">
  <img alt="Python 3" src="https://img.shields.io/badge/Python-3-3776AB">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="Estado: en desarrollo" src="https://img.shields.io/badge/estado-en%20desarrollo-c08a3e">
</p>

<p align="center">
  <a href="#qué-hace">Qué hace</a> ·
  <a href="#requisitos">Requisitos</a> ·
  <a href="#instalación">Instalación</a> ·
  <a href="#uso">Uso</a> ·
  <a href="#arquitectura">Arquitectura</a> ·
  <a href="#estado-y-limitaciones">Estado</a> ·
  <a href="#cómo-trabajamos-en-equipo">Contribuir</a> ·
  <a href="#aviso-legal-y-ético">Aviso legal</a>
</p>

---

HERA es un orquestador: recibe la elección del usuario, valida y sanitiza la entrada, detecta el
sistema operativo, ejecuta internamente la herramienta de seguridad que corresponde, interpreta
su salida y la muestra. **Audita y reporta; no ataca ni explota nada.**

Tiene dos interfaces que comparten exactamente la misma lógica en Python:

- **CLI** (`HERA.py`): la interfaz original y la más probada. Probada en Linux y Windows.
- **Aplicación de escritorio** (Tauri 2 + TypeScript sin framework, dirección visual *Argos*):
  cada equipo de la red es una pluma de un abanico de pavo real cuyo ojo indica su estado.
  Desarrollada y probada en Linux.

No hay dos implementaciones del motor: la app de escritorio es un shell gráfico que llama al
mismo código Python que usa el CLI.

## Qué hace

Los escaneos se agrupan en dos categorías. Una tercera, **Vulnerar**, está planeada y aparece
como "próximamente".

### Mapear (reconocimiento, con Nmap)

| Escaneo | Qué hace |
|---|---|
| Escaneo rápido | Descubre hosts activos y sus 100 puertos TCP más comunes. Genera poco tráfico. |
| Dispositivos ocultos | Encuentra hosts que están en la red pero no responden al ping (compara ARP contra ICMP) y escanea a fondo solo a esos. |
| Auditoría admin | Busca interfaces de gestión expuestas (SSH, RDP, VNC, paneles web con su título, bases de datos, SNMP, IPMI, TR-069). |
| Identificación | Fingerprinting agresivo: sistema operativo, marca y modelo vía NetBIOS, SMB, mDNS y UPnP. |
| Full pack | Combina descubrimiento, identificación, gestión y todos los puertos TCP. Es el escaneo que lanza el Dashboard. |
| Personalizado | Control manual de protocolo (TCP/UDP/SCTP), tipo de escaneo TCP, timing y puertos. |

### Detectar (vulnerabilidades)

| Escaneo | Qué hace |
|---|---|
| Vulnerabilidades | Nmap descubre los servicios y [Nuclei](https://github.com/projectdiscovery/nuclei) comprueba cada falla (CVE, paneles expuestos, malas configuraciones) contra la respuesta real del servicio, sin pruebas intrusivas ni de DoS. Incluye EternalBlue (MS17-010) y MS12-020 (RDP) con Nmap. |
| Seguridad TLS | [testssl.sh](https://github.com/testssl/testssl.sh) revisa cada servicio cifrado: protocolos viejos, cifrados débiles, certificado y fallas como Heartbleed (unos 30 s por servicio). |

Los hallazgos se clasifican en **confirmados**, **posibles** e **informativos**
(`utils/vuln_classification.py`).

### Objetivo del escaneo

Por defecto HERA audita la **subred local**, detectada con `ip route` (Linux/macOS) o
`ipconfig` (Windows), descartando interfaces virtuales (Docker, VMware, VirtualBox, WSL, etc.).
Todos los escaneos aceptan además un objetivo opcional (una IP, un rango, un CIDR o un nombre:
cualquier formato que Nmap acepte) que reemplaza la subred solo para esa ejecución. La red
auditada se guarda en `hosts.txt`; en la app, si se deja vacío el objetivo, se usa esa red.

### Evasión de firewall/IDS (opcional)

Dispositivos ocultos, Full pack y Personalizado permiten activar fragmentación, señuelos y orden
aleatorio de hosts. Va **apagada por defecto**: en tu propia red esconderse no aporta y vuelve el
escaneo más lento y menos preciso. Sirve para comprobar si tu firewall o IDS detecta un escaneo
sigiloso.

## Requisitos

| Para | Necesitas |
|---|---|
| CLI | Python 3 (solo biblioteca estándar; no hay `requirements.txt`). Privilegios de administrador para varios escaneos (ver [Elevación de privilegios](#elevación-de-privilegios)). |
| App de escritorio | Lo anterior, más Node.js con npm, Rust (`cargo`) y los [prerrequisitos de Tauri 2](https://v2.tauri.app/start/prerequisites/) de tu sistema (WebKitGTK en Linux, WebView2 en Windows). La app invoca `python3`, así que ese comando debe estar en el `PATH`. |
| Seguridad TLS | `bash`. No funciona en Windows. |
| Windows | [Npcap](https://npcap.com) para que `nmap.exe` envíe paquetes crudos. Si falta, HERA lo descarga, verifica su SHA-256 y abre el instalador antes del primer escaneo (`utils/npcap.py`). |

### Herramientas incluidas

| Herramienta | Linux | Windows | macOS |
|---|---|---|---|
| Nmap 7.98 | Incluido | Incluido | No incluido |
| Nuclei 3.11.1 | Se instala desde HERA | Se instala desde HERA | Se instala desde HERA |
| testssl.sh 3.2.4 | Incluido | No disponible | No incluido |

Los binarios viven en `tools/tools_bin/<Linux|Windows|macos>/<Herramienta>/`. Nuclei no se
versiona (pesa unos 140 MB, más que el límite de GitHub): al elegir **Vulnerabilidades** sin
Nuclei, el CLI y la app piden permiso para descargarlo de la release oficial y verifican su
SHA-256. Detalles, versiones y licencias en [`tools/README.md`](tools/README.md).

## Instalación

```bash
git clone https://github.com/OctavioNovelo/Herramientas-Ejecutables-de-Reconocimineto-y-Auditoria.git
cd Herramientas-Ejecutables-de-Reconocimineto-y-Auditoria
```

El CLI no necesita nada más. Para la app de escritorio:

```bash
cd frontend
npm install
```

## Uso

### CLI

```bash
python3 HERA.py
```

Menú principal:

- **Dashboard**: resumen combinado de todos los escaneos y lanzamiento del Full pack.
- **Mapear** y **Detectar**: una pantalla por escaneo para ejecutarlo con objetivo opcional,
  ver los resultados del último, buscar en ellos y compararlos con el anterior.
- **Vulnerar**: próximamente.

`Ctrl+C` durante un escaneo lo cancela y descarta los archivos parciales. Define `NO_COLOR` para
desactivar los colores (también se desactivan si la salida no es una terminal).

### App de escritorio

Desde `frontend/`:

```bash
npm run tauri dev      # desarrollo (Vite en http://127.0.0.1:3001)
npm run tauri build    # build de producción
```

En la app, cada escaneo abre un diálogo antes de lanzarse que pide "Rango o equipo" y, según el
caso, la evasión o las opciones de Personalizado. Sobre el abanico hay pestañas: "Todo" y una
por cada escaneo con resultados; se pueden revisar mientras otro escaneo corre en segundo plano.

### Modos de demostración (sin escanear)

Para trabajar en la interfaz con datos ficticios (`frontend/src/api/demoData.ts`):

| Comando (en `frontend/`) | Datos |
|---|---|
| `npm run tauri:demo` | Red pequeña |
| `npm run tauri:demovacio` | Instalación sin escaneos |
| `npm run tauri:demogrande` | Red de unos 40 equipos |

`npm run dev:demo`, `dev:demovacio` y `dev:demogrande` levantan solo Vite, sin ventana nativa.
Con `npm run dev:demogrande` corriendo, `node herramientas/prueba.mjs` recorre la interfaz en
Chromium headless y guarda capturas (requiere `chromium` instalado).

### Linux con Wayland y NVIDIA

La app arranca WebKitGTK con `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1`: mantiene la aceleración por
GPU y evita que la ventana se cierre con "Error 71". Si en tu equipo la ventana no abre o se ve
mal, lánzala con `WEBKIT_DISABLE_COMPOSITING_MODE=1` (todo se pinta por CPU: más lento y sin 3D
en las cartas).

### Resultados

Cada escaneo escribe en `utils/Resultados/<SO>/<Herramienta>/` archivos con el patrón
`<escaneo>_<fecha>_<hora>` (en Nmap: `.xml`, `_normal.txt` y `_grepable.txt`). Esa carpeta
contiene datos reales de tu red y está en `.gitignore`: **nunca la subas**.

## Arquitectura

```
HERA.py                   punto de entrada del CLI (la app lo usa para ubicar la raíz: no moverlo)
core/executor.py          localiza binarios por SO y detecta las subredes locales
tools/                    un módulo por herramienta: nmap.py, nuclei.py, testssl.py
tools/tools_bin/          binarios de las herramientas, por SO
utils/parser.py           interpreta los resultados (única fuente de verdad para CLI y app)
utils/vuln_classification.py  clasifica hallazgos: confirmados, posibles, informativos
utils/elevation.py        elevación de privilegios multiplataforma
utils/npcap.py            comprobación e instalación de Npcap en Windows
utils/system_info.py      detección del sistema operativo
utils/Resultados/         salida de cada escaneo (no versionada)
frontend/CLI.py           menús y flujo del CLI
frontend/option.py        catálogo de escaneos (espejo de src/state/viewState.ts)
frontend/cli_render.py    presentación en terminal
frontend/src-tauri/       shell nativo en Rust (comandos #[tauri::command])
frontend/src/             interfaz en TypeScript; la vista Argos vive en src/argos/
frontend/herramientas/    utilidades de desarrollo (prueba.mjs, tramar.py)
docs/ui/                  dirección visual Argos y aprendizajes de la UI
```

### Capas

- **`core/`**: protege al sistema de ejecuciones inválidas o inseguras. Prepara el contexto de
  cada ejecución (binario de la herramienta, binarios del resto, subredes locales).
- **`tools/`**: cada herramienta vive en su propio archivo, declara `BINARIOS` por SO y se
  registra en `core/executor.py::HERRAMIENTAS`. Sumar una herramienta no exige rediseñar el resto.
- **`utils/`**: parseo, clasificación, elevación, Npcap y detección de SO.
- **`frontend/`**: el CLI y la app. Nunca ejecuta herramientas directamente: pasa por `core` y
  `tools`. Lo que se agregue en una interfaz debe agregarse también en la otra (`option.py` y
  `viewState.ts` deben coincidir).

### Cómo habla la app con Python

1. El frontend llama a `invoke("nombre_comando", {...})`, por ejemplo
   `invoke("trigger_nmap_scan", { scanType: "vuln" })`.
2. Tauri lo entrega a la función `#[tauri::command]` del mismo nombre en
   `frontend/src-tauri/src/main.rs`.
3. Rust ejecuta `python3` con un bloque de código fijo y pasa los parámetros como argumentos de
   proceso (`sys.argv`), nunca interpolados en el código, para evitar inyección.
4. Python corre la misma lógica que el CLI (`core/executor.py`, `tools/`, `utils/parser.py`),
   escribe en `utils/Resultados/` o devuelve JSON por `stdout`.
5. Rust devuelve esa salida como respuesta a la promesa del `invoke`.

El WebView no tiene acceso directo al sistema de archivos ni puede lanzar procesos: todo pasa
por los comandos que expone Rust.

**Por qué Tauri.** Reutiliza la lógica Python ya probada en el CLI sin portarla, evita que CLI y
app diverjan, y usa el WebView del sistema (WebKitGTK, WebView2, WebKit) en vez de empaquetar
Chromium como Electron, con instaladores de pocos MB.

**Por qué el análisis vive en Python.** Al inicio del proyecto hubo bugs por duplicar lógica
entre TypeScript y Python. Mantener una sola implementación (`utils/parser.py`) garantiza que
CLI y app muestren lo mismo para los mismos datos.

### Elevación de privilegios

Nmap necesita privilegios para varios escaneos (`-sS`, detección de SO, etc.).
`utils/elevation.py` lo centraliza y nunca se escribe `sudo` directamente en `tools/`: todo pasa
por `elevation.ejecutar_elevado()`.

- **Linux**: `sudo` si hay terminal (CLI); `pkexec` si no la hay (app).
- **macOS**: `sudo` si hay terminal; si no, el diálogo nativo vía `osascript`.
- **Windows**: HERA debe ejecutarse como Administrador. Si no, avisa en vez de fallar en
  silencio. La app está pensada para declararlo en el manifest del instalador, de modo que
  Windows pida UAC una sola vez al abrirla.

## Estado y limitaciones

El proyecto está en desarrollo activo.

- Implementado: Mapear (6 escaneos) y Detectar (2), en CLI y app.
- No implementado: **Vulnerar** (explotación y pentesting) y el análisis de resultados asistido
  por IA. Hoy el plan "Qué hacer ahora" de la app se arma con reglas.
- La app solo se ha probado en Linux. Windows (WebView2) y macOS (WKWebView) no se han probado,
  aunque el código los contempla.
- La declaración de "requiere Administrador" para el instalador de Windows todavía no está en
  `tauri.conf.json`.
- En macOS no hay binarios incluidos de Nmap ni testssl.sh.
- Antes de un lanzamiento real hay que auditar y asegurar el frontend.

Documentación adicional:

- [`docs/ui/ARGOS.md`](docs/ui/ARGOS.md): dirección visual vigente, cómo está hecha y riesgos.
- [`docs/ui/APRENDIZAJES.md`](docs/ui/APRENDIZAJES.md): aprendizajes del desarrollo de la UI.
- [`frontend/README_FRONTEND.md`](frontend/README_FRONTEND.md): guía del frontend. Parte de su
  estructura de `src/` es anterior a Argos; el puente con Rust y Python sigue vigente.
- [`tools/README.md`](tools/README.md): herramientas, versiones, licencias e instalación de Nuclei.
- [`PRODUCT.md`](PRODUCT.md) y [`DESIGN_BRIEF.md`](DESIGN_BRIEF.md): producto y brief de diseño.

## Cómo trabajamos en equipo

**No se trabaja directamente sobre `main`.** `main` debe estar siempre funcional. Cada error,
funcionalidad, mejora o cambio importante va en su propia branch y entra a `main` mediante un
Pull Request revisado.

### Nombres de branch

| Prefijo | Uso | Ejemplo |
|---|---|---|
| `feature/` | Nueva funcionalidad | `feature/nueva-gui` |
| `fix/` | Corrección de errores | `fix/tauri-build` |
| `refactor/` | Reorganizar código sin cambiar funcionalidad | `refactor/backend` |
| `test/` | Pruebas | `test/api-tests` |
| `docs/` | Documentación | `docs/actualizar-readme` |

Una branch es un **cambio lógico**, no un commit: cinco commits que arreglan el login van en
`fix/login`; dos problemas distintos van en dos branches.

### Flujo

```bash
# 1. Partir de main actualizado
git switch main
git pull

# 2. Crear la branch
git switch -c feature/mi-cambio

# 3. Trabajar, probar y hacer commits que digan qué se hizo
git add .
git commit -m "feat: agregar pantalla de resultados"

# 4. Subir la branch (la primera vez con -u; después basta git push)
git push -u origin feature/mi-cambio
```

5. En GitHub, **Compare & pull request** con dirección `feature/mi-cambio → main`. Escribe un
   título descriptivo, qué cambiaste y cómo lo probaste.
6. Otro integrante revisa el código, que funcione y que no rompa otras partes. Si pide cambios,
   se siguen haciendo commits en la misma branch y el PR se actualiza solo.
7. Aprobado el PR, se hace **Merge pull request** y se borra la branch.

Ejemplos de mensajes: `feat: ...`, `fix: corregir botón de auditoría`,
`refactor: reorganizar módulo de reconocimiento`, `docs: actualizar instrucciones de instalación`.

### Si `main` cambió mientras trabajabas

```bash
git switch main
git pull
git switch feature/mi-cambio
git merge main     # si hay conflictos, resolverlos, luego git add . y git commit
```

### Comandos de referencia

| Acción | Comando |
|---|---|
| Ver estado | `git status` |
| Ver branches (locales / todas) | `git branch` / `git branch -a` |
| Crear branch | `git switch -c nombre` |
| Cambiar de branch | `git switch nombre` |
| Subir branch por primera vez | `git push -u origin nombre` |
| Subir / descargar cambios | `git push` / `git pull` |
| Unir una branch (fuera del flujo de PR) | `git merge nombre` |
| Eliminar branch local | `git branch -d nombre` |
| Eliminar branch remota | `git push origin --delete nombre` |

## Licencia

El repositorio todavía no tiene un archivo de licencia propio. Las herramientas de terceros
incluidas conservan las suyas (Nmap: NPSL; Nuclei y nuclei-templates: MIT; testssl.sh: GPLv2);
ver [`tools/README.md`](tools/README.md).

## Aviso legal y ético

Usa HERA únicamente en sistemas y redes de tu propiedad o sobre los que tengas autorización
explícita para auditar. El escaneo de redes no autorizado es ilegal.
