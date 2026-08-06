# core/executor.py
import subprocess
import platform
import os
import re
from pathlib import Path
from utils.system_info import obtener_sistema_operativo, obtener_carpeta_os

def ejecutar_herramienta(tool, os_folder):
    from tools.nmap import nmap_bin # Importación local para evitar círculo
    base_path = Path(__file__).parent.parent
    os_name = platform.system()
    

    bin_name  = nmap_bin[os_name.lower()]['bin_name']
    bin_path  = base_path / "tools" / "tools_bin" / os_folder / tool / bin_name

    if not bin_path.exists():
        raise FileNotFoundError(f"Binario no encontrado: {bin_path}")

    if os_name != "Windows":
        os.chmod(bin_path, 0o755)

    redes = []
    if os_name == "Windows":
        # Execute ipconfig
        ip_result = subprocess.run("ipconfig", shell=True, capture_output=True, text=True)
        
        # Split into lines for granular processing
        lineas = ip_result.stdout.split('\n')
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
        
        redes = [red for red in ip_result.stdout.strip().split("\n") if red]

    return {"bin_path": bin_path, "os_folder": os_folder, "redes": redes, "os_type": os_name}
