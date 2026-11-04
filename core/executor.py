# core/executor.py
import importlib
import subprocess
import platform
import os
import re
from pathlib import Path

# Herramientas que orquesta HERA y el módulo de tools/ que las implementa. Cada módulo declara
# BINARIOS = {carpeta_os: nombre_del_binario}, con None si la herramienta no existe en ese SO.
# Los binarios viven en tools/tools_bin/<carpeta_os>/<Herramienta>/<binario>.
HERRAMIENTAS = {
    "Nmap": "tools.nmap",
    "Nuclei": "tools.nuclei",
    "Testssl": "tools.testssl",
}


def buscar_binario(tool, os_folder):
    """Ruta al binario de 'tool' para este SO, o None si no está disponible (no existe para el SO o falta el archivo)."""
    modulo = importlib.import_module(HERRAMIENTAS[tool])  # import tardío: tools/ importa core indirectamente
    bin_name = modulo.BINARIOS.get(os_folder)
    if not bin_name:
        return None
    bin_path = Path(__file__).parent.parent / "tools" / "tools_bin" / os_folder / tool / bin_name
    if not bin_path.exists():
        return None
    if os_folder != "Windows":
        os.chmod(bin_path, 0o755)
    return bin_path


def ejecutar_herramienta(tool, os_folder):
    """
    Prepara el contexto de ejecución: binario de 'tool' (obligatorio), binarios del resto de
    herramientas (context["binarios"], None si no están, porque los flujos de Detectar combinan
    Nmap con Nuclei/testssl) y las subredes locales detectadas.
    """
    os_name = platform.system()

    bin_path = buscar_binario(tool, os_folder)
    if bin_path is None:
        raise FileNotFoundError(
            f"Binario de {tool} no encontrado para {os_folder} "
            f"(se espera en tools/tools_bin/{os_folder}/{tool}/)."
        )
    binarios = {nombre: buscar_binario(nombre, os_folder) for nombre in HERRAMIENTAS}

    redes = []
    if os_name == "Windows":
        # Execute ipconfig
        ip_result = subprocess.run("ipconfig", shell=True, capture_output=True, text=True)
        
        # Split into lines for granular processing
        lineas = ip_result.stdout.split('\n')

        # Para que esta esta variable ? 
        adaptador_actual = ""
        bloques = []
        
        # Group lines by adapter
        temp_bloque = []
        for linea in lineas:
            if linea.strip() and not linea.startswith(" "):
                if temp_bloque:
                    bloques.append("\n".join(temp_bloque))
                temp_bloque = [linea]
            elif linea.strip():
                temp_bloque.append(linea)
        if temp_bloque:
            bloques.append("\n".join(temp_bloque))
        
        for bloque in bloques:
            # Aggressive filtering for virtual and unwanted interfaces
            # Including VirtualBox, Host-Only, VMware, Docker, WSL, etc.
            if re.search(r'(docker|vmware|virtual|vbox|wsl|vethernet|loopback|pseudo|teredo|isatap|host-only|npcap)', bloque, re.IGNORECASE):
                continue
            
            # Searching for IP line
            match = re.search(r'IPv4.*:\s*(\d+\.\d+\.\d+\.)(\d+)', bloque)
            if match:
                red_base = f"{match.group(1)}0/24"
                
                # Discard localhost and APIPA (169.254.x.x)
                if not red_base.startswith('127.') and not red_base.startswith('169.254.'):
                    if red_base not in redes:
                        redes.append(red_base)
    else:
        ip_result = subprocess.run("ip route | grep kernel | grep -vE 'docker|br-' | awk '{print $1}'", shell=True, capture_output=True, text=True)
        
        # dict.fromkeys quita duplicados conservando el orden: la misma subred aparece una vez
        # por interfaz (ej. Wi-Fi y Ethernet en la misma red) y Nmap la escanearía dos veces.
        redes = list(dict.fromkeys(red for red in ip_result.stdout.strip().split("\n") if red))

    return {"bin_path": bin_path, "binarios": binarios, "os_folder": os_folder, "redes": redes, "os_type": os_name}
