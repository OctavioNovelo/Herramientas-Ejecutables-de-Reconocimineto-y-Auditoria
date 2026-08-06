import subprocess
from pathlib import Path
import frontend.CLI
from utils import elevation

nmap_bin = {
    'linux':   {'bin_name': 'nmap'},
    'windows': {'bin_name': 'nmap.exe'},
    'macos':   {'bin_name': 'nmap'}
}

def file_number(base_path):
    """Calculates the next available filename (e.g., internet_lento, internet_lento_1, etc.)
    Checks for .xml, _normal.txt, and _grepable.txt availability.
    """
    xml_path = base_path.with_suffix('.xml')
    normal_path = Path(f"{base_path}_normal.txt")
    grepable_path = Path(f"{base_path}_grepable.txt")

    if not xml_path.exists() and not normal_path.exists() and not grepable_path.exists():
        return str(base_path)

    contador = 1
    while True:
        nuevo_path_str = f"{base_path}_{contador}"
        nuevo_path = Path(nuevo_path_str)
        if not nuevo_path.with_suffix('.xml').exists() and \
           not Path(f"{nuevo_path_str}_normal.txt").exists() and \
           not Path(f"{nuevo_path_str}_grepable.txt").exists():
            return nuevo_path_str
        contador += 1

def escaneo_rapido(context):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "escaneo_rapido"
    result_path = file_number(result_path_base)

    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hosts_file, "w") as f:
        for red in context["redes"]: f.write(red + "\n")

    args = [str(context["bin_path"]), "-sS", "-F", "-Pn", "-n", "-O",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

def vulnerabilidades(context, timing_level = 3):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "vulnerabilidades"
    result_path = file_number(result_path_base)

    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hosts_file, "w") as f:
        for red in context["redes"]: f.write(red + "\n")

    args = [str(context["bin_path"]), "-sV", "--script", "vuln", "-Pn", "-n", f"-T{timing_level}", "-O",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

# Consolida todas las técnicas en un único escaneo exhaustivo
def full_pack(context):
    """
    FULL PACK: Ejecuta un análisis integral combinando las 6 categorías del auditor.
    1. Escaneo Rapido
    2. Vulnerabilidades
    3. Ghost Hunter
    4. Auditoría Admin (Puertos de gestión)
    5. Ghost ID (Identificación agresiva de dispositivos)
    6. Monitor Consumo (Puertos de multimedia/juegos)
    """
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "full_pack"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    # Puertos combinados de Auditoría Admin y Monitor Consumo
    # Admin: 21,22,23,80,443,623,902,1433,2082,2083,2086,2087,3306,3389,3391,5900,5985,8080,8443,8880
    # Consumo: 1935,3478,3479,3480,5060,5061,80,443,27015-27030
    puertos = "21,22,23,80,443,623,902,1433,1935,2082,2083,2086,2087,3306,3389,3391,3478-3480,5060,5061,5900,5985,8080,8443,8880,27015-27030"

    args = [
        str(context["bin_path"]),
        "-A",                # Ghost ID: OS detection, Version detection, Script scanning, Traceroute
        "-sS",               # Internet Lento/Ghost Hunter: Stealth SYN scan
        "-Pn",               # Ghost Hunter: No ping (salta firewalls)
        "-f",                # Ghost Hunter: Fragmentación de paquetes
        "--data-length", "24", # Ghost Hunter: Tamaño de datos extra para evadir firmas
        "--script", "vuln",  # Vulnerabilidades: Motor de scripts para fallos conocidos
        "-p", puertos,       # Combinación de puertos críticos de Admin y Consumo
        "-T4",               # Balance entre velocidad y agresividad
        "-iL", str(hosts_file),
        "-oN", f"{result_path}_normal.txt",
        "-oG", f"{result_path}_grepable.txt",
        "-oX", f"{result_path}.xml"
    ]

    print(f"\n[+] Iniciando FULL PACK. Este proceso es exhaustivo y tomará tiempo...\n")
    elevation.ejecutar_elevado(args)

def dispositivos_ocultos(context, timing_level=3):
    """Detects hidden intruders using fragmented scans and no ping."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "dispositivos_ocultos"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    args = [str(context["bin_path"]), "-sS", "-Pn", "-f", "--data-length", "24", f"-T{timing_level}", "-n",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def admin_audit(context):
    """Searches for exposed management panels."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "admin_audit"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    # Common management ports: HTTP, HTTPS, Telnet, SSH, FTP, etc.
    args = [str(context["bin_path"]), "-p", "21,22,23,80,443,623,902,1433,2082,2083,2086,2087,3306,3389,3391,5900,5985,8080,8443,8880",
            "-T", str(4),
            "-sV",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    # cPanel HTTP = 2082
    # cPanel SSL/HTTPS = 2083
    # WHM HTTP = 2086
    # WHM SSL = 2087

    # # RDP (Remote Desktop Protocol)
    # Remote access for windows (TCP) = 3389
    # (UDP) = 3391

    # Admin servers & virtualization
    # VMware vSphere (TCP/UDP) = 902
    # SSH = 22
    # VNC (TCP) = 5900
    # IPMI/ASF (UDP) = 623

    # Web Admin & API
    # WinRM and Powershell (TCP) = 5985
    # Proxy or alt = 8080
    #
    # Databases
    # MySQL (TCP) = 3306
    # Microsoft SQL Server (TCP) = 1433

    elevation.ejecutar_elevado(args)

# Change name
# Crashes if it doesn't find hosts.txt at the beginning, so it's not generating it.
def indentificar_dispositivos(context, timing_level=4):
    """Deep device identification."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "ind_disp"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    args = [str(context["bin_path"]), "-A", f"-T{timing_level}", "-Pn",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def monitor_consumo(context, timing_level=4):
    """Searches for high-consumption protocols (Streaming/Gaming)."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "consumo"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    # Steam, Netflix, Spotify, and common games ports
    args = [str(context["bin_path"]), "-p", "1935,3478,3479,3480,5060,5061,80,443,27015-27030", f"-T{timing_level}", "-sV",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def personalizado(context):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "personalizado"
    result_path = file_number(result_path_base)

    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hosts_file, "w") as f:
        for red in context["redes"]: f.write(red + "\n")

    print("\n Escaneo Personalizado \n")
    print("1) TCP  2) UDP  3) SCTP  4) Regresar \n")
    opcion = frontend.CLI.leer_opcion("Seleccione: ", 1, 4)
    if opcion == 4: return

    args = [str(context["bin_path"])]
    # Timing
    print("\n Nivel de Intensidad (1: Sigiloso - 5: Agresivo, 4 recomendado) \n")
    t_level = frontend.CLI.leer_opcion("Timing (1-5): ", 1, 5)
    args.append(f"-T{t_level}")

    if opcion == 1:
        print("1) SYN  2) Connect  3) FIN  4) NULL  5) Xmas\n")
        t_opt = frontend.CLI.leer_opcion("Tipo: ", 1, 5)
        args.append(["-sS", "-sT", "-sF", "-sN", "-sX"][t_opt-1])
    elif opcion == 2: args.append("-sU")
    elif opcion == 3: args.append("-sY")

    frontend.CLI.limpiar_pantalla()
    print("\n Puertos \n")
    print("1) Especificar  2) Top Ports  3) Port Ratio  4) Todos\n")
    p_opt = frontend.CLI.leer_opcion("Opción: ", 1, 4)
    if p_opt == 1: args.extend(["-p", input("Puertos (ej: 80,443): ")])
    elif p_opt == 2: args.extend(["--top-ports", str(frontend.CLI.leer_opcion("Cantidad: ", 1, 10000))])
    elif p_opt == 3: args.extend(["--port-ratio", str(frontend.CLI.leer_opcion("Ratio (0-1): ", 0, 1))])
    elif p_opt == 4: args.append("-p-")

    args.extend(["-iL", str(hosts_file), "-oN", f"{result_path}_normal.txt", "-oG", f"{result_path}_grepable.txt", "-oX", f"{result_path}.xml"])
    elevation.ejecutar_elevado(args)


def personalizado_gui(context, protocol, tcp_type=None, timing=4, port_mode="top", port_value="1000"):
    """
    Versión NO interactiva de personalizado(), pensada para la interfaz gráfica (Tauri).
    personalizado() usa input()/frontend.CLI.leer_opcion() para pedir opciones por teclado,
    lo cual se colgaría indefinidamente si se invoca desde un subprocess sin terminal (como
    ocurre al lanzarlo desde la app nativa). Esta función recibe las mismas opciones como
    parámetros explícitos en vez de preguntarlas, pero construye exactamente el mismo tipo
    de comando nmap que la versión interactiva del CLI.

    Parámetros:
        protocol:   "tcp" | "udp" | "sctp"
        tcp_type:   solo si protocol == "tcp": "syn" | "connect" | "fin" | "null" | "xmas"
        timing:     entero 1-5 (T1 sigiloso .. T5 agresivo)
        port_mode:  "specific" | "top" | "ratio" | "all"
        port_value: depende de port_mode:
                        "specific" -> string de puertos, ej. "80,443"
                        "top"      -> cantidad de top-ports, ej. "1000"
                        "ratio"    -> ratio 0-1, ej. "0.5"
                        "all"      -> ignorado
    """
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "personalizado"
    result_path = file_number(result_path_base)

    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hosts_file, "w") as f:
        for red in context["redes"]: f.write(red + "\n")

    args = [str(context["bin_path"]), f"-T{timing}"]

    if protocol == "tcp":
        flag_por_tipo = {"syn": "-sS", "connect": "-sT", "fin": "-sF", "null": "-sN", "xmas": "-sX"}
        args.append(flag_por_tipo.get(tcp_type, "-sS"))
    elif protocol == "udp":
        args.append("-sU")
    elif protocol == "sctp":
        args.append("-sY")
    else:
        raise ValueError(f"Protocolo desconocido: {protocol}")

    if port_mode == "specific":
        args.extend(["-p", str(port_value)])
    elif port_mode == "top":
        args.extend(["--top-ports", str(port_value)])
    elif port_mode == "ratio":
        args.extend(["--port-ratio", str(port_value)])
    elif port_mode == "all":
        args.append("-p-")
    else:
        raise ValueError(f"Modo de puertos desconocido: {port_mode}")

    args.extend(["-iL", str(hosts_file), "-oN", f"{result_path}_normal.txt", "-oG", f"{result_path}_grepable.txt", "-oX", f"{result_path}.xml"])
    elevation.ejecutar_elevado(args)
