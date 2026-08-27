# This is the beginning of the Auditor project
import frontend.CLI
import subprocess


def main ():
    frontend.CLI.limpiar_pantalla()
    frontend.CLI.cli()

while (1):
    main()

# Cositas que faltan por hacer:
# TODO: Add option to include/exclude vulnerabilities in the customized scan
# TODO: Reduce timing level for Ghost Hunter
# TODO: Fix Full Pack logic

## WINDOWS:
## Npcap windows, si nunca has instalado Nmap
## solucionado en terminal via: Invoke-WebRequest "https://npcap.com/dist/npcap-1.88.exe" -OutFile "$env:TEMP\npcap-1.88.exe"
## Start-Process "$env:TEMP\npcap-1.88.exe" -Verb RunAs