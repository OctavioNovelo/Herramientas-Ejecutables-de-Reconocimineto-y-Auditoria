# frontend/cli_render.py
# Presentación del CLI en la terminal: banners, menús, tablas y fichas de dispositivo.
# Es la contraparte de los componentes de la interfaz nativa (ScanView.ts, ResultsTable.ts,
# SecurityCard.ts): recibe EXACTAMENTE los mismos datos ya procesados por utils/parser.py
# y solo decide cómo pintarlos. Aquí no se interpreta ningún XML ni se clasifica nada.
#
# Estilo clásico de herramienta de consola: banners con '=', marcadores [*] [+] [!] [-] y
# tablas en ASCII. El color se usa solo para riesgo y severidad.

import os
import platform
import sys

import frontend.option as option

ANCHO = 80

# --- Color (solo riesgo/severidad) ---
# Se desactiva si la salida no es una terminal o si el usuario define NO_COLOR.
_USAR_COLOR = sys.stdout.isatty() and "NO_COLOR" not in os.environ
if _USAR_COLOR and platform.system() == "Windows":
    os.system("")  # Activa el procesamiento de secuencias ANSI en la consola de Windows.

_ROJO, _AMARILLO, _VERDE, _CIAN = "31", "33", "32", "36"


def _color(texto, codigo):
    return f"\033[{codigo}m{texto}\033[0m" if _USAR_COLOR else texto


# Mismo criterio que la GUI (clases .critical/.high/.medium/.low de ScanView.css).
_COLOR_SEVERIDAD = {"critical": "1;31", "high": _ROJO, "medium": _AMARILLO, "low": _CIAN}
_ORDEN_SEVERIDAD = {"critical": 3, "high": 2, "medium": 1, "low": 0}

# Mismo mapeo que SecurityCard.ts: CRÍTICO/ALTO -> RIESGO, MEDIO -> ADVERTENCIA, resto SEGURO.
_ESTADO_SEGURIDAD = {
    "CRÍTICO": ("RIESGO", "1;31"),
    "ALTO": ("RIESGO", "1;31"),
    "MEDIO": ("ADVERTENCIA", "1;33"),
    "BAJO": ("SEGURO", "1;32"),
}


def severidad(etiqueta, clave):
    return _color(etiqueta, _COLOR_SEVERIDAD.get(clave, "0"))


# --- Elementos básicos ---

def banner(texto):
    print("\n" + "=" * ANCHO)
    print(f"{texto.upper():^{ANCHO}}")
    print("=" * ANCHO)


def seccion(texto):
    print(f"\n--- {texto} ---\n")


def info(texto):
    print(f"[*] {texto}")


def exito(texto):
    print(f"\n[+] {texto}")


def aviso(texto):
    print(f"\n[!] {texto}")


def error(texto):
    print(f"\n[-] Error: {texto}")


def menu(opciones, salida="Regresar"):
    """Imprime opciones numeradas [(texto, nota|None), ...] y la opción 0."""
    ancho_texto = max((len(t) for t, _ in opciones), default=0)
    print()
    for i, (texto, nota) in enumerate(opciones, start=1):
        print(f" {i}) {texto.ljust(ancho_texto)}   [{nota}]" if nota else f" {i}) {texto}")
    print(f" 0) {salida}\n")


def recortar(texto, ancho):
    texto = str(texto)
    return texto if len(texto) <= ancho else texto[: ancho - 3] + "..."


def estado_seguridad(stats):
    """(etiqueta, etiqueta coloreada) del estado de seguridad, o None si no hay resultados."""
    if not stats or stats["active_devices"] == 0:
        return None
    etiqueta, codigo = _ESTADO_SEGURIDAD.get(stats["risk_level"], _ESTADO_SEGURIDAD["BAJO"])
    return etiqueta, _color(etiqueta, codigo)


# --- Dashboard ---

def mostrar_dashboard(stats, dispositivos):
    """Equivalente a la vista Dashboard de main.ts: estado, resumen y tabla de dispositivos."""
    estado = estado_seguridad(stats)
    if estado is None:
        aviso("No hay escaneos previos. Ejecuta un Full Pack (o cualquier categoría) primero.")
        return

    etiqueta, texto_estado = estado
    sev = stats["vulns_by_severity"]
    print(f" Estado de seguridad : {texto_estado}")
    print(f" Último escaneo      : {stats['last_scan']}")
    print(f" Hosts activos       : {stats['active_devices']}")
    print(f" Vulnerabilidades    : {stats['total_vulns']}  ("
          f"{severidad('Crítica', 'critical')} {sev['critical']} / "
          f"{severidad('Alta', 'high')} {sev['high']} / "
          f"{severidad('Media', 'medium')} {sev['medium']} / "
          f"{severidad('Baja', 'low')} {sev['low']})")
    print(f" Tiempo escaneando   : {stats['scan_time_total_str']}")

    seccion(f"Dispositivos ({len(dispositivos)})")
    _tabla_dispositivos(dispositivos)

    con_hallazgos = [d for d in dispositivos if d["vulnerabilities"]]
    if con_hallazgos:
        seccion("Hallazgos confirmados")
        for dev in con_hallazgos:
            print(f"[+] {dev['ip']} - {dev['device']}")
            for v in dev["vulnerabilities"]:
                _linea_vulnerabilidad(v)
            print()


def _tabla_dispositivos(dispositivos):
    """Tabla compacta, columnas equivalentes a ResultsTable.ts."""
    print(f"{'IP':<16}| {'DISPOSITIVO':<20}| {'SO':<18}| {'PUERTOS':<15}| VULNS")
    print("-" * ANCHO)
    for dev in dispositivos:
        vulns = dev["vulnerabilities"]
        if vulns:
            peor = max(vulns, key=lambda v: _ORDEN_SEVERIDAD[v["severity"]])
            total = sum(v.get("cve_count") or 1 for v in vulns)
            celda_vul = severidad(f"{total} ({peor['sev_label']})", peor["severity"])
        else:
            celda_vul = "-"
        puertos = ",".join(str(p) for p in dev["ports"]) or "-"
        print(f"{dev['ip']:<16}| {recortar(dev['device'], 19):<20}| "
              f"{recortar(_resumen_so(dev.get('os_info')), 17):<18}| {recortar(puertos, 14):<15}| {celda_vul}")


def _resumen_so(os_info):
    """Versión corta del SO para una celda de tabla (mismo criterio que ResultsTable.ts)."""
    if not os_info:
        return "-"
    if os_info["exact_match"]:
        return os_info["running"] or ", ".join(os_info["device_types"]) or "-"
    if os_info["guesses"]:
        g = os_info["guesses"][0]
        return f"{g['name'] or '?'} (~{g['accuracy'] or '?'}%)"
    return "-"


def _linea_vulnerabilidad(v, clave_sev=None, etiqueta_sev=None):
    clave_sev = clave_sev or v["severity"]
    etiqueta_sev = (etiqueta_sev or v["sev_label"]).upper()
    nombre = f"{v['id']} ({v['cve_count']} CVEs)" if v.get("cve_count") else v["id"]
    puerto = f" - puerto {v['port']}" if v.get("port") else ""
    print(f"      {severidad(f'[{etiqueta_sev}]', clave_sev)} {nombre}{puerto}")
    if v.get("output"):
        print(f"          {recortar(v['output'], ANCHO - 10)}")


# --- Resultados por categoría (equivalente a ScanView.ts::renderDevices) ---

def mostrar_resultados_categoria(categoria, resultado):
    """'resultado' es la salida de parser.obtener_resultados_categoria()."""
    dispositivos = resultado["devices"]
    scan_time = resultado.get("scan_time") or {}
    if scan_time.get("duracion_str") and scan_time["duracion_str"] != "N/D":
        info(f"Duración del escaneo: {scan_time['duracion_str']}")
    if not dispositivos:
        if categoria.id == "ocultos":
            exito("Ningún dispositivo oculto: todos los hosts activos responden al ping.")
        else:
            aviso("El escaneo no encontró dispositivos activos.")
        return
    info(f"Dispositivos activos: {len(dispositivos)}\n")
    for dev in dispositivos:
        _ficha_dispositivo(categoria.id, dev)


def _ficha_dispositivo(cat_id, dev):
    print(f"[+] {dev['ip']} - {dev['device'] or 'N/D'}")
    _campo("MAC", dev["mac"])
    if dev.get("latency"):
        _campo("Latencia", f"{dev['latency']} ms")

    # Mismas reglas de qué mostrar en cada categoría que ScanView.ts.
    if cat_id != "vuln":
        _campo_so(dev.get("os_info"))

    if cat_id == "admin":
        _campo_lista("Gestión", [_etiqueta_admin(dev, p) for p in dev["ports"]],
                     "Sin puertos de gestión abiertos")
    else:
        _campo_lista("Abiertos", [_etiqueta_servicio(dev, p, s) for p, s in zip(dev["ports"], dev["services"])],
                     "Sin puertos abiertos detectados")

    if dev["filtered_services"]:
        _campo("Filtrados", ", ".join(dev["filtered_services"]) + "  (probable firewall)")

    if cat_id != "vuln":
        _campo_lista("UPnP", dev["location_urls"])

    if cat_id == "vuln":
        _vulnerabilidades_divididas(dev)
    elif dev["vulnerabilities"]:
        _campo("Vulns", "")
        for v in dev["vulnerabilities"]:
            _linea_vulnerabilidad(v)
    print()


def _campo(nombre, valor):
    print(f"    {nombre:<11}: {valor}")


def _campo_lista(nombre, valores, si_vacio=None):
    """Primer valor junto a la etiqueta, el resto alineado debajo."""
    if not valores:
        if si_vacio:
            _campo(nombre, si_vacio)
        return
    _campo(nombre, valores[0])
    for valor in valores[1:]:
        print(f"    {'':<11}  {valor}")


def _campo_so(os_info):
    if not os_info:
        return
    if os_info["exact_match"]:
        partes = [", ".join(os_info["device_types"])] if os_info["device_types"] else []
        if os_info["running"]:
            partes.append(os_info["running"])
        texto = " - ".join(partes) or os_info["details"]
        if texto and os_info["details"] and os_info["details"] != texto:
            texto += f" ({os_info['details']})"
        if texto:
            _campo("SO", texto)
    elif os_info["guesses"]:
        guesses = ", ".join(f"{g['name'] or '?'} ({g['accuracy'] or '?'}%)" for g in os_info["guesses"])
        _campo("SO", f"sin match exacto: {guesses}")


def _etiqueta_servicio(dev, puerto, servicio):
    """'22/ssh (OpenSSH 7.4)', como el tooltip de los badges en la GUI."""
    for d in dev["service_details"]:
        if d["port"] == puerto and d["state"] == "open":
            partes = [p for p in (d["product"], d["version"], d["extrainfo"]) if p]
            if partes:
                return f"{servicio} ({' '.join(partes)})"
            if not d["reconocido"] and d["fingerprint"]:
                return f"{servicio} (no reconocido, fingerprint disponible)"
    return servicio


def _etiqueta_admin(dev, puerto):
    texto = f"{puerto}/{option.admin_port_label(puerto)}"
    # Título de la página (http-title): dice QUÉ panel es, no solo que el puerto está abierto.
    titulo = next((d["title"] for d in dev["service_details"]
                   if d["port"] == puerto and d["state"] == "open" and d.get("title")), None)
    if titulo:
        texto += f' "{recortar(titulo, 40)}"'
    if puerto in option.ADMIN_STANDARD_PORTS:
        return texto
    return f"{texto}  " + _color("[!] no estándar", _AMARILLO)


def _vulnerabilidades_divididas(dev):
    """Confirmadas vs. posibles, igual que renderVulnSplit en ScanView.ts."""
    confirmadas = dev["vulnerabilities"]
    posibles = dev.get("possible_vulnerabilities", [])
    if not confirmadas and not posibles:
        _campo("Vulns", "Sin hallazgos de vulnerabilidades")
        return
    _campo("Confirmadas", str(len(confirmadas)))
    for v in confirmadas:
        _linea_vulnerabilidad(v)
    _campo("Posibles", f"{len(posibles)} (sin confirmar)")
    for v in posibles:
        _linea_vulnerabilidad(v, "low", "Sin confirmar")


# --- Comparación entre escaneos ---

def mostrar_cambios(filas):
    """Filas planas (parser.comparar_escaneos) que son NUEVAS respecto al escaneo anterior."""
    print(f"\n{'IP':<16}| {'PUERTO':<10}| {'SERVICIO':<18}| ESTADO")
    print("-" * 60)
    for f in filas:
        puerto = f"{f['Puerto']}/{f.get('Protocolo') or ''}" if f["Puerto"] else "-"
        print(f"{f['IP']:<16}| {puerto:<10}| {recortar(f['Servicio'] or '-', 17):<18}| {f['Estado'] or 'host nuevo'}")
        for v in f.get("Vulnerabilidades", []):
            print(f"   └── {severidad('[' + v['sev_label'].upper() + ']', v['severity'])} {v['id']}")
