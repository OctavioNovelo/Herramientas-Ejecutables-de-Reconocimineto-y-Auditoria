# Dirección B — "Lámina"

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

## Paleta
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

## Tipografía
- **Familjen Grotesk** (voz y titulares, 600, tracking negativo, minúsculas deliberadas) y
  **Azeret Mono** (cotas, IPs, especificaciones).
- Escala 1.333 sobre 15 px: 11.25 / 13 / 15 / 20 / 26.7 / 63.

## Ver sin backend
`npm run build && npx vite preview` y abrir `/?demo` (o `/?demo=vacio`).
