import json
import subprocess
import tempfile
from pathlib import Path

import tools.nmap as nmap
from utils import parser

# Binario por carpeta de SO (ver core/executor.py::HERRAMIENTAS). Pesa ~140 MB, más que el límite
# de GitHub (100 MB), así que NO se versiona: se descarga de github.com/projectdiscovery/nuclei/releases.
BINARIOS = {"Linux": "nuclei", "Windows": "nuclei.exe", "macos": "nuclei"}

# Plantillas de Nuclei (~86 MB, ~14 mil archivos, iguales para todos los SO). Tampoco se versionan:
# Nuclei las instala aquí solo en su primera ejecución (requiere internet esa vez).
PLANTILLAS_DIR = Path(__file__).parent / "tools_bin" / "nuclei-templates"

# Nunca se ejecutan plantillas que puedan tumbar un servicio (dos), que manden payloads masivos
# (fuzz), que prueben contraseñas (brute) o que sean intrusivas: HERA audita la red propia.
ETIQUETAS_EXCLUIDAS = "dos,fuzz,brute,intrusive"

# Scripts de Nmap que corren junto con el sondeo, para fallas críticas de Windows que Nmap
# comprueba en vivo (no por versión). Solo corren en hosts con el 445 (SMB) o el 3389 (RDP).
SCRIPTS_NMAP = "smb-vuln-ms17-010,rdp-vuln-ms12-020"


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
