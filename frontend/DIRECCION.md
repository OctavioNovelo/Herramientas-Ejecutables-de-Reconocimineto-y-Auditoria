# Dirección J — "Tablero" (tercera ronda)

La base es **G** (la favorita): buscador grande arriba e índice de hosts a la izquierda. Al
centro, "Qué hacer ahora" se convierte en un **tablero de trabajo**: Hoy, Esta semana, Cuando
puedas y Hecho. Las tarjetas se arrastran entre columnas (o se mueven con su botón y su menú,
también con teclado) y el **avance se guarda en este equipo** entre escaneos. Si algo marcado
como hecho vuelve a aparecer en el escaneo siguiente, la tarjeta lo avisa ("volvió a aparecer").
La ficha del host, con las **láminas de F**, se abre como panel lateral sobre el tablero
(Esc o Cerrar para volver).

## Por qué
La auditoría no termina al ver los hallazgos: termina al corregirlos. El tablero convierte el
resultado en una lista de trabajo con avance visible.

## Notas
- El avance se guarda en `localStorage` (preferencia de esta persona en este equipo). Los
  resultados siguen viniendo solo de `utils/parser.py`.
- El plan sigue saliendo de `synthesis/plan.ts` (reglas en TypeScript). Para que el CLI tenga
  el mismo plan habría que moverlo a Python (pendiente).
- Sin lag: nada se anima por cuadro; el fondo avanza a saltos.

## Paleta
Pavo real de noche: fondo `#0E1A1C`, panel `#132326`, tinta `#ECF3F1`, pluma `#3FE0BF`
(seguro, hecho), cresta `#E8BB5C` (alerta, esta semana), coral `#F2765E` (riesgo, hoy).
Onest + Azeret Mono. Fondo: patrón tenue de ocelos de pluma.

## Verla
`npm run tauri:demo`, `npm run tauri:demogrande`, `npm run tauri dev` (real).
