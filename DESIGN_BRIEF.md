# HERA — Brief de rediseño de frontend

> Documento de encargo para el rediseño visual completo de HERA. Léelo entero antes de
> proponer nada. Activa la skill `frontend-design` antes de tomar decisiones de paleta,
> tipografía o layout. No empieces a codear hasta acordar una dirección visual.

---

## 1. Qué es HERA

Herramienta **defensiva** de auditoría de red. Orquesta herramientas de seguridad
(Nmap, Nuclei, testssl.sh), detecta el SO, ejecuta los escaneos, captura y procesa la
salida, y la presenta de forma legible. **Audita y reporta — no ataca ni explota nada hoy.**

El nombre es la diosa griega: guardiana, vigilancia, protección. La estética debe
sentirse como un **instrumento de precisión**, no como una consola de ataque.

### Dos interfaces, una sola lógica
- **CLI** (`HERA.py`): la original, la más probada (Linux + Windows). Para gente experimentada.
- **App de escritorio**: hoy Tauri + TypeScript vanilla. Operativa en Linux; no probada aún
  en Windows/macOS. **Es la que se va a rediseñar por completo.**

Ambas comparten exactamente la misma lógica de escaneo; no hay dos implementaciones.

### Roadmap (afecta el diseño — hay que dejar lugar para esto)
- **Escanear** — *implementado* (Nmap: 7 modalidades, dashboard, pestaña dedicada).
- **Vulnerar** (encontrar vulnerabilidades) — planeado, sin desarrollo.
- **Pentesting / Penetrar** — planeado, sin desarrollo.
- **IA de síntesis** — planeada: resumirá los resultados y propondrá **planes de acción**
  accionables. El diseño debe prever un espacio de primera clase para "aquí está lo que
  encontré y esto es lo que deberías hacer", no un cajón escondido.

---

## 2. Para quién y para qué

- **Usuario:** técnico-curioso que quiere entender y proteger su propia red (trabajo o casa).
  Sabe leer una salida de Nmap pero agradece que se la traduzcan. La CLI cubre al experto.
- **Trabajo de la app:** que de un vistazo el usuario entienda **qué tan segura está su red
  ahora mismo** y **qué es lo más urgente que revisar**. La acción clave no es "comprar":
  es **confiar en el diagnóstico y saber el siguiente paso**.

---

## 3. Alcance del encargo

Refactorización **completa** del frontend. Libertad total:

- **Rebranding completo permitido**, colores incluidos. La paleta azul/teal actual
  (`#0F6DBF`→`#1BA1BF` sobre `#05101a`) es punto de partida, **no** una restricción.
- **Se puede cambiar de framework o abandonar Tauri** si hay buena razón. Requisito duro:
  **debe correr en Windows, Linux y macOS** (nativo de escritorio; no es una web pública).
- Mantener la lógica Python/escaneo intacta; esto es solo la capa de presentación y su
  puente con el backend.

**Entregable esperado del primer paso (no código todavía):** una propuesta de dirección
visual — moodboard verbal, decisiones de paleta con hex, tipografías concretas con escala,
y 1–2 bocetos de layout del dashboard y de la vista de resultados de un escaneo. Acordar
eso antes de construir.

---

## 4. Dirección visual: "instrumento, no consola de hacker"

### El cliché a evitar (crítico)
La mayoría del software de seguridad grita "hacker": **verde neón sobre negro, fuente mono
tipo Matrix, glitch, calaveras, terminal falsa**. HERA protege; eso es justo lo que NO debe
parecer. Evita también los tells de página generada por IA (ver skill `frontend-design`):
acentuar una sola palabra del titular, etiquetas en MAYÚSCULAS por defecto, marcadores
"01/02/03" sin secuencia real, y fade-and-slide-up en cada sección.

### Personalidad
- **Sí:** precisa · serena · legible — un instrumento confiable.
- **No:** "underground/hacker" · alarmista · lúdica/gamer.

### Hilo común de las referencias del cliente (ya revisadas)
Las referencias apuntan todas al mismo lugar y es muy coherente con HERA:

1. **La interfaz *es* el instrumento.** (terrain sculpting: mapa de contornos sobre lienzo
   oscuro, pines con readouts numéricos, tipo CAD/científico; key-switch anatomy: vista
   explotada con piezas etiquetadas y specs; morphing controls: un componente honesto sobre
   su estructura.) → Para HERA: tratar **la red como un objeto que se desarma e inspecciona**.
   Hosts, puertos y servicios como partes de un sistema explorable, con readouts de
   instrumento (números, specs, estados), no como tablas planas inertes.
2. **Base monocroma + un único acento.** Fondo neutro disciplinado + un color de acento que
   trabaja (aquí, idealmente, el acento = estado de seguridad). Grilla estricta.
3. **Tipografía como material, con personalidad editorial.** Minúsculas deliberadas,
   monospace usado como identidad (no como "estética terminal"), mezcla de casing
   intencional, detalles tipo reloj/estado en vivo. Una o dos familias, bien distintas.
4. **El movimiento cuenta algo.** Carga por etapas, gauges que cuentan hacia arriba,
   arrastrar para explorar, un componente que se transforma. Un momento orquestado (p. ej.
   la secuencia de un escaneo en progreso) vale más que efectos dispersos. Nada de hover
   animado en cada tarjeta.

Referencias (ábrelas tú para calibrar el detalle visual, son image-heavy):
- recent.design: genie-minimize-for-web, interactive-terrain-sculpting, x-com,
  mechanical-key-switch-anatomy, step-tracker-app-ui
- siteinspire: maximilian-kaspar (Big Type + Minimal, monospace, grid + 1 acento, mockups
  físicos), artemii-lebedev (Minimal + Unusual Layout, casing mixto, reloj local,
  "make meaning, not noise", ESC para efectos)
- lapa.ninja: byot-ne, bem, playfolly (landings) · behance: SAKAMOTO

### Semáforo de seguridad
Hoy existe seguro/alerta/riesgo (teal/ámbar/rojo-naranja). Conservar el concepto de 3
estados legibles, pero reelegir los valores dentro de la nueva paleta y asegurar contraste
AA y que funcionen para daltónicos (no depender solo del color: usar forma/ícono/texto).

---

## 5. Restricciones técnicas

- **Cross-platform real:** Windows, Linux, macOS. (Tauri lo permite; si se cambia de stack,
  mantener este requisito.)
- **Datos densos:** tablas de hosts, puertos, servicios, salidas largas de escaneo, XML.
  El diseño tiene que respirar con mucha información en pantalla.
- **Español** como idioma principal de la UI.
- **Operaciones largas y cancelables:** los escaneos tardan; ya existe cancelar. El diseño
  de estados de progreso/cancelación es parte central, no un extra.
- **Estructura backend:** `tools/` (un archivo por herramienta) → `core/executor.py`.
  La UI consume eso; no rediseñar esa arquitectura.
- Logo actual en `frontend/images/logo.png` (reemplazable en el rebranding).

---

## 6. Lo que falta por decidir (pregúntaselo al cliente)

1. **Modo claro/oscuro:** las referencias mezclan ambos (terrain = oscuro; key-switch y
   step-tracker = claro). ¿HERA va oscuro, claro, o ambos? Recomendación a proponer: oscuro
   como hogar (es un instrumento de monitoreo), con claro opcional.
2. **Nivel de "desarmar la red":** ¿hasta dónde llevar la metáfora de vista explotada /
   exploración directa vs. dashboard más convencional pero pulido? Proponer 2 niveles de
   ambición y dejar elegir.
3. ¿El rebranding toca el **nombre/wordmark** o solo el sistema visual?

---

*Proceso sugerido: (1) proponer dirección visual y validarla contra este brief y las
referencias; (2) decidir stack; (3) construir; (4) criticar el resultado contra los
clichés de arriba antes de darlo por bueno.*
