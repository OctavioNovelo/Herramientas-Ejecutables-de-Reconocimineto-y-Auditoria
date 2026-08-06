# utils/parser.py
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
        hostname = hostname_el.get('name') if hostname_el is not None else ""

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
                'Vulnerabilidades': [], 'PosiblesVulnerabilidades': []
            })
            continue

        for port in puertos_del_host:
            estado_el = port.find('state')
            servicio_el = port.find('service')
            puerto_id = port.get('portid')

            fila = {
                'IP': ip,
                'Puerto': puerto_id,
                'Estado': estado_el.get('state') if estado_el is not None else "N/D",
                'Servicio': servicio_el.get('name') if servicio_el is not None else "N/D",
                'HostStatus': host_status,
                'MAC': mac,
                'Vendor': vendor,
                'Hostname': hostname,
                'LatenciaMs': latencia_ms,
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
    if resultados_dir.exists():
        archivos = list(resultados_dir.glob("*.xml"))
        if archivos:
            latest_file = max(archivos, key=lambda x: x.stat().st_mtime)
            from datetime import datetime
            last_scan = datetime.fromtimestamp(latest_file.stat().st_mtime).strftime('%d/%m/%y')

    return {
        "active_devices": len(dispositivos),
        "total_vulns": total_vulns,
        "risk_level": riesgo,
        "vulns_by_severity": vulns_por_sev,
        "vulnerabilities": vulnerabilidades_lista,
        "devices": [d['ip'] for d in dispositivos],
        "last_scan": last_scan
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
                'vulnerabilities': [],
                'latency': fila.get('LatenciaMs', 0.0),
            }
            if incluir_posibles:
                dispositivos[ip]['possible_vulnerabilities'] = []

        dev = dispositivos[ip]

        if fila.get('Puerto') and fila.get('Estado') == 'open':
            try:
                puerto_num = int(fila['Puerto'])
            except (TypeError, ValueError):
                puerto_num = None
            if puerto_num is not None and puerto_num not in dev['ports']:
                dev['ports'].append(puerto_num)
                dev['services'].append(f"{puerto_num}/{fila.get('Servicio', 'unknown')}")

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

    return list(dispositivos.values())


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
    """
    filas = generar_tabla_xml(ruta_xml)
    if filas and isinstance(filas[0], dict) and "Error" in filas[0]:
        return {"error": filas[0]["Error"]}

    dispositivos = _agrupar_por_dispositivo(filas, incluir_posibles=True)
    for dispositivo in dispositivos:
        dispositivo['vulnerabilities'] = agrupar_vulnerabilidades_para_mostrar(
            dispositivo['vulnerabilities']
        )
    return {"devices": dispositivos}


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