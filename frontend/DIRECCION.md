# Dirección A — "Carta"

La red como un terreno que se inspecciona. Oscuro como hogar, pensado para un instrumento
de monitoreo. Nivel de ambición: **alto** (exploración directa de la red).

- **Pieza memorable:** la carta. Centro = este equipo; los anillos de contorno son bandas
  de latencia; cada host es un pin cuya forma y color dicen su estado. Se elige con ratón o
  teclado y se "desarma" en el inspector (sistema, puertos, servicios, hallazgos).
- **Movimiento:** los pins aparecen del centro hacia afuera al cargar; durante un escaneo,
  un barrido gira sobre la carta y el reloj de la barra cuenta. Nada más se anima.
- **Resultados de escaneo:** cada host es una fila con una regla de puertos logarítmica
  (1–65535); marcas llenas = abiertos, círculos = filtrados, rojo = con hallazgo.

## Paleta
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

## Tipografía
- **Onest** (texto de interfaz) y **Martian Mono** con eje de anchura al 75–85 %
  (lecturas: IPs, puertos, cifras, reloj, wordmark `hera`).
- Escala 1.25 sobre 14 px: 11.2 / 12.5 / 14 / 17.5 / 22 / 34.

## Ver sin backend
`npm run build && npx vite preview` y abrir `/?demo` (o `/?demo=vacio` para el primer arranque).
