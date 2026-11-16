# HERA.py — punto de entrada del CLI (python3 HERA.py).
# Ojo: la app nativa (main.rs::find_workspace_root) usa este archivo como marcador de la raíz
# del proyecto, así que no debe moverse ni renombrarse.
from frontend import CLI

if __name__ == "__main__":
    CLI.cli()

# Cositas que faltan por hacer:
# TODO: Add option to include/exclude vulnerabilities in the customized scan
# TODO: Reduce timing level for Ghost Hunter
# TODO: Fix Full Pack logic

## WINDOWS:
## Npcap windows, si nunca has instalado Nmap
## solucionado en terminal via: Invoke-WebRequest "https://npcap.com/dist/npcap-1.88.exe" -OutFile "$env:TEMP\npcap-1.88.exe"
## Start-Process "$env:TEMP\npcap-1.88.exe" -Verb RunAs