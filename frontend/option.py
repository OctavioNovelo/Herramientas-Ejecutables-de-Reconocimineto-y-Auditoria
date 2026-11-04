# frontend/option.py
# Catálogo de categorías de escaneo del CLI. Es el equivalente en Python de SCAN_CATEGORIES
# (frontend/src/state/viewState.ts) y de las etiquetas de frontend/src/utils/portLabels.ts:
# si se agrega, quita o renombra una categoría, hay que reflejarlo en ambos lados para que CLI
# e interfaz nativa ofrezcan exactamente las mismas opciones.
#
# Aquí solo vive QUÉ se puede hacer (datos). CÓMO se muestra vive en CLI.py / cli_render.py,
# y CÓMO se ejecuta vive en tools/nmap.py.

from dataclasses import dataclass
from typing import Callable, Optional

import tools.nmap as nmap
import tools.nuclei as nuclei
import tools.testssl as testssl


@dataclass(frozen=True)
class Categoria:
    id: str            # mismo id que usa la GUI ("rapido", "vuln", ...)
    label: str
    # Nombre base de los archivos que genera tools/nmap.py (<file_base>_<fecha>_<hora>, ver
    # ruta_con_fecha()). Debe coincidir EXACTAMENTE con el 'file_base' de viewState.ts.
    file_base: str
    # Pestaña en la que aparece: "mapear" (reconocimiento) o "detectar" (vulnerabilidades).
    group: str
    descripcion: str
    # Función de tools/nmap.py con firma (context, target=None). None para "Personalizado",
    # que necesita un formulario previo (ver CLI.formulario_personalizado).
    ejecutar: Optional[Callable]
    # True si la función acepta evasion=True (técnicas de evasión de firewall/IDS, apagadas por
    # defecto — ver tools/nmap.py::_args_evasion). Mismo flag que 'supportsEvasion' en viewState.ts.
    admite_evasion: bool = False


CATEGORIAS = [
    Categoria(
        "rapido", "Escaneo rápido", "escaneo_rapido", "mapear",
        "Identifica qué dispositivos están activos y qué servicios básicos exponen.\n"
        "Escaneo TCP/SYN sobre los 100 puertos más comunes. Genera poco tráfico.",
        nmap.escaneo_rapido,
    ),
    Categoria(
        "vuln", "Vulnerabilidades", "vulnerabilidades", "detectar",
        "Comprueba fallas reales (CVEs, paneles expuestos, malas configuraciones) contra cada servicio.\n"
        "Nmap encuentra los servicios y Nuclei los verifica. Sin pruebas intrusivas ni de DoS.",
        nuclei.vulnerabilidades,
    ),
    Categoria(
        "tls", "Seguridad TLS", "seguridad_tls", "detectar",
        "Revisa el cifrado de cada servicio con TLS/SSL usando testssl.sh: protocolos viejos,\n"
        "cifrados débiles, certificado y fallas como Heartbleed. ~30 s por servicio.",
        testssl.seguridad_tls,
    ),
    # Corre en 2 etapas: el sondeo intermedio se guarda como "sondeo_ocultos" y el resultado
    # final como "dispositivos_ocultos" (ver tools/nmap.py::dispositivos_ocultos).
    Categoria(
        "ocultos", "Dispositivos ocultos", "dispositivos_ocultos", "mapear",
        "Encuentra dispositivos que están en la red pero NO responden al ping (firewall o\n"
        "configurados para no contestar). Luego escanea a fondo solo esos dispositivos.",
        nmap.dispositivos_ocultos,
        admite_evasion=True,
    ),
    Categoria(
        "admin", "Auditoría admin", "auditoria_admin", "mapear",
        "Busca interfaces de administración expuestas.\n"
        "Revisa SSH, RDP, VNC, paneles web (con su título), bases de datos, SNMP, IPMI y TR-069.",
        nmap.admin_audit,
    ),
    Categoria(
        "id", "Identificación", "identificacion_dispositivos", "mapear",
        "Intenta identificar marca, modelo y sistema operativo de cada dispositivo.\n"
        "Escaneo agresivo con detección de SO y scripts NetBIOS/SMB/mDNS/UPnP.",
        nmap.indentificar_dispositivos,
    ),
    Categoria(
        "full", "Full pack", "full_pack", "mapear",
        "Análisis completo: descubrimiento, identificación, gestión y todos los puertos TCP.\n"
        "Es el mismo escaneo que lanza el Dashboard. Puede tardar bastante.",
        nmap.full_pack,
        admite_evasion=True,
    ),
    Categoria(
        "custom", "Personalizado", "personalizado", "mapear",
        "Control total sobre protocolo (TCP/UDP/SCTP), tipo de escaneo, timing y puertos.\n"
        "Recomendado solo para usuarios con conocimientos de redes.",
        None,
        admite_evasion=True,
    ),
]


# Categorías cuyo resultado es una lista de hallazgos (confirmados/posibles) y no de puertos:
# se muestran con la vista de vulnerabilidades, igual que en ScanView.ts (VULN_VIEW_IDS).
VISTA_HALLAZGOS = {"vuln", "tls"}


def categorias_de(grupo):
    """Categorías que pertenecen a una pestaña ("mapear" o "detectar")."""
    return [c for c in CATEGORIAS if c.group == grupo]


def categoria_por_id(id_categoria):
    return next(c for c in CATEGORIAS if c.id == id_categoria)


# --- Etiquetas de puertos (mismas que frontend/src/utils/portLabels.ts) ---
# Deben coincidir con la lista de puertos de admin_audit() en tools/nmap.py.

ADMIN_PORT_LABELS = {
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    80: "HTTP",
    161: "SNMP",
    443: "HTTPS",
    623: "IPMI / ASF",
    902: "VMware vSphere",
    1433: "Microsoft SQL Server",
    2082: "cPanel (HTTP)",
    2083: "cPanel (HTTPS)",
    2086: "WHM (HTTP)",
    2087: "WHM (HTTPS)",
    2222: "SSH alterno",
    3306: "MySQL",
    3389: "RDP (Escritorio remoto)",
    5900: "VNC",
    5985: "WinRM / PowerShell remoto",
    5986: "WinRM sobre HTTPS",
    7547: "TR-069 (gestión remota del ISP)",
    8000: "HTTP alterno",
    8080: "Proxy / HTTP alterno",
    8291: "MikroTik Winbox",
    8443: "HTTPS alterno",
    8880: "HTTP alterno",
    8888: "HTTP alterno",
    10000: "Webmin",
}

# Puertos "esperables" en un panel de administración normal; cualquier otro puerto de gestión
# abierto se marca como no estándar (bases de datos, RDP, VNC... expuestos).
ADMIN_STANDARD_PORTS = {80, 443}


def admin_port_label(puerto):
    return ADMIN_PORT_LABELS.get(puerto, f"Puerto {puerto}")

