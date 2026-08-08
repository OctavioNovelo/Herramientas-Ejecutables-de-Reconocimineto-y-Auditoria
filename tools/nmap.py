import subprocess
from pathlib import Path
import frontend.CLI
from utils import elevation

nmap_bin = {
    'linux':   {'bin_name': 'nmap'},
    'windows': {'bin_name': 'nmap.exe'},
    'macos':   {'bin_name': 'nmap'}
}

# Esta variable es la que permite crear varios archivos de salida con el mismo nombre base, agregando un sufijo incremental si ya existe un archivo previo.
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


def _escribir_hosts_file(hosts_file, context, target=None):
    """
    Escribe hosts.txt con la direccion de red.

    Si el usuario especificó 'target' (una IP, rango, CIDR o hostname — cualquier formato
    que Nmap acepte en un archivo -iL), se usa eso tal cual. Si no, se usa la subred local
    detectada automáticamente en context["redes"] (comportamiento por defecto, sin cambios).
    """
    hosts_file.parent.mkdir(parents=True, exist_ok=True)
    with open(hosts_file, "w") as f:
        if target:
            f.write(target.strip() + "\n")
        else:
            for red in context["redes"]:
                f.write(red + "\n")


# Aqui empiezan las funciones que ejecutan los diff escaneos
def escaneo_rapido(context, target=None):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "escaneo_rapido"
    result_path = file_number(result_path_base)

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-sS", "-F", "-Pn", "-n", "-O",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

def vulnerabilidades(context, timing_level=3, target=None):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "vulnerabilidades"
    result_path = file_number(result_path_base)

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-sV", "--script", "vuln", "-Pn", "-n", f"-T{timing_level}", "-O",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

# Consolida todas las técnicas en un único escaneo exhaustivo
def full_pack(context, target=None):
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

    _escribir_hosts_file(hosts_file, context, target)

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

def dispositivos_ocultos(context, timing_level=3, target=None):
    """Detects hidden intruders using fragmented scans and no ping."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "dispositivos_ocultos"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-sS", "-Pn", "-f", "--data-length", "24", f"-T{timing_level}", "-n",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def admin_audit(context, target=None):
    """Searches for exposed management panels."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "admin_audit"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

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

def indentificar_dispositivos(context, timing_level=4, target=None):
    """Deep device identification."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "ind_disp"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-A", f"-T{timing_level}", "-Pn",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def monitor_consumo(context, timing_level=4, target=None):
    """Searches for high-consumption protocols."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "consumo"
    result_path = file_number(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    # Steam, Netflix, Spotify, and common games ports
    args = [str(context["bin_path"]), "-p", "1935,3478,3479,3480,5060,5061,80,443,27015-27030", f"-T{timing_level}", "-sV",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)

def personalizado(context):
    """
    Versión INTERACTIVA (CLI) del escaneo personalizado. Pide todo por teclado, incluyendo
    la opción de un target/IP específico. No se tocó para agregar validación de parámetros
    aparte de lo que ya hacía frontend.CLI.leer_opcion() (que ya restringe rangos numéricos);
    la validación exhaustiva nueva vive en personalizado_gui(), ver esa función.
    """
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "personalizado"
    result_path = file_number(result_path_base)

    print("\n Objetivo del escaneo \n")
    target_input = input("IP/red a escanear (Enter para usar la red local detectada): ").strip()
    _escribir_hosts_file(hosts_file, context, target_input if target_input else None)

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


def _validar_parametros_personalizado(protocol, tcp_type, timing, port_mode, port_value):
    """
    Valida los parámetros del escaneo personalizado ANTES de construir el comando de Nmap,
    para fallar rápido con un mensaje claro en vez de dejar que Nmap reciba flags mal
    formadas y falle con un error críptico. Lanza ValueError si algo es inválido.

    """
    if protocol not in ("tcp", "udp", "sctp"):
        raise ValueError(f"Protocolo inválido: '{protocol}'. Debe ser tcp, udp o sctp.")

    if protocol == "tcp" and tcp_type not in ("syn", "connect", "fin", "null", "xmas"):
        raise ValueError(
            f"Tipo de escaneo TCP inválido: '{tcp_type}'. Debe ser syn, connect, fin, null o xmas."
        )

    try:
        timing_int = int(timing)
    except (TypeError, ValueError):
        raise ValueError(f"La intensidad (timing) debe ser un número entero: '{timing}'.")
    if not (1 <= timing_int <= 5):
        raise ValueError(f"La intensidad (timing) debe estar entre 1 y 5, recibido: {timing_int}.")

    if port_mode not in ("specific", "top", "ratio", "all"):
        raise ValueError(
            f"Modo de puertos inválido: '{port_mode}'. Debe ser specific, top, ratio o all."
        )

    if port_mode == "specific":
        tokens = [t.strip() for t in str(port_value).split(",") if t.strip()]
        if not tokens:
            raise ValueError("Debes especificar al menos un puerto (ej: 80,443).")
        for tok in tokens:
            if "-" in tok:
                partes = tok.split("-")
                if len(partes) != 2 or not all(p.isdigit() for p in partes):
                    raise ValueError(f"Rango de puertos con formato inválido: '{tok}'.")
                a, b = int(partes[0]), int(partes[1])
                if not (1 <= a <= 65535 and 1 <= b <= 65535 and a <= b):
                    raise ValueError(f"Rango de puertos fuera de límites válidos (1-65535): '{tok}'.")
            else:
                if not tok.isdigit() or not (1 <= int(tok) <= 65535):
                    raise ValueError(f"Puerto fuera de rango (1-65535): '{tok}'.")

    elif port_mode == "top":
        try:
            n = int(port_value)
        except (TypeError, ValueError):
            raise ValueError(f"La cantidad de 'top ports' debe ser un entero: '{port_value}'.")
        if not (1 <= n <= 65535):
            raise ValueError(f"La cantidad de 'top ports' debe estar entre 1 y 65535, recibido: {n}.")

    elif port_mode == "ratio":
        try:
            r = float(port_value)
        except (TypeError, ValueError):
            raise ValueError(f"El port-ratio debe ser un número: '{port_value}'.")
        if not (0 <= r <= 1):
            raise ValueError(f"El port-ratio debe estar entre 0 y 1, recibido: {r}.")

    # port_mode == "all": no hay port_value que validar (-p- no toma argumento adicional).


def personalizado_gui(context, protocol, tcp_type=None, timing=4, port_mode="top", port_value="1000", target=None):
    """
    Versión NO interactiva de personalizado(), pensada para la interfaz gráfica (Tauri).
    personalizado() usa input()/frontend.CLI.leer_opcion() para pedir opciones por teclado,
    lo cual se colgaría indefinidamente si se invoca desde un subprocess sin terminal (como
    ocurre al lanzarlo desde la app nativa). Esta función recibe las mismas opciones como
    parámetros explícitos en vez de preguntarlas, pero construye exactamente el mismo tipo
    de comando nmap que la versión interactiva del CLI.

    Valida todos los parámetros antes de tocar el sistema de archivos o construir el
    comando (ver _validar_parametros_personalizado) — si algo es inválido, lanza ValueError
    con un mensaje claro, que se propaga hasta la interfaz como el error del escaneo.

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
        target:     IP/red/hostname específico a escanear (opcional). Si no se especifica,
                    usa la subred local detectada automáticamente (comportamiento por defecto).
    """
    _validar_parametros_personalizado(protocol, tcp_type, timing, port_mode, port_value)

    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "personalizado"
    result_path = file_number(result_path_base)

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), f"-T{timing}"]

    if protocol == "tcp":
        flag_por_tipo = {"syn": "-sS", "connect": "-sT", "fin": "-sF", "null": "-sN", "xmas": "-sX"}
        args.append(flag_por_tipo.get(tcp_type, "-sS"))
    elif protocol == "udp":
        args.append("-sU")
    elif protocol == "sctp":
        args.append("-sY")

    if port_mode == "specific":
        args.extend(["-p", str(port_value)])
    elif port_mode == "top":
        args.extend(["--top-ports", str(port_value)])
    elif port_mode == "ratio":
        args.extend(["--port-ratio", str(port_value)])
    elif port_mode == "all":
        args.append("-p-")

    args.extend(["-iL", str(hosts_file), "-oN", f"{result_path}_normal.txt", "-oG", f"{result_path}_grepable.txt", "-oX", f"{result_path}.xml"])
    elevation.ejecutar_elevado(args)