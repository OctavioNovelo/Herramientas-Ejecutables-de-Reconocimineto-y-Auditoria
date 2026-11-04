# utils/vuln_classification.py
# Esta madre se la pedi a claude. Estuve moviendole cosas antes de vacaciones pero la neta YA NO me acuerdo que pedo
"""
Clasifica los resultados de los scripts NSE de Nmap en:
  - "confirmada": hallazgo verificado (librería 'vulns' con state=VULNERABLE,
    CVEs de 'vulners', o una excepción conocida con patrón de texto confirmado).
  - "posible": Nmap buscó pero no pudo confirmar (librería 'vulns' con state=UNKNOWN).
  - None: puramente informativo (banner grabbing, certificados, versiones, etc.) — se ignora.

Esta es la ÚNICA fuente de verdad para esta lógica (Nmap NSE, Nuclei y testssl, ver abajo). Tanto el CLI como la interfaz nativa
(vía utils/parser.py, invocado directamente o a través de los comandos de Tauri) pasan por aquí.
No debe existir una segunda implementación de este criterio en TypeScript.
"""

# Excepciones conocidas: scripts que NO usan la librería 'vulns' de Nmap (sin <table> con
# elem 'state') pero cuyo output de texto libre indica un hallazgo real y específico cuando
# contiene cierta frase. Extensible: agregar más entradas conforme se detecten en escaneos reales.
KNOWN_EXCEPTIONS = {
    "http-csrf": {
        "confirm_substring": "possible csrf vulnerabilities",
        "severity": "medium",
        "sev_label": "Media",
    },
}


def _formatear_cpe(cpe_key):
    """
    Convierte 'cpe:/a:thekelleys:dnsmasq:2.15-opendns-1' en 'dnsmasq 2.15-opendns-1'.
    Si el formato no es el esperado, devuelve la cadena original sin modificar.
    """
    if not cpe_key or not cpe_key.startswith("cpe:/"):
        return cpe_key or "Producto desconocido"
    partes = cpe_key.split(":")
    # cpe:/a:vendor:product:version -> ['cpe', '/a', 'vendor', 'product', 'version', ...]
    if len(partes) >= 5:
        producto = partes[3]
        version = partes[4]
        return f"{producto} {version}".strip()
    return cpe_key


def _severidad_desde_cvss(cvss):
    """Umbrales estándar de CVSS v3: 9+ Crítica, 7+ Alta, 4+ Media, resto Baja."""
    try:
        score = float(cvss)
    except (TypeError, ValueError):
        return "low", "Baja"
    if score >= 9:
        return "critical", "Crítica"
    if score >= 7:
        return "high", "Alta"
    if score >= 4:
        return "medium", "Media"
    return "low", "Baja"


def _severidad_desde_risk_factor(risk_factor):
    """Usa el risk_factor que el propio script de Nmap ya indicó, si está disponible."""
    rf = (risk_factor or "").strip().lower()
    mapping = {
        "critical": ("critical", "Crítica"),
        "high": ("high", "Alta"),
        "medium": ("medium", "Media"),
        "low": ("low", "Baja"),
    }
    return mapping.get(rf)


def _tabla_a_dict(table_elem):
    """Convierte los <elem> hijos directos de un <table> de Nmap en un dict {key: texto}."""
    resultado = {}
    for elem in table_elem.findall("elem"):
        key = elem.get("key")
        if key:
            resultado[key] = (elem.text or "").strip()
    return resultado


def clasificar_script(script_elem, ip, puerto):
    """
    Recibe el elemento XML <script> completo (xml.etree.ElementTree.Element) y devuelve:
        (categoria, [entradas])
    donde categoria in {"confirmada", "posible", None}, y cada entrada es un dict con:
    id, output, severity, sev_label, device, port, status.
    Puede haber varias entradas para un mismo script (caso 'vulners': una por CVE/exploit).
    """
    script_id = script_elem.get("id") or ""
    output = (script_elem.get("output") or "").strip()
    tables = script_elem.findall("table")

    # --- Caso especial: 'vulners' (cruce de CVEs conocidos contra la versión detectada) ---
    # No verifica nada en vivo contra el objetivo: son coincidencias de base de datos por
    # versión de servicio (CPE). Son hallazgos reales; se conservan individualmente aquí
    # (para que las estadísticas de riesgo sean exactas), pero se etiquetan con 'group_key'
    # y 'group_label' para que la capa de presentación pueda colapsarlas en una sola fila
    # por producto/versión (ver parser.py::agrupar_vulnerabilidades_para_mostrar).
    if script_id == "vulners":
        entradas = []
        for cpe_table in tables:
            cpe_key = cpe_table.get("key", "")
            group_label = _formatear_cpe(cpe_key)
            for sub in cpe_table.findall("table"):
                datos = _tabla_a_dict(sub)
                cve_id = datos.get("id", "CVE-desconocido")
                cvss = datos.get("cvss")
                severity, sev_label = _severidad_desde_cvss(cvss)
                es_exploit = datos.get("is_exploit", "false").lower() == "true"
                desc = f"CVSS {cvss or '?'}" + (" — exploit conocido públicamente" if es_exploit else "")
                entradas.append({
                    "id": cve_id,
                    "output": desc,
                    "severity": severity,
                    "sev_label": sev_label,
                    "device": ip,
                    "port": puerto,
                    "status": "confirmada",
                    "group_key": f"{ip}:{puerto}:{cpe_key}" if cpe_key else None,
                    "group_label": group_label,
                })
        if entradas:
            return "confirmada", entradas
        return None, []

    # --- Formato estándar de la librería 'vulns' de Nmap (usado por --script vuln) ---
    for table in tables:
        datos = _tabla_a_dict(table)
        state = datos.get("state", "")
        if not state:
            continue
        state_lower = state.lower()
        titulo = datos.get("title", script_id)

        if "not vulnerable" in state_lower:
            return None, []

        if "unknown" in state_lower:
            entrada = {
                "id": script_id,
                "output": titulo,
                "severity": "low",
                "sev_label": "Sin confirmar",
                "device": ip,
                "port": puerto,
                "status": "posible",
                "group_key": None,
                "group_label": None,
            }
            return "posible", [entrada]

        if "vulnerable" in state_lower:
            sev = _severidad_desde_risk_factor(datos.get("risk_factor"))
            if sev is None:
                # Confirmada por Nmap pero sin risk_factor explícito: fallback conservador.
                sev = ("high", "Alta")
            entrada = {
                "id": script_id,
                "output": titulo,
                "severity": sev[0],
                "sev_label": sev[1],
                "device": ip,
                "port": puerto,
                "status": "confirmada",
                "group_key": None,
                "group_label": None,
            }
            return "confirmada", [entrada]

        # Valor de 'state' no reconocido: se ignora de forma conservadora.
        return None, []

    # --- Excepciones conocidas: scripts sin tabla 'state' pero con hallazgo real en texto libre ---
    if script_id in KNOWN_EXCEPTIONS:
        exc = KNOWN_EXCEPTIONS[script_id]
        if exc["confirm_substring"] in output.lower():
            entrada = {
                "id": script_id,
                "output": output[:300],
                "severity": exc["severity"],
                "sev_label": exc["sev_label"],
                "device": ip,
                "port": puerto,
                "status": "confirmada",
                "group_key": None,
                "group_label": None,
            }
            return "confirmada", [entrada]
        return None, []

    # --- Cualquier otro script (http-title, ssl-cert, dns-nsid, fingerprint-strings, etc.):
    # es puramente informativo, no representa una vulnerabilidad. ---
    return None, []

# --- Nuclei (tools/nuclei.py) ---
# Nuclei verifica cada hallazgo contra la respuesta real del servicio (matchers de la plantilla),
# así que todo lo que reporta con severidad low o mayor se considera confirmado. 'info' y 'unknown'
# ya se excluyen al ejecutar (-es info,unknown); si llegaran, se ignoran aquí también.

_SEVERIDAD_ETIQUETA = {"critical": "Crítica", "high": "Alta", "medium": "Media", "low": "Baja"}


def clasificar_nuclei(registro):
    """
    Recibe un dict de una línea del JSONL de Nuclei y devuelve una entrada con el mismo formato
    que clasificar_script() (más 'remediation' y 'references'), o None si no es un hallazgo.
    """
    info = registro.get("info") or {}
    severity = (info.get("severity") or "").lower()
    if severity not in _SEVERIDAD_ETIQUETA:
        return None

    clasificacion = info.get("classification") or {}
    cves = [c for c in (clasificacion.get("cve-id") or []) if c]
    descripcion = " ".join((info.get("description") or "").split())
    detalle = registro.get("matched-at") or ""
    if registro.get("matcher-name"):
        detalle += f" [{registro['matcher-name']}]"

    return {
        "id": info.get("name") or registro.get("template-id", "nuclei"),
        "template_id": registro.get("template-id"),
        "output": (f"{', '.join(c.upper() for c in cves)} — " if cves else "") + (descripcion[:300] or detalle),
        "matched_at": detalle,
        "severity": severity,
        "sev_label": _SEVERIDAD_ETIQUETA[severity],
        "device": registro.get("ip") or registro.get("host"),
        "port": str(registro.get("port") or "") or None,
        "status": "confirmada",
        "remediation": " ".join((info.get("remediation") or "").split()) or None,
        "references": [r for r in (info.get("reference") or []) if r][:3],
        "group_key": None,
        "group_label": None,
    }


# --- testssl.sh (tools/testssl.py) ---
# testssl prueba la configuración TLS en vivo (protocolos, cifrados, vulnerabilidades como
# Heartbleed/ROBOT, certificado), así que sus hallazgos LOW+ son confirmados. OK/INFO no son
# hallazgos; WARN/FATAL/DEBUG son avisos del propio escaneo.

_SEVERIDAD_TESTSSL = {"CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium", "LOW": "low"}

# En una red doméstica casi todos los routers, impresoras, NAS y cámaras sirven su panel con un
# certificado autofirmado. testssl lo reporta como CRÍTICO (cadena de confianza) más varios ALTO
# (sin SAN, no coincide con la URI, sin CRL/OCSP), lo que dejaría el dashboard siempre en CRÍTICO
# por algo esperable. Se reclasifican a Baja con una nota; los problemas reales de TLS (protocolos
# viejos, cifrados débiles, vulnerabilidades) conservan su severidad.
CERTIFICADO_ESPERABLE_EN_LAN = {
    "cert_chain_of_trust", "cert_trust", "cert_subjectAltName", "cert_revocation",
    "cert_caIssuers", "cert_ocspURL", "cert_crlDistributionPoints",
}
NOTA_CERTIFICADO_LAN = "normal en equipos domésticos con certificado autofirmado"

# Duplicados o puramente informativos (cert_notAfter es la fecha; el estado ya va en cert_expirationStatus).
TESTSSL_IGNORADOS = {"cert_notAfter", "cert_notBefore", "engine_problem"}


def clasificar_testssl(registro):
    """
    Recibe un dict del JSON plano de testssl (--jsonfile) y devuelve una entrada con el mismo
    formato que clasificar_script(), o None si no es un hallazgo.
    """
    hallazgo_id = registro.get("id") or ""
    severity = _SEVERIDAD_TESTSSL.get((registro.get("severity") or "").upper())
    if severity is None or hallazgo_id in TESTSSL_IGNORADOS:
        return None

    output = (registro.get("finding") or "").strip()
    if registro.get("cve"):
        output = f"{registro['cve']} — {output}"
    if hallazgo_id in CERTIFICADO_ESPERABLE_EN_LAN:
        severity = "low"
        output = f"{output} ({NOTA_CERTIFICADO_LAN})"

    # 'ip' viene como "hostname/ip"; nos quedamos con la IP para cruzarla con el sondeo de Nmap.
    ip = (registro.get("ip") or "").split("/")[-1] or None
    return {
        "id": f"TLS: {hallazgo_id}",
        "output": output[:300],
        "severity": severity,
        "sev_label": _SEVERIDAD_ETIQUETA[severity],
        "device": ip,
        "port": str(registro.get("port") or "") or None,
        "status": "confirmada",
        "remediation": None,
        "group_key": None,
        "group_label": None,
    }
