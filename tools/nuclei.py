import hashlib
import json
import os
import platform
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import tools.nmap as nmap
from utils import parser

# Binario por carpeta de SO (ver core/executor.py::HERRAMIENTAS). Pesa ~140 MB, más que el límite
# de GitHub (100 MB), así que NO se versiona: instalar() lo descarga de la release oficial.
BINARIOS = {"Linux": "nuclei", "Windows": "nuclei.exe", "macos": "nuclei"}

# Versión fija y SHA-256 de cada .zip de la release (nuclei_<VERSION>_checksums.txt, coinciden con
# los digest que publica la API de GitHub). Los hashes viven aquí y no se bajan junto con el .zip:
# quien pudiera alterar el .zip en la release también podría alterar su archivo de checksums.
# Para actualizar Nuclei: cambiar VERSION y los cuatro hashes, a propósito, en un commit.
VERSION = "3.11.1"
DESCARGAS = {
    ("Linux", "amd64"): "ea63d4ae232808cd7c6bc00d0142428e231fab59dae01042246097d195835ab6",
    ("Linux", "arm64"): "8044e3d9768ba0a744b2872c1a87e813006f013da97ca9f50f7661a4203bec07",
    ("Windows", "amd64"): "bb6cb9ff8939b753f6fcab06fd30a15f5bc61d8382a597871334c007a85ff9d2",
    ("macos", "amd64"): "75c47ce11e9dbd4288a1c895ed85e3c4df9f4acb8237d6d178da6dccd1628f2a",
    ("macos", "arm64"): "7d7e291addd1fc29a9bf8d089afe878a9799b20229cbea2fb1693fc40fd4c5f0",
}
TAMANO_DESCARGA = "~45 MB"
_NOMBRE_SO_RELEASE = {"Linux": "linux", "Windows": "windows", "macos": "macOS"}
_ARQUITECTURAS = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}

# Plantillas de Nuclei (~86 MB, ~14 mil archivos, iguales para todos los SO). Tampoco se versionan:
# Nuclei las instala aquí solo en su primera ejecución (requiere internet esa vez).
PLANTILLAS_DIR = Path(__file__).parent / "tools_bin" / "nuclei-templates"

# Nunca se ejecutan plantillas que puedan tumbar un servicio (dos), que manden payloads masivos
# (fuzz), que prueben contraseñas (brute) o que sean intrusivas: HERA audita la red propia.
ETIQUETAS_EXCLUIDAS = "dos,fuzz,brute,intrusive"

# Scripts de Nmap que corren junto con el sondeo, para fallas críticas de Windows que Nmap
# comprueba en vivo (no por versión). Solo corren en hosts con el 445 (SMB) o el 3389 (RDP).
SCRIPTS_NMAP = "smb-vuln-ms17-010,rdp-vuln-ms12-020"


def instalar(os_folder):
    """
    Descarga Nuclei VERSION de la release oficial, verifica su SHA-256 contra DESCARGAS y deja el
    binario en tools/tools_bin/<os_folder>/Nuclei/. No toca nada si la verificación falla. Lo
    llaman el CLI y la GUI (install_tool en main.rs), siempre después de que el usuario acepte.
    """
    arquitectura = _ARQUITECTURAS.get(platform.machine().lower())
    sha_esperado = DESCARGAS.get((os_folder, arquitectura))
    if sha_esperado is None:
        raise RuntimeError(f"No hay descarga de Nuclei para {os_folder} ({platform.machine()}).")

    nombre_zip = f"nuclei_{VERSION}_{_NOMBRE_SO_RELEASE[os_folder]}_{arquitectura}.zip"
    url = f"https://github.com/projectdiscovery/nuclei/releases/download/v{VERSION}/{nombre_zip}"
    destino = Path(__file__).parent / "tools_bin" / os_folder / "Nuclei" / BINARIOS[os_folder]
    destino.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        ruta_zip = Path(tmp) / nombre_zip
        sha = hashlib.sha256()
        print(f"[*] Descargando {url}")
        try:
            with urllib.request.urlopen(url, timeout=30) as respuesta, open(ruta_zip, "wb") as archivo:
                while bloque := respuesta.read(1 << 20):
                    sha.update(bloque)
                    archivo.write(bloque)
        except OSError as e:
            raise RuntimeError(f"No se pudo descargar Nuclei (¿hay conexión a internet?): {e}") from e

        if sha.hexdigest() != sha_esperado:
            raise RuntimeError(
                f"El SHA-256 de {nombre_zip} no coincide con el esperado; se canceló la instalación "
                "(el archivo pudo alterarse o la descarga se corrompió)."
            )

        # Se extrae solo el binario, a un archivo temporal junto al destino, y se mueve al final:
        # si algo falla a medias no queda un binario incompleto que buscar_binario daría por bueno.
        with zipfile.ZipFile(ruta_zip) as zf:
            temporal = destino.with_name(destino.name + ".descarga")
            with zf.open(BINARIOS[os_folder]) as origen, open(temporal, "wb") as salida:
                while bloque := origen.read(1 << 20):
                    salida.write(bloque)
        if os_folder != "Windows":
            temporal.chmod(0o755)
        os.replace(temporal, destino)
    print(f"[*] Nuclei {VERSION} instalado en {destino}")


def _args_base(bin_path, salida):
    """
    Opciones comunes a todas las pasadas:
      -ni   sin interactsh: si no, Nuclei manda datos a servidores externos (oast.*) para
            pruebas fuera de banda. Por privacidad, nada sale de la red auditada.
      -duc  sin buscar actualizaciones de Nuclei en cada ejecución.
      -es   sin severidad info/unknown: son miles de plantillas de detección de tecnologías
            que no son hallazgos y multiplican el tiempo.
      -or -ot  el JSONL no incluye peticiones/respuestas crudas ni la plantilla codificada.
    """
    return [str(bin_path), "-ud", str(PLANTILLAS_DIR), "-jsonl", "-o", str(salida),
            "-silent", "-nc", "-duc", "-ni", "-or", "-ot",
            "-etags", ETIQUETAS_EXCLUIDAS, "-es", "info,unknown", "-timeout", "5", "-retries", "1"]


def _correr(args):
    # Nuclei no necesita privilegios: corre como el usuario, sin pasar por utils/elevation.
    proceso = subprocess.run(args)
    if proceso.returncode != 0:
        raise RuntimeError(f"Nuclei terminó con error (código {proceso.returncode}).")


def vulnerabilidades(context, target=None):
    """
    Categoría Vulnerabilidades. Reemplaza a '--script vuln' de Nmap, que en su mayoría compara
    versiones contra listas de CVEs (falsos positivos en equipos parchados), incluye scripts
    intrusivos/DoS y manda las versiones de los equipos a vulners.com. Nuclei comprueba cada falla
    contra la respuesta real del servicio.

      Etapa 1 (sondeo_nuclei_*.xml): Nmap descubre hosts y servicios (ver nmap.sondeo_servicios)
      y corre SCRIPTS_NMAP; sus hallazgos se leen del mismo XML.
      Etapa 2 (vulnerabilidades_*.jsonl, misma fecha): dos pasadas de Nuclei, solo sobre lo
      que encontró la etapa 1, y se juntan en un solo archivo:
        - Web, en modo automático (-as): detecta qué software corre en cada servicio web y aplica
          solo las plantillas de esa tecnología. Probado: ~3 s por servicio contra ~4 min de
          aplicar todas las plantillas.
        - Red (-pt tcp), sobre cada host: servicios expuestos sin autenticación (Redis,
          MongoDB...), Telnet, etc. Las plantillas definen sus propios puertos.

    utils/parser.py empareja ambos archivos por la fecha para mostrar cada hallazgo en su
    dispositivo. Si no hay hallazgos, el .jsonl queda vacío (escaneo terminado, 0 hallazgos).
    """
    bin_path = context["binarios"].get("Nuclei")
    if bin_path is None:
        raise FileNotFoundError(
            f"Nuclei no está instalado: se espera en tools/tools_bin/{context['os_folder']}/Nuclei/ "
            "(descargar de github.com/projectdiscovery/nuclei/releases)."
        )

    resultados_dir = parser.directorio_resultados(context["os_folder"], "Nuclei")
    resultados_dir.mkdir(parents=True, exist_ok=True)
    marca = nmap.marca_de_tiempo()

    sondeo = Path(nmap.ruta_con_fecha(resultados_dir / "sondeo_nuclei", marca) + ".xml")
    nmap.sondeo_servicios(context, sondeo, target, scripts=SCRIPTS_NMAP)
    if not parser.escaneo_finalizado(sondeo):
        raise RuntimeError("El sondeo de servicios con Nmap no terminó; se cancela la búsqueda de vulnerabilidades.")

    servicios = parser.servicios_abiertos(sondeo)
    urls = sorted({s["url"] for s in servicios if s["url"]})
    hosts = sorted({s["ip"] for s in servicios})
    print(f"[*] Nuclei sobre {len(urls)} servicio(s) web y {len(hosts)} host(s).")

    resultado = Path(nmap.ruta_con_fecha(resultados_dir / "vulnerabilidades", marca) + ".jsonl")
    lineas = []
    with tempfile.TemporaryDirectory() as tmp:
        pasadas = [("web", urls, ["-as"]), ("red", hosts, ["-pt", "tcp"])]
        for nombre, objetivos, extra in pasadas:
            if not objetivos:
                continue
            lista = Path(tmp) / f"{nombre}.txt"
            lista.write_text("\n".join(objetivos) + "\n")
            salida = Path(tmp) / f"{nombre}.jsonl"
            _correr(_args_base(bin_path, salida) + ["-l", str(lista)] + extra)
            if salida.exists():
                lineas.extend(l for l in salida.read_text().splitlines() if l.strip())

    # Se valida cada línea antes de escribir: el resultado final siempre es JSONL válido.
    resultado.write_text("".join(json.dumps(json.loads(l)) + "\n" for l in lineas))
