// Plan de acción preliminar, generado con reglas fijas a partir de los dispositivos.
// Ocupa el espacio que tendrá la IA de síntesis: misma forma de salida (qué encontré,
// por qué importa, qué hacer), para que la UI no cambie cuando llegue la IA. Se marca
// siempre como "generado por reglas" para no presentarlo como algo que no es.

import type { Device } from "../api/heraApi";
import { ADMIN_PORT_LABELS } from "../utils/portLabels";

export type Prioridad = "riesgo" | "alerta" | "info";

export interface Accion {
  id: string;
  prioridad: Prioridad;
  titulo: string;
  motivo: string;
  pasos: string[];
  hosts: { ip: string; nombre: string; puerto?: number | string }[];
}

export interface Plan {
  origen: "reglas" | "ia";
  acciones: Accion[];
}

const ORDEN: Record<Prioridad, number> = { riesgo: 0, alerta: 1, info: 2 };

interface ReglaPuerto {
  puertos: number[];
  prioridad: Prioridad;
  titulo: (n: number) => string;
  motivo: string;
  pasos: string[];
}

const REGLAS_PUERTO: ReglaPuerto[] = [
  {
    puertos: [23],
    prioridad: "riesgo",
    titulo: (n) => (n > 1 ? `Desactiva Telnet en ${n} dispositivos` : "Desactiva Telnet"),
    motivo: "Telnet envía usuario y contraseña sin cifrar: cualquiera en la red puede leerlos.",
    pasos: ["Entra al panel del dispositivo y apaga el servicio Telnet.", "Si necesitas acceso remoto, usa SSH."],
  },
  {
    puertos: [3389, 5900],
    prioridad: "alerta",
    titulo: () => "Revisa quién puede usar el escritorio remoto",
    motivo: "RDP y VNC abiertos son de los primeros puertos que se prueban con contraseñas robadas.",
    pasos: ["Desactívalo si no lo usas.", "Si lo usas, exige autenticación de red (NLA) y limítalo a la LAN."],
  },
  {
    puertos: [21],
    prioridad: "alerta",
    titulo: () => "Sustituye FTP por SFTP",
    motivo: "FTP transmite credenciales y archivos en claro.",
    pasos: ["Desactiva FTP.", "Usa SFTP o el protocolo de archivos del propio dispositivo."],
  },
  {
    puertos: [8291, 7547, 623],
    prioridad: "alerta",
    titulo: () => "Limita los puertos de gestión remota",
    motivo: "Puertos de administración (Winbox, TR-069, IPMI) dan control total del equipo.",
    pasos: ["Permite el acceso solo desde la IP de tu equipo de gestión.", "Bloquéalos desde la WAN en el firewall."],
  },
  {
    puertos: [1900],
    prioridad: "info",
    titulo: () => "Comprueba si necesitas UPnP",
    motivo: "UPnP deja que los dispositivos abran puertos en tu router sin preguntarte.",
    pasos: ["Desactiva UPnP en el router si ningún dispositivo lo necesita."],
  },
];

export function generarPlan(devices: Device[]): Plan {
  const acciones: Accion[] = [];

  // 1. Vulnerabilidades confirmadas: una acción por hallazgo, con su remediación.
  for (const dev of devices) {
    for (const v of dev.vulnerabilities) {
      const prioridad: Prioridad =
        v.severity === "critical" || v.severity === "high" ? "riesgo" : v.severity === "medium" ? "alerta" : "info";
      const cves = v.cve_count ? ` (${v.cve_count} CVE)` : "";
      acciones.push({
        id: `vuln-${dev.ip}-${v.id}`,
        prioridad,
        titulo: `Corrige ${v.id}${cves} en ${dev.device || dev.ip}`,
        motivo: v.output,
        pasos: v.remediation ? [v.remediation] : ["Busca una actualización del fabricante para este servicio."],
        hosts: [{ ip: dev.ip, nombre: dev.device, puerto: v.port }],
      });
    }
  }

  // 2. Puertos expuestos: una acción por regla, agrupando todos los hosts afectados.
  for (const regla of REGLAS_PUERTO) {
    const hosts = devices.flatMap((d) =>
      d.ports.filter((p) => regla.puertos.includes(p)).map((p) => ({ ip: d.ip, nombre: d.device, puerto: p }))
    );
    if (hosts.length === 0) continue;
    const distintos = new Set(hosts.map((h) => h.ip)).size;
    const puertos = [...new Set(hosts.map((h) => h.puerto))].map((p) => (ADMIN_PORT_LABELS[p as number] ? `${p} ${ADMIN_PORT_LABELS[p as number]}` : `${p}`)).join(", ");
    acciones.push({
      id: `puerto-${regla.puertos.join("-")}`,
      prioridad: regla.prioridad,
      titulo: regla.titulo(distintos),
      motivo: `${regla.motivo} Visto en: ${puertos}.`,
      pasos: regla.pasos,
      hosts,
    });
  }

  acciones.sort((a, b) => ORDEN[a.prioridad] - ORDEN[b.prioridad]);
  return { origen: "reglas", acciones };
}

export const PRIORIDAD_TEXTO: Record<Prioridad, string> = {
  riesgo: "Hazlo hoy",
  alerta: "Esta semana",
  info: "Cuando puedas",
};
