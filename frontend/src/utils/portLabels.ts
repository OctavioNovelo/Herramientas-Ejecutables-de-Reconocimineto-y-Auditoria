// Traduce números de puerto a etiquetas legibles para la vista de categoría "Auditoría Admin".
// Los puertos deben coincidir EXACTAMENTE con los que usa admin_audit() en tools/nmap.py (y con
// ADMIN_PORT_LABELS en frontend/option.py) — si esa lista cambia, actualizar aquí también.

// --- Auditoría Admin ---
export const ADMIN_PORT_LABELS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  80: "HTTP",
  161: "SNMP",
  443: "HTTPS",
  623: "IPMI / ASF",
  902: "VMware vSphere",
  1433: "Microsoft SQL Server",
  2082: "cPanel (HTTP)",
  2083: "cPanel (HTTPS)",
  2086: "WHM (HTTP)",
  2087: "WHM (HTTPS)",
  2222: "SSH alterno",
  3306: "MySQL",
  3389: "RDP (Escritorio remoto)",
  5900: "VNC",
  5985: "WinRM / PowerShell remoto",
  5986: "WinRM sobre HTTPS",
  7547: "TR-069 (gestión remota del ISP)",
  8000: "HTTP alterno",
  8080: "Proxy / HTTP alterno",
  8291: "MikroTik Winbox",
  8443: "HTTPS alterno",
  8880: "HTTP alterno",
  8888: "HTTP alterno",
  10000: "Webmin",
};

// Puertos "esperables" para un panel de administración normal (web estándar).
// Cualquier otro puerto de la lista de arriba que aparezca ABIERTO se marca como no estándar,
// porque es más inusual y potencialmente más sensible (bases de datos, RDP, VNC, etc. expuestos).
export const ADMIN_STANDARD_PORTS = new Set([80, 443]);

export function adminPortLabel(port: number): string {
  return ADMIN_PORT_LABELS[port] ?? `Puerto ${port}`;
}

export function isAdminPortStandard(port: number): boolean {
  return ADMIN_STANDARD_PORTS.has(port);
}
