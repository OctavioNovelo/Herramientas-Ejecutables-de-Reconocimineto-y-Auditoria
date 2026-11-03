# frontend/CLI.py
# Flujo y menús del CLI. Replica la navegación de la interfaz nativa (NavBar.ts):
#
#   Dashboard  -> resumen combinado de todos los escaneos + lanzar Full Pack
#   Mapear     -> categorías de reconocimiento (rápido, ocultos, admin, ...)
#   Detectar   -> categorías de búsqueda de vulnerabilidades
#   Vulnerar   -> próximamente (explotación/pentesting aún no implementado)
#
# Cada categoría tiene su propia pantalla (equivalente a ScanView.ts): ejecutar con un objetivo
# opcional, ver los resultados del último escaneo, buscar en ellos y compararlos con el anterior.
#
# Este módulo solo orquesta: QUÉ categorías existen vive en option.py, CÓMO se pinta vive en
# cli_render.py, CÓMO se ejecuta vive en tools/nmap.py y CÓMO se interpreta vive en utils/parser.py.

import platform
import re
import subprocess
from pathlib import Path

import core.executor as ejec
import frontend.option as option
import tools.nmap as nmap
import utils.parser as parser
from frontend import cli_render as ui
from utils.system_info import obtener_carpeta_os

BASE_PATH = Path(__file__).parent.parent
OS_FOLDER = obtener_carpeta_os(platform.system())
RESULTADOS_DIR = BASE_PATH / "utils" / "Resultados" / OS_FOLDER / "Nmap"


# --- Entrada del usuario ---

def limpiar_pantalla():
    """Clears the terminal screen based on the operating system."""
    if platform.system() == "Windows":
        subprocess.run(["cls"], shell=True)
    else:
        subprocess.run(["clear"])


def leer_opcion(mensaje, min_val, max_val):
    """Lee un número dentro de [min_val, max_val], repitiendo hasta que sea válido."""
    while True:
        try:
            opcion = int(input(mensaje))
            if min_val <= opcion <= max_val:
                return opcion
            print(f"Error: Por favor seleccione una opción entre {min_val} y {max_val}.")
        except ValueError:
            print("Error: Entrada no válida. Por favor, ingrese un número.")


def leer_texto(mensaje):
    return input(mensaje).strip()


def confirmar(mensaje):
    return leer_texto(f"{mensaje} (s/n): ").lower() in ("s", "si", "sí", "y", "yes")


def pausar():
    input("\nPresiona Enter para continuar...")


# --- Menú principal ---

def cli():
    """Main CLI entry point."""
    try:
        while True:
            limpiar_pantalla()
            _encabezado_principal()
            ui.menu([("Dashboard", None), ("Mapear", None), ("Detectar", None), ("Vulnerar", "próximamente")],
                    salida="Salir")

            match leer_opcion("Seleccione una opción: ", 0, 4):
                case 0:
                    break
                case 1:
                    dashboard()
                case 2:
                    menu_grupo("mapear", "Mapear")
                case 3:
                    menu_grupo("detectar", "Detectar")
                case 4:
                    vulnerar()
    except (KeyboardInterrupt, EOFError):
        print()
    print("Bye!")


def _encabezado_principal():
    ui.banner("HERA - Auditoría y Análisis de Red")
    print(f" Red auditada : {_red_auditada()}")
    print(f" Host         : {platform.node() or 'localhost'}")

    stats = parser.obtener_estadisticas_dashboard(OS_FOLDER)
    estado = ui.estado_seguridad(stats)
    if estado is None:
        print(" Estado       : sin escaneos previos")
    else:
        print(f" Estado       : {estado[1]} | {stats['active_devices']} hosts | "
              f"{stats['total_vulns']} vulnerabilidades | último escaneo {stats['last_scan']}")
    print("=" * ui.ANCHO)


def _red_auditada():
    """Red del último escaneo (hosts.txt), el mismo dato que muestra la GUI en 'Dirección de Red'."""
    try:
        redes = [l.strip() for l in (RESULTADOS_DIR / "hosts.txt").read_text().splitlines() if l.strip()]
    except OSError:
        return "sin escaneos previos"
    return ", ".join(redes) or "sin red detectada"


# --- Vistas ---

def dashboard():
    """Equivalente a la vista Dashboard de la GUI: todos los escaneos combinados."""
    while True:
        limpiar_pantalla()
        ui.banner("Dashboard")
        ui.mostrar_dashboard(
            parser.obtener_estadisticas_dashboard(OS_FOLDER),
            parser.obtener_dispositivos_para_dashboard(OS_FOLDER),
        )
        # Igual que el botón único del dashboard de la GUI: siempre lanza Full Pack.
        ui.menu([("Nuevo escaneo completo (Full Pack)", None)])
        if leer_opcion("Seleccione una opción: ", 0, 1) == 0:
            return
        ejecutar_categoria(option.categoria_por_id("full"))


def menu_grupo(grupo, nombre):
    """Pestaña Mapear/Detectar: lista sus categorías (los "chips" de la GUI)."""
    categorias = option.categorias_de(grupo)
    if len(categorias) == 1:
        pantalla_categoria(categorias[0])
        return

    while True:
        limpiar_pantalla()
        ui.banner(nombre)
        ui.menu([(c.label, _resumen_ultimo_escaneo(c)) for c in categorias])
        opcion = leer_opcion("Seleccione una opción: ", 0, len(categorias))
        if opcion == 0:
            return
        pantalla_categoria(categorias[opcion - 1])


def pantalla_categoria(cat):
    while True:
        limpiar_pantalla()
        ui.banner(cat.label)
        for renglon in cat.descripcion.splitlines():
            print(f"- {renglon}")
        print(f"\nÚltimo escaneo: {_resumen_ultimo_escaneo(cat)}")

        ui.menu([
            ("Ejecutar escaneo", None),
            ("Ver resultados del último escaneo", None),
            ("Buscar en los resultados", None),
            ("Comparar con el escaneo anterior", None),
        ])
        match leer_opcion("Seleccione una opción: ", 0, 4):
            case 0:
                return
            case 1:
                ejecutar_categoria(cat)
            case 2:
                ver_resultados(cat)
            case 3:
                buscar_en_resultados(cat)
            case 4:
                comparar_con_anterior(cat)


def vulnerar():
    limpiar_pantalla()
    ui.banner("Vulnerar")
    print("\nEn construcción.\n")
    print("Las herramientas de explotación y pentesting todavía están en desarrollo.")
    print("Por ahora, la detección de vulnerabilidades vía Nmap está disponible en Detectar.")
    pausar()


# --- Resultados ---

def _escaneos(cat):
    """XML de la categoría, del más reciente al más antiguo."""
    return parser.buscar_escaneos(RESULTADOS_DIR, cat.file_base, extension=".xml")


def _resumen_ultimo_escaneo(cat):
    xmls = _escaneos(cat)
    if not xmls:
        return "sin resultados"
    fecha = parser.fecha_de_escaneo(xmls[0])
    return f"{fecha:%d/%m/%Y %H:%M}, {len(xmls)} en total"


def ver_resultados(cat, limpiar=True):
    if limpiar:
        limpiar_pantalla()
        ui.banner(f"Resultados - {cat.label}")
    xmls = _escaneos(cat)
    if not xmls:
        ui.aviso("No se encontraron resultados para esta categoría. Ejecuta un escaneo primero.")
    else:
        ui.info(f"Archivo: {Path(xmls[0]).name}")
        resultado = parser.obtener_resultados_categoria(xmls[0])
        if "error" in resultado:
            ui.error(resultado["error"])
        else:
            ui.mostrar_resultados_categoria(cat, resultado)
    pausar()


def buscar_en_resultados(cat):
    limpiar_pantalla()
    ui.banner(f"Buscar - {cat.label}")
    grepables = parser.buscar_escaneos(RESULTADOS_DIR, cat.file_base, extension="_grepable.txt")
    if not grepables:
        ui.aviso("No se encontraron resultados para esta categoría. Ejecuta un escaneo primero.")
        pausar()
        return

    termino = leer_texto("\n¿Qué buscas? (Ej: 'open', '80', 'ip'): ")
    if not termino:
        return
    coincidencias = parser.buscar_en_gnmap(grepables[0], termino)
    print(f"\n--- Coincidencias en {Path(grepables[0]).name}: {len(coincidencias)} ---\n")
    for renglon in coincidencias:
        print(renglon)
    pausar()


def comparar_con_anterior(cat):
    limpiar_pantalla()
    ui.banner(f"Comparar - {cat.label}")
    xmls = _escaneos(cat)
    if len(xmls) < 2:
        ui.aviso(f"Se necesitan al menos 2 escaneos para comparar. Escaneos encontrados: {len(xmls)}")
        pausar()
        return

    ui.info(f"Actual  : {Path(xmls[0]).name}")
    ui.info(f"Anterior: {Path(xmls[1]).name}")
    cambios = parser.comparar_escaneos(xmls[0], xmls[1])
    if cambios and "Error" in cambios[0]:
        ui.error(cambios[0]["Error"])
    elif not cambios:
        ui.exito("No se detectaron nuevos dispositivos o puertos abiertos.")
    else:
        ui.seccion("Nuevos dispositivos / puertos detectados")
        ui.mostrar_cambios(cambios)
    pausar()


# --- Ejecución de escaneos ---

def ejecutar_categoria(cat):
    limpiar_pantalla()
    ui.banner(cat.label)
    try:
        context = ejec.ejecutar_herramienta("Nmap", OS_FOLDER)
    except (OSError, KeyError) as e:
        ui.error(f"No se pudo preparar Nmap: {e}")
        pausar()
        return

    parametros = {}
    if cat.ejecutar is None:  # Personalizado: necesita su formulario antes de poder lanzarse.
        parametros = formulario_personalizado()
        if parametros is None:
            return
        lanzar = nmap.personalizado
    else:
        lanzar = cat.ejecutar

    redes = ", ".join(context["redes"]) or "ninguna"
    ui.seccion("Objetivo del escaneo")
    print(f"Red local detectada: {redes}")
    target = leer_texto("IP/red a escanear (Enter para usar la red local detectada): ") or None
    if not target and not context["redes"]:
        ui.error("No se detectó ninguna red local; especifica una IP o red.")
        pausar()
        return

    if cat.admite_evasion:
        ui.seccion("Evasión de firewall/IDS (opcional)")
        print("Fragmentación, señuelos y orden aleatorio. Solo útil para probar si tu propio")
        print("firewall/IDS detecta un escaneo sigiloso: vuelve el escaneo más lento y menos preciso.\n")
        parametros["evasion"] = confirmar("¿Activar técnicas de evasión?")

    print(f"\nObjetivo: {target or redes}")
    if parametros.get("evasion"):
        print("Evasión: activada")
    if not confirmar("¿Desea continuar con esta operación?"):
        return

    print("\n[*] Escaneando, espera por favor... (Ctrl+C para cancelar)\n")
    if _correr_escaneo(cat, lambda: lanzar(context, target=target, **parametros)):
        ui.exito("Escaneo finalizado.\n")
        ver_resultados(cat, limpiar=False)
    else:
        pausar()


def formulario_personalizado():
    """
    Pide las opciones del escaneo personalizado (equivalente al formulario de ScanView.ts).
    Devuelve los kwargs para tools/nmap.py::personalizado, o None si el usuario cancela.
    """
    ui.seccion("Protocolo")
    print(" 1) TCP  2) UDP  3) SCTP  0) Cancelar\n")
    opcion = leer_opcion("Seleccione: ", 0, 3)
    if opcion == 0:
        return None
    protocol = ("tcp", "udp", "sctp")[opcion - 1]

    tcp_type = None
    if protocol == "tcp":
        ui.seccion("Tipo de escaneo TCP")
        print(" 1) SYN  2) Connect  3) FIN  4) NULL  5) Xmas  0) Cancelar\n")
        opcion = leer_opcion("Tipo: ", 0, 5)
        if opcion == 0:
            return None
        tcp_type = ("syn", "connect", "fin", "null", "xmas")[opcion - 1]

    ui.seccion("Nivel de intensidad (1: Sigiloso - 5: Agresivo, 4 recomendado)")
    timing = leer_opcion("Timing (1-5): ", 1, 5)

    ui.seccion("Puertos")
    print(" 1) Especificar  2) Top Ports  3) Port Ratio  4) Todos  0) Cancelar\n")
    opcion = leer_opcion("Opción: ", 0, 4)
    if opcion == 0:
        return None
    port_mode = ("specific", "top", "ratio", "all")[opcion - 1]

    # Se valida con la MISMA función que usa tools/nmap.py antes de ejecutar, para que un
    # valor inválido se corrija aquí en vez de fallar después de pedir la contraseña.
    prompts = {"specific": "Puertos (ej: 80,443 o 1-1024): ", "top": "Cantidad (Enter = 1000): ",
               "ratio": "Ratio (0-1): "}
    port_value = ""
    while True:
        if port_mode in prompts:
            port_value = leer_texto(prompts[port_mode]) or ("1000" if port_mode == "top" else "")
        try:
            nmap.validar_parametros_personalizado(protocol, tcp_type, timing, port_mode, port_value)
            break
        except ValueError as e:
            ui.error(str(e))

    return {"protocol": protocol, "tcp_type": tcp_type, "timing": timing,
            "port_mode": port_mode, "port_value": port_value}


def _archivos_resultados():
    if not RESULTADOS_DIR.exists():
        return set()
    return {f for f in RESULTADOS_DIR.iterdir() if f.is_file()}


def _descartar_archivos_nuevos(antes):
    """Borra solo lo que apareció durante el escaneo (mismo criterio que cancel_nmap_scan en main.rs)."""
    for archivo in _archivos_resultados() - antes:
        try:
            archivo.unlink()
        except OSError as e:
            ui.aviso(f"No se pudo eliminar {archivo.name}: {e}")


def _correr_escaneo(cat, lanzar):
    """
    Ejecuta el escaneo y devuelve True solo si terminó con resultados completos.
    Si se cancela o falla, descarta los archivos parciales para que no contaminen el
    dashboard ni las comparaciones.

    La cancelación se detecta de dos formas, porque depende de quién recibe el Ctrl+C:
    como KeyboardInterrupt (si llega a Python), o porque el XML quedó sin terminar (si
    sudo lo reenvía directo a Nmap a través de su propia terminal y Python nunca lo ve).
    """
    antes = _archivos_resultados()
    try:
        lanzar()
    except KeyboardInterrupt:
        _descartar_archivos_nuevos(antes)
        ui.aviso("Escaneo cancelado. Se descartaron los archivos parciales.")
        return False
    except (OSError, ValueError) as e:  # Sin privilegios en Windows, parámetros inválidos, etc.
        _descartar_archivos_nuevos(antes)
        ui.error(str(e))
        return False

    nuevos = [x for x in _escaneos(cat) if Path(x) not in antes]
    if not nuevos:
        _descartar_archivos_nuevos(antes)
        ui.aviso("El escaneo no generó resultados (se canceló, falló o no encontró hosts activos).")
        return False
    if not all(parser.escaneo_finalizado(x) for x in nuevos):
        _descartar_archivos_nuevos(antes)
        ui.aviso("El escaneo se interrumpió antes de terminar. Se descartaron los archivos parciales.")
        return False
    return True
