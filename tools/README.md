# Herramientas orquestadas por HERA

Cada herramienta tiene su módulo en `tools/` (`nmap.py`, `nuclei.py`, `testssl.py`) que declara
`BINARIOS = {carpeta_os: binario}`. Los binarios van en `tools/tools_bin/<Linux|Windows|macos>/<Herramienta>/`
(ver `core/executor.py::HERRAMIENTAS`).

| Herramienta | Uso en HERA | Versionada en el repo | Licencia |
|---|---|---|---|
| [Nmap](https://nmap.org) 7.98 | Mapear y Detectar (descubrimiento de servicios) | Sí | [NPSL](https://nmap.org/npsl/) |
| [Nuclei](https://github.com/projectdiscovery/nuclei) 3.11.1 | Detectar → Vulnerabilidades | **No** (binario de ~140 MB > límite de GitHub) | MIT |
| [nuclei-templates](https://github.com/projectdiscovery/nuclei-templates) | Plantillas de Nuclei | **No** (se instalan solas en `tools_bin/nuclei-templates/`) | MIT |
| [testssl.sh](https://github.com/testssl/testssl.sh) 3.2.4 | Detectar → Seguridad TLS | Sí (`testssl.sh`, `etc/`, `bin/openssl.<SO>`) | GPLv2 (OpenSSL: ver `bin/OPENSSL-LICENSE.txt`) |

## Instalar Nuclei

Descargar el `.zip` del SO desde las [releases de Nuclei](https://github.com/projectdiscovery/nuclei/releases),
verificar su SHA-256 contra `nuclei_<versión>_checksums.txt` y dejar el binario en:

- `tools/tools_bin/Linux/Nuclei/nuclei`
- `tools/tools_bin/Windows/Nuclei/nuclei.exe`
- `tools/tools_bin/macos/Nuclei/nuclei`

La primera ejecución descarga las plantillas (requiere internet esa vez).

## Requisitos de testssl.sh

- `bash`. testssl exige al arrancar `dig`, `host`, `drill` o `nslookup`, pero HERA solo le pasa
  IPs sin DNS (`--nodns none`); si el sistema no tiene ninguna, `tools/testssl.py` le da un `host`
  de reemplazo y no hay que instalar nada.
- No funciona en Windows (requiere bash). Para macOS copiar el mismo `testssl.sh` y `etc/` con
  `bin/openssl.Darwin.x86_64` de la release.
