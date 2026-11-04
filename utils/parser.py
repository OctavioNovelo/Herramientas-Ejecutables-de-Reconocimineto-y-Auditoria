import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from utils import vuln_classification

# Cada escaneo se guarda como <categoria>_<fecha>_<hora>, ej. escaneo_rapido_2026-11-01_18-30-05.xml
# (más sus _normal.txt y _grepable.txt). tools/nmap.py usa este mismo formato al escribirlos, así
# que si cambia aquí cambia para todos. Sin ':' en la hora porque Windows no lo permite en nombres.
FORMATO_FECHA_ARCHIVO = "%Y-%m-%d_%H-%M-%S"
_RE_FECHA_ARCHIVO = r"\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}"

# Extensión del resultado principal de cada herramienta, que se guarda en
# utils/Resultados/<carpeta_os>/<Herramienta>/ (ver tools/<herramienta>.py):
#   Nmap   -> <categoria>_<fecha>.xml
#   Nuclei -> vulnerabilidades_<fecha>.jsonl     + su sondeo de Nmap sondeo_nuclei_<fecha>.xml
#   Testssl-> seguridad_tls_<fecha>.json         + su sondeo de Nmap sondeo_tls_<fecha>.xml
# Nuclei y testssl solo reportan hallazgos; el sondeo (misma fecha) aporta los dispositivos.
FORMATOS_RESULTADO = {"Nmap": ".xml", "Nuclei": ".jsonl", "Testssl": ".json"}
SONDEO_POR_EXTENSION = {".jsonl": "sondeo_nuclei", ".json": "sondeo_tls"}


def directorio_resultados(os_folder, herramienta="Nmap"):
    return Path(__file__).parent.parent / "utils" / "Resultados" / os_folder / herramienta


def buscar_en_gnmap(ruta_gnmap, termino_busqueda):
    """Searches for a term within a .gnmap file."""
    resultados = []
    try:
        with open(ruta_gnmap, "r") as f:
            for linea in f:
                if not linea.startswith("#") and termino_busqueda.lower() in linea.lower():
                    resultados.append(linea.strip())
        return resultados
    except FileNotFoundError:
        return ["Error: No se encontró el archivo de resultados. Ejecuta un escaneo primero."]


def _extraer_nombre_identificado(host):
    """
    Busca un nombre "amigable" de dispositivo en los scripts NSE de identificación
    (dns-service-discovery, nbstat, smb-os-discovery). Estos suelen dar nombres reales
    configurados por el usuario/fabricante (ej. "Juan", "32in Hisense Roku TV"), a diferencia
    de hostnames/hostname (que casi nunca viene resuelto en redes domésticas) o el vendor de
    la MAC (que solo dice el fabricante del chip, no qué dispositivo es).
    Devuelve None si ningún script trae un nombre utilizable.
    """
    # 1. dns-service-discovery: <table key="7000/tcp airplay"><elem key="name">Juan</elem>...
    #    Puede haber varias "tables" (una por servicio anunciado); se prioriza airplay/display
    #    porque suelen traer el nombre que el usuario le puso al dispositivo. Servicios como
    #    spotify-connect a veces anuncian un UUID en vez de un nombre real, así que esos se filtran.
    for script in host.findall(".//script[@id='dns-service-discovery']"):
        candidato = None
        for tabla in script.findall('table'):
            nombre_el = tabla.find("elem[@key='name']")
            if nombre_el is None or not nombre_el.text:
                continue
            nombre = nombre_el.text.strip()
            if re.fullmatch(r'[0-9a-fA-F-]{20,}', nombre):
                continue  # parece un UUID/ID aleatorio, no un nombre real
            key = tabla.get('key', '')
            if 'airplay' in key or 'display' in key:
                return nombre
            if candidato is None:
                candidato = nombre
        if candidato:
            return candidato

    # 2. nbstat: nombre NetBIOS del equipo
    for script in host.findall(".//script[@id='nbstat']"):
        el = script.find("elem[@key='server_name']")
        if el is None:
            el = script.find("elem[@key='netbios_name']")
        if el is not None and el.text:
            return el.text.strip()

    # 3. smb-os-discovery: nombre de equipo / FQDN (Windows)
    for script in host.findall(".//script[@id='smb-os-discovery']"):
        el = script.find("elem[@key='computer_name']")
        if el is None:
            el = script.find("elem[@key='fqdn']")
        if el is not None and el.text:
            return el.text.strip()

    return None


def _extraer_info_escaneo(root):
    """
    Extrae la duración total y fechas de un escaneo a partir de <runstats><finished>.
    Devuelve un dict con segundos (float), un string 'mm:ss' listo para mostrar, y las
    fechas de inicio/fin tal como las reporta Nmap. Si el XML no trae runstats (escaneo
    interrumpido, archivo corrupto, etc.) se devuelven valores en None/0 en vez de reventar.
    """
    finished_el = root.find('runstats/finished')
    nmaprun_start = root.get('startstr')

    if finished_el is None:
        return {
            'segundos': 0.0,
            'duracion_str': 'N/D',
            'inicio': nmaprun_start,
            'fin': None,
        }

    try:
        segundos = float(finished_el.get('elapsed', 0))
    except (TypeError, ValueError):
        segundos = 0.0

    minutos, segs_resto = divmod(round(segundos), 60)
    duracion_str = f"{minutos}m {segs_resto}s" if minutos else f"{segs_resto}s"

    return {
        'segundos': segundos,
        'duracion_str': duracion_str,
        'inicio': nmaprun_start,
        'fin': finished_el.get('timestr'),
    }


def _extraer_os_info(host):
    """
    Extrae la detección de SO de <os><osmatch>...</osmatch></os>, replicando lo que Nmap
    muestra en su salida de texto normal:

      Device type: phone
      Running: Google Android 5.X
      OS CPE: cpe:/o:google:android:5.1.1
      OS details: Android 5.1.1

    o, cuando Nmap no logra un match exacto (accuracy < 100%):

      Aggressive OS guesses: Linux 3.2 - 4.14 (95%), Linux 3.10 - 4.11 (92%), ...
      No exact OS matches for host (test conditions non-ideal).

    Devuelve None si el host no tiene bloque <os> o no trae ningún osmatch (osscan
    deshabilitado para esa categoría, ej. Auditoría admin).
    """
    os_el = host.find('os')
    if os_el is None:
        return None

    osmatches = os_el.findall('osmatch')
    if not osmatches:
        return None

    # Nmap ya entrega los osmatch ordenados por 'accuracy' descendente en el XML.
    top = osmatches[0]
    try:
        top_accuracy = int(top.get('accuracy', 0))
    except (TypeError, ValueError):
        top_accuracy = 0

    # Tipos de dispositivo (osclass "type", ej. "phone", "media device", "WAP") del mejor
    # match, deduplicados mantendiendo el orden en que aparecen.
    device_types = []
    for oc in top.findall('osclass'):
        t = oc.get('type')
        if t and t not in device_types:
            device_types.append(t)

    resultado = {
        'device_types': device_types,
        'exact_match': top_accuracy == 100,
        'running': None,
        'cpe': None,
        'cpes': [],
        'details': None,
        'guesses': [],
        'sin_match_exacto_msg': None,
    }

    if top_accuracy == 100:
        # "Running:" agrupa las osclass por (vendor, familia) uniendo las generaciones con
        # "|", ej. osclasses Android 9.X/10.X/11.X + Linux 4.X -> "Google Android 9.X|10.X|11.X, Linux 4.X"
        grupos = {}
        orden_grupos = []
        cpes = []
        for oc in top.findall('osclass'):
            vendor = oc.get('vendor', '')
            familia = oc.get('osfamily', '')
            gen = oc.get('osgen')
            clave = (vendor, familia)
            if clave not in grupos:
                grupos[clave] = []
                orden_grupos.append(clave)
            if gen and gen not in grupos[clave]:
                grupos[clave].append(gen)
            cpe_el = oc.find('cpe')
            if cpe_el is not None and cpe_el.text and cpe_el.text not in cpes:
                cpes.append(cpe_el.text)

        partes = []
        for (vendor, familia) in orden_grupos:
            gens = grupos[(vendor, familia)]
            etiqueta = familia if vendor == familia else f"{vendor} {familia}".strip()
            if gens:
                partes.append(f"{etiqueta} {'|'.join(gens)}".strip())
            else:
                partes.append(etiqueta)

        resultado['running'] = ", ".join(p for p in partes if p) or None
        resultado['cpes'] = cpes
        resultado['cpe'] = " ".join(cpes) if cpes else None
        resultado['details'] = top.get('name')
    else:
        # Sin match exacto: se muestran los 3 "guesses" más probables (ya vienen ordenados
        # por accuracy en el XML), tal como "Aggressive OS guesses" en la salida de Nmap.
        for om in osmatches[:3]:
            resultado['guesses'].append({
                'name': om.get('name'),
                'accuracy': om.get('accuracy'),
            })
        resultado['sin_match_exacto_msg'] = "No exact OS matches for host (test conditions non-ideal)."

    return resultado


_RE_LOCATION_URL = re.compile(r'(?:LOCATION|Location)\s*:\s*(\S+)')


def _extraer_urls_identificacion(host):
    """
    Busca URLs tipo "Location:"/"LOCATION:" en la salida cruda de scripts NSE (ej. respuestas
    SSDP/UPnP capturadas por 'fingerprint-strings' en el puerto 1900). Estas URLs suelen
    apuntar a un XML de descripción del dispositivo (fabricante, modelo, servicios) y hoy no
    se muestran en ningún lado, aunque contienen información útil de identificación.
    Devuelve una lista de URLs únicas, en el orden en que aparecen.
    """
    urls = []
    for script in host.findall(".//script"):
        salida = script.get('output') or ''
        for match in _RE_LOCATION_URL.finditer(salida):
            url = match.group(1).strip()
            if url and url not in urls:
                urls.append(url)
    return urls


def _extraer_titulo_web(port):
    """
    Título de la página web servida en el puerto (script http-title), útil para saber QUÉ hay
    detrás (ej. "RouterOS router configuration page", "Hikvision"). None si el script no corrió
    o la página no tiene título (ej. solo redirige).
    """
    titulo_el = port.find("script[@id='http-title']/elem[@key='title']")
    if titulo_el is not None and titulo_el.text and titulo_el.text.strip():
        return titulo_el.text.strip()
    return None


def generar_tabla_xml(ruta_xml):
    """
    Parsea un XML de Nmap y devuelve una lista de filas (una por puerto reportado).
    Cada fila incluye datos de host (IP, MAC, vendor, hostname, latencia) y las
    vulnerabilidades encontradas en ese puerto, separadas en:
      - 'Vulnerabilidades': hallazgos confirmados (cuentan para el riesgo/estadísticas)
      - 'PosiblesVulnerabilidades': hallazgos sin confirmar (Nmap no pudo verificarlos)
    La clasificación de qué es confirmado/posible/informativo vive en vuln_classification.py.
    """
    try:
        tree = ET.parse(ruta_xml)
        root = tree.getroot()
    except Exception as e:
        return [{"Error": f"No se pudo leer el archivo: {e}"}]

    filas_tabla = []
    for host in root.findall('host'):
        address = host.find("address[@addrtype='ipv4']")
        ip = address.get('addr') if address is not None else "Desconocido"

        mac_el = host.find("address[@addrtype='mac']")
        mac = mac_el.get('addr') if mac_el is not None else "N/D"
        vendor = mac_el.get('vendor') if mac_el is not None else ""

        hostname_el = host.find('hostnames/hostname')
        hostname_dns = hostname_el.get('name') if hostname_el is not None else ""
        # Se prioriza el nombre "amigable" sacado de scripts de identificación (dns-service-discovery,
        # nbstat, smb-os-discovery) sobre el hostname DNS crudo, porque suele ser mucho más útil
        # para el usuario (ej. "Juan" o "32in Hisense Roku TV" en vez de vacío o un mDNS genérico).
        hostname = _extraer_nombre_identificado(host) or hostname_dns

        # Estos dos son a nivel de host (no por puerto), se calculan una vez y se replican
        # en cada fila del host para que _agrupar_por_dispositivo los pueda leer directo.
        os_info = _extraer_os_info(host)
        location_urls = _extraer_urls_identificacion(host)

        times_el = host.find('times')
        srtt = times_el.get('srtt') if times_el is not None else None
        try:
            latencia_ms = round(int(srtt) / 1000, 1) if srtt else 0.0
        except (TypeError, ValueError):
            latencia_ms = 0.0

        status_el = host.find('status')
        host_status = status_el.get('state') if status_el is not None else "unknown"

        # Solo se procesan hosts que Nmap confirmó como activos. Con -Pn, Nmap puede listar
        # cientos de IPs de la subred como "down" (no respondieron) sin haberles escaneado
        # ningún puerto: incluirlas aquí inflaría el conteo de dispositivos activos con
        # direcciones que en realidad no están en la red.
        if host_status != "up":
            continue

        puertos_del_host = host.findall('.//port')

        if not puertos_del_host:
            # Host activo pero sin puertos listados (ej. todo quedó filtrado): se reporta igual,
            # para que no desaparezca silenciosamente del conteo de dispositivos activos.
            filas_tabla.append({
                'IP': ip, 'Puerto': None, 'Estado': None, 'Servicio': None,
                'HostStatus': host_status, 'MAC': mac, 'Vendor': vendor,
                'Hostname': hostname, 'LatenciaMs': latencia_ms,
                'Vulnerabilidades': [], 'PosiblesVulnerabilidades': [],
                'OS': os_info, 'LocationURLs': location_urls,
            })
            continue

        for port in puertos_del_host:
            estado_el = port.find('state')
            servicio_el = port.find('service')
            puerto_id = port.get('portid')

            # Nombre reconocido por Nmap para el servicio (vacío/"unknown"/"tcpwrapped" cuenta
            # como NO reconocido). Para esos casos es donde interesa mostrar el fingerprint
            # crudo (servicefp), ya que es la única pista disponible sobre qué es el servicio.
            nombre_servicio = servicio_el.get('name') if servicio_el is not None else None
            reconocido = nombre_servicio not in (None, '', 'unknown', 'tcpwrapped')

            fila = {
                'IP': ip,
                'Puerto': puerto_id,
                'Protocolo': port.get('protocol'),
                'Estado': estado_el.get('state') if estado_el is not None else "N/D",
                'EstadoRazon': estado_el.get('reason') if estado_el is not None else None,
                'Servicio': nombre_servicio if nombre_servicio else "N/D",
                'ServicioReconocido': reconocido,
                'Producto': servicio_el.get('product') if servicio_el is not None else None,
                'VersionServicio': servicio_el.get('version') if servicio_el is not None else None,
                'InfoExtra': servicio_el.get('extrainfo') if servicio_el is not None else None,
                'DeviceTypeServicio': servicio_el.get('devicetype') if servicio_el is not None else None,
                'Fingerprint': servicio_el.get('servicefp') if servicio_el is not None else None,
                'TituloWeb': _extraer_titulo_web(port),
                'HostStatus': host_status,
                'MAC': mac,
                'Vendor': vendor,
                'Hostname': hostname,
                'LatenciaMs': latencia_ms,
                'OS': os_info,
                'LocationURLs': location_urls,
                'Vulnerabilidades': [],
                'PosiblesVulnerabilidades': [],
            }

            for script in port.findall('script'):
                _agregar_hallazgo(fila, script, ip, puerto_id)

            filas_tabla.append(fila)

        # Scripts a nivel de host (<hostscript>): los smb-vuln-* (ej. smb-vuln-ms17-010) reportan
        # aquí y no en un puerto. Se cuelgan del puerto SMB (445, si no 139) o del primero del host.
        filas_host = [f for f in filas_tabla if f['IP'] == ip]
        destino = next((f for f in filas_host if f['Puerto'] == '445'), None) \
            or next((f for f in filas_host if f['Puerto'] == '139'), None) \
            or (filas_host[0] if filas_host else None)
        if destino is not None:
            for script in host.findall('hostscript/script'):
                _agregar_hallazgo(destino, script, ip, destino['Puerto'])
    return filas_tabla


def _agregar_hallazgo(fila, script, ip, puerto):
    categoria, entradas = vuln_classification.clasificar_script(script, ip, puerto)
    if categoria == "confirmada":
        fila['Vulnerabilidades'].extend(entradas)
    elif categoria == "posible":
        fila['PosiblesVulnerabilidades'].extend(entradas)


def buscar_escaneos(directorio, base_name, extension=".xml"):
    """
    Devuelve los archivos de una categoría (<base_name>_<fecha>_<hora><extension>), del más
    reciente al más antiguo. La coincidencia es exacta, así que "dispositivos_ocultos" no
    confunde sus archivos con los de otra categoría cuyo nombre empiece igual.
    """
    path = Path(directorio)
    if not path.exists():
        return []

    patron = re.compile(rf"^{re.escape(base_name)}_{_RE_FECHA_ARCHIVO}{re.escape(extension)}$")
    archivos = [f for f in path.iterdir() if patron.match(f.name)]
    # La fecha del nombre está en formato año-mes-día_hora, así que ordenar por nombre
    # es ordenar por fecha (no depende de la fecha de modificación del archivo).
    archivos.sort(key=lambda f: f.name, reverse=True)
    return [str(a) for a in archivos]


def fecha_de_escaneo(ruta):
    """Fecha y hora en que se lanzó un escaneo, leída de su nombre. None si no la trae."""
    m = re.search(_RE_FECHA_ARCHIVO, Path(ruta).name)
    return datetime.strptime(m.group(0), FORMATO_FECHA_ARCHIVO) if m else None


def buscar_resultados(os_folder, base_name):
    """
    Resultados principales de una categoría, de cualquier herramienta, del más reciente al más
    antiguo. Es lo que usan el CLI y la GUI (get_category_results) para encontrar los archivos de
    una categoría sin tener que saber con qué herramienta se generó.
    """
    archivos = []
    for herramienta, extension in FORMATOS_RESULTADO.items():
        archivos.extend(buscar_escaneos(directorio_resultados(os_folder, herramienta), base_name, extension))
    return sorted(archivos, key=lambda r: Path(r).name, reverse=True)


def escaneo_finalizado(ruta):
    """
    True si el archivo corresponde a un escaneo terminado. Un escaneo interrumpido (Ctrl+C,
    proceso terminado) deja el archivo truncado, así que esto permite distinguir resultados
    completos de restos parciales:
      - .xml de Nmap: debe traer <runstats><finished>.
      - .jsonl (Nuclei) / .json (testssl): HERA los escribe al final, de una vez; basta con
        que existan y sean JSON válido (un .jsonl vacío = escaneo terminado sin hallazgos).
    """
    ruta = Path(ruta)
    try:
        if ruta.suffix == ".xml":
            return ET.parse(ruta).getroot().find('runstats/finished') is not None
        if ruta.suffix == ".jsonl":
            for linea in ruta.read_text().splitlines():
                if linea.strip():
                    json.loads(linea)
            return True
        if ruta.suffix == ".json":
            return isinstance(json.loads(ruta.read_text()), list)
    except Exception:
        return False
    return False


def servicios_abiertos(ruta_xml):
    """
    Servicios TCP abiertos de un XML de Nmap, para alimentar a otras herramientas (tools/nuclei.py,
    tools/testssl.py). Cada uno: {ip, port, service, tls, url}. 'url' solo existe para servicios
    web (http:// o https:// según Nmap haya detectado TLS); 'tls' es True si el servicio va cifrado.
    """
    try:
        root = ET.parse(ruta_xml).getroot()
    except Exception:
        return []

    servicios = []
    for host in root.findall('host'):
        estado = host.find('status')
        direccion = host.find("address[@addrtype='ipv4']")
        if estado is None or estado.get('state') != 'up' or direccion is None:
            continue
        ip = direccion.get('addr')
        for port in host.findall('ports/port'):
            estado_puerto = port.find('state')
            if port.get('protocol') != 'tcp' or estado_puerto is None or estado_puerto.get('state') != 'open':
                continue
            servicio_el = port.find('service')
            nombre = (servicio_el.get('name') if servicio_el is not None else '') or ''
            tunel = servicio_el.get('tunnel') if servicio_el is not None else None
            tls = tunel == 'ssl' or nombre in _SERVICIOS_TLS
            url = None
            if nombre.startswith('http') or nombre in ('https', 'https-alt'):
                esquema = 'https' if tls or nombre.startswith('https') else 'http'
                url = f"{esquema}://{ip}:{port.get('portid')}"
            servicios.append({'ip': ip, 'port': port.get('portid'), 'service': nombre, 'tls': tls, 'url': url})
    return servicios


# Servicios que Nmap nombra directamente por su versión cifrada (sin tunnel="ssl").
_SERVICIOS_TLS = {'https', 'https-alt', 'imaps', 'pop3s', 'smtps', 'ldaps', 'ftps', 'ircs', 'nntps'}


def _sondeo_de(ruta_resultado):
    """XML del sondeo de Nmap que acompaña a un resultado de Nuclei/testssl (misma carpeta y fecha)."""
    ruta = Path(ruta_resultado)
    marca = re.search(_RE_FECHA_ARCHIVO, ruta.name)
    prefijo = SONDEO_POR_EXTENSION.get(ruta.suffix)
    if not marca or not prefijo:
        return None
    return ruta.parent / f"{prefijo}_{marca.group(0)}.xml"


def _filas_con_hallazgos(ruta_resultado, hallazgos):
    """
    Filas planas (mismo formato que generar_tabla_xml) a partir del sondeo de Nmap, con los
    hallazgos de Nuclei/testssl colgados de su (IP, puerto). Así el resto del parser, el CLI y
    la GUI los tratan exactamente igual que a los hallazgos de Nmap.
    """
    sondeo = _sondeo_de(ruta_resultado)
    filas = generar_tabla_xml(str(sondeo)) if sondeo and sondeo.exists() else []
    if filas and "Error" in filas[0]:
        filas = []

    for entrada in hallazgos:
        ip, puerto = entrada["device"], entrada["port"]
        fila = next((f for f in filas if f['IP'] == ip and f['Puerto'] == puerto), None)
        if fila is None:
            # Hallazgo en un puerto que el sondeo no listó (ej. plantilla de red de Nuclei con su
            # propio puerto): se crea la fila copiando los datos de host si el host es conocido.
            del_host = next((f for f in filas if f['IP'] == ip), None)
            fila = dict(del_host) if del_host else {
                'IP': ip, 'HostStatus': 'up', 'MAC': 'N/D', 'Vendor': '', 'Hostname': '',
                'LatenciaMs': 0.0, 'OS': None, 'LocationURLs': [],
            }
            fila.update({'Puerto': puerto, 'Protocolo': 'tcp', 'Estado': 'open' if puerto else None,
                         'Servicio': 'N/D', 'Vulnerabilidades': [], 'PosiblesVulnerabilidades': []})
            filas.append(fila)
        fila['Vulnerabilidades'] = fila['Vulnerabilidades'] + [entrada]
    return filas


def filas_de_resultado(ruta):
    """Filas planas de cualquier resultado principal (Nmap .xml, Nuclei .jsonl, testssl .json)."""
    ruta = Path(ruta)
    if ruta.suffix == ".xml":
        return generar_tabla_xml(str(ruta))
    try:
        if ruta.suffix == ".jsonl":
            registros = [json.loads(l) for l in ruta.read_text().splitlines() if l.strip()]
            hallazgos = [vuln_classification.clasificar_nuclei(r) for r in registros]
        elif ruta.suffix == ".json":
            hallazgos = [vuln_classification.clasificar_testssl(r) for r in json.loads(ruta.read_text())]
        else:
            return [{"Error": f"Formato de resultado no reconocido: {ruta.name}"}]
    except Exception as e:
        return [{"Error": f"No se pudo leer el archivo: {e}"}]
    return _filas_con_hallazgos(ruta, [h for h in hallazgos if h])


def _duracion_escaneo(ruta):
    """
    Duración de un escaneo. Nmap la trae en su XML; para Nuclei/testssl se mide desde la fecha del
    nombre (inicio del sondeo) hasta la última modificación del resultado (cuando terminó).
    """
    ruta = Path(ruta)
    if ruta.suffix == ".xml":
        try:
            return _extraer_info_escaneo(ET.parse(ruta).getroot())
        except Exception:
            return {'segundos': 0.0, 'duracion_str': 'N/D', 'inicio': None, 'fin': None}
    inicio = fecha_de_escaneo(ruta)
    fin = datetime.fromtimestamp(ruta.stat().st_mtime)
    segundos = max(0.0, (fin - inicio).total_seconds()) if inicio else 0.0
    minutos, segs_resto = divmod(round(segundos), 60)
    return {
        'segundos': segundos,
        'duracion_str': f"{minutos}m {segs_resto}s" if minutos else f"{segs_resto}s",
        'inicio': str(inicio) if inicio else None,
        'fin': str(fin),
    }


def ultimos_escaneos(os_folder):
    """
    El XML más reciente y TERMINADO de cada categoría (agrupando los archivos por su nombre sin
    la fecha). Es lo que usa el dashboard combinado: así refleja el estado ACTUAL de la red y no
    todo el historial — un dispositivo que ya no está o una vulnerabilidad ya corregida dejan de
    contar en cuanto se vuelve a escanear esa categoría. Si el último escaneo de una categoría
    quedó incompleto (cancelado, interrumpido), se usa el anterior que sí terminó.
    """
    por_categoria = {}
    for herramienta, extension in FORMATOS_RESULTADO.items():
        resultados_dir = directorio_resultados(os_folder, herramienta)
        if not resultados_dir.exists():
            continue
        # Solo la extensión del resultado principal de cada herramienta: los sondeos .xml de
        # Nuclei/testssl viven en sus propias carpetas y no cuentan como categoría aparte.
        patron = re.compile(rf"^(.+)_{_RE_FECHA_ARCHIVO}{re.escape(extension)}$")
        for archivo in resultados_dir.iterdir():
            m = patron.match(archivo.name)
            if m:
                por_categoria.setdefault(m.group(1), []).append(archivo)

    ultimos = []
    for archivos in por_categoria.values():
        # El nombre trae la fecha en formato ordenable: el mayor es el más reciente.
        for archivo in sorted(archivos, key=lambda f: f.name, reverse=True):
            if escaneo_finalizado(archivo):
                ultimos.append(archivo)
                break
    return ultimos


def obtener_datos_completos(os_folder):
    """Combina las filas del escaneo más reciente de cada categoría (ver ultimos_escaneos)."""
    todos_los_datos = []
    for archivo in ultimos_escaneos(os_folder):
        datos = filas_de_resultado(archivo)
        if datos and "Error" not in datos[0]:
            todos_los_datos.extend(datos)
    return todos_los_datos


def obtener_estadisticas_dashboard(os_folder):
    """
    Estadísticas combinadas del escaneo más reciente de cada categoría (ver ultimos_escaneos).
    Solo cuenta vulnerabilidades CONFIRMADAS (las 'posibles' quedan fuera a propósito,
    para no inflar el nivel de riesgo con hallazgos que Nmap no pudo verificar).

    Se calcula a partir de los dispositivos ya deduplicados (obtener_dispositivos_agrupados),
    para que el conteo coincida exactamente con lo que se muestra por dispositivo en la UI
    (si el mismo hallazgo aparece en más de un archivo XML —p. ej. vulnerabilidades.xml y
    full_pack.xml— no se cuenta dos veces).
    """
    dispositivos = obtener_dispositivos_agrupados(os_folder)

    vulns_por_sev = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    total_vulns = 0
    vulnerabilidades_lista = []

    for d in dispositivos:
        for v in d['vulnerabilities']:
            vulns_por_sev[v['severity']] += 1
            total_vulns += 1
            vulnerabilidades_lista.append({
                'severity': v['severity'],
                'sev_label': v['sev_label'],
                'desc': f"[{v['id']}] {v['output'][:100]}",
                'device': d['ip'],
                'status': 'open'
            })

    riesgo = "BAJO"
    if vulns_por_sev["critical"] > 0: riesgo = "CRÍTICO"
    elif vulns_por_sev["high"] > 0: riesgo = "ALTO"
    elif vulns_por_sev["medium"] > 0: riesgo = "MEDIO"

    # Fecha y tiempo salen de los MISMOS archivos que alimentan los dispositivos, para que todo
    # el dashboard describa el mismo conjunto de escaneos.
    archivos = ultimos_escaneos(os_folder)
    last_scan = "N/A"
    if archivos:
        last_scan = max(fecha_de_escaneo(a) for a in archivos).strftime('%d/%m/%y')

    # Tiempo total escaneando: suma del 'elapsed' de cada archivo XML combinado (cada uno
    # es una corrida de Nmap independiente, así que se suman, no se toma el máximo).
    segundos_totales = sum(_duracion_escaneo(archivo)['segundos'] for archivo in archivos)

    minutos, segs_resto = divmod(round(segundos_totales), 60)
    scan_time_total_str = f"{minutos}m {segs_resto}s" if minutos else f"{segs_resto}s"

    return {
        "active_devices": len(dispositivos),
        "total_vulns": total_vulns,
        "risk_level": riesgo,
        "vulns_by_severity": vulns_por_sev,
        "vulnerabilities": vulnerabilidades_lista,
        "devices": [d['ip'] for d in dispositivos],
        "last_scan": last_scan,
        "scan_time_total_seconds": segundos_totales,
        "scan_time_total_str": scan_time_total_str,
    }


def agrupar_vulnerabilidades_para_mostrar(vulnerabilidades):
    """
    Colapsa vulnerabilidades que comparten 'group_key' (mismo producto/versión detectado por
    el script 'vulners' en el mismo host:puerto) en una sola entrada resumen, para que la UI
    no tenga que mostrar decenas de badges individuales por un mismo hallazgo de versión.
    Las entradas sin 'group_key' (hallazgos de --script vuln, excepciones conocidas, etc.)
    se devuelven sin modificar.

    IMPORTANTE: esto es solo para PRESENTACIÓN. Las estadísticas globales (total_vulns,
    vulns_by_severity, risk_level) se calculan sobre la lista SIN agrupar, para que el nivel
    de riesgo refleje la cantidad real de hallazgos, no la cantidad de filas visuales.
    """
    orden_severidad = {"critical": 3, "high": 2, "medium": 1, "low": 0}
    grupos = {}
    sueltas = []

    for v in vulnerabilidades:
        key = v.get("group_key")
        if not key:
            sueltas.append(v)
            continue
        if key not in grupos:
            grupos[key] = {
                "id": v.get("group_label", "Producto desconocido"),
                "output": "",
                "severity": v["severity"],
                "sev_label": v["sev_label"],
                "device": v["device"],
                "port": v.get("port"),
                "status": "confirmada",
                "cve_count": 0,
                "cve_ids": [],
            }
        grupo = grupos[key]
        grupo["cve_count"] += 1
        grupo["cve_ids"].append(v["id"])
        if orden_severidad[v["severity"]] > orden_severidad[grupo["severity"]]:
            grupo["severity"] = v["severity"]
            grupo["sev_label"] = v["sev_label"]

    for grupo in grupos.values():
        grupo["output"] = f"{grupo['cve_count']} hallazgos conocidos (severidad máxima: {grupo['sev_label']})"

    return sueltas + list(grupos.values())


def _clave_orden_ip(ip):
    """
    Convierte una IP en una tupla de enteros para poder ordenarla numéricamente
    (10.0.0.2 antes que 10.0.0.13 — un ordenamiento de texto plano pondría "10.0.0.13"
    primero porque '1' < '2' como caracter). Usado porque varios escaneos corren con
    --randomize-hosts, así que el orden en que Nmap procesa los hosts (y por lo tanto el
    orden en que aparecen en el XML) es aleatorio: sin esto, la lista de dispositivos
    saldría en un orden distinto cada vez.

    Si 'ip' no tiene el formato IPv4 esperado (ej. "Desconocido"), se ordena al final.
    """
    try:
        return (0, tuple(int(octeto) for octeto in ip.split(".")))
    except (ValueError, AttributeError):
        return (1, ip)


def _agrupar_por_dispositivo(filas, incluir_posibles=False):
    """Helper interno: agrupa filas planas (una por puerto) en dispositivos únicos por IP."""
    dispositivos = {}
    for fila in filas:
        ip = fila['IP']
        if ip not in dispositivos:
            dispositivos[ip] = {
                'ip': ip,
                'device': fila.get('Hostname') or fila.get('Vendor') or 'Dispositivo Desconocido',
                'mac': fila.get('MAC', 'N/D'),
                'services': [],
                'ports': [],
                # Puertos TCP/UDP que salieron "filtered": en un escaneo TCP, un puerto
                # filtrado normalmente significa que hay un firewall bloqueando la respuesta
                # (a diferencia de "closed", que sí respondió confirmando que no hay nada
                # escuchando). Se guardan aparte de 'ports'/'services' (que siguen siendo solo
                # puertos abiertos, para no romper nada que ya consuma esos campos) para que la
                # interfaz los pueda pintar de otro color.
                'filtered_ports': [],
                'filtered_services': [],
                # Detalle completo por puerto (abiertos y filtrados): protocolo, producto,
                # versión, device type del servicio, y si Nmap logró reconocer el servicio o no
                # (para saber cuándo vale la pena mostrar el fingerprint crudo).
                'service_details': [],
                # Detección de SO (Device type / Running / OS CPE / OS details, o los 3
                # "Aggressive OS guesses" más probables cuando no hay match exacto). None si la
                # categoría de escaneo no corrió -O (ej. Auditoría admin).
                'os_info': None,
                # URLs "Location:" encontradas en respuestas SSDP/UPnP (script fingerprint-strings
                # en el puerto 1900), que suelen apuntar a un XML de descripción del dispositivo.
                'location_urls': [],
                'vulnerabilities': [],
                'latency': fila.get('LatenciaMs', 0.0),
            }
            if incluir_posibles:
                dispositivos[ip]['possible_vulnerabilities'] = []

        dev = dispositivos[ip]

        if dev['os_info'] is None and fila.get('OS'):
            dev['os_info'] = fila['OS']

        for url in fila.get('LocationURLs') or []:
            if url not in dev['location_urls']:
                dev['location_urls'].append(url)

        estado = fila.get('Estado')
        puerto_num = None
        if fila.get('Puerto'):
            try:
                puerto_num = int(fila['Puerto'])
            except (TypeError, ValueError):
                puerto_num = None

        if puerto_num is not None and estado == 'open':
            if puerto_num not in dev['ports']:
                dev['ports'].append(puerto_num)
                dev['services'].append(f"{puerto_num}/{fila.get('Servicio', 'unknown')}")
        elif puerto_num is not None and estado == 'filtered':
            if puerto_num not in dev['filtered_ports']:
                dev['filtered_ports'].append(puerto_num)
                dev['filtered_services'].append(f"{puerto_num}/{fila.get('Servicio', 'unknown')}")

        # service_details solo interesa para puertos abiertos o filtrados (closed es ruido:
        # confirma que no hay nada ahí, no aporta nada a mostrar).
        if puerto_num is not None and estado in ('open', 'filtered'):
            ya_registrado = any(
                d['port'] == puerto_num and d['protocol'] == fila.get('Protocolo')
                for d in dev['service_details']
            )
            if not ya_registrado:
                dev['service_details'].append({
                    'port': puerto_num,
                    'protocol': fila.get('Protocolo'),
                    'state': estado,
                    'reason': fila.get('EstadoRazon'),
                    'service': fila.get('Servicio', 'N/D'),
                    'reconocido': fila.get('ServicioReconocido', True),
                    'product': fila.get('Producto'),
                    'version': fila.get('VersionServicio'),
                    'extrainfo': fila.get('InfoExtra'),
                    'devicetype': fila.get('DeviceTypeServicio'),
                    'fingerprint': fila.get('Fingerprint'),
                    'title': fila.get('TituloWeb'),
                })

        for v in fila.get('Vulnerabilidades', []):
            ya_existe = any(
                existente['id'] == v['id'] and existente.get('port') == v.get('port')
                for existente in dev['vulnerabilities']
            )
            if not ya_existe:
                dev['vulnerabilities'].append(v)

        if incluir_posibles:
            for v in fila.get('PosiblesVulnerabilidades', []):
                ya_existe = any(
                    existente['id'] == v['id'] and existente.get('port') == v.get('port')
                    for existente in dev['possible_vulnerabilities']
                )
                if not ya_existe:
                    dev['possible_vulnerabilities'].append(v)

    # Se ordena por IP numérica (no alfabética) para que el orden sea consistente
    # sin importar en qué orden haya procesado Nmap los hosts (--randomize-hosts).
    return sorted(dispositivos.values(), key=lambda d: _clave_orden_ip(d['ip']))


def obtener_dispositivos_agrupados(os_folder):
    """
    Agrupa el escaneo más reciente de cada categoría en dispositivos únicos por IP.
    Las vulnerabilidades quedan SIN agrupar por producto (una entrada por CVE individual):
    esta es la fuente que usa obtener_estadisticas_dashboard() para que el conteo total y el
    desglose por severidad reflejen la cantidad real de hallazgos, no la cantidad de filas
    visuales. Para la vista de tabla en la interfaz, usar obtener_dispositivos_para_dashboard().
    Solo incluye vulnerabilidades confirmadas (no las 'posibles').
    """
    datos = obtener_datos_completos(os_folder)
    return _agrupar_por_dispositivo(datos, incluir_posibles=False)


def obtener_dispositivos_para_dashboard(os_folder):
    """
    Igual que obtener_dispositivos_agrupados(), pero con las vulnerabilidades de cada
    dispositivo ya colapsadas por producto/versión (ver agrupar_vulnerabilidades_para_mostrar).
    Esta es la función que debe consumir la interfaz nativa para pintar la tabla: evita que
    un solo servicio desactualizado (p. ej. dnsmasq viejo con 67 CVEs conocidos) genere 67
    filas/badges individuales para un mismo hallazgo de "versión vulnerable".
    """
    dispositivos = obtener_dispositivos_agrupados(os_folder)
    for dispositivo in dispositivos:
        dispositivo['vulnerabilities'] = agrupar_vulnerabilidades_para_mostrar(
            dispositivo['vulnerabilities']
        )
    return dispositivos


def obtener_resultados_categoria(ruta):
    """
    Para la pestaña 'Escaneo': resultados de UN solo archivo de una categoría específica (de
    cualquier herramienta, ver filas_de_resultado), incluyendo tanto vulnerabilidades
    confirmadas COMO posibles (sin confirmar).
    Las vulnerabilidades confirmadas se devuelven ya agrupadas por producto/versión
    (ver agrupar_vulnerabilidades_para_mostrar) para consistencia con el dashboard combinado.
    También incluye 'scan_time' con la duración total de ESE escaneo en particular.
    """
    filas = filas_de_resultado(ruta)
    if filas and isinstance(filas[0], dict) and "Error" in filas[0]:
        return {"error": filas[0]["Error"]}

    scan_time = _duracion_escaneo(ruta)

    dispositivos = _agrupar_por_dispositivo(filas, incluir_posibles=True)
    for dispositivo in dispositivos:
        dispositivo['vulnerabilities'] = agrupar_vulnerabilidades_para_mostrar(
            dispositivo['vulnerabilities']
        )
    return {"devices": dispositivos, "scan_time": scan_time}


def comparar_escaneos(ruta_nuevo, ruta_base):
    """
    Compara dos escaneos de la misma categoría y devuelve lo NUEVO en el más reciente: puertos
    que antes no estaban, o puertos que ya estaban pero con hallazgos que antes no aparecían
    (en ese caso la fila trae solo los hallazgos nuevos).
    """
    try:
        nuevo = filas_de_resultado(ruta_nuevo)
        base = filas_de_resultado(ruta_base)
    except Exception as e:
        return [{"Error": f"Error al comparar archivos: {e}"}]

    if not base or (isinstance(base[0], dict) and "Error" in base[0]):
        return nuevo

    if not nuevo or (isinstance(nuevo[0], dict) and "Error" in nuevo[0]):
        return nuevo

    conocidos = {}
    for f in base:
        conocidos.setdefault((f['IP'], f['Puerto']), set()).update(v['id'] for v in f.get('Vulnerabilidades', []))

    diferencias = []
    for f in nuevo:
        clave = (f['IP'], f['Puerto'])
        if clave not in conocidos:
            diferencias.append(f)
            continue
        hallazgos_nuevos = [v for v in f.get('Vulnerabilidades', []) if v['id'] not in conocidos[clave]]
        if hallazgos_nuevos:
            diferencias.append({**f, 'Vulnerabilidades': hallazgos_nuevos})

    return diferencias