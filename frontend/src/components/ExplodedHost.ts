// Vista explotada de un host, como la lámina técnica de una pieza: el dispositivo se separa
// en capas apiladas (equipo, sistema, puertos, servicios, hallazgos) y cada capa lleva una
// cota numerada que remite a su especificación al lado. Las cotas sí son una secuencia: el
// orden de las capas de abajo arriba, de lo físico a lo expuesto.

import type { Device } from "../api/heraApi";
import { esc, estadoHost, Estado } from "../utils/security";

const W = 620;
const PLACA_W = 320;
const PLACA_D = 120;
const GROSOR = 9;
const SEP = 104;
const CX = 210;

interface Capa {
  n: number;
  nombre: string;
  spec: string[];
  marcas: { etiqueta: string; estado?: Estado | "abierto" | "filtrado" }[];
  estado?: Estado;
}

function capas(d: Device): Capa[] {
  const so = d.os_info?.running ?? d.os_info?.details ?? (d.os_info?.guesses[0]?.name ? `${d.os_info.guesses[0].name} (${d.os_info.guesses[0].accuracy} %)` : null);
  const servicios = d.service_details.filter((s) => s.state === "open");
  return [
    { n: 1, nombre: "Equipo", spec: [d.device || "Sin nombre", `mac ${d.mac || "—"}`, `latencia ${d.latency.toFixed(1)} ms`], marcas: [] },
    { n: 2, nombre: "Sistema", spec: [so ?? "No detectado", ...(d.os_info?.device_types.length ? [d.os_info.device_types.join(", ")] : [])], marcas: [] },
    {
      n: 3,
      nombre: "Puertos",
      spec: [`${d.ports.length} abiertos`, d.filtered_ports.length ? `${d.filtered_ports.length} filtrados` : "ninguno filtrado"],
      marcas: [
        ...d.ports.map((p) => ({ etiqueta: String(p), estado: "abierto" as const })),
        ...d.filtered_ports.map((p) => ({ etiqueta: String(p), estado: "filtrado" as const })),
      ],
    },
    {
      n: 4,
      nombre: "Servicios",
      spec: servicios.length
        ? servicios.slice(0, 4).map((s) => `${s.port} ${[s.product, s.version].filter(Boolean).join(" ") || s.service}`).concat(servicios.length > 4 ? [`y ${servicios.length - 4} más`] : [])
        : ["Ninguno expuesto"],
      marcas: [],
    },
    {
      n: 5,
      nombre: "Hallazgos",
      spec: d.vulnerabilities.length ? d.vulnerabilities.map((v) => `${v.sev_label}: ${v.id}`) : ["Ninguno confirmado"],
      marcas: d.vulnerabilities.map((v) => ({ etiqueta: v.port ? String(v.port) : "", estado: v.severity === "critical" || v.severity === "high" ? "riesgo" : v.severity === "medium" ? "alerta" : "seguro" })),
      estado: d.vulnerabilities.length ? estadoHost(d) : undefined,
    },
  ];
}

function placa(cy: number, clase: string): string {
  const hw = PLACA_W / 2;
  const hd = PLACA_D / 2;
  const top = `${CX},${cy - hd} ${CX + hw},${cy} ${CX},${cy + hd} ${CX - hw},${cy}`;
  const izq = `${CX - hw},${cy} ${CX},${cy + hd} ${CX},${cy + hd + GROSOR} ${CX - hw},${cy + GROSOR}`;
  const der = `${CX},${cy + hd} ${CX + hw},${cy} ${CX + hw},${cy + GROSOR} ${CX},${cy + hd + GROSOR}`;
  return `<g class="placa ${clase}"><polygon class="p-izq" points="${izq}"/><polygon class="p-der" points="${der}"/><polygon class="p-top" points="${top}"/></g>`;
}

// Posición isométrica (u, v en 0..1) sobre la cara superior de una placa.
function iso(cy: number, u: number, v: number): [number, number] {
  const hw = PLACA_W / 2;
  const hd = PLACA_D / 2;
  return [CX + (u - v) * hw, cy - hd + (u + v) * hd];
}

export function dibujarHost(d: Device | null): string {
  if (!d) {
    return `<svg class="lamina-svg" viewBox="0 0 ${W} 580" aria-hidden="true">
      ${[0, 1, 2, 3, 4].map((i) => placa(490 - i * SEP, "vacia")).join("")}
    </svg>`;
  }
  const cs = capas(d);
  const H = SEP * (cs.length - 1) + PLACA_D + 60;
  const base = H - PLACA_D / 2 - 20;
  let svg = "";
  cs.forEach((c, i) => {
    const cy = base - i * SEP;
    // Guía vertical de ensamblaje (línea discontinua entre placas)
    if (i > 0) svg += `<line class="guia" x1="${CX}" y1="${cy + PLACA_D / 2 + GROSOR}" x2="${CX}" y2="${cy + SEP - PLACA_D / 2}"/>`;
    svg += `<g class="capa" style="--i:${i}">${placa(cy, c.estado ? `est-${c.estado}` : "")}`;
    // Marcas sobre la placa
    if (c.marcas.length) {
      const n = c.marcas.length;
      c.marcas.forEach((m, k) => {
        const u = 0.15 + (0.7 * (k + 0.5)) / n;
        const [x, y] = iso(cy, u, 0.5);
        if (m.estado === "abierto" || m.estado === "filtrado") {
          const conH = d.vulnerabilities.some((v) => String(v.port) === m.etiqueta);
          svg += `<g class="bloque ${m.estado}${conH ? " con-h" : ""}"><polygon points="${x},${y - 12} ${x + 7},${y - 8} ${x},${y - 4} ${x - 7},${y - 8}"/><polygon class="b-l" points="${x - 7},${y - 8} ${x},${y - 4} ${x},${y + 2} ${x - 7},${y - 2}"/><polygon class="b-r" points="${x},${y - 4} ${x + 7},${y - 8} ${x + 7},${y - 2} ${x},${y + 2}"/>
            <text x="${x}" y="${y + 15}">${esc(m.etiqueta)}</text></g>`;
        } else {
          svg += `<g class="marca-h est-${m.estado}"><path d="M${x} ${y - 9} L${x + 9} ${y} L${x} ${y + 9} L${x - 9} ${y} Z"/></g>`;
        }
      });
    }
    // Cota: línea de referencia desde la esquina derecha de la placa hasta el número
    const [ex, ey] = [CX + PLACA_W / 2, cy];
    const lx = 430;
    svg += `<polyline class="cota" points="${ex + 4},${ey} ${ex + 26},${ey - 18} ${lx},${ey - 18}"/>
      <circle class="cota-n" cx="${lx + 12}" cy="${ey - 18}" r="11"/><text class="cota-t" x="${lx + 12}" y="${ey - 14}">${c.n}</text>
      <text class="cota-nombre" x="${lx + 30}" y="${ey - 14}">${c.nombre}</text></g>`;
  });
  return `<svg class="lamina-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vista explotada de ${esc(d.ip)}: ${cs.map((c) => `${c.nombre}: ${c.spec.join(", ")}`).join("; ")}">${svg}</svg>`;
}

export function specsHost(d: Device): string {
  return capas(d)
    .slice()
    .reverse()
    .map(
      (c) => `<div class="spec${c.estado ? ` est-${c.estado}` : ""}">
        <span class="spec-n">${c.n}</span>
        <div><p class="spec-nombre">${c.nombre}</p>${c.spec.map((s) => `<p class="spec-v">${esc(s)}</p>`).join("")}</div>
      </div>`
    )
    .join("");
}
