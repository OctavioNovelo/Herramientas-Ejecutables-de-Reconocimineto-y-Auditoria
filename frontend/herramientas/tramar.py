# Foto -> trama de puntos color hueso sobre transparente, para las cartas de Lanzar. El color va horneado en el PNG.
# Uso: python3 herramientas/tramar.py   (necesita ImageMagick; lee imagenes_claude/Cards y escribe src/argos/cartas)
import subprocess as sp, sys, os
AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(AQUI, "..", "imagenes_claude", "Cards") + os.sep
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, "..", "src", "argos", "cartas"); os.makedirs(OUT, exist_ok=True); TMP = OUT + "/_t.png"
def m(*a): sp.run(["magick", *map(str, a)], check=True)
def relleno(fuzz):   # el fondo liso se pinta de negro desde las cuatro esquinas (se resuelve tras el recorte)
    return ["-fuzz", f"{fuzz}%", "-fill", "black"] + sum((["-draw", f"color {x},{y} floodfill"] for x, y in ESQ), [])
# nombre: (archivo, recorte WxH+X+Y o None, fondo: None | número (fuzz del relleno) | color a borrar, nivel, viñeta)
CARTAS = {
  "aquiles":  ("Aquiles.png", None, None, "48%,95%", 0),
  "atenea":   ("Atena.png", "408x330+0+20", "#3d6fb8", "25%,95%", 0),
  "cerbero":  ("Cerbero.png", "760x491+50+50", "#fbdcae", "5%,60%", 0),
  "hefesto":  ("Hefesto.png", None, 14, "30%,95%", 0),
  "heracles": ("Heracles_2.png", "330x437+55+3", 7, "30%,70%", 0),
  "io":       ("Io.png", "330x420+60+170", None, "22%,75%", 1),
  "iris":     ("Iris_2.png", None, None, "38%,100%", 0),
  "esfinge":  ("La_Esfige_2.png", "620x560+110+140", None, "56%,96%", 0),
  "argos":    ("Argos_Panoptes_2.png", "330x360+30+0", None, "10%,75%", 1),
}
for n, (f, rec, fondo, nivel, vi) in CARTAS.items():
    a = [SRC + f] + (["-crop", rec, "+repage"] if rec else [])
    m(*a, TMP)
    w, h = map(int, sp.check_output(["magick", "identify", "-format", "%w %h", TMP]).split())
    ESQ = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2)]
    b = [TMP] + (relleno(fondo) if isinstance(fondo, int) else ["-fuzz", "22%", "-fill", "black", "-opaque", fondo] if fondo else [])
    m(*b, "-colorspace", "Gray", "-level", nivel, "-resize", "x720", TMP)
    if vi:
        w, h = map(int, sp.check_output(["magick", "identify", "-format", "%w %h", TMP]).split())
        m(TMP, "(", "+clone", "-fill", "black", "-colorize", "100", "-fill", "white", "-draw", f"ellipse {w/2},{h/2} {w*.44},{h*.46} 0,360", "-blur", "0x40", ")", "-compose", "multiply", "-composite", TMP)
    m(TMP, "-ordered-dither", "h6x6o", "-background", "#ece5d2", "-alpha", "shape", f"{OUT}/{n}.png")
os.remove(TMP)
