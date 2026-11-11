# Aprendizajes de las propuestas de UI

Archivo de lo que dejó cada propuesta visual de HERA antes de elegir Argos. Las ramas y prototipos se borraron; aquí queda su dirección, paleta, tipografía y riesgos tal como se escribieron. La dirección vigente está en `docs/ui/ARGOS.md`.

## Ronda 1 a 3: ramas ui/a a ui/p (DIRECCION.md de cada rama)

---

### Rama `ui/a-carta` (c4a1c7f 2026-11-04)

### Dirección A — "Carta"

La red como un terreno que se inspecciona. Oscuro como hogar, pensado para un instrumento
de monitoreo. Nivel de ambición: **alto** (exploración directa de la red).

- **Pieza memorable:** la carta. Centro = este equipo; los anillos de contorno son bandas
  de latencia; cada host es un pin cuya forma y color dicen su estado. Se elige con ratón o
  teclado y se "desarma" en el inspector (sistema, puertos, servicios, hallazgos).
- **Movimiento:** los pins aparecen del centro hacia afuera al cargar; durante un escaneo,
  un barrido gira sobre la carta y el reloj de la barra cuenta. Nada más se anima.
- **Resultados de escaneo:** cada host es una fila con una regla de puertos logarítmica
  (1–65535); marcas llenas = abiertos, círculos = filtrados, rojo = con hallazgo.

#### Paleta
| token | hex | uso |
|---|---|---|
| fondo | `#161B21` | lienzo |
| panel | `#1B2128` | superficies |
| línea | `#2D3641` | bordes, contornos |
| tinta | `#E3E7EB` | texto, acción primaria |
| tinta-2 | `#9BA6B2` | texto secundario |
| seguro | `#5CC8B0` ● | estado |
| alerta | `#E8B64C` ▲ | estado |
| riesgo | `#F27B5E` ◆ | estado |

El único color que "trabaja" es el del estado; la acción primaria es tinta clara sobre fondo.

#### Tipografía
- **Onest** (texto de interfaz) y **Martian Mono** con eje de anchura al 75–85 %
  (lecturas: IPs, puertos, cifras, reloj, wordmark `hera`).
- Escala 1.25 sobre 14 px: 11.2 / 12.5 / 14 / 17.5 / 22 / 34.

#### Ver sin backend
`npm run build && npx vite preview` y abrir `/?demo` (o `/?demo=vacio` para el primer arranque).

---

### Rama `ui/b-lamina` (5f717c6 2026-11-04)

### Dirección B — "Lámina"

La red como un plano técnico. Claro, editorial, con la precisión de una lámina de despiece.
Nivel de ambición: **alto** (vista explotada de cada dispositivo).

- **Pieza memorable:** la vista explotada. El dispositivo elegido se separa en cinco capas
  isométricas — equipo, sistema, puertos, servicios, hallazgos — de lo físico a lo expuesto.
  Cada capa lleva una cota numerada que remite a su especificación (las cotas sí son una
  secuencia). Los puertos son bloques sobre su placa; el que tiene un hallazgo va en rojo.
- **Voz:** titular grande en minúsculas que dice el diagnóstico en una frase
  ("tu red está en riesgo.") y una bajada con lo que hay que hacer hoy y esta semana.
- **Cajetín:** el pie es el bloque de título de un plano (red, equipo, dispositivos,
  hallazgos, tiempo escaneando, fecha de revisión).
- **Movimiento:** al elegir un dispositivo las capas se separan desde la base (responde a
  una acción). Durante un escaneo, el contorno de las placas se "traza" en discontinuo.
- **Resultados de escaneo:** hojas de especificación por host, ordenadas de más a menos
  urgente, con tabla de puertos y hallazgos confirmados/posibles.

#### Paleta
| token | hex | uso |
|---|---|---|
| papel | `#E7EAED` | lienzo |
| hoja | `#F5F6F7` | superficies |
| tinta | `#18202A` | texto, líneas de dibujo, acción primaria |
| tinta-2 | `#4C5663` | texto secundario |
| línea | `#BFC6CE` | divisiones |
| seguro | `#17775F` ● | estado (AA sobre papel) |
| alerta | `#965A00` ▲ | estado |
| riesgo | `#C0381F` ◆ | estado |

#### Tipografía
- **Familjen Grotesk** (voz y titulares, 600, tracking negativo, minúsculas deliberadas) y
  **Azeret Mono** (cotas, IPs, especificaciones).
- Escala 1.333 sobre 15 px: 11.25 / 13 / 15 / 20 / 26.7 / 63.

#### Ver sin backend
`npm run build && npx vite preview` y abrir `/?demo` (o `/?demo=vacio`).

---

### Rama `ui/d-levantamiento` (0016193 2026-11-04)

### Dirección D — "Levantamiento"

Evolución de A (Carta) y B (Lámina). La red como un levantamiento topográfico: primero el
terreno (la carta de contornos de A) y, al elegir un dispositivo, su plano de despiece
(la vista explotada de B), en el mismo panel. Oscuro, como instrumento de monitoreo.

#### Qué toma de cada una
- **De A:** lienzo oscuro de instrumento, carta con anillos de latencia y pins con forma
  de estado, lecturas en Martian Mono condensada que cuentan hacia arriba, barrido durante
  el escaneo, resultados con regla de puertos logarítmica.
- **De B:** titular editorial en minúsculas que dice el diagnóstico en una frase, vista
  explotada en capas con cotas numeradas, cajetín al pie, Familjen Grotesk como voz.
- **Nuevo:**
  - La carta se aparta y deja sitio al despiece del pin elegido (un mismo componente que
    se transforma, en vez de un cajón aparte).
  - Durante un escaneo, el titular se convierte en el progreso: "levantando el plano de tu
    red." con un reloj grande.
  - Diseñada como app: ocupa la ventana sin scroll de página, cada zona hace su propio scroll,
    y en un mosaico estrecho (gestores en mosaico, media pantalla) el contenido fluye en una
    columna.

#### Paleta
| token | hex | uso |
|---|---|---|
| fondo | `#16181B` | lienzo (grafito neutro) |
| panel | `#1B1E22` | superficies |
| línea | `#31363D` | bordes, contornos |
| tinta | `#ECEEF0` | texto, acción primaria |
| tinta-2 | `#A3AAB2` | texto secundario |
| seguro | `#6DCBA6` ● | estado |
| alerta | `#E7B44C` ▲ | estado |
| riesgo | `#F2785B` ◆ | estado |

#### Tipografía
- **Familjen Grotesk** (voz, titulares, interfaz) y **Martian Mono** al 75–85 % de anchura
  (IPs, puertos, cifras, reloj).
- Escala 1.25 sobre 14 px: 11.2 / 12.5 / 14 / 17.5 / 22 / 34, más un display de 30–52 px.

#### Verla
- App nativa con datos de demostración: `npm run tauri:demo` (o `tauri:demovacio`).
- App nativa con tus escaneos reales: `npm run tauri dev`.

---

### Rama `ui/e-relieve` (1e3222a 2026-11-04)

### Dirección E — "Relieve" (segunda ronda)

La carta de A llevada a 3D. La red es un terreno: el centro es este equipo, cada host es un
pico sobre su anillo de latencia y **la altura del pico es su exposición** (puertos abiertos y
hallazgos). Lo que hay que revisar primero sobresale.

#### Qué toma de la primera ronda
- **De A:** la sección principal (diagnóstico + carta + "Qué hacer ahora") y el inspector del
  host con mac, sistema, latencia, filtrados y la tabla de puertos.
- **De B:** las láminas en capas (ahora cada capa se levanta al pasar el cursor e ilumina su
  descripción, y al revés) y las hojas de especificación en Mapear/Detectar.
- **De D:** la idea de usar ambas en la misma pantalla.

#### Qué cambió por la revisión
- Etiquetas con IP **y nombre** del host, colocadas sin encimarse. Si no caben, queda el último
  octeto; los hosts en riesgo o alerta tienen prioridad para conservar la etiqueta completa.
- Sin la regla de puertos de A.
- Buscador y filtros (en riesgo / en alerta / seguros / con hallazgos) en el inicio y en
  Mapear/Detectar. Comparten el mismo filtro. `/` o `Ctrl+K` lo enfocan.
- El logo + HERA es el botón de inicio; ya no hay pestañas Resumen ni Penetrar.
- Fondo con dos luces del plumaje que derivan despacio, y el relieve gira solo en reposo
  (se detiene al interactuar o elegir un host; botón "Pausar giro").

#### Controles del relieve
Arrastrar: girar e inclinar. Rueda: acercar. Doble clic o `0`: vista inicial.
Con teclado: flechas, `+` y `-`. Los picos se recorren con Tab y se abren con Enter.

#### Paleta (sale del logo)
| token | hex | uso |
|---|---|---|
| noche | `#0A1017` | lienzo |
| panel | `#0F1821` | superficies |
| línea | `#1F2E3D` | bordes |
| tinta | `#E6EEF5` | texto |
| pluma | `#32D9BA` ● | seguro, selección, acción |
| cresta | `#E0B65A` ▲ | alerta |
| riesgo | `#F2735C` ◆ | riesgo |
| cian / cobalto | `#1BA1BF` / `#0F6DBF` | anillos de latencia, fondo |

#### Tipografía
Familjen Grotesk (voz e interfaz) y Martian Mono condensada (IPs, puertos, cifras).

#### Verla
- `npm run tauri:demo`: 8 hosts. `npm run tauri:demogrande`: 42 hosts (para la carta y el buscador).
- `npm run tauri dev`: tus escaneos reales.

---

### Rama `ui/f-cianotipo` (d5f74b8 2026-11-04)

### Dirección F — "Cianotipo" (segunda ronda)

El plano técnico de B, pero en **papel azul de cianotipo con tinta blanca**: la misma precisión
y la misma voz, sin el brillo del papel blanco. La carta se convierte en el **abanico** del logo.

#### Qué toma de la primera ronda
- **De B:** el titular grande en minúsculas que dice el diagnóstico en una frase, las láminas
  en capas (cada capa se levanta al pasar el cursor e ilumina su descripción), el cajetín al
  pie y las hojas de especificación en Mapear/Detectar.
- **De A:** el inspector del host (mac, sistema, latencia, filtrados y tabla de puertos) y
  "Qué hacer ahora" a la derecha.
- **De D:** carta y despiece en la misma pantalla.

#### Qué cambió por la revisión
- **Ya no es blanco.** Papel azul profundo; los estados usan las versiones claras de la pluma,
  la cresta y el coral para leerse bien.
- **El abanico resuelve los nombres:** cada host tiene su pluma y su etiqueta (IP y nombre) se
  escribe a lo largo de ella. Ninguna etiqueta se encima con otra, ni con 40 hosts.
- Buscador y filtros en el inicio y en Mapear/Detectar (mismo filtro en todas las vistas).
- El logo + hera es el botón de inicio; sin Resumen ni Penetrar.
- Fondo vivo: la cuadrícula de dibujo deriva muy despacio y las manchas de revelado respiran.
  Durante un escaneo, un barrido recorre el abanico.

#### Paleta
| token | hex | uso |
|---|---|---|
| papel | `#0D2747` | lienzo (cianotipo) |
| hoja | `#10305A` | superficies |
| tinta | `#EEF5FF` | texto, líneas de dibujo, acción primaria |
| tinta-2 | `#B0C6E2` | texto secundario |
| pluma | `#4AE6C9` ● | seguro |
| cresta | `#F3C86D` ▲ | alerta |
| riesgo | `#FF8E76` ◆ | riesgo |

#### Tipografía
Familjen Grotesk (voz en minúsculas y titulares) y Azeret Mono (cotas, IPs, cifras).
Escala 1.333 sobre 15 px.

#### Verla
`npm run tauri:demo` (8 hosts), `npm run tauri:demogrande` (42 hosts), `npm run tauri dev` (real).

---

### Rama `ui/g-indice` (2463007 2026-11-04)

### Dirección G — "Índice" (segunda ronda)

Pensada para **redes grandes**, donde lo primero es encontrar un host. El buscador es la pieza
principal; a la izquierda, un índice de todos los hosts agrupado por estado; al centro, la
ficha del host elegido (o el plan, si no hay ninguno); a la derecha, una carta pequeña que
marca dónde caen los resultados de la búsqueda.

#### Qué toma de la primera ronda
- **De A:** el inspector del host (mac, sistema, latencia, filtrados, tabla de puertos), la
  carta de contornos (aquí en pequeño, como mapa de ubicación) y "Qué hacer ahora".
- **De B:** las láminas en capas (cada capa se levanta al pasar el cursor e ilumina su
  descripción) y las hojas de especificación en Mapear/Detectar.
- **De D:** carta, ficha y despiece en la misma pantalla.

#### Qué cambió por la revisión
- Buscador grande con filtros por estado y "con hallazgos". Busca por IP (o `.13` para el
  último octeto), nombre, MAC, sistema, puerto (`443` o `puerto:443`), servicio, producto o CVE.
  `/` o `Ctrl+K` lo enfocan; las flechas recorren el índice; Esc limpia.
- Los nombres nunca se pierden: viven en el índice. La carta pequeña solo rotula el host
  elegido o el que está bajo el cursor.
- El logo + HERA es el botón de inicio; sin Resumen ni Penetrar.
- Fondo con retícula de puntos que sigue un poco al cursor y deriva despacio.
- Superficie de pizarra (gris azulado), más luminosa que E y sin blanco.

#### Paleta
| token | hex | uso |
|---|---|---|
| pizarra | `#161C23` | lienzo |
| panel | `#1B222B` | superficies |
| línea | `#2F3A47` | bordes |
| tinta | `#EDF1F5` | texto |
| pluma | `#32D9BA` ● | seguro, foco, acción primaria |
| cresta | `#E0B65A` ▲ | alerta |
| riesgo | `#F2735C` ◆ | riesgo |

#### Tipografía
Onest (interfaz; muy legible en listas densas) y Martian Mono condensada (IPs, cifras).
Escala 1.2 sobre 14 px.

#### Verla
`npm run tauri:demogrande` (42 hosts, donde más luce), `npm run tauri:demo` (8 hosts),
`npm run tauri dev` (real).

---

### Rama `ui/h-senal` (8306c6a 2026-11-04)

### Dirección H — "Señal" (tercera ronda)

La base es **G** (la favorita): buscador grande arriba, índice de hosts a la izquierda. Al
centro, la red **como la ve el router**: la puerta de enlace emite ondas, cada dispositivo se
conecta a ella con una línea y se agrupa en un sector según su **tipo** (computadoras,
teléfonos, TV, cámaras...), con su ícono. Más lejos del router = más latencia (lo inalámbrico y
lo lejano responde más lento). A la derecha, el plan o la ficha con las **láminas de F**.

#### Respuesta a la segunda ronda
- **Sin lag:** la posición se calcula una vez por escaneo con d3-force (física que separa los
  nodos) y se dibuja como SVG estático. Solo se animan las ondas del router (CSS) y la línea del
  host elegido. E se descartó porque redibujaba miles de puntos en cada cuadro.
- **Realista para wifi:** una topología en estrella alrededor del router en vez del relieve 3D.
- **Láminas de F**, con los puertos en cuadrícula cuando son muchos (prueba el 192.168.1.10).
- Hojas de F/G en Mapear y Detectar, ahora con el ícono del tipo.

#### Tipo de dispositivo
`src/utils/tipos.ts` lo deduce del fabricante/nombre, los puertos y el tipo de sistema de Nmap.
Es una estimación para agrupar; el dato real sigue en la ficha. Íconos de Lucide (ISC).

#### Paleta
La de G: pizarra `#161C23`, panel `#1B222B`, pluma `#32D9BA` (seguro), cresta `#E0B65A`
(alerta), coral `#F2735C` (riesgo), cian `#1BA1BF` (ondas). Onest + Martian Mono.

#### Verla
`npm run tauri:demo` (9 hosts), `npm run tauri:demogrande` (43), `npm run tauri dev` (real).

---

### Rama `ui/i-maqueta` (3c6554c 2026-11-04)

### Dirección I — "Maqueta" (tercera ronda)

Las **láminas de F** (las definitivas) llevadas a toda la red: una **maqueta isométrica** con
una plataforma por tipo de dispositivo (como una placa del despiece) y una **torre** por
dispositivo. La altura de la torre es su **exposición** (puertos abiertos y hallazgos) y su cara
superior lleva el color del estado y el ícono del tipo. Al pasar el cursor la torre se levanta
y muestra IP y nombre, el mismo gesto que las capas del despiece.

#### Respuesta a la segunda ronda
- **Sin lag:** dibujo estático, armado una vez por escaneo. Solo se mueve la torre bajo el cursor.
- **Nada de 3D tipo lidar:** volúmenes isométricos limpios, el lenguaje de las láminas.
- Láminas de F en la ficha, con puertos en cuadrícula (prueba el 192.168.1.10).
- Buscador de G arriba; los dispositivos que no coinciden se apagan en la maqueta.
- Hojas de F/G en Mapear y Detectar, con el ícono del tipo.

#### Paleta
Tinta azul de noche con trazo blanco (el cianotipo de F, más profundo y menos saturado):
fondo `#0B1626`, panel `#0F1E33`, tinta `#EDF4FC`, pluma `#45E0C4` (seguro), cresta `#F0C46A`
(alerta), coral `#FF8A73` (riesgo). Familjen Grotesk en minúsculas + Azeret Mono.

#### Verla
`npm run tauri:demogrande` (43 hosts, donde más luce), `npm run tauri:demo`, `npm run tauri dev`.

---

### Rama `ui/j-tablero` (284398e 2026-11-04)

### Dirección J — "Tablero" (tercera ronda)

La base es **G** (la favorita): buscador grande arriba e índice de hosts a la izquierda. Al
centro, "Qué hacer ahora" se convierte en un **tablero de trabajo**: Hoy, Esta semana, Cuando
puedas y Hecho. Las tarjetas se arrastran entre columnas (o se mueven con su botón y su menú,
también con teclado) y el **avance se guarda en este equipo** entre escaneos. Si algo marcado
como hecho vuelve a aparecer en el escaneo siguiente, la tarjeta lo avisa ("volvió a aparecer").
La ficha del host, con las **láminas de F**, se abre como panel lateral sobre el tablero
(Esc o Cerrar para volver).

#### Por qué
La auditoría no termina al ver los hallazgos: termina al corregirlos. El tablero convierte el
resultado en una lista de trabajo con avance visible.

#### Notas
- El avance se guarda en `localStorage` (preferencia de esta persona en este equipo). Los
  resultados siguen viniendo solo de `utils/parser.py`.
- El plan sigue saliendo de `synthesis/plan.ts` (reglas en TypeScript). Para que el CLI tenga
  el mismo plan habría que moverlo a Python (pendiente).
- Sin lag: nada se anima por cuadro; el fondo avanza a saltos.

#### Paleta
Pavo real de noche: fondo `#0E1A1C`, panel `#132326`, tinta `#ECF3F1`, pluma `#3FE0BF`
(seguro, hecho), cresta `#E8BB5C` (alerta, esta semana), coral `#F2765E` (riesgo, hoy).
Onest + Azeret Mono. Fondo: patrón tenue de ocelos de pluma.

#### Verla
`npm run tauri:demo`, `npm run tauri:demogrande`, `npm run tauri dev` (real).

---

### Rama `ui/k-faro` (22ff753 2026-11-04)

### Dirección K — "Faro" (ronda final)

Es **H afinada**. Se queda todo lo que te gustó (buscador arriba, índice a la izquierda, la red
desde el router al centro, plan o ficha con las láminas de F a la derecha) y se pule:

- **Colores intercambiables.** Botón "Colores" en la barra: Abismo (por defecto), Grafito,
  Ocelo, Niebla (claro, no blanco) y Pizarra (la de H). Se recuerda en este equipo.
- **Zoom y arrastre** en el mapa (rueda, + y −, doble clic, 0 para encuadrar). Los nodos y los
  nombres conservan su tamaño, así que al acercarte aparecen los nombres que estaban ocultos.
- **Elegir un host desde el índice o el plan lo encuadra** en redes grandes; al cerrar la ficha
  vuelve a toda la red.
- **Línea de lectura** bajo el mapa: lo que tienes bajo el cursor (nombre, tipo, puertos,
  hallazgos, respuesta), sin abrir la ficha.
- **Índice y mapa conectados:** pasar por una fila resalta su nodo, y al revés.
- **Corona de puertos** alrededor del host elegido: una marca por puerto, en rojo los que
  tienen hallazgo.
- **Barras de respuesta** (como las del wifi) según la latencia. Miden lo rápido que contesta
  el equipo, no la intensidad de la señal.

Rendimiento: el mapa sigue siendo SVG estático; el zoom solo cambia el viewBox y solo se anima
cuando lo pides. Las ondas del router son lo único que se mueve solo.

Onest + Martian Mono. Verla: `npm run tauri:demogrande` (43 hosts) o `npm run tauri:demo`.

---

### Rama `ui/l-panorama` (d54bd7f 2026-11-04)

### Dirección L — "Panorama" (ronda final)

Las mismas piezas de H, pero **el mapa es la pantalla**. La red desde el router ocupa todo el
fondo y lo demás flota encima en dos paneles que se pliegan:

- **Izquierda:** buscador, filtros e índice de hosts (botón "Índice" o tecla `[`).
- **Derecha:** "Qué hacer ahora" o la ficha del host con las láminas de F (botón "Plan"/"Ficha"
  o tecla `]`).
- **Arriba, al centro:** el estado de la red en una cápsula.

El mapa sabe qué parte tapan los paneles: encaja la red en la zona libre, y al elegir un host lo
lleva al centro de esa zona. Si pliegas los dos paneles, la red crece a toda la ventana.

Comparte con K: zoom y arrastre (rueda, + y −, doble clic, 0), índice y mapa conectados, corona
de puertos, barras de respuesta y el botón "Colores". Por defecto usa **Ocelo** (ciruela y
turquesa del pavo real); las otras paletas están en el mismo botón.

Hanken Grotesk + JetBrains Mono (nuevas, versiones 5.2.8 de 2025).
Paneles opacos sin desenfoque: en WebKitGTK sin composición el blur repinta todo en cada cuadro.

Verla: `npm install` y luego `npm run tauri:demogrande` (43 hosts) o `npm run tauri:demo`.

---

### Rama `ui/m-ronda` (05a7246 2026-11-06)

### Dirección M — "Ronda" (sobre L "Panorama")

HERA hace su ronda de vigilancia por la red. La base es **Panorama tal como la dejó el equipo el
5 de noviembre** (Overpass, filtros en menú, plan por host con pestaña de lámina, estados sin
símbolos): el mapa a pantalla completa, índice y plan/ficha en paneles plegables. Ronda no agrega
pantallas; cambia cuatro cosas, todas con piezas que ya existían.

#### 1. Una sola corona, a tres escalas
La corona de puertos (una marca por puerto alrededor del host) ya era el emblema de cada
dispositivo. Ahora es también la de **la red entera**:

- **En el mapa**, sobre la pista fina de los sectores, una marca frente a cada dispositivo **en
  riesgo o en alerta** (los seguros no se marcan: con 31 de 43 seguros, marcarlos era ruido y
  duplicaba los halos). Dice en qué sector están los problemas aunque el mapa esté acercado. El
  grosor también dice el estado (riesgo el doble que alerta), no solo el color. Pasar el cursor
  por una marca o pulsarla es lo mismo que hacerlo sobre el host.
- **En la cápsula**, tres arcos proporcionales (riesgo, alerta, seguro) como emblema de la red.
- **En la ficha y en las hojas de Mapear/Detectar**, la corona de puertos del host.

Las tres salen de `src/utils/corona.ts` (antes la dibujaban `Senal.ts` y `ScanResults.ts` cada uno
por su cuenta).

#### 2. El escaneo es el reloj de la ronda
Mientras corre un escaneo, el mapa del escaneo anterior se apaga (sin rótulos, para que nada
choque con la carátula), los paneles se atenúan con el aviso "del escaneo anterior", y una
**manecilla recorre la corona**, avanzando una vez por segundo como un segundero, con el tiempo
transcurrido en grande bajo el router. La carátula mide minutos (5 si no hay referencia; marca
larga cada 5). Si ya hubo un escaneo del mismo tipo en este equipo, una marca dice **dónde terminó
el anterior** y la cápsula da la cifra ("el anterior tardó 3 min 34 s"). En el primer escaneo, bajo
el reloj se lee qué hace la ronda (sin decir en qué fase va: no se sabe). Mapa y cápsula usan el
mismo tic.

No es una barra de porcentaje: Nmap no reporta su avance y HERA no lo inventa. Es un reloj con una
referencia real. La duración se guarda en `localStorage` (`hera.duracion.<tipo>`) solo cuando el
escaneo termina bien; uno cancelado o con error no cuenta.

Al terminar un escaneo, la manecilla da **una última vuelta en 8 saltos (~0.9 s)** y cada parte del
mapa aparece cuando ella llega: la ronda termina enseñando lo que encontró. Al abrir la app no hay
revelado: el vistazo tiene que estar completo desde el primer cuadro. Respeta
`prefers-reduced-motion`.

#### 3. "Qué hacer ahora" como triaje
`synthesis/plan.ts` ahora junta el mismo hallazgo en varios equipos en **una** acción ("Corrige
CVE-2023-38545 en 3 dispositivos"); antes salía una vez por equipo.

- Arriba, una barra con cuántas acciones hay de cada prioridad (hazlo hoy / esta semana / cuando puedas).
- **La primera acción, abierta y en grande**, con sus pasos y los equipos a los que afecta.
- El resto en listas compactas por prioridad; cada una se abre al pulsarla.
- **Pasar el cursor (o el foco) por una acción enciende en el mapa los equipos a los que afecta** y
  apaga el resto: se ve de un vistazo si es un problema de un equipo o de media red.

El plan por host (pestañas "Qué hacer ahora" / "Lámina") se queda como lo dejó el equipo; la
cabecera de la ficha ahora lleva la corona del host.

#### 4. Primer arranque
Sin escaneos, los paneles no tienen nada que decir: se apartan, y al centro del anillo vacío
aparece qué hace HERA (descubre, prueba puertos, reconoce cada equipo), que solo observa, que pide
permiso de administrador y que tarda varios minutos. El primer escaneo ocupa toda la ventana con
el reloj.

#### Rendimiento (WebKitGTK sin composición)
Nada se anima por cuadro. El reloj repinta una vez por segundo; las ondas del router ya no laten
(la manecilla las reemplaza). El revelado son 8 repintados con `setTimeout`, solo al terminar un
escaneo. Sin transiciones en las marcas de la corona.

#### Otros cambios
- Tema Niebla: alerta `#7d5000`, seguro `#0a6a4b` y riesgo `#a32a1e` para pasar AA (≥ 4.5:1) sobre
  el panel y el fondo.
- Plurales en la cápsula ("1 medio") y "Escaneo completo" en lugar de "Full pack" en la cápsula.
- Por debajo de 1180 px el índice empieza plegado para que el mapa se lea.

#### Pendiente (no se tocó)
- Tres vocabularios para el estado: seguro/revisar/riesgo (leyenda), "En alerta" (índice) y
  hazlo hoy/esta semana (plan). Conviene unificarlo con el equipo.
- "Full pack" sigue en inglés en la pestaña de Mapear.
- En Ocelo, `--tinta-3` sobre `--panel-3` da 4.26:1.
- El plan sigue en TypeScript; el CLI no lo tiene (ver J).

#### Verla
`npm install` y luego `npm run tauri:demogrande` (43 hosts), `npm run tauri:demo` o
`npm run tauri:demovacio` (primer arranque). En el navegador: `npm run dev:demogrande`.

---

### Rama `ui/n-plano` (b2004bd 2026-11-06)

### Dirección N — "Plano"

Una reinvención del lenguaje visual, no de la arquitectura. Todo lo que el equipo fue validando
sigue: buscador e índice para redes grandes (G), la red desde el router agrupada por tipo (H),
las láminas en capas (F), el plan por host con su lámina (L), el reloj de la ronda (M). Lo que
cambia es cómo se ve y cómo se lee, tomado de las referencias del brief:

| referencia | qué toma Plano |
|---|---|
| terrain sculpting | fondo oscuro, un solo acento, el objeto como dibujo de líneas con lecturas numéricas pegadas |
| mechanical key switch | la ficha del equipo como una lámina de papel con el despiece, rótulos mono, "fig. 2" |
| maximilian kaspar | la retícula de 12 columnas se ve; la tipografía grande es el material |
| artemii lebedev | listas mono en columnas, un bloque claro sobre lo oscuro, la hora en vivo |

#### Sistema
- **Retícula de 12 columnas visible**, de arriba abajo. Todo se alinea a ella: la barra es una
  fila de rótulos por columna. Nada redondeado, sin sombras, sin desenfoque.
- **Monocromo + un acento que significa "atención"** (ámbar en Noche, óxido en Papel). Lo seguro
  es neutro: no hay verde. Riesgo y alerta comparten el acento y se distinguen por la **forma**
  (lleno / punteado) y por el texto, así que funciona sin distinguir colores.
- **Overpass** (la elección del equipo) para la voz, en grande y en minúsculas; **Overpass Mono**
  para todo lo que se lee como instrumento.
- Dos paletas: **Noche** (por defecto) y **Papel**. Las cinco de Panorama no encajan con un
  sistema de un solo acento; siguen en `temas.css` para las otras ramas.

#### Pantalla
- **Columnas 1–4, el relato.** El diagnóstico es la tipografía ("tu red está en riesgo."), una
  frase con a quién afecta, y las lecturas en una tabla mono. Debajo, dos pestañas:
  - *qué hacer ahora*: el plan como **libro de asientos numerados** (el número es el orden de
    urgencia; lleno = hoy, punteado = esta semana). El primero va abierto. Pasar por un asiento
    enciende en el mapa los equipos a los que afecta.
  - *equipos*: el índice con el buscador, como una lista de columnas (ip, nombre, respuesta,
    puertos). `/` o Ctrl+K abren esta pestaña y enfocan el buscador.
- **Columnas 5–12, el lienzo (fig. 1).** La estrella desde la puerta de enlace, dibujada en línea
  fina sobre un **relieve de exposición**: curvas de nivel de la superficie expuesta (puertos,
  puertos sensibles, hallazgos; `utils/relieve.ts`). Donde se concentra lo que pide atención, las
  curvas van en el acento y forman un cerro; cada equipo con pendientes lleva una **etiqueta
  numérica** (hallazgos + puertos sensibles), como las lecturas del terreno. Se calcula una vez
  por escaneo (suma de gaussianas + marching squares) y es SVG estático.
- **La hoja (fig. 2).** Al elegir un equipo, una hoja de papel claro se posa sobre las columnas
  9–12 con su plan o su lámina. Tiene su propia paleta: ficha, despiece y plan del host la heredan
  sin cambios.
- **Escaneo.** El diagnóstico se vuelve el reloj en tipografía gigante y en el mapa corre la
  manecilla de M, con la marca del escaneo anterior.
- **Primer arranque.** La frase invita a la primera ronda, con los tres pasos; el lienzo muestra
  la carátula vacía del instrumento.
- **Mapear y Detectar** hablan el mismo idioma: pestañas subrayadas, título grande, hojas planas
  separadas por líneas en lugar de tarjetas.

#### Disciplina del acento (tras la crítica)
El acento solo aparece donde hay que mirar: el nodo con pendientes, su marca en la corona, las
curvas altas del relieve, la lectura de la cima, el número del asiento urgente, la cifra de
críticos y el reloj. Enlaces, rótulos, "hoy" e IPs van en tinta. En el índice, el estado lleva un
glifo (lleno / punteado) además del color, porque riesgo y alerta comparten tono.

El relieve usa pocas curvas amplias, unidas y suavizadas (Chaikin), y **una sola lectura en la
cima** ("3 por revisar"), en lugar de una etiqueta por equipo. Con la hoja abierta, el equipo
elegido va al centro del medio lienzo libre con un acercamiento mínimo legible.

Bordes de controles (buscador, zoom, botones) en `--control`, ≥ 3:1. Tres tamaños de texto: 12
(mono), 15 (voz) y la frase grande.

#### Rendimiento (WebKitGTK sin composición)
Todo es estático. El reloj de la barra y el de la ronda repintan una vez por segundo; el relieve
se calcula al llegar un escaneo; el revelado son 8 repintados al terminar un escaneo.

#### Pendiente
- Detectar todavía usa las teclas de puertos con caja y los sellos de estado rellenos; se aplanó,
  pero no se rehízo en el lenguaje de lámina.
- El zoom anima 260 ms al pedirlo (botones, elegir un equipo), como en K y L. Si en WebKitGTK se
  siente, basta con saltar sin animar (`irA(..., false)` en Senal.ts).
- "tiempo total escaneando" suma todos los escaneos combinados (así lo calcula parser.py); en
  Detectar se ve la duración de esa categoría. Conviene decidir cuál mostrar.

#### Verla
`npm run tauri:demogrande`, `npm run tauri:demo`, `npm run tauri:demovacio`.

---

### Rama `ui/o-anatomia` (13987f8 2026-11-06)

### Dirección O — "Anatomía"

Sale de lo que funcionó en N "Plano" (retícula visible, monocromo con un solo acento de atención,
el diagnóstico en tipografía grande, el relieve de exposición) y de lo que no: la ficha como hoja
de papel claro sobre el instrumento oscuro no encajaba, y el menú de colores no se podía usar
(el mapa lo tapaba y se tragaba los clics; corregido: la barra va por encima).

#### La idea
- **El mapa es toda la pantalla**, como en Panorama (la elección del equipo). El texto va en las
  esquinas, como en las referencias: el diagnóstico arriba a la izquierda, las lecturas abajo a la
  izquierda; como la red es un círculo, esas esquinas están vacías y el mapa no les cede espacio.
  El relieve corre por debajo del texto.
- **A la derecha, una columna de listas mono** (3 de las 12 columnas): el plan como asientos
  numerados o el índice de equipos con el buscador.
- **No hay hoja aparte. Al elegir un equipo, su anatomía se arma sobre su propio nodo**: las
  cinco capas de la lámina (equipo, sistema, puertos, servicios, hallazgos) se levantan desde el
  nodo sobre un eje punteado, y de cada una sale una línea guía a un rótulo con su número, su
  nombre y su valor. Es el despiece del key switch, pero dentro del instrumento y en su mismo
  material. La red se apaga alrededor y la columna pasa a ser la ficha del equipo (qué hacer;
  puertos y hallazgos). `components/Anatomia.ts` lo dibuja en píxeles de pantalla, así que los
  rótulos se leen con cualquier zoom, y sigue al nodo cuando el mapa se mueve.
- **Colores que funcionan**: Noche (ámbar), Acero (gris azulado, coral) y Papel (claro). Un solo
  acento por paleta, siempre con el mismo significado: atención.

#### Segunda vuelta (comentarios del cliente)
- **Sin titulares gigantes.** El estado es una lectura compacta en la esquina: un glifo con la
  forma del estado, la palabra ("en riesgo") y tres cifras (críticos o altos, hallazgos, equipos).
  La fecha del último escaneo va al pie. Escaneo y primer arranque, igual de contenidos.
- **Menos texto.** Fuera la frase de bajada, la tabla de seis lecturas y el motivo en el plan de la
  red (sigue en la ficha de cada equipo). El primer asiento abierto muestra solo sus pasos.
- **La lámina queda en medio.** Al elegir un equipo, el mapa se acerca (mínimo 1.15 px por unidad)
  y centra el dibujo completo (las cinco capas y el nodo) en la zona libre, no el nodo.

#### Tercera vuelta
- **Sin curvas de nivel.** El círculo queda limpio: la estrella, las bandas de latencia y la
  corona. Fuera también la etiqueta de la cima. (`utils/relieve.ts` queda sin uso.)
- **Centrado medido.** Cuando el acercamiento termina de verdad (`Senal.alTerminarMovimiento`, no un tiempo fijo: en WebKitGTK la animación tarda más) se mide dónde quedó de verdad el dibujo (capas,
  nodo y rótulos) y se corrige la diferencia con `Senal.desplazar()`, sin el límite de encuadre.
  Así queda en medio aunque WebKitGTK calcule distinto o el límite frene el movimiento.

#### Movimiento
Al elegir un equipo, las capas suben una tras otra desde el nodo (≈0.7 s, responde a la acción).
El escaneo usa el reloj de la ronda (M) y el revelado al terminar. En reposo no se mueve nada.

#### Verla
`npm run tauri:demogrande`, `npm run tauri:demo`, `npm run tauri:demovacio`.

---

### Rama `ui/p-maqueta` (f44cb27 2026-11-06)

### Dirección P — "Maqueta"

La red como un objeto físico en 3D (WebGL, Three.js), sobre la base de O "Anatomía" (estado
compacto en la esquina, columna de listas a la derecha, sin titulares gigantes, colores que
funcionan). Referencias: terrain sculpting (el objeto sobre una mesa oscura, con lecturas) y
mechanical key switch anatomy (el despiece en 3D que se gira arrastrando).

#### Qué se ve
- **La maqueta.** El router al centro; cada equipo es una ficha con el ícono de su tipo, en el
  sector de su tipo y más lejos cuanto más tarda en responder (la misma disposición de H, ahora en
  `utils/disposicion.ts`, compartida con el mapa 2D). Los equipos que piden atención llevan un
  **poste en el acento tan alto como lo que tienen pendiente**: con un rombo, riesgo; con un aro
  hueco, alerta. En el borde de la mesa, la corona con una marca por equipo en riesgo o alerta.
  Se gira arrastrando, rueda para acercar, doble clic para encuadrar.
- **La anatomía en 3D.** Al elegir un equipo la cámara vuela hacia él y sus cinco capas se
  separan sobre la ficha: placas de vidrio fino con aristas nítidas, los puertos como cubos (en el
  acento los que tienen hallazgo) y la placa de hallazgos en el acento. Rótulos HTML nítidos con
  número, capa y valor, y líneas guía. Se puede girar alrededor del despiece.
- **El escaneo.** Un barrido de luz recorre la mesa a la velocidad del reloj de la ronda, con la
  marca de dónde terminó el anterior. Al terminar, cada ficha sale de la mesa cuando el barrido
  pasa por su ángulo.
- Si el equipo no tiene WebGL 2, se usa el mapa 2D de O (Senal.ts) con su anatomía.

#### Rendimiento, medido
La regla "nada se anima" de las rondas anteriores venía del mapa en SVG, que WebKitGTK sin
composición repinta por CPU. WebGL dibuja en la GPU. Medido en WebKitGTK 2.54 (MiniBrowser) con la
configuración exacta de la app (`WEBKIT_DISABLE_COMPOSITING_MODE=1`,
`WEBKIT_DISABLE_DMABUF_RENDERER=1`), a 1920×1080, eligiendo cuatro equipos seguidos (vuelo de
cámara + anatomía) y luego escaneando:

| equipo | vuelos y anatomía | escaneo (barrido) |
|---|---|---|
| Ryzen 9 9900X + RTX 5060 Ti | 63–65 fps, peor cuadro 30 ms | 64 fps |
| mismo equipo, render por software (sin GPU, llvmpipe) | 51–59 fps, peor cuadro 38 ms | 54 fps |

En reposo no dibuja nada: solo hay cuadros mientras algo se mueve (cámara, animaciones,
escaneo). Si va lento de forma sostenida, baja la resolución. No se probó en WebView2 (Windows)
ni WKWebView (macOS), ni en equipos viejos reales.

Lo que se corrigió midiendo (para quien toque `components/Maqueta.ts`):
- **Un solo bucle de dibujo.** Los controles de órbita avisan "cambié" dentro del cuadro; si eso
  pedía otro cuadro además del normal, se abrían bucles en paralelo que se multiplicaban (miles de
  dibujos por segundo y congelones de más de 1 s). `cuadro()` solo pide el siguiente si no hay uno.
- **Rótulos fuera del cuadro mientras la cámara se mueve**: se ocultan y se colocan una vez al
  detenerse. El tamaño del lienzo se mide al cambiar, no por rótulo (evita recalcular el diseño).
- **La anatomía se arma una vez** y se reutiliza; los materiales se compilan al arrancar.
- **El ajuste de calidad** solo cuenta cuadros seguidos (antes contaba los ratos de reposo como
  lentitud y redimensionaba a mitad de uso).
- **El lienzo 3D termina donde empieza la columna**, para no repintar la columna en cada cuadro.

#### Dependencias
`three@0.160.0` (MIT), versión fija. `npm audit` reporta dos avisos que ya estaban (vite 8.2.x y
source-map-js, herramientas de desarrollo); no vienen de three. Quedan para la auditoría de
seguridad previa al lanzamiento que pide README_FRONTEND.md.

#### Verla
`npm install` y luego `npm run tauri:demogrande`, `npm run tauri:demo` o `npm run tauri:demovacio`.

---

## Ronda final: prototipos fuera del repo (propuestas-ui-ronda2)

### Encargo común

### Encargo común: prototipo de dirección visual para HERA

Eres el director de diseño y el constructor de UNA dirección visual para HERA. Otros dos agentes construyen otras dos direcciones en paralelo; no las mires ni toques sus carpetas. El dueño elegirá entre las tres.

#### Producto (hechos, no se inventan)
Lee primero: `/home/johnny_silverhand/Documents/GitHub/HERA/Herramientas-Ejecutables-de-Reconocimineto-y-Auditoria/PRODUCT.md` y `DESIGN_BRIEF.md` en la misma carpeta.
Datos de demostración reales (43 equipos, con puertos, servicios, hallazgos, CVE): `/home/johnny_silverhand/Documents/GitHub/HERA/hera-m/frontend/src/api/demoData.ts`. Usa esos equipos y hallazgos; pásalos a JS plano dentro de tu prototipo. Reglas del plan "Qué hacer ahora": `/home/johnny_silverhand/Documents/GitHub/HERA/hera-m/frontend/src/synthesis/plan.ts`.
Logo: `/home/johnny_silverhand/Documents/GitHub/HERA/Herramientas-Ejecutables-de-Reconocimineto-y-Auditoria/frontend/src/assets/hera-logo.png` (cópialo a tu carpeta). El logo con el nombre HERA es el botón de inicio.

#### Por qué existe esta ronda
El dueño rechazó la propuesta anterior con la palabra "terrible". Sus motivos, textuales: "es lo mismo de siempre", "se ve plana y sin vida", "la estructura de la app" (barra superior + panel izquierdo de índice + mapa radial de nodos + panel derecho de plan). Declaró: nada es sagrado salvo logo, nombre y funciones; ambición visual SIN LÍMITE (WebGL, 3D, sombreado, movimiento continuo). Mira la propuesta rechazada para NO parecerte a ella: `/tmp/claude-1000/-home-johnny-silverhand-Documents-GitHub-HERA-Herramientas-Ejecutables-de-Reconocimineto-y-Auditoria-frontend/b6d6755c-dcc5-4ac8-a0d1-a9088685f82b/scratchpad/shots/q-red.png`.

Rechazos históricos del dueño que siguen vigentes: verde neón sobre negro y estética hacker; 3D tipo nube de puntos lidar; giros trabados o con lag; fondos blancos que lastiman; líneas decorativas sin significado; titulares gigantes; mucho texto; todo lo que huele a plantilla de IA (tarjetas redondeadas idénticas con sombra gris, rótulos en MAYÚSCULAS espaciadas, marcadores 01/02/03 sin secuencia, fade-and-slide-up en cada cosa, puntos medios entre metadatos, una palabra del titular acentuada, flecha al final de los botones). Cero emojis. Todo en español, tuteo, frases cortas.
Le gustó en rondas pasadas: picar un equipo y que salga su información; la lámina en capas que se levanta al pasar el cursor; que el fondo tenga dinamismo.

#### Qué debe demostrar el prototipo (todas, funcionando, no dibujadas)
1. Primera mirada: en dos segundos se entiende qué tan segura está la red (en riesgo, 6 equipos en riesgo, 6 en alerta, 31 sin pendientes, 43 equipos) y qué es lo más urgente.
2. Recorrer la red de 43 equipos y encontrar uno (búsqueda o filtro por estado).
3. Elegir un equipo: se desarma e inspecciona (equipo, sistema, puertos, servicios, hallazgos con su corrección). Este es el momento firma.
4. Plan "Qué hacer ahora": acciones por urgencia (hoy, esta semana, cuando puedas); al pasar por una acción se señalan sus equipos. Lugar de primera clase, no un cajón.
5. Lanzar un escaneo: Mapear (escaneo rápido, dispositivos ocultos, auditoría admin, identificación, full pack, personalizado) y Detectar (vulnerabilidades, seguridad TLS). "Vulnerar" aparece como "pronto", desactivado.
6. Escaneo en curso y cancelación: es el momento orquestado. El backend NO da porcentaje: solo sabes el tiempo transcurrido y cuánto tardó la vez anterior. Simula un escaneo de unos 12 segundos que termina y revela el resultado; "Cancelar escaneo" siempre a la vista.
7. Primer arranque, sin datos.
El estado nunca depende solo del color (forma o texto además). Teclado utilizable, foco visible, `prefers-reduced-motion` respetado, contraste AA.

#### Entregable
- Una carpeta autocontenida (la tuya, indicada en tu mensaje) con `index.html` que abre con doble clic desde `file://` en Chromium SIN flags ni servidor: nada de módulos ES importados por URL remota, nada de CDN. Copia junto al HTML lo que uses.
  - Three.js: `/home/johnny_silverhand/Documents/GitHub/HERA/hera-m/frontend/node_modules/three/build/` (usa un build que cargue con `<script>` clásico o inclúyelo en un bundle; los módulos ES con `import` desde file:// fallan en Chromium, verifica).
  - Iconos lucide (UMD): `.../hera-m/frontend/node_modules/lucide/dist/umd/lucide.min.js`.
  - Fuentes: elige con intención para TU mundo. Puedes instalar paquetes `@fontsource/*` o `@fontsource-variable/*` con `npm install` DENTRO de tu carpeta y copiar los .woff2; también puedes instalar gsap, pixi.js u otra librería ahí. No instales nada fuera de tu carpeta.
- Tamaño de referencia de la ventana: 1600x950; debe aguantar 1280x720.
- Estados enlazables por hash para poder capturarlos: `#red`, `#equipo`, `#plan`, `#lanzar`, `#escaneo`, `#vacio` (además de la interacción real).
- `NOTAS.md` en tu carpeta, breve: tesis en una frase, paleta con hex, tipografías y escala, qué es la firma, riesgos honestos (rendimiento, legibilidad), qué no terminaste.

#### Cómo trabajar
- Antes de escribir código carga y sigue estas skills con la herramienta Skill: `impeccable:impeccable` (luego lee su `reference/craft-floor.md` y `reference/mode-persuade.md`; NO corras `concept-seed`, la dirección ya está decidida y es la tuya; NO escribas PRODUCT.md ni DESIGN.md), `frontend-design:frontend-design`, `make-interfaces-feel-better`, y las de tu técnica (por ejemplo `threejs-webgl:threejs-webgl`, `pixijs-2d:pixijs-2d`, `gsap-skills:gsap-core`, `gsap-skills:gsap-timeline`, `motion`, `accessibility`).
- Construye la dirección asignada con compromiso total, no una versión prudente. Cada átomo (botones, campos, listas, navegación) se rehace en el vocabulario de tu mundo; un componente genérico dentro del mundo es una falla.
- Mira lo que construyes. Captura con Chromium en modo headless y abre las imágenes con Read. Comando que funciona aquí (el `timeout` es obligatorio, sin él se cuelga):
  `timeout 40 chromium --headless --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1600,950 --virtual-time-budget=6000 --screenshot=SALIDA.png "file://RUTA/index.html#red"`
  Si WebGL no pinta con eso, prueba las herramientas de Playwright (cárgalas con ToolSearch) o `--disable-gpu`. Corrige lo que veas (solapes, texto cortado, vacío muerto, contraste) en lotes; al menos dos rondas de mirar y corregir. Guarda las capturas finales de los seis estados en `capturas/` dentro de tu carpeta.
- No toques el repositorio de HERA ni ningún archivo fuera de tu carpeta. No hagas commits.
- Tu respuesta final: ruta del index.html, lista de capturas, y tres líneas de riesgos honestos. Nada más.

---

### Prototipo `rack` (NOTAS.md)

### HERA Rack: notas

**Tesis.** La red es un mueble de equipos: cada equipo es un módulo atornillado, cada puerto abierto es un conector con su luz, y el diagnóstico es la pantalla del propio mueble.

#### Cómo está hecho
- Three.js r160 (build clásico, `lib/three.min.js`), materiales físicos, sombras PCF y mapa de entorno procedural. Conectores, tapones, LED y halos son mallas instanciadas.
- Profundidad: campo de 46 grados con el punto de fuga arriba a la izquierda, visera que da sombra, mejillas y zócalo salientes, tiras y asas con relieve, módulos en riesgo 14 unidades afuera. El mueble se ve al 92 % para dejar aire de sala alrededor.
- Cámara de un punto de fuga desplazado (sin rotación, solo se traslada y se acerca): los frentes siguen siendo rectángulos, así la serigrafía queda nítida y la tinta DOM (pantalla, hoja, rótulos del despiece) se ancla exacta sobre la pieza 3D. El DOM solo pone tinta y botones transparentes para teclado y foco; la materia es toda 3D.
- Archivos: `data.js` (43 equipos y reglas del plan), `core.js` (cámara, resortes, anclas, materiales), `rack.js` (mueble), `detalle.js` (despiece), `escaneo.js`, `ui.js`. `prueba.js` solo corre con `?prueba` y deja el resultado de los flujos en la consola.

#### Paleta
- Chasis azul petróleo en pintura en polvo `#1d6272` (costados `#144550`, puerta `#185360`), estructura grafito `#23282c`, cabecera aluminio anodizado `#4b545b`, tiras de bahía aluminio cepillado `#c4c9cc`.
- Serigrafía `#efe9da`; la palabra de estado va sobre inserto oscuro `#0a1215`. Pantalla: vidrio `#050c11`, caracteres `#dff3f0`.
- Estado: riesgo `#ff5a3c` (triángulo, etiqueta colgante `#a63416`, módulo saliente), alerta `#f5b83d` (rombo, cinta ámbar), LED de enlace `#c9f7e6`, baliza de localización `#58a8ff`.
- Papel de la orden `#d9d3bf`, tinta `#1b2422`.

#### Tipografía
- Barlow Condensed (serigrafía, rótulos, pantalla): 25 estado, 16 nombre de módulo, 14.5 bahía, 12.5 leyendas, 11 mínimos.
- Barlow Semi Condensed (texto de la orden de trabajo): 13.5 tarea, 12 detalle.
- Spline Sans Mono (IP, MAC, puertos, reloj): 10.5 en módulo, 30 reloj.

#### Firma
Elegir un módulo: sale 170 unidades sobre sus rieles, la cámara se pone enfrente y las placas bajan en despiece vertical con rótulos de rotuladora (chasis, equipo, placa de sistema, placa de puertos, tarjetas de servicio, hallazgos con su corrección). Pasar el cursor o el foco levanta la capa. Los módulos de la parte baja se despiezan hacia arriba, porque abajo está el piso.

#### Estados por hash
`#red`, `#equipo` (o `#equipo=192.168.1.10`), `#plan`, `#lanzar`, `#escaneo` (corre en vivo 12 s; `#escaneo=6.3` lo fija en ese segundo para capturar), `#vacio`.

#### Riesgos honestos
- Rendimiento sin medir en equipo real: las capturas son con SwiftShader. Son unas 200 llamadas de dibujo y un mapa de sombras de 4096 que solo se recalcula cuando algo se mueve; falta probar los 60 fps en WebKitGTK.
- Legibilidad: a 1280x720 el nombre queda en unos 12 px. Con seis conectores o menos el número de puerto va a 11 px; con más (y en las dos filas del servidor de 24 puertos) baja a 8 px o desaparece y solo se lee al abrir el módulo. Un módulo en riesgo tapa unos píxeles del de abajo con su saliente y su etiqueta. Las etiquetas ámbar de puerto sensible son pequeñas; el estado se lee por testigo, palabra y saliente.
- La textura del frente es 2x: en el despiece (aumento de 2.3) el nombre del chasis se ve algo suave.
- La hoja y la pantalla son tinta DOM sobre malla: no reciben sombra ni brillo de la escena.

#### Sin terminar
- Rieles poco visibles: quedan detrás del módulo salvo durante el movimiento.
- "Personalizado" no abre su formulario de rango y puertos; solo se elige y se lanza.
- Los grupos de radio (selector, pulsadores) se recorren con Tab, sin flechas.
- El escaneo no tiene rama visible para "tarda más que la vez anterior" (la simulación siempre termina en 12 s).
- No se ejecutó el lanzador de contexto de impeccable para no escribir en el repositorio.

---

### Prototipo `puente` (NOTAS.md)

### Puente: un medidor por equipo

**Tesis.** HERA es el puente de medidores de una mesa de grabación: cada equipo es un VU idéntico y la aguja dice cuánto está expuesto; se lee barriendo la fila, sin abrir nada.

#### Paleta
| Uso | Hex |
|---|---|
| Sala en penumbra | `#0f0c0a` |
| Nogal del bastidor (veta procedural) | `#3c2416` |
| Acero de biseles y mandos | `#8d9296` / `#2b2e31` |
| Cara de marfil con luz interior | `#fff7d9` a `#cbb685` |
| Marfil de texto / secundario | `#eadfc4` / `#b9ab8c` |
| Tinta (arcos, agujas, texto en papel) | `#17130f` |
| Rojo, solo más allá del cero | `#c8281c` |
| Ámbar de lámpara (testigos, foco) | `#f2a52e` |
| Papel de la hoja / cinta de las tiras | `#cdc0a0` / `#d2c6a6` |

El rojo aparece solo donde significa "más allá del cero": el arco, el testigo triangular y la marca de riesgo. Es el mismo valor en todos.

#### Tipografía
- **Barlow Condensed** (500 a 700): numerales de escala, rótulos, cifras. 12, 13, 15, 22 y 34 px.
- **Barlow Semi Condensed** (400, 600): texto corrido, 13 a 15 px.
- **Patrick Hand**: rotulación a mano en las tiras de canal (11.5 a 14 px) y en las tareas de la hoja (17 a 20 px).
Incrustadas en base64 en `fuentes.css` para que carguen desde `file://`.

#### Estado sin depender del color
Posición de la aguja (reposo, media escala, arco rojo), forma del testigo (anillo, rombo, triángulo), luz de la cara (media luz, encendida, encendida con halo) y texto en la etiqueta accesible de cada medidor.

#### La firma
Elegir un medidor: la cara sale de su sitio, crece y el mecanismo se separa en cinco capas con pestaña: caja (equipo), bobina (sistema), escala (una marca por puerto; las que tienen hallazgo caen en el arco rojo), aguja (servicios) y zona roja (hallazgos con su corrección). Pasar el cursor o el foco por una capa o por su rótulo la separa.

#### Cómo está hecho
Canvas 2D sin librerías. Cara y cristal se hornean una vez por tamaño; por cuadro solo se repinta la aguja de los medidores que se mueven. Balística de segundo orden (wn 16 rad/s, zeta 0.8: unos 300 ms y 1.5 % de sobrepaso) a paso fijo de 1/240 s. La sombra de la aguja es un trazo desplazado, sin blur por cuadro. El despiece son cinco canvas en CSS 3D. `datos.js` se genera del `demoData.ts` real con `herramientas/datos.cjs`; las cifras 43, 6/6/31 y 5/4/1 se comprueban con `console.assert`.

Hashes: `#red`, `#equipo` (o `#equipo=192.168.1.10`), `#plan`, `#lanzar`, `#escaneo` (o `#escaneo=5` para entrar a los 5 s), `#vacio`.

#### Riesgos honestos
- **Rendimiento sin medir.** No pude medir fps: Playwright no tiene navegador aquí y el headless no da cuadros reales. Nada probado en WebKitGTK; el despiece usa CSS 3D con `drop-shadow`, que ahí puede salir caro.
- **Legibilidad a 1280x720.** Las tiras caben en dos líneas y los nombres largos se cortan hasta pasar el cursor o el foco; riesgo y alerta se distinguen por aguja, forma y halo, pero el rombo y el triángulo miden unos 8 px.
- **Despiece.** La bobina queda medio tapada por la escala y la caja; las capas son pequeñas frente a la ficha de texto.
- **La hoja es un área clara grande.** Está entonada y viñeteada, pero es lo más luminoso de la pantalla.

#### Sin terminar
- Animación de apertura y cierre del despiece y la balística en movimiento: escritas, no vistas en vivo (solo capturas fijas y `herramientas/prueba-flujo.html`, que comprueba escanear, cancelar, terminar, vacío, búsqueda y abrir un equipo).
- La perilla gira con clic, flechas o la carta; no se arrastra.
- "Personalizado" muestra el campo de objetivo y puertos, pero no lo valida.
- El escaneo simulado devuelve siempre los mismos 43 equipos.
- Sin anterior/siguiente dentro del despiece.
