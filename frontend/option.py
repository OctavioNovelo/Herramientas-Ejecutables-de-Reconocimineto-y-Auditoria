# frontend/option.py
from core.executor import obtener_carpeta_os
import platform

def obtener_sistema_operativo():
    return platform.system()

os = obtener_sistema_operativo()


def opciones(opcion, os_name):
    match opcion:
        case 1:
            os_folder = obtener_carpeta_os(os_name)
            return {"tool": "Nmap", "os_folder": os_folder}
        case 2:
            return {"tool": "JTR", "os_folder": obtener_carpeta_os(os_name)}
        case 3:
            os_folder = obtener_carpeta_os(os_name)
            return {"tool": "Resultados", "os_folder": os_folder}
        case 4:
            return None