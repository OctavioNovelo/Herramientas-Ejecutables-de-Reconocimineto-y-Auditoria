# utils/npcap.py
"""
Npcap en Windows. El nmap.exe que trae HERA necesita Npcap para enviar y capturar paquetes
crudos (SYN, ARP, detección de sistema). Quien ya instaló Nmap alguna vez lo tiene; en un
Windows limpio falta y los escaneos fallan o salen incompletos.

Si falta, se descarga el instalador oficial (verificado por SHA-256) y se abre. La edición
gratuita de Npcap no admite instalación silenciosa: la persona completa el asistente.
"""
import hashlib
import os
import platform
import subprocess
import tempfile
import urllib.request
from pathlib import Path

VERSION = "1.88"
URL = f"https://npcap.com/dist/npcap-{VERSION}.exe"
# SHA-256 de lo que npcap.com servía el 2026-11-15. Al subir VERSION hay que recalcularlo.
SHA256 = "a2f4ec1e5ea353ff67efd24b2ebf081ba44532410fae8d5e146af0310aa4f56b"


def instalado() -> bool:
    """Npcap deja wpcap.dll en <Windows>\\System32\\Npcap (y en SysWOW64\\Npcap para procesos de 32 bits)."""
    raiz = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    return any((raiz / carpeta / "Npcap" / "wpcap.dll").exists() for carpeta in ("System32", "SysWOW64"))


def asegurar():
    """En Windows, instala Npcap si falta. No hace nada en otros sistemas ni si ya está."""
    if platform.system() != "Windows" or instalado():
        return

    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / f"npcap-{VERSION}.exe"
        sha = hashlib.sha256()
        print(f"[*] Npcap no está instalado y Nmap lo necesita. Descargando {URL}")
        try:
            with urllib.request.urlopen(URL, timeout=30) as respuesta, open(ruta, "wb") as archivo:
                while bloque := respuesta.read(1 << 20):
                    sha.update(bloque)
                    archivo.write(bloque)
        except OSError as e:
            raise RuntimeError(
                f"Npcap no está instalado y no se pudo descargar (¿hay conexión a internet?): {e}. "
                f"Instálalo a mano desde {URL} y vuelve a escanear."
            ) from e

        if sha.hexdigest() != SHA256:
            raise RuntimeError(
                "El SHA-256 del instalador de Npcap no coincide con el esperado; no se ejecutó "
                f"(el archivo pudo alterarse o hay una versión nueva). Instálalo a mano desde {URL}."
            )

        print("[*] Se abre el instalador de Npcap: complétalo para continuar con el escaneo.")
        # Start-Process -Verb RunAs pide elevación si hace falta y -Wait espera a que el asistente cierre.
        ruta_ps = str(ruta).replace("'", "''")
        subprocess.run(["powershell", "-NoProfile", "-Command", f"Start-Process -FilePath '{ruta_ps}' -Verb RunAs -Wait"])

    if not instalado():
        raise RuntimeError(
            "Npcap no quedó instalado (el instalador se canceló o falló) y Nmap lo necesita. "
            f"Instálalo desde {URL} y vuelve a escanear."
        )


if __name__ == "__main__":
    # Autocomprobación (corre en cualquier sistema): python3 utils/npcap.py
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["SystemRoot"] = tmp
        assert not instalado()
        (Path(tmp) / "SysWOW64" / "Npcap").mkdir(parents=True)
        (Path(tmp) / "SysWOW64" / "Npcap" / "wpcap.dll").touch()
        assert instalado()
    print("ok")
