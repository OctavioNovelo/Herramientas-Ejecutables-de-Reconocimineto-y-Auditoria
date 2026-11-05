# Dirección H — "Señal" (tercera ronda)

La base es **G** (la favorita): buscador grande arriba, índice de hosts a la izquierda. Al
centro, la red **como la ve el router**: la puerta de enlace emite ondas, cada dispositivo se
conecta a ella con una línea y se agrupa en un sector según su **tipo** (computadoras,
teléfonos, TV, cámaras...), con su ícono. Más lejos del router = más latencia (lo inalámbrico y
lo lejano responde más lento). A la derecha, el plan o la ficha con las **láminas de F**.

## Respuesta a la segunda ronda
- **Sin lag:** la posición se calcula una vez por escaneo con d3-force (física que separa los
  nodos) y se dibuja como SVG estático. Solo se animan las ondas del router (CSS) y la línea del
  host elegido. E se descartó porque redibujaba miles de puntos en cada cuadro.
- **Realista para wifi:** una topología en estrella alrededor del router en vez del relieve 3D.
- **Láminas de F**, con los puertos en cuadrícula cuando son muchos (prueba el 192.168.1.10).
- Hojas de F/G en Mapear y Detectar, ahora con el ícono del tipo.

## Tipo de dispositivo
`src/utils/tipos.ts` lo deduce del fabricante/nombre, los puertos y el tipo de sistema de Nmap.
Es una estimación para agrupar; el dato real sigue en la ficha. Íconos de Lucide (ISC).

## Paleta
La de G: pizarra `#161C23`, panel `#1B222B`, pluma `#32D9BA` (seguro), cresta `#E0B65A`
(alerta), coral `#F2735C` (riesgo), cian `#1BA1BF` (ondas). Onest + Martian Mono.

## Verla
`npm run tauri:demo` (9 hosts), `npm run tauri:demogrande` (43), `npm run tauri dev` (real).
