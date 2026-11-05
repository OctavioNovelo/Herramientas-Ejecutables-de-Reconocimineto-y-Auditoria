# Dirección F — "Cianotipo" (segunda ronda)

El plano técnico de B, pero en **papel azul de cianotipo con tinta blanca**: la misma precisión
y la misma voz, sin el brillo del papel blanco. La carta se convierte en el **abanico** del logo.

## Qué toma de la primera ronda
- **De B:** el titular grande en minúsculas que dice el diagnóstico en una frase, las láminas
  en capas (cada capa se levanta al pasar el cursor e ilumina su descripción), el cajetín al
  pie y las hojas de especificación en Mapear/Detectar.
- **De A:** el inspector del host (mac, sistema, latencia, filtrados y tabla de puertos) y
  "Qué hacer ahora" a la derecha.
- **De D:** carta y despiece en la misma pantalla.

## Qué cambió por la revisión
- **Ya no es blanco.** Papel azul profundo; los estados usan las versiones claras de la pluma,
  la cresta y el coral para leerse bien.
- **El abanico resuelve los nombres:** cada host tiene su pluma y su etiqueta (IP y nombre) se
  escribe a lo largo de ella. Ninguna etiqueta se encima con otra, ni con 40 hosts.
- Buscador y filtros en el inicio y en Mapear/Detectar (mismo filtro en todas las vistas).
- El logo + hera es el botón de inicio; sin Resumen ni Penetrar.
- Fondo vivo: la cuadrícula de dibujo deriva muy despacio y las manchas de revelado respiran.
  Durante un escaneo, un barrido recorre el abanico.

## Paleta
| token | hex | uso |
|---|---|---|
| papel | `#0D2747` | lienzo (cianotipo) |
| hoja | `#10305A` | superficies |
| tinta | `#EEF5FF` | texto, líneas de dibujo, acción primaria |
| tinta-2 | `#B0C6E2` | texto secundario |
| pluma | `#4AE6C9` ● | seguro |
| cresta | `#F3C86D` ▲ | alerta |
| riesgo | `#FF8E76` ◆ | riesgo |

## Tipografía
Familjen Grotesk (voz en minúsculas y titulares) y Azeret Mono (cotas, IPs, cifras).
Escala 1.333 sobre 15 px.

## Verla
`npm run tauri:demo` (8 hosts), `npm run tauri:demogrande` (42 hosts), `npm run tauri dev` (real).
