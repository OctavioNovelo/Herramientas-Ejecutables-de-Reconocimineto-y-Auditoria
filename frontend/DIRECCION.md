# Dirección L — "Panorama" (ronda final)

Las mismas piezas de H, pero **el mapa es la pantalla**. La red desde el router ocupa todo el
fondo y lo demás flota encima en dos paneles que se pliegan:

- **Izquierda:** buscador, un botón "Filtros" (estado y hallazgos) e índice de hosts (botón "Índice" o tecla `[`).
- **Derecha:** "Qué hacer ahora" de toda la red; al elegir un host, primero su propio "Qué hacer
  ahora" y, con una pestaña, su lámina (la ficha con las capas de F). Si el host no tiene nada que
  hacer, abre directo la lámina. Se pliega con el botón "Plan"/"Lámina" o la tecla `]`.
- **Arriba, al centro:** el estado de la red en una cápsula.

El mapa sabe qué parte tapan los paneles: encaja la red en la zona libre, y al elegir un host lo
lleva al centro de esa zona. Si pliegas los dos paneles, la red crece a toda la ventana.

Comparte con K: zoom y arrastre (rueda, + y −, doble clic, 0), índice y mapa conectados, corona
de puertos, barras de respuesta y el botón "Colores". Por defecto usa **Ocelo** (ciruela y
turquesa del pavo real); las otras paletas están en el mismo botón.

Overpass (interfaz) + Overpass Mono (IPs y cifras), basadas en la Highway Gothic de la señalética
de carreteras: se leen como rótulos técnicos, no como la sans de siempre. El estado se dice con color y
texto, sin símbolos.
Paneles opacos sin desenfoque: en WebKitGTK sin composición el blur repinta todo en cada cuadro.

Verla: `npm install` y luego `npm run tauri:demogrande` (43 hosts) o `npm run tauri:demo`.
