import platform

def obtener_sistema_operativo():
    return platform.system()

def obtener_carpeta_os(os_name):
    if 'Win' in os_name:
        return 'Windows'
    elif 'Darwin' in os_name or 'mac' in os_name:
        return 'macos'
    elif 'Linux' in os_name:
        return 'Linux'
    else:
        raise ValueError(f"Sistema operativo no soportado: {os_name}")
