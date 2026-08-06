// Archivo: frontend/src/utils/portLabels.ts
// Razón: Traduce números de puerto a etiquetas legibles para las vistas de categoría
// "Auditoría Admin" y "Monitor de Consumo". Los puertos deben coincidir EXACTAMENTE con
// los que usan admin_audit() y monitor_consumo() en tools/nmap.py — si esas listas cambian,
// actualizar aquí también.

// --- Auditoría Admin ---
export const ADMIN_PORT_LABELS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  80: "HTTP",
  443: "HTTPS",
  623: "IPMI / ASF",
  902: "VMware vSphere",
  1433: "Microsoft SQL Server",
  2082: "cPanel (HTTP)",
  2083: "cPanel (HTTPS)",
  2086: "WHM (HTTP)",
  2087: "WHM (HTTPS)",
  3306: "MySQL",
  3389: "RDP (Escritorio remoto)",
  3391: "RDP (UDP)",
  5900: "VNC",
  5985: "WinRM / PowerShell remoto",
  8080: "Proxy / HTTP alterno",
  8443: "HTTPS alterno",
  8880: "HTTP alterno",
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

// --- Monitor de Consumo ---
const CONSUMO_PORT_LABELS: Record<number, string> = {
  1935: "🎥 Streaming (RTMP)",
  3478: "📞 VoIP (STUN)",
  3479: "📞 VoIP",
  3480: "📞 VoIP",
  5060: "📞 VoIP (SIP)",
  5061: "📞 VoIP (SIP sobre TLS)",
  80: "🌐 Web",
  443: "🌐 Web (TLS)",
};

export function consumoPortLabel(port: number): string {
  if (port >= 27015 && port <= 27030) {
    return "🎮 Gaming (Steam / Source)";
  }
  return CONSUMO_PORT_LABELS[port] ?? `Puerto ${port}`;
}
