# utils/elevation.py
import ctypes
import os
import platform
import shlex
import subprocess
import sys


def es_admin() -> bool:
    """Detecta si el proceso actual ya tiene privilegios elevados."""
    sistema = platform.system()
    if sistema == "Windows":
        try:
            return ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception:
            return False
    else:
        return os.geteuid() == 0


def tiene_tty() -> bool:
    """Determina si hay una terminal interactiva disponible (CLI) o no (GUI)."""
    try:
        return sys.stdin.isatty()
    except Exception:
        return False


def ejecutar_elevado(args: list[str]) -> subprocess.CompletedProcess:
    """
    Ejecuta 'args' con privilegios administrativos, eligiendo el mecanismo
    correcto según el sistema operativo y el contexto (CLI vs GUI).
    """
    sistema = platform.system()

    if es_admin():
        return subprocess.run(args)

    if sistema == "Windows":
        # La app Tauri ya debe correr elevada (ver manifest); si llegamos aquí
        # desde CLI sin admin, avisamos en vez de fallar en silencio.
        raise PermissionError(
            "HERA requiere privilegios de Administrador en Windows. "
            "Ejecuta la terminal como Administrador o inicia HERA.exe con 'Ejecutar como administrador'."
        )

    elif sistema == "Darwin":  # macOS
        if tiene_tty():
            return subprocess.run(["sudo"] + args)
        # Diálogo gráfico nativo de macOS, funciona sin TTY
        comando = " ".join(shlex.quote(a) for a in args)
        script = f'do shell script "{comando}" with administrator privileges'
        return subprocess.run(["osascript", "-e", script])

    else:  # Linux
        if tiene_tty():
            return subprocess.run(["sudo"] + args)
        # pkexec: diálogo gráfico nativo vía polkit, funciona sin TTY
        return subprocess.run(["pkexec"] + args)