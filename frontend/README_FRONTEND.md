# Guía de desarrollo — Interfaz nativa de HERA

La interfaz está escrita en **TypeScript vanilla**, envuelta en
**Tauri** (Rust) como shell nativo de escritorio. No hay build step de componentes: cada
"componente" es una clase que construye y devuelve un `HTMLElement`.

## Lean esto people

> Esto lo hice con ayuda de Claude, lo que provocó algo de deuda técnica sobre la
> funcionalidad. Como quien escribe esto no ve frontend de forma habitual, no se
> preocupó tanto por eso — pero se documentó todo lo que se sabe, incluyendo lo que
> **no** se sabe.
>
> **Importante para versiones finales:** TODO el frontend deberá ser testeado y
> asegurado contra CVEs ya existentes antes de un lanzamiento real. Es chamba, mucha
> chamba, y por eso se deja para el final — **no podemos lanzar HERA sin antes asegurar
> la app.**
>
> Sobre por qué Tauri: se escogió como alternativa a React o Electron (frameworks que
> permiten construir frontends programando como si fuera una WebApp: HTML, CSS y
> TypeScript), para que el equipo no tuviera mayores problemas de adaptación. Además,
> Tauri está muy optimizado para todos los SO y consume muy poca RAM comparado con
> Electron.
>
> Sobre `vite`: se usa porque es necesario, pero no hay una comprensión clara de qué es
> exactamente ni por qué hace falta.
>
> Sobre los `.json` sueltos en `frontend/` (fuera de cualquier subcarpeta) —
> `package.json` y `package-lock.json`: no está claro qué son exactamente. Se sabe que
> los JSON son archivos de variables que pueden cambiar y/o necesitan recordarse, así
> que son importantes — si alguien quiere sentarse a descifrarlos a detalle, que lo
> documente después.
>
> Sobre el flujo CLI ↔ frontend: `CLI.py` es donde ocurre toda la lógica del CLI. Por lo
> tanto, **todo lo que se agregue en el frontend se debe agregar en paralelo con la misma
> funcionalidad dentro del CLI.** Lo más recomendable es trabajar primero en el CLI y,
> una vez la funcionalidad esté pulida, pasarla al frontend nativo.

## Estructura de carpetas

```
frontend/
├── index.html              → punto de montaje, carga main.ts
├── package.json             → scripts npm (dev, build, tauri)
├── src/
│   ├── main.ts               → arma el layout completo, cablea todos los componentes
│   ├── index.css             → estilos globales y variables de color (--color-*)
│   ├── api/
│   │   └── heraApi.ts         → puente hacia los comandos de Tauri (invoke). NO contiene
│   │                            lógica de análisis — solo transporta datos.
│   ├── state/
│   │   ├── scanState.ts       → estado global de datos de red (dispositivos, stats,
│   │   │                        si hay un escaneo en curso). Singleton reactivo.
│   │   └── viewState.ts       → estado de navegación (qué pestaña está activa, qué
│   │                            categoría de escaneo está seleccionada) + la lista de
│   │                            las 8 categorías (SCAN_CATEGORIES).
│   ├── components/
│   │   ├── NavBar.ts           → menú horizontal (Escaneo | Opción 2 | Logo | Opción 3/4)
│   │   ├── Card.ts              → tarjeta genérica reutilizable (título + contenido)
│   │   ├── SecurityCard.ts      → tarjeta "Estado de Seguridad" (BAJO/MEDIO/ALTO/CRÍTICO)
│   │   ├── NetworkChart.ts      → la gráfica de "Actividad de Red"
│   │   ├── ScanButton.ts        → botón único del dashboard (siempre dispara full_pack)
│   │   ├── ResultsTable.ts      → tabla de dispositivos del dashboard combinado
│   │   └── ScanView.ts          → pestaña "Escaneo": chips de categoría, formulario de
│   │                              Personalizado, y las cards de resultados por categoría
│   ├── utils/
│   │   └── portLabels.ts        → diccionarios puerto→etiqueta para Admin y Consumo
│   └── styles/
│       └── *.css                → un archivo CSS por componente, mismo nombre
└── src-tauri/
    ├── tauri.conf.json          → configuración de la ventana, ícono, build
    └── src/main.rs               → comandos nativos (invoke_handler) que llaman a Python
```

**Nota sobre `components/`, `styles/` y "lo bueno del frontend":** la mayor parte de lo
sólido del frontend vive en `src/` y `src-tauri/`. Fue construido en gran parte por
Claude siguiendo la arquitectura general, empezando desde cero, así que el código puede
sentirse un poco confuso en partes — se documentó lo que se recuerda de cada pieza:

- **`api/`** → incluye `heraApi.ts`, encargado de enviar la información del backend al
  frontend. Revisar el archivo directamente para entender el detalle fino.
- **`components/`** → todo lo que se ve de forma individual: cards, botones especiales,
  la barra horizontal, los distintos tipos de tablas, etc.
- **`styles/`** → un archivo CSS por componente, sin mucho más misterio.

### Carpetas de `src-tauri/` con estado incierto (documentado a propósito)

Estas partes de `src-tauri/` **no están del todo entendidas por quien escribió esta
guía** y quedan anotadas aquí para que alguien las revise antes de tocarlas o borrarlas:

- **`icons/`** — íconos creados en algún momento, no está claro de dónde salieron ni
  para qué se usan exactamente. Candidatos a eliminar, pero primero hay que revisar su
  utilidad real (pueden estar referenciados en `tauri.conf.json` para el empaquetado).
- **`gen/schemas/`** — no hay idea de qué son. Pendiente de investigar.
- **`src/`** (el de `src-tauri/`, no confundir con `frontend/src/`) — el archivo más
  confuso de todos: no está claro por qué ni cómo existe en su forma actual. La hipótesis
  es que podría tratarse de un intento de mover lógica de backend a Rust, pero eso
  dejaría inutilizables los otros archivos que ejecutan comandos (`main.rs`), lo cual no
  es el caso actual. **Conclusión provisional: este archivo debe y necesita ser
  refactorizado**, no eliminado a ciegas.
- **`target/`** — carpeta de build de Rust; en teoría no requiere atención manual (es
  generada), pero tampoco está confirmado al 100%.
- El resto de archivos de `src-tauri/` son generados por Tauri directamente — en teoría
  no deberían requerir atención, pero si alguien encuentra algo interesante ahí, vale la
  pena reportarlo.

## "Cambios" → mapa de archivos

| Quiero cambiar | Archivo(s) |
|---|---|
| Colores generales, variables de tema | `src/index.css` (busca las variables `--color-primary`, `--color-accent`, `--color-security-*`, `--color-border-inactive`, etc. — se usan en todos los componentes). **Nota: hoy son colores placeholder**, puestos solo para diferenciar secciones visualmente; hay que cambiarlos a los colores reales de marca de HERA. |
| El logo / wordmark "HERA" | `src/components/NavBar.ts` + `src/styles/NavBar.css` (clases `.hera-navbar-logo-icon` / `.hera-navbar-logo-text`). El SVG y la técnica de gradiente están duplicados intencionalmente desde `Header.ts`/`Header.css` (que ya no se usan en `main.ts`, pero se dejaron sin borrar por si se quieren reutilizar). **El símbolo actual en el menú horizontal es un placeholder** — no se ha implementado el logo definitivo por falta de tiempo, aunque la imagen (con fondo) ya está en la carpeta `images`. Falta quitarle el fondo y colocarlo donde corresponde. |
| Ítems del menú horizontal (agregar/quitar opciones, textos) | `src/components/NavBar.ts`. Las "Opción 2/3/4" están inertes a propósito (`is-disabled`) — para activarlas, agregar su `addEventListener` igual que tiene el botón "ESCANEO" |
| A dónde lleva el logo o el botón "Escaneo" | `src/state/viewState.ts` (`goToDashboard()` / `goToScan()`) — el NavBar solo llama a estos métodos, no decide la navegación él mismo |
| La gráfica "Actividad de Red" | `src/components/NetworkChart.ts` |
| El botón principal del dashboard (Escanear/Informe) | `src/components/ScanButton.ts` para la apariencia; `src/state/scanState.ts::startScan()` para el comportamiento (siempre lanza `full_pack`, ver nota en el README raíz). **Pendiente de aclarar:** no está definida la diferencia funcional exacta entre `components/ReportButton` y `components/ScanButton` — hay que revisar ambos antes de modificarlos. |
| La tabla de dispositivos del dashboard | `src/components/ResultsTable.ts` |
| Las 8 categorías de escaneo (agregar una, cambiar nombres, orden) | `src/state/viewState.ts` → array `SCAN_CATEGORIES`. El `file_base` de cada una debe coincidir exactamente con el nombre de archivo que genera la función correspondiente en `tools/nmap.py` |
| El diseño de las cards por categoría (Vulnerabilidades, Admin, Consumo, genérica) | `src/components/ScanView.ts` — cada categoría tiene su propio método de renderizado (`renderVulnSplit`, `renderAdminPorts`, `renderConsumoPorts`, `renderGenericBadges`) |
| El formulario de "Personalizado" (protocolo, timing, puertos) | `src/components/ScanView.ts` → `buildCustomForm()`, validación en `validateCustomForm()` |
| El campo de "IP / red objetivo" (las 8 categorías pueden apuntar a un objetivo distinto de la red local detectada) | Frontend: `src/components/ScanView.ts` (`renderActionBar()` para las 7 categorías genéricas, `buildCustomForm()` para Personalizado) → `src/state/scanState.ts::startScan()`/`startCustomScan()` → `src/api/heraApi.ts`. Backend: `tools/nmap.py::_escribir_hosts_file()`, parámetro `target` en cada función de escaneo |
| Las etiquetas de puertos en Admin/Consumo (ej. "🎮 Gaming", "cPanel") | `src/utils/portLabels.ts` — deben coincidir con las listas de puertos reales en `tools/nmap.py::admin_audit()` / `monitor_consumo()` |
| Qué cuenta como "vulnerabilidad confirmada" vs "posible" vs "informativa" | **No está en TypeScript.** Vive en `utils/vuln_classification.py` (Python) — es la única fuente de verdad, compartida por CLI y GUI. Ver sección siguiente |
| Cómo se agrupan los dispositivos, qué campos trae cada uno | `utils/parser.py` (Python) — el frontend solo consume lo que esta función ya arma |
| Qué comandos puede invocar la interfaz desde Rust | `frontend/src-tauri/src/main.rs` — cada `#[tauri::command]` es una función que el TS puede llamar con `invoke("nombre_comando", {...})`. **Nota de arquitectura pendiente de evaluar:** el archivo `option.py` (mapeo de selección del usuario a parámetros de herramienta) quedó semi-inutilizado — al parecer, en algún punto del desarrollo asistido, las funciones que normalmente pasarían por `option.py` terminaron invocándose directamente desde `executor.py`. Esto no es necesariamente malo, pero falta evaluar qué tan independientes deben quedar las capas de HERA (frontend / core / tools) para no romper la separación de responsabilidades original. |
| El tamaño/comportamiento de la ventana nativa | `frontend/src-tauri/tauri.conf.json` |
| Cómo se eleva a permisos de administrador para escanear | `utils/elevation.py` (Python, no Rust ni TS) |

## Los parsers específicos (por qué no están en `frontend/`)

Una decisión de arquitectura importante: **todo el análisis de resultados de Nmap vive en
Python**, no en TypeScript, aunque se muestre en la interfaz gráfica.

- `utils/parser.py`: lee los XML de Nmap y arma la estructura de datos que consume tanto
  el CLI (`generar_tabla_xml`, `obtener_estadisticas_dashboard`) como la interfaz nativa
  (`obtener_dispositivos_para_dashboard`, `obtener_resultados_categoria`).
- `utils/vuln_classification.py`: decide si un script NSE de Nmap representa una
  vulnerabilidad confirmada, posible (sin confirmar) o puramente informativa. Incluye una
  tabla `KNOWN_EXCEPTIONS` para scripts que no siguen el formato estándar de Nmap pero sí
  reportan hallazgos reales (ej. `http-csrf`).

Si necesitas cambiar cómo se interpreta un escaneo (qué cuenta como hallazgo, cómo se
calcula la severidad, cómo se agrupan los CVEs de `vulners`), el cambio va en estos dos
archivos de Python — **nunca** en `heraApi.ts`. Ese archivo solo llama a
`invoke("get_dashboard_data")` / `invoke("get_category_results", {...})` y tipa la
respuesta; si alguna vez vuelve a aparecer lógica de clasificación duplicada ahí, es un
retroceso al bug que ya se corrigió (ver README raíz, sección "Por qué el análisis vive
en Python").

## Cómo fluyen los datos de un escaneo, de principio a fin

```
Usuario hace clic en "Ejecutar" (ScanView.ts)
  → scanState.startScan(categoria)                         [state/scanState.ts]
    → heraApi.startScan(categoria)                          [api/heraApi.ts]
      → invoke("trigger_nmap_scan", { scanType })
        → main.rs despacha según scanType a la función      [src-tauri/src/main.rs]
          correspondiente de tools/nmap.py (vía subprocess python3)
            → tools/nmap.py construye el comando y llama a
              utils/elevation.py::ejecutar_elevado()         [utils/elevation.py]
                → nmap corre, escribe .xml/.gnmap/.txt en
                  utils/Resultados/<SO>/Nmap/
  → al terminar, scanState.refreshData() vuelve a pedir datos
    → invoke("get_dashboard_data")
      → main.rs llama a utils/parser.py::obtener_dispositivos_para_dashboard()
        y obtener_estadisticas_dashboard()                   [utils/parser.py]
          → internamente usa utils/vuln_classification.py
            para clasificar cada hallazgo                    [utils/vuln_classification.py]
      → Rust devuelve JSON ya procesado
  → scanState actualiza AppState y notifica a los componentes suscritos
  → cada componente (SecurityCard, ResultsTable, NetworkChart, etc.) se repinta
```

## Deuda técnica conocida y pendientes

Pendientes:

- **Colores placeholder** en toda la interfaz — hay que reemplazarlos por la paleta real
  de marca de HERA (ver tabla de arriba, fila "Colores generales").
- **Logo placeholder** en el menú horizontal — la imagen con fondo ya existe en `images`,
  falta quitarle el fondo e integrarla en `NavBar.ts` (ver tabla de arriba).
- **`Header.ts` / `Header.css`** quedaron sin usar en el código (se reemplazaron por el
  logo del `NavBar`) pero no se borraron — limpiarlos o decidir reutilizarlos es tarea
  pendiente.
- **Diferencia entre `components/ReportButton` y `components/ScanButton`** no está
  documentada ni clara — revisar antes de tocar cualquiera de los dos.
- **`option.py` semi-inutilizado** — evaluar si las funciones que actualmente se invocan
  directo desde `executor.py` deberían pasar por `option.py`, y qué tan independientes
  deben mantenerse las capas de HERA (ver tabla de arriba).
- **Agrupamiento de CVEs de `vulners` por CPE** (ver
  `utils/parser.py::agrupar_vulnerabilidades_para_mostrar`) asume que el formato del CPE
  sigue el patrón `cpe:/a:vendor:producto:version`; CPEs con otro formato caen a
  mostrarse tal cual, sin agrupar.
- **Archivo `src-tauri/src/main.rs`** Es el pero archivo que hay NO TENGO IDEA DE PORQUE NI COMO EXISTE. Mi hipotesis es que es el backend sin embargo es dejaria inutilizable los otros archivos que ejecutan comandos, lo cual no es el caso. Asi que tristemente, efectivamente este archivo debe y necesita ser refactorizado. 
- **`src-tauri/icons/`, `src-tauri/gen/schemas/`, `src-tauri/target/`** — estado y
  utilidad sin confirmar, pendientes de revisión antes de tocarlos o eliminarlos.

**Antes de un lanzamiento real:** todo el frontend (dependencias de npm/Tauri incluidas)
debe testearse y asegurarse contra CVEs conocidos. Esto se deja deliberadamente para el
final del desarrollo, pero es un requisito bloqueante — **HERA no debe lanzarse sin antes
completar esta auditoría de seguridad del propio frontend.**