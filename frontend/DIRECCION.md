# Dirección E — "Relieve" (segunda ronda)

La carta de A llevada a 3D. La red es un terreno: el centro es este equipo, cada host es un
pico sobre su anillo de latencia y **la altura del pico es su exposición** (puertos abiertos y
hallazgos). Lo que hay que revisar primero sobresale.

## Qué toma de la primera ronda
- **De A:** la sección principal (diagnóstico + carta + "Qué hacer ahora") y el inspector del
  host con mac, sistema, latencia, filtrados y la tabla de puertos.
- **De B:** las láminas en capas (ahora cada capa se levanta al pasar el cursor e ilumina su
  descripción, y al revés) y las hojas de especificación en Mapear/Detectar.
- **De D:** la idea de usar ambas en la misma pantalla.

## Qué cambió por la revisión
- Etiquetas con IP **y nombre** del host, colocadas sin encimarse. Si no caben, queda el último
  octeto; los hosts en riesgo o alerta tienen prioridad para conservar la etiqueta completa.
- Sin la regla de puertos de A.
- Buscador y filtros (en riesgo / en alerta / seguros / con hallazgos) en el inicio y en
  Mapear/Detectar. Comparten el mismo filtro. `/` o `Ctrl+K` lo enfocan.
- El logo + HERA es el botón de inicio; ya no hay pestañas Resumen ni Penetrar.
- Fondo con dos luces del plumaje que derivan despacio, y el relieve gira solo en reposo
  (se detiene al interactuar o elegir un host; botón "Pausar giro").

## Controles del relieve
Arrastrar: girar e inclinar. Rueda: acercar. Doble clic o `0`: vista inicial.
Con teclado: flechas, `+` y `-`. Los picos se recorren con Tab y se abren con Enter.

## Paleta (sale del logo)
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

## Tipografía
Familjen Grotesk (voz e interfaz) y Martian Mono condensada (IPs, puertos, cifras).

## Verla
- `npm run tauri:demo`: 8 hosts. `npm run tauri:demogrande`: 42 hosts (para la carta y el buscador).
- `npm run tauri dev`: tus escaneos reales.
