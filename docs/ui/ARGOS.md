# Dirección visual: Argos, el guardián de cien ojos

**Tesis.** HERA vigila la red como Argos: la pantalla entera es el abanico del pavo real, cada equipo es una pluma y su ojo dice, por forma, si hay algo que mirar.

## Paleta
- Tinta (fondo): `#070d1a`, con cuerpo hacia `#10203c` en la base. Tinta 2: `#0d1830`.
- Hueso (texto): `#ece5d2`. Hueso 2 (secundario): `#a8ab9c`.
- Película de la pluma (rampa del shader y relleno del control primario): bronce `#c08a3e`, verde botella `#1f8a63`, azul pavo `#1c9cc0`, violeta `#7a66d8`.
- Estados: ámbar `#f4b540` (alerta), brasa `#ff7350` (riesgo). Sin pendientes no tiene color propio: es el ocelo natural, apagado.
- Los ojos son canicas de vidrio con fondo: gris translúcido (sin pendientes, deja ver el ocelo), ámbar (alerta) y brasa (riesgo). El brillo, la cáustica y la sombra siguen a la luz, y el ojo de dentro mira hacia ella.
- El estado nunca va solo por color: cerrado = una línea de párpado; alerta = almendra entreabierta + anillo punteado; riesgo = ojo abierto con pupila + anillo continuo. El nombre del equipo sale solo con el cursor o el foco encima. Los mismos tres glifos se repiten en cifras, plan y ficha, junto al texto.

## Tipografía
- Piazzolla (serif variable): titulares, acciones del plan y rótulos de lámina en cursiva.
- Atkinson Hyperlegible Next: texto y controles. Atkinson Hyperlegible Mono: IP, MAC, puertos, reloj.
- Escala: 12.5 / 13.5 / 15 (base) / 17 / 20 / 26 / 30 px. Nada por encima de 40 px (el reloj del escaneo).

## Firma
Picar un ojo: las demás plumas se pliegan en haz y se apagan; la elegida se tiende horizontal y se desarma con rótulos. Raquis = equipo y sistema; barbas = un puerto por barba (ámbar o brasa si hay que revisarlo); anillos del ocelo = servicios, un anillo por familia; pupila = hallazgos y su corrección (y los posibles, sin confirmar). Cursor o foco sobre una parte, en el rótulo o en la pluma misma, la separa un poco.

## Cómo está hecho
- La cola baja y sube: en Lanzar y en la ficha, las plumas se cierran, caen hacia atrás sobre su base (giro con perspectiva en el vertex shader, `caer` en `pluma.js`, y el mismo cálculo en `app.js` para los rótulos) y se apagan; al volver se alzan y luego se abren. En el primer arranque y durante el escaneo la cola sigue recogida a la vista.
- Lanzar son dos ruedas de cartas en 3D con CSS: Mapear (6) y Detectar (2, más Vulnerar desactivada). Una flecha al costado pasa de una a otra. Cada carta lleva título arriba y la descripción al centro, sin dibujo. Flechas, rueda del ratón, arrastre o clic en una carta de lado; la de enfrente se lanza. Las ruedas no dan la vuelta completa: en la primera carta el lado izquierdo queda vacío.
- Cada carta lleva arriba un personaje en trama de puntos (Iris, Ío, Cerbero, la Esfinge, Argos, Hefesto, Aquiles, Atenea, Heracles). Se generan con `python3 tramar.py cartas` (ImageMagick) desde las fotos de `frontend/imagenes_claude/Cards`; recorte, fondo y nivel de cada una están en ese archivo. Falta confirmar la licencia de las fotos antes de publicar.
- En la ficha, el raquis y las barbas de los puertos ya no se desplazan con el cursor; solo se iluminan.
- `pluma.js`: Three r160, dos draw calls. 4859 tiras instanciadas (barbas + raquis) cuya forma sale del vertex shader, y 43 ocelos por SDF. Iridiscencia: rampa cíclica cuya fase depende del ángulo entre la barba y una luz que deriva sola y sigue al cursor con retraso, más reflejo anisótropo.
- `app.js`: muelles propios (10 valores por pluma), composición por vista, 43 botones DOM sobre los ojos (picar, foco, flechas, Inicio/Fin), `/` para buscar, Esc para volver, flechas para cambiar de pluma en la ficha.
- Hashes: `#red`, `#equipo` (o `#equipo=192.168.1.10`), `#plan`, `#lanzar`, `#escaneo` (o `#escaneo=7` para sembrar segundos), `#vacio`.
- `prueba.mjs`: recorrido de interacción por CDP que también genera las capturas (`node prueba.mjs`).

## Riesgos honestos
- **Rendimiento.** Medido en Chromium headless con Vulkan sobre una RTX 5060 Ti: 61 fps a 1600x950 (tope de vsync). Con SwiftShader (software) baja a unos 20. Sin probar en WebKitGTK, WebView2, WKWebView ni en gráficas integradas. El bucle no se detiene nunca (la luz deriva): habría que pausarlo con la ventana oculta.
- **Legibilidad del abanico.** 6 en riesgo se leen al instante; los 31 cerrados no llevan nombre hasta pasar el cursor, enfocar, filtrar o buscar. Con 43 funciona; con 80 o más equipos las tres hileras no alcanzan y haría falta una cuarta o agrupar.
- **Rótulos.** Los nombres ya no se quedan fijos (ni en riesgo, ni al filtrar o buscar, ni desde el plan): solo con cursor o foco. Los rótulos de grupo esquivan el diagnóstico, lo urgente, el buscador y el panel del escaneo. En 1280x720 la esquina de "Lo que Argos vio" queda justa y muestra dos acciones en vez de tres; la pupila de la ficha hace scroll si hay mucho texto.
- **Kitsch.** El ojo en riesgo es deliberadamente gráfico (diana bermellón) sobre una pluma naturalista; es lo que da la lectura en dos segundos, pero es el punto donde el mundo puede sentirse disfraz.
- Los puertos en la ficha van girados 52 grados: se leen, pero peor que un texto horizontal, sobre todo con 24.

## Sin terminar
- Sin respaldo si no hay WebGL (pantalla sin abanico, aunque los botones y rótulos siguen).
- "Personalizado" solo pide el rango, no los puertos.
- La rueda de cartas no se probó en WebKitGTK (usa `preserve-3d`).
- La duración anterior es una sola cifra de demostración (12 s) para todos los escaneos; el caso "tarda más que la vez anterior" está escrito pero la simulación no llega a él.
- Los anillos agrupan servicios por familia con una regla mía (acceso remoto, web, archivos, correo, datos, impresión, medios, otros); no viene del backend.
- En `capturas/` quedaron dos archivos viejos que no pude borrar: `equipo=192.168.1.10-proxmox.png` y `equipo=192.168.1.77-pixel.png` (los vigentes son `equipo-24-puertos.png` y `equipo-sin-puertos.png`).

## En el frontend real (rama `ui/argos`)
- `frontend/index.html` es el esqueleto del prototipo. `frontend/src/argos/app.js` y `pluma.js` son el código aprobado, convertido en módulos y casi sin tocar; por eso siguen en JavaScript (sus tipos están en `argos.d.ts`).
- `frontend/src/argos/datos.ts` arma el modelo desde el backend: equipos en el orden del abanico, plan (`synthesis/plan.ts`), cartas de escaneo con su duración anterior real y los textos del diagnóstico.
- `frontend/src/main.ts` une todo con `scanState`. Cada vez que cambian los equipos (al cargar y al terminar un escaneo) se monta una vista nueva; el número de plumas ya no es fijo.
- Escaneo real: el backend no da avance. Mientras corre, la cola espera recogida con el reloj y "la vez anterior tardó". Al terminar, el abanico nuevo se revela por grupos (4,6 s) y se abren los ojos. Cancelar y los errores repliegan y vuelven a lo que había.
- Si una categoría necesita una herramienta que falta (Nuclei), su carta dice "Instalar" con el tamaño de la descarga.
- Sin WebGL, los ojos se dibujan como aros y todo lo demás sigue funcionando.
- Three se instala por npm (0.160.1, la misma versión del prototipo). Fuentes y cartas van dentro de `src/argos`, sin red.
- Prueba: `npm run dev:demogrande` y, en otra terminal, `node herramientas/prueba.mjs` (recorre la interfaz en Chromium y deja capturas).
- Las cartas se regeneran con `python3 herramientas/tramar.py` desde `frontend/imagenes_claude/Cards` (esas fotos no están en el repositorio: falta confirmar su licencia).

## Pendiente antes de pasar a main
- Probar en la ventana de Tauri en los tres sistemas (WebKitGTK, WebView2, WKWebView). En Linux la app arranca con `WEBKIT_DISABLE_COMPOSITING_MODE=1`, que puede aplanar la rueda de cartas (`preserve-3d`).
- Funciones del frontend anterior que Argos aún no ofrece: objetivo (IP o rango) en los escaneos que no son Personalizado, evasión de firewall en Dispositivos ocultos, Full pack y Personalizado, y los parámetros de Personalizado (protocolo, tipo TCP, ritmo, puertos). Hoy Personalizado usa TCP SYN, T4 y los 1000 puertos más comunes.
- Los resultados por categoría (lo que encontró solo el último escaneo de un tipo) ya no tienen pantalla propia: todo se lee en el abanico combinado.
- Más de unos 80 equipos: las tres hileras no alcanzan. Más de unos 300: hay que pasar los valores por textura.
- Licencia de las fotos de las cartas.
