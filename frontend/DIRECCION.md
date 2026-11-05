# Dirección I — "Maqueta" (tercera ronda)

Las **láminas de F** (las definitivas) llevadas a toda la red: una **maqueta isométrica** con
una plataforma por tipo de dispositivo (como una placa del despiece) y una **torre** por
dispositivo. La altura de la torre es su **exposición** (puertos abiertos y hallazgos) y su cara
superior lleva el color del estado y el ícono del tipo. Al pasar el cursor la torre se levanta
y muestra IP y nombre, el mismo gesto que las capas del despiece.

## Respuesta a la segunda ronda
- **Sin lag:** dibujo estático, armado una vez por escaneo. Solo se mueve la torre bajo el cursor.
- **Nada de 3D tipo lidar:** volúmenes isométricos limpios, el lenguaje de las láminas.
- Láminas de F en la ficha, con puertos en cuadrícula (prueba el 192.168.1.10).
- Buscador de G arriba; los dispositivos que no coinciden se apagan en la maqueta.
- Hojas de F/G en Mapear y Detectar, con el ícono del tipo.

## Paleta
Tinta azul de noche con trazo blanco (el cianotipo de F, más profundo y menos saturado):
fondo `#0B1626`, panel `#0F1E33`, tinta `#EDF4FC`, pluma `#45E0C4` (seguro), cresta `#F0C46A`
(alerta), coral `#FF8A73` (riesgo). Familjen Grotesk en minúsculas + Azeret Mono.

## Verla
`npm run tauri:demogrande` (43 hosts, donde más luce), `npm run tauri:demo`, `npm run tauri dev`.
