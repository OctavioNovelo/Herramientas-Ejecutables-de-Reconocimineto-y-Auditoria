# Dirección G — "Índice" (segunda ronda)

Pensada para **redes grandes**, donde lo primero es encontrar un host. El buscador es la pieza
principal; a la izquierda, un índice de todos los hosts agrupado por estado; al centro, la
ficha del host elegido (o el plan, si no hay ninguno); a la derecha, una carta pequeña que
marca dónde caen los resultados de la búsqueda.

## Qué toma de la primera ronda
- **De A:** el inspector del host (mac, sistema, latencia, filtrados, tabla de puertos), la
  carta de contornos (aquí en pequeño, como mapa de ubicación) y "Qué hacer ahora".
- **De B:** las láminas en capas (cada capa se levanta al pasar el cursor e ilumina su
  descripción) y las hojas de especificación en Mapear/Detectar.
- **De D:** carta, ficha y despiece en la misma pantalla.

## Qué cambió por la revisión
- Buscador grande con filtros por estado y "con hallazgos". Busca por IP (o `.13` para el
  último octeto), nombre, MAC, sistema, puerto (`443` o `puerto:443`), servicio, producto o CVE.
  `/` o `Ctrl+K` lo enfocan; las flechas recorren el índice; Esc limpia.
- Los nombres nunca se pierden: viven en el índice. La carta pequeña solo rotula el host
  elegido o el que está bajo el cursor.
- El logo + HERA es el botón de inicio; sin Resumen ni Penetrar.
- Fondo con retícula de puntos que sigue un poco al cursor y deriva despacio.
- Superficie de pizarra (gris azulado), más luminosa que E y sin blanco.

## Paleta
| token | hex | uso |
|---|---|---|
| pizarra | `#161C23` | lienzo |
| panel | `#1B222B` | superficies |
| línea | `#2F3A47` | bordes |
| tinta | `#EDF1F5` | texto |
| pluma | `#32D9BA` ● | seguro, foco, acción primaria |
| cresta | `#E0B65A` ▲ | alerta |
| riesgo | `#F2735C` ◆ | riesgo |

## Tipografía
Onest (interfaz; muy legible en listas densas) y Martian Mono condensada (IPs, cifras).
Escala 1.2 sobre 14 px.

## Verla
`npm run tauri:demogrande` (42 hosts, donde más luce), `npm run tauri:demo` (8 hosts),
`npm run tauri dev` (real).
