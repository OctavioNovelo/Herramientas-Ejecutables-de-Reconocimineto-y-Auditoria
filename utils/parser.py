import re
import xml.etree.ElementTree as ET
from pathlib import Path
from utils import vuln_classification


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
                categoria, entradas = vuln_classification.clasificar_script(script, ip, puerto_id)
                if categoria == "confirmada":
                    fila['Vulnerabilidades'].extend(entradas)
                elif categoria == "posible":
                    fila['PosiblesVulnerabilidades'].extend(entradas)

            filas_tabla.append(fila)
    return filas_tabla


def buscar_escaneos(directorio, base_name, extension=".xml"):
    """
    Finds all scan files for a category and sorts them by modification time (newest first).
    Handles base filenames and numbered versions (e.g., scan.xml, scan_1.xml, etc.).
    """
    path = Path(directorio)
    if not path.exists():
        return []

    archivos = []
    for f in path.glob(f"{base_name}*{extension}"):
        name = f.name
        if name == f"{base_name}{extension}":
            archivos.append(f)
        elif name.startswith(f"{base_name}_") and name[len(base_name)+1:-len(extension)].isdigit():
            archivos.append(f)

    archivos.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    return [str(a) for a in archivos]


def obtener_datos_completos(os_folder):
    """Lee todos los archivos XML en el directorio de resultados y los combina."""
    base_path = Path(__file__).parent.parent
    resultados_dir = base_path / "utils" / "Resultados" / os_folder / "Nmap"

    todos_los_datos = []
    if not resultados_dir.exists():
        return todos_los_datos

    for archivo in resultados_dir.glob("*.xml"):
        if archivo.suffix == ".xml":
            datos = generar_tabla_xml(str(archivo))
            if datos and "Error" not in datos[0]:
                todos_los_datos.extend(datos)

    return todos_los_datos


def obtener_estadisticas_dashboard(os_folder):
    """
    Estadísticas combinadas de TODOS los escaneos disponibles para el SO dado.
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

    base_path = Path(__file__).parent.parent
    resultados_dir = base_path / "utils" / "Resultados" / os_folder / "Nmap"
    last_scan = "N/A"
    segundos_totales = 0.0
    if resultados_dir.exists():
        archivos = list(resultados_dir.glob("*.xml"))
        if archivos:
            latest_file = max(archivos, key=lambda x: x.stat().st_mtime)
            from datetime import datetime
            last_scan = datetime.fromtimestamp(latest_file.stat().st_mtime).strftime('%d/%m/%y')

        # Tiempo total escaneando: suma del 'elapsed' de cada archivo XML combinado (cada uno
        # es una corrida de Nmap independiente, así que se suman, no se toma el máximo).
        for archivo in archivos:
            try:
                info = _extraer_info_escaneo(ET.parse(archivo).getroot())
                segundos_totales += info['segundos']
            except Exception:
                continue

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
    Agrupa TODOS los escaneos disponibles (todas las categorías) en dispositivos únicos por IP.
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


def obtener_resultados_categoria(ruta_xml):
    """
    Para la pestaña 'Escaneo': resultados de UN solo archivo XML de una categoría específica,
    incluyendo tanto vulnerabilidades confirmadas COMO posibles (sin confirmar).
    Las vulnerabilidades confirmadas se devuelven ya agrupadas por producto/versión
    (ver agrupar_vulnerabilidades_para_mostrar) para consistencia con el dashboard combinado.
    También incluye 'scan_time' con la duración total de ESE escaneo en particular
    (sacada de <runstats><finished> del propio XML).
    """
    filas = generar_tabla_xml(ruta_xml)
    if filas and isinstance(filas[0], dict) and "Error" in filas[0]:
        return {"error": filas[0]["Error"]}

    try:
        scan_time = _extraer_info_escaneo(ET.parse(ruta_xml).getroot())
    except Exception:
        scan_time = {'segundos': 0.0, 'duracion_str': 'N/D', 'inicio': None, 'fin': None}

    dispositivos = _agrupar_por_dispositivo(filas, incluir_posibles=True)
    for dispositivo in dispositivos:
        dispositivo['vulnerabilities'] = agrupar_vulnerabilidades_para_mostrar(
            dispositivo['vulnerabilities']
        )
    return {"devices": dispositivos, "scan_time": scan_time}


def comparar_escaneos(ruta_xml_nuevo, ruta_xml_base):
    """Compares two scans and returns what is NEW in the current scan."""
    try:
        nuevo = generar_tabla_xml(ruta_xml_nuevo)
        base = generar_tabla_xml(ruta_xml_base)
    except Exception as e:
        return [{"Error": f"Error al comparar archivos: {e}"}]

    if not base or (isinstance(base[0], dict) and "Error" in base[0]):
        return nuevo

    if not nuevo or (isinstance(nuevo[0], dict) and "Error" in nuevo[0]):
        return nuevo

    conocidos = set((f['IP'], f['Puerto']) for f in base)

    diferencias = []
    for f in nuevo:
        if (f['IP'], f['Puerto']) not in conocidos:
            diferencias.append(f)

    return diferencias