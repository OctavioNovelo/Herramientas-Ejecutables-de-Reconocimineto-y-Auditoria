import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import tools.nmap as nmap
from utils import parser

# Binario por carpeta de SO (ver core/executor.py::HERRAMIENTAS). testssl.sh es un script de bash
# junto con su carpeta etc/ y un OpenSSL propio en bin/ (que testssl encuentra solo y que, a
# diferencia del OpenSSL del sistema, todavía sabe hablar protocolos viejos como SSLv3 para
# poder detectarlos). No funciona en Windows sin bash, por eso no tiene binario ahí.
BINARIOS = {"Linux": "testssl.sh", "macos": "testssl.sh", "Windows": None}

# Al arrancar, testssl aborta si no existe ninguna de estas herramientas de DNS del sistema, aunque
# HERA solo le pasa IPs con --nodns none y nunca las llega a usar. Si el sistema no tiene ninguna,
# se le da un 'host' de reemplazo que no resuelve nada (ver _sin_resolvedor_dns).
RESOLVEDORES_DNS = ("dig", "host", "drill", "nslookup")


def _sin_resolvedor_dns(tmp):
    """Entorno para testssl con un 'host' falso en el PATH (sale con error, como una consulta fallida)."""
    shim_dir = Path(tmp) / "dns"
    shim_dir.mkdir()
    shim = shim_dir / "host"
    shim.write_text("#!/bin/sh\nexit 1\n")
    shim.chmod(0o755)
    return {**os.environ, "PATH": f"{shim_dir}{os.pathsep}{os.environ.get('PATH', '')}"}


def _verificar_dependencias(context):
    if context["os_folder"] == "Windows":
        raise FileNotFoundError("testssl.sh no funciona en Windows (requiere bash).")
    if context["binarios"].get("Testssl") is None:
        raise FileNotFoundError(
            f"testssl.sh no está instalado: se espera en tools/tools_bin/{context['os_folder']}/Testssl/."
        )
    if shutil.which("bash") is None:
        raise FileNotFoundError("testssl.sh requiere bash.")


def seguridad_tls(context, target=None):
    """
    Revisa la configuración TLS/SSL de cada servicio cifrado de la red con testssl.sh:
    protocolos (SSLv2/3, TLS 1.0/1.1), cifrados débiles, forward secrecy, certificado y
    vulnerabilidades conocidas (Heartbleed, ROBOT, POODLE, LUCKY13, ...).

      Etapa 1 (sondeo_tls_*.xml): Nmap descubre hosts y servicios (ver nmap.sondeo_servicios).
      Etapa 2 (seguridad_tls_*.json, misma fecha): testssl sobre cada servicio con TLS que encontró
      la etapa 1, uno por uno (~30 s cada uno), y se juntan todos los hallazgos en un solo JSON.

    Opciones: -p protocolos, -s categorías de cifrados, -f forward secrecy, -S certificado,
    -U vulnerabilidades. Se omite -c (simulación de clientes), que es lo más lento y no aporta
    hallazgos. --nodns none: sin consultas DNS. --severity LOW: el JSON solo trae hallazgos.
    """
    _verificar_dependencias(context)
    bin_path = context["binarios"]["Testssl"]

    resultados_dir = parser.directorio_resultados(context["os_folder"], "Testssl")
    resultados_dir.mkdir(parents=True, exist_ok=True)
    marca = nmap.marca_de_tiempo()

    sondeo = Path(nmap.ruta_con_fecha(resultados_dir / "sondeo_tls", marca) + ".xml")
    nmap.sondeo_servicios(context, sondeo, target)
    if not parser.escaneo_finalizado(sondeo):
        raise RuntimeError("El sondeo de servicios con Nmap no terminó; se cancela la revisión TLS.")

    objetivos = [f"{s['ip']}:{s['port']}" for s in parser.servicios_abiertos(sondeo) if s["tls"]]
    print(f"[*] testssl sobre {len(objetivos)} servicio(s) con TLS.")

    hallazgos = []
    with tempfile.TemporaryDirectory() as tmp:
        entorno = None if any(shutil.which(r) for r in RESOLVEDORES_DNS) else _sin_resolvedor_dns(tmp)
        for i, objetivo in enumerate(objetivos, start=1):
            print(f"[*] ({i}/{len(objetivos)}) {objetivo}")
            salida = Path(tmp) / f"{i}.json"
            proceso = subprocess.run([
                "bash", str(bin_path), "--quiet", "--color", "0", "--warnings", "off",
                "--nodns", "none", "--severity", "LOW",
                "--connect-timeout", "5", "--openssl-timeout", "5",
                "-p", "-s", "-f", "-S", "-U",
                "--jsonfile", str(salida), objetivo,
            ], stdout=subprocess.DEVNULL, env=entorno)
            if salida.exists():
                hallazgos.extend(json.loads(salida.read_text() or "[]"))
            else:
                print(f"[!] testssl no pudo analizar {objetivo} (código {proceso.returncode}).")

    resultado = Path(nmap.ruta_con_fecha(resultados_dir / "seguridad_tls", marca) + ".json")
    resultado.write_text(json.dumps(hallazgos, indent=1, ensure_ascii=False))
