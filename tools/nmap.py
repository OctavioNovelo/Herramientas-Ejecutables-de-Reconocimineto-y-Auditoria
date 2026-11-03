import subprocess
import re
from datetime import datetime
from pathlib import Path
from utils import elevation
from utils.parser import FORMATO_FECHA_ARCHIVO

nmap_bin = {
    'linux':   {'bin_name': 'nmap'},
    'windows': {'bin_name': 'nmap.exe'},
    'macos':   {'bin_name': 'nmap'}
}

# Nombre de salida de cada escaneo: <categoria>_<fecha>_<hora>, ej. escaneo_rapido_2026-11-01_18-30-05.
# Las tres salidas de Nmap (.xml, _normal.txt, _grepable.txt) comparten este prefijo.
# El formato vive en utils/parser.py (FORMATO_FECHA_ARCHIVO), que es quien los vuelve a leer.
def ruta_con_fecha(base_path):
    return f"{base_path}_{datetime.now().strftime(FORMATO_FECHA_ARCHIVO)}"


def _args_evasion(tipo_escaneo="syn"):
    """
    Técnicas de evasión de firewall/IDS. Son OPCIONALES y van apagadas por defecto: HERA
    audita la red propia, donde esconderse no aporta nada y sí hace el escaneo más lento y
    menos preciso (los señuelos meten tráfico con IPs falsas y --defeat-rst-ratelimit puede
    marcar puertos cerrados como filtrados). Sirven para comprobar si un firewall/IDS propio
    detecta un escaneo sigiloso.

    No todas aplican a todos los tipos de escaneo, por eso se arman según 'tipo_escaneo':
      - fragmentación (-f), --data-length y señuelos (-D) necesitan paquetes crudos, así que
        no tienen efecto con Connect (-sT), que usa la pila de red del sistema.
      - --defeat-rst-ratelimit solo existe para SYN (-sS); con otro tipo Nmap aborta.
    """
    if tipo_escaneo == "connect":
        return ["--randomize-hosts"]
    args = ["-f", "--data-length", "24", "-D", "RND:5,ME", "--randomize-hosts"]
    if tipo_escaneo == "syn":
        args.append("--defeat-rst-ratelimit")
    return args


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
    """
    Hosts activos + sus 100 puertos más comunes. No lleva -Pn a propósito: en la red local
    Nmap descubre los hosts por ARP (segundos, y ARP no lo bloquea el firewall del equipo),
    y con -Pn se escanearían también todas las IPs vacías de la subred. Tampoco fija
    --min-rtt-timeout: en una LAN la latencia es de ~1 ms y obligar a esperar 1.5 s por
    sonda era lo que lo hacía lento.
    """
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "escaneo_rapido"
    result_path = ruta_con_fecha(result_path_base)

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-sS", "-F", "-n", "-T4", "--max-retries", "3", "--reason",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

# Pendiente por revisar si es util la neta.
def vulnerabilidades(context, timing_level=3, target=None):
    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "vulnerabilidades"
    result_path = ruta_con_fecha(result_path_base)

    _escribir_hosts_file(hosts_file, context, target)

    args = [str(context["bin_path"]), "-sV", "--script", "vuln", "-Pn", "-n", f"-T{timing_level}", "-O",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    elevation.ejecutar_elevado(args)

# Consolida todas las técnicas en un único escaneo exhaustivo
# PENDIENTE POR CONFIRMAR SI REALMENTE HACE TODOS.
def full_pack(context, target=None, evasion=False):
    """
    FULL PACK: Ejecuta un análisis integral combinando las técnicas de reconocimiento
    de las diferentes categorías del auditor, excepto vulnerabilidades.

    1. Escaneo Rapido
    2. Dispositivos ocultos (descubrimiento; evasión solo si evasion=True)
    3. Auditoría Admin (Puertos de gestión)
    4. Identificación de dispositivos

    No ejecuta el análisis de vulnerabilidades.
    """
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "full_pack"
    result_path = ruta_con_fecha(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    # Descubrimiento de hosts:
    # PR: ARP discovery
    # PS: SYN ping sobre puertos comunes
    # PA: ACK ping sobre puertos comunes
    # PU: UDP ping sobre DNS
    #
    # No se utiliza -Pn porque se desea que Nmap determine qué hosts están activos.

    # Todos los puertos TCP son incluidos, por lo que también se cubren
    # automáticamente los puertos TCP de Auditoría Admin e Identificación.
    #
    # UDP mantiene únicamente los puertos de Identificación (NetBIOS, SSDP/UPnP, mDNS, LLMNR)
    # y los de gestión de Auditoría Admin (SNMP, IPMI), ya que un escaneo UDP completo sería
    # considerablemente más costoso. Requiere -sU: sin él, Nmap ignora los "U:" en silencio.
    puertos = "T:1-65535,U:137,161,623,1900,5353,5355"

    args = [
        str(context["bin_path"]),

        # Ghost Hunter: Descubrimiento de hosts
        "-PR",
        "-PS22,80,443",
        "-PA80,443",
        "-PU53",

        # Escaneo TCP + UDP (solo los puertos U: de arriba)
        "-sS",
        "-sU",

        # Ghost ID: Detección de sistema operativo y servicios
        "-sV",
        "-O",
        "--osscan-guess",

        # Ghost ID: Identificación de dispositivos mediante NSE
        "--script", "nbstat,smb-os-discovery,dns-service-discovery,upnp-info",

        # Puertos TCP completos + UDP utilizado para identificación
        "-p", puertos,

        # Configuración general
        "-n",
        "-T4",

        "-iL", str(hosts_file),
        "-oN", f"{result_path}_normal.txt",
        "-oG", f"{result_path}_grepable.txt",
        "-oX", f"{result_path}.xml"
    ]
    if evasion:
        args.extend(_args_evasion("syn"))

    elevation.ejecutar_elevado(args)

def _extraer_ips_vivas_de_grepable(ruta_grepable):
    """
    Extrae las IPs marcadas como 'Status: Up' de un archivo grepable (-oG) de Nmap.
    Se usa para pasar de la etapa 1 (sondeo liviano) a la etapa 2 (escaneo profundo) en
    dispositivos_ocultos(), sin tener que volver a barrer la subred completa.
    """
    ips_vivas = []
    try:
        with open(ruta_grepable, "r") as f:
            for linea in f:
                m = re.match(r"Host:\s+(\S+)\s+.*Status:\s+Up", linea)
                if m:
                    ips_vivas.append(m.group(1))
    except FileNotFoundError:
        pass
    return ips_vivas


def dispositivos_ocultos(context, timing_level=4, target=None, evasion=False):
    """
    Encuentra los dispositivos "ocultos": hosts que SÍ están en la red pero NO responden al
    ping tradicional (ICMP echo), normalmente porque un firewall lo bloquea (ej. el Firewall de
    Windows en perfil público) o porque el dispositivo está configurado para no contestar
    (muchos IoT, cámaras, equipos endurecidos). Son justo los que un "ping a toda la red" no ve.

      Etapa 1a (sondeo_ocultos_*): hosts vivos por cualquier método, SIN escanear puertos
      (-sn). En la red local Nmap usa ARP (-PR), que el firewall del equipo no puede bloquear
      porque sin ARP el equipo no tendría red; fuera de la subred entran en juego los pings
      SYN a 22/80/443, ACK a 80/443 y UDP a 53. No lleva -Pn: con -Pn Nmap marcaría a TODOS
      los hosts como activos sin comprobar nada.

      Etapa 1b (sondeo_ocultos_icmp_*): los mismos objetivos, pero SOLO con ping ICMP echo
      (-PE) y sin ARP (--disable-arp-ping), es decir, el "ping tradicional".

      Ocultos = vivos en 1a que no respondieron en 1b.

      Etapa 2 (escaneo_profundo(), archivo dispositivos_ocultos_*): todos los puertos, servicio
      y SO, SOLO sobre los ocultos. Si no hay ninguno, se corre igual con la lista vacía (Nmap
      termina al instante) para que el resultado "0 dispositivos ocultos" quede guardado como
      un escaneo terminado, y no se confunda con "nunca se escaneó". Con evasion=True agrega
      fragmentación, señuelos, etc. (ver _args_evasion).

    Limitación: fuera de la red local (sin ARP), un host que ignora el ping y además no tiene
    abierto ninguno de los puertos de la etapa 1a no se puede distinguir de una IP vacía.

    El resultado que ve el usuario en la pestaña "Dispositivos Ocultos" es el de la etapa 2
    (ver viewState.ts, categoría 'ocultos' -> file_base 'dispositivos_ocultos').
    """
    base_path = Path(__file__).parent.parent
    resultados_dir = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap"
    hosts_file = resultados_dir / "hosts.txt"
    hosts_ocultos_file = resultados_dir / "hosts_ocultos.txt"

    _escribir_hosts_file(hosts_file, context, target)

    # --- Etapa 1a: hosts vivos por cualquier método (resultado intermedio, no se muestra) ---
    sondeo_path = ruta_con_fecha(resultados_dir / "sondeo_ocultos")
    elevation.ejecutar_elevado([
        str(context["bin_path"]),
        "-sn", "-PR", "-PS22,80,443", "-PA80,443", "-PU53",
        "-n", "--randomize-hosts", f"-T{timing_level}",
        "-iL", str(hosts_file),
        "-oG", f"{sondeo_path}_grepable.txt",
    ])
    ips_vivas = _extraer_ips_vivas_de_grepable(f"{sondeo_path}_grepable.txt")
    if not ips_vivas:
        print("[!] El sondeo inicial no encontró hosts activos; se omite el escaneo profundo.")
        return

    # --- Etapa 1b: quién responde al ping tradicional (ICMP echo, sin ARP) ---
    icmp_path = ruta_con_fecha(resultados_dir / "sondeo_ocultos_icmp")
    elevation.ejecutar_elevado([
        str(context["bin_path"]),
        "-sn", "-PE", "--disable-arp-ping",
        "-n", f"-T{timing_level}",
        "-iL", str(hosts_file),
        "-oG", f"{icmp_path}_grepable.txt",
    ])
    responden_ping = set(_extraer_ips_vivas_de_grepable(f"{icmp_path}_grepable.txt"))

    ips_ocultas = [ip for ip in ips_vivas if ip not in responden_ping]
    print(f"[*] Hosts activos: {len(ips_vivas)} | responden a ping: {len(ips_vivas) - len(ips_ocultas)}"
          f" | ocultos: {len(ips_ocultas)}")

    with open(hosts_ocultos_file, "w") as f:
        for ip in ips_ocultas:
            f.write(ip + "\n")

    # --- Etapa 2: escaneo profundo, solo sobre los ocultos ---
    escaneo_profundo(context, timing_level=3, hosts_file_override=hosts_ocultos_file, evasion=evasion)

# Esta madre en las pruebas tardo 1hr en total con 6 host escaneando 65,535 puertos (en cada host)
# Aprox 10 min por host. Podriamos reducir el tiempo NO escaneando todos los puertos.
def escaneo_profundo(context, timing_level=4, hosts_file_override=None, evasion=False):
    """
    Escaneo agresivo (todos los puertos, detección de servicio/SO) sobre un
    conjunto de hosts. Normalmente se invoca desde dispositivos_ocultos() como su segunda
    etapa, con 'hosts_file_override' apuntando a los hosts ocultos que el sondeo previo
    confirmó como activos — NUNCA se regenera ese archivo aquí con _escribir_hosts_file(), porque
    eso sobrescribiría la lista filtrada con la subred completa otra vez, anulando el punto
    de tener dos etapas. También puede llamarse directo (sin hosts_file_override) para
    escanear la subred/target detectado, igual que el resto de las categorías.
    """
    base_path = Path(__file__).parent.parent
    resultados_dir = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap"
    result_path_base = resultados_dir / "dispositivos_ocultos"
    result_path = ruta_con_fecha(result_path_base)

    descubrimiento = []
    if hosts_file_override:
        hosts_file = hosts_file_override
        # Ya se confirmó que estos hosts están activos, y por definición NO responden al ping:
        # sin -Pn, fuera de la red local Nmap volvería a sondearlos y los daría por caídos.
        descubrimiento = ["-Pn"]
    else:
        hosts_file = resultados_dir / "hosts.txt"
        _escribir_hosts_file(hosts_file, context, target=None)

    args = [str(context["bin_path"]), "-sS", "-sV", "-O", "-p-", f"-T{timing_level}", *descubrimiento,
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]
    if evasion:
        args.extend(_args_evasion("syn"))

    elevation.ejecutar_elevado(args)


def admin_audit(context, target=None):
    """Searches for exposed management panels."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "auditoria_admin"
    result_path = ruta_con_fecha(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    # Puertos de gestión. Los UDP (SNMP, IPMI) van aparte con U: y necesitan -sU; antes se
    # escaneaban como TCP, donde esos servicios no existen.
    puertos = ("T:21,22,23,80,443,902,1433,2082,2083,2086,2087,2222,3306,3389,5900,5985,5986,"
               "7547,8000,8080,8291,8443,8880,8888,10000,U:161,623")
    # http-title: título de la página en los puertos web, para saber QUÉ panel es (ej. "RouterOS
    # router configuration page"). Solo corre donde -sV detectó HTTP y hace una petición por
    # puerto, así que casi no suma tiempo.
    args = [str(context["bin_path"]), "-sS", "-sU", "-p", puertos,
            "-T", str(4),
            "-sV", "--script", "http-title",
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

    # Admin servers & virtualization
    # VMware vSphere (TCP/UDP) = 902
    # SSH = 22, SSH alterno = 2222
    # VNC (TCP) = 5900
    # IPMI/ASF (UDP) = 623
    # SNMP (UDP) = 161

    # Routers
    # TR-069 / CWMP (gestión remota del ISP) = 7547
    # MikroTik Winbox = 8291

    # Web Admin & API
    # WinRM and Powershell (TCP) = 5985, sobre HTTPS = 5986
    # Webmin = 10000
    # Proxy or alt = 8080, 8000, 8888
    #
    # Databases
    # MySQL (TCP) = 3306
    # Microsoft SQL Server (TCP) = 1433

    elevation.ejecutar_elevado(args)

def indentificar_dispositivos(context, timing_level=4, target=None):
    """Deep device identification."""
    base_path = Path(__file__).parent.parent
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "identificacion_dispositivos"
    result_path = ruta_con_fecha(result_path_base)
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"

    _escribir_hosts_file(hosts_file, context, target)

    # Aqui tengo un conflicto para hacerlo eficiente tuve que escanear puertos especificos que contengan informacion del dispositivo.
    # como bien sabemos cada puerto puede ser cualqueir cosa por lo que personalmente NO me gusta solo escanear puertos especificos.
    # Si se queda con puertos especificos recordar que hay 65mil puertos, por lo que habria que averiguar cuales de esos tienen mas probabilidad de tener informacion
    # que necesitamos
    #
    # Puertos elegidos por la información de identificación que suelen dar:
    #   TCP: 22/80/443 (comunes, ayudan a la detección de SO), 139/445 (SMB/NetBIOS),
    #        554 (RTSP, cámaras), 631 (IPP) y 9100 (JetDirect) impresoras,
    #        8008/8009 (Chromecast/Google Cast), 62078 (iPhone/iPad).
    #   UDP: 137 (NetBIOS), 1900 (SSDP/UPnP: fabricante y modelo), 5353 (mDNS), 5355 (LLMNR).
    # Separados con T:/U: para que cada puerto se pruebe solo en su protocolo. La detección de SO
    # necesita al menos un puerto TCP abierto y uno cerrado; con solo 139/445 casi nunca lo lograba.
    # -A ya incluye -O, -sV, scripts por defecto y traceroute.
    puertos = "T:22,80,139,443,445,554,631,8008,8009,9100,62078,U:137,1900,5353,5355"
    args = [str(context["bin_path"]), "-A", "-sU", "-sS", "-p", puertos, f"-T{timing_level}",
            "--script", "nbstat,smb-os-discovery,dns-service-discovery,upnp-info", "--osscan-guess",
            "-iL", str(hosts_file),
            "-oN", f"{result_path}_normal.txt",
            "-oG", f"{result_path}_grepable.txt",
            "-oX", f"{result_path}.xml"]

    elevation.ejecutar_elevado(args)


def validar_parametros_personalizado(protocol, tcp_type, timing, port_mode, port_value):
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


def personalizado(context, protocol, tcp_type=None, timing=4, port_mode="top", port_value="1000", target=None,
                  evasion=False):
    """
    Escaneo personalizado, NO interactivo: recibe todas las opciones como parámetros en vez
    de pedirlas por teclado. Es la única implementación y la comparten ambas interfaces: el
    CLI arma los parámetros con su formulario (frontend/CLI.py::formulario_personalizado) y
    la interfaz nativa los manda vía trigger_custom_scan (main.rs). Al no usar input(), no
    se cuelga cuando se invoca desde un subprocess sin terminal.

    Valida todos los parámetros antes de tocar el sistema de archivos o construir el
    comando (ver validar_parametros_personalizado) — si algo es inválido, lanza ValueError
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
        evasion:    True para agregar técnicas de evasión de firewall/IDS (ver _args_evasion).
    """
    validar_parametros_personalizado(protocol, tcp_type, timing, port_mode, port_value)

    base_path = Path(__file__).parent.parent
    hosts_file = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "hosts.txt"
    result_path_base = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap" / "personalizado"
    result_path = ruta_con_fecha(result_path_base)

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

    if evasion:
        args.extend(_args_evasion(tcp_type if protocol == "tcp" else protocol))

    args.extend(["-iL", str(hosts_file), "-oN", f"{result_path}_normal.txt", "-oG", f"{result_path}_grepable.txt", "-oX", f"{result_path}.xml"])
    elevation.ejecutar_elevado(args)