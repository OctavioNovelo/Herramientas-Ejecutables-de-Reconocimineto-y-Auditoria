# frontend/CLI.py
import platform
import subprocess
import frontend.option
import core.executor as ejec
import tools
import utils.parser as parser
from pathlib import Path

def obtener_os():
    """Returns the current operating system name."""
    return platform.system()

def limpiar_pantalla():
    """Clears the terminal screen based on the operating system."""
    if obtener_os() == "Windows":
        subprocess.run(['cls'], shell=True)
    else:
        subprocess.run(['clear'])

def cli():
    """Main CLI entry point."""
    os_name = obtener_os()
    while True:
        limpiar_pantalla()
        print("¿Qué desea hacer? \n")
        print("1) Escaneo de Red")
        print("2) Revisión de seguridad")
        print("3) Resultados")
        print("4) Salir \n")

        opcion = leer_opcion("Seleccione una opción: ", 1, 4)
        
        if opcion == 4:
            print("Bye!")
            exit()

        contexto = frontend.option.opciones(opcion, os_name)
        if not contexto:
            continue

        match contexto["tool"]:
            case "Nmap":
                nmap_cli(contexto)
            case "JTR":
                print("\nEn construccion.\n")
                input("Presiona Enter para continuar...")
            case "Resultados":
                resultados(contexto)

def leer_opcion(mensaje, min_val, max_val):
    """Helper to read and validate user input within a range."""
    while True:
        try:
            opcion = int(input(mensaje))
            if min_val <= opcion <= max_val:
                return opcion
            else:
                print(f"Error: Por favor seleccione una opción entre {min_val} y {max_val}.")
        except ValueError:
            print("Error: Entrada no válida. Por favor, ingrese un número.")

def confirmar_escaneo(titulo, descripcion):
    """Shows a verification page with scan details and asks for confirmation."""
    limpiar_pantalla()
    print("\n" + "="*80)
    print(f"{titulo:^80}")
    print("="*80 + "\n")
    print(descripcion + "\n")
    print("="*80)
    print("¿Desea continuar con esta operación?")
    print("1) Sí")
    print("2) Regresar\n")
    
    confirm = leer_opcion("Seleccione una opción: ", 1, 2)
    return confirm == 1

def nmap_cli(contexto):
    """Nmap-specific menu and logic."""
    while True:
        limpiar_pantalla()
        print("\n--- Opciones ---\n")
        print("1) Escaneo Rapido")
        print("2) Escaneo de Vulnerabilidades")
        print("3) Deteccion de dispositivos ocultos")
        print("4) Auditoria de Access Points")
        print("5) Identificacion de Dipositivos")
        print("6) Monitor de consumo")
        print("7) Full Pack")
        print("8) Personalización")
        print("9) Regresar\n")

        opcion = leer_opcion("Seleccione una opción: ", 1, 9)

        match opcion:
            case 1:
                desc = ("- Identifica qué dispositivos están activos y qué servicios básicos consumen.\n"
                        "- Escaneo TCP/SYN sobre los 100 puertos más comunes.\n"
                        "- Escaneo rápido de la red. No genera mucho tráfico.")
                if confirmar_escaneo("ESCANEO RAPIDO", desc):
                    limpiar_pantalla()
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.escaneo_rapido(context)
            case 2:
                desc = ("- Detectar fallos de seguridad, servicios mal configurados y versiones inseguras.\n"
                        "- Detecta versiones y ejecuta scripts para identificar vulnerabilidades.\n"
                        "- Tardar varios minutos dependiendo del tamaño de la red.")
                if confirmar_escaneo("ESCANEO DE VULNERABILIDADES", desc):
                    limpiar_pantalla()
                    print("\n Esto tardara un algo de tiempo, espera porfavor\n")
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.vulnerabilidades(context)
            case 3:
                desc = ("- Detecta dispositivos 'invisibles u ocultos' que no responden a los Pings tradicionales.\n"
                        "- Escaneo TCP/SYN fragmentado, longitud de datos extra y no usamos Ping.\n"
                        "- Permite saltar firewalls y evita IDS")
                if confirmar_escaneo("DDETECCION DE DISPOSITIVOS OCULTOS", desc):
                    limpiar_pantalla()
                    print("\n Buscando dispositivos ocultos....\n")
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.dispositivos_ocultos(context)
            case 4:
                desc = ("- Encontrar interfaces de administración expuestas.\n"
                        "- Escaneamos puertos específicos.\n")
                if confirmar_escaneo("AUDITORÍA DE ACCESS POINTS", desc):
                    limpiar_pantalla()
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.admin_audit(context)
            case 5:
                desc = ("- Identificar marca y modelo cada dispositivo detectado.\n"
                        "- Escaneo Agresivo que incluye OS detection, Script scanning y Traceroute.\n"
                        "- Proporciona nombres claros como 'iPhone 13', 'Samsung SmartTV' o 'Tesla MCU'.")
                if confirmar_escaneo("IDENTIFICACIÓN DE DISPOSITIVOS", desc):
                    limpiar_pantalla()
                    print("\n Intentando identificar marcas y modelos de dispositivos...\n")
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.indentificar_dispositivos(context)
            case 6:
                desc = ("- Identificamos dispositivos que saturan el ancho de banda con video o juegos.\n"
                        "- Escaneo de puertos UDP/TCP asociados a Steam, Netflix, Spotify y PSN/Xbox Live.\n"
                        "- Permite identificar lag en juegos, problemas de buffer en streaming, etc.")
                if confirmar_escaneo("MONITOR DE CONSUMO", desc):
                    limpiar_pantalla()
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.monitor_consumo(context)
            case 7:
                desc = ("- Realizar un análisis completo.\n"
                        "- TODO EN UNO")
                if confirmar_escaneo("FULL PACK", desc):
                    limpiar_pantalla()
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.full_pack(context)
            case 8:
                desc = ("- Control total sobre su escaneo.\n"
                        "- Control completo sobre la tecnica de escaneo (TCP/UDP/SCTP), banderas SYN/Connect/FIN y timing (T1-T5).\n"
                        "- Recomendado solo para usuarios avanzados con conocimientos de redes.")
                if confirmar_escaneo("PERSONALIZADO", desc):
                    limpiar_pantalla()
                    context = ejec.ejecutar_herramienta(contexto["tool"], contexto["os_folder"])
                    tools.nmap.personalizado(context)
            case 9:
                return

def mostrar_resultados_formateados(resultados):
    """Displays formatted scan results. Outputs need to be customized for each tool."""
    if not resultados:
        print("No se encontraron coincidencias.")
        return
    if isinstance(resultados[0], dict) and "Error" in resultados[0]:
        print(resultados[0]["Error"])
        return

    print(f"\n{'IP':<16} | {'PUERTO':<8} | {'SERVICIO':<15} | {'ESTADO':<10}")
    print("-" * 70)
    for res in resultados:
        if isinstance(res, dict):
            print(f"{res['IP']:<16} | {res['Puerto']:<8} | {res['Servicio']:<15} | {res['Estado']:<10}")
            if res.get('Vulnerabilidades'):
                for v in res['Vulnerabilidades']:
                    print(f"   └── [!] {v}")
        else:
            print(res)

def resultados(context):
    """Results management menu."""
    while True:
        limpiar_pantalla()
        base_path = Path(__file__).parent.parent
        
        print("\n Resultados \n")
        print("1) Ver todos los resultados")
        print("2) Comparar resultados")
        print("3) Regresar \n")
        
        opcion = leer_opcion("Elige una opción: ", 1, 3)
        
        if opcion == 3: return

        limpiar_pantalla()
        print("\n Selecciona la categoría: \n")
        print("1) Escaneo Rapido")
        print("2) Escaneo de Vulnerabilidades")
        print("3) Deteccion de dispositivos ocultos")
        print("4) Auditoría de Administracion")
        print("5) Identificacion de Dispositivos")
        print("6) Monitor de consumo")
        print("7) Full Pack")
        print("8) Personalizado\n")
        cat = leer_opcion("Categoría: ", 1, 8)
        
        # Mapping categories to filenames
        nombres_archivos = {
            1: "escaneo_rapido", 2: "vulnerabilidades", 3: "dispositivos_ocultos",
            4: "admin_audit", 5: "ind_disp", 6: "consumo",
            7: "full_pack", 8: "personalizado"
        }
        
        file_name = nombres_archivos[cat]
        results_dir = base_path / "utils" / "Resultados" / context["os_folder"] / "Nmap"
        
        # Automatically find existing scans
        xml = parser.buscar_escaneos(results_dir, file_name, extension=".xml")
        greapables = parser.buscar_escaneos(results_dir, file_name, extension="_grepable.txt")

        if opcion == 1:
            if not xml and not greapables:
                print(f"\n[!] No se encontraron resultados para {file_name}.")
                input("\n Enter para continuar...")
                continue

            # Default to the most recent scan
            latest_xml = xml[0] if xml else None
            latest_gnmap = greapables[0] if greapables else None

            while True:
                limpiar_pantalla()
                print("\n1) Información específica")
                print("2) Tabla de resumen")
                print("3) Regresar \n")
                
                sub_opt = leer_opcion("Opción: ", 1, 3)
                if sub_opt == 3: break
                
                if sub_opt == 1:
                    if not latest_gnmap:
                        print("\n[!] No hay archivo .gnmap disponible.")
                    else:
                        limpiar_pantalla()
                        info = input("\n ¿Qué buscas? (Ej: 'open', '80', 'ip'): ")
                        res = parser.buscar_en_gnmap(latest_gnmap, info)
                        print("\n --- Coincidencias ---")
                        for line in res: print(line)
                    input("\n Enter para continuar...")
                else:
                    if not latest_xml:
                        print("\n[!] No hay archivo .xml disponible.")
                    else:
                        limpiar_pantalla()
                        datos = parser.generar_tabla_xml(latest_xml)
                        mostrar_resultados_formateados(datos)
                    input("\n Enter para continuar...")
        
        elif opcion == 2:
            limpiar_pantalla()
            print(f"\n Buscando cambios significativos en {file_name}...")
            
            if len(xml) < 2:
                print(f"\n[!] Se necesitan al menos 2 escaneos para comparar.")
                print(f" Escaneos encontrados: {len(xml)}")
                print(" Realice otro escaneo de esta categoría primero.")
            else:
                # Compare the latest (index 0) with the previous one (index 1)
                ultimo = xml[0]
                penultimo = xml[1]
                
                print(f" Comparando: {Path(ultimo).name} vs {Path(penultimo).name}")
                cambios = parser.comparar_escaneos(ultimo, penultimo)
                
                if not cambios:
                    print("\n No se detectaron nuevos dispositivos o puertos abiertos.")
                else:
                    print("\n --- NUEVOS DISPOSITIVOS / PUERTOS DETECTADOS ---")
                    mostrar_resultados_formateados(cambios)
            input("\n Enter para continuar...")
