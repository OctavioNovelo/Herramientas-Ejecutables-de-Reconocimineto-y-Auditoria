# This is the beginning of the Auditor project
import frontend.CLI
import subprocess


def main ():
    frontend.CLI.limpiar_pantalla()
    frontend.CLI.cli()

while (1):
    main()

# TODO: Add option to include/exclude vulnerabilities in the customized scan
# TODO: Reduce timing level for Ghost Hunter
# TODO: Fix Full Pack logic
