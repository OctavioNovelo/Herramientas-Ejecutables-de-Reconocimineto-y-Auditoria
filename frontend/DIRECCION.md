# Dirección D — "Levantamiento"

Evolución de A (Carta) y B (Lámina). La red como un levantamiento topográfico: primero el
terreno (la carta de contornos de A) y, al elegir un dispositivo, su plano de despiece
(la vista explotada de B), en el mismo panel. Oscuro, como instrumento de monitoreo.

## Qué toma de cada una
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

## Paleta
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

## Tipografía
- **Familjen Grotesk** (voz, titulares, interfaz) y **Martian Mono** al 75–85 % de anchura
  (IPs, puertos, cifras, reloj).
- Escala 1.25 sobre 14 px: 11.2 / 12.5 / 14 / 17.5 / 22 / 34, más un display de 30–52 px.

## Verla
- App nativa con datos de demostración: `npm run tauri:demo` (o `tauri:demovacio`).
- App nativa con tus escaneos reales: `npm run tauri dev`.
