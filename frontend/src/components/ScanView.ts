// Archivo: frontend/src/components/ScanView.ts
// Razón: Pestaña "Escaneo" — selector de categoría, botón de ejecución (o formulario para
// "Personalizado"), y resultados presentados según el tipo de escaneo elegido:
//   - "vuln": separa hallazgos Confirmados de Posibles (sin confirmar)
//   - "admin": solo puertos ABIERTOS de gestión, marcando los no estándar
//   - "consumo": puertos traducidos a protocolos reconocibles (streaming/gaming/VoIP)
//   - resto: grid genérico de cards por dispositivo (IP, MAC, puertos/servicios, vulnerabilidades)
// "Personalizado" no tiene botón "Ejecutar" directo: requiere completar un formulario
// (protocolo, timing, puertos) antes de poder lanzarse, replicando lo que el CLI pide por
// teclado en tools/nmap.py::personalizado.

import { viewState, SCAN_CATEGORIES, ScanCategory } from "../state/viewState";
import { scanState } from "../state/scanState";
import { heraApi, CategoryDevice, Vulnerability, PossibleVulnerability, CustomScanParams } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard, consumoPortLabel } from "../utils/portLabels";
import "../styles/ScanView.css";

export class ScanView {
  private element: HTMLElement;
  private chipsRow: HTMLElement;
  private actionBar: HTMLElement;
  private resultsArea: HTMLElement;
  private unsubscribeScanState: (() => void) | null = null;
  private unsubscribeViewState: (() => void) | null = null;

  // Estado local del formulario de "Personalizado" (no necesita ser reactivo global)
  private customForm: CustomScanParams = {
    protocol: "tcp",
    tcpType: "syn",
    timing: 4,
    portMode: "top",
    portValue: "1000",
  };

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hera-scanview";

    this.chipsRow = document.createElement("div");
    this.chipsRow.className = "hera-scanview-chips";

    this.actionBar = document.createElement("div");
    this.actionBar.className = "hera-scanview-action-bar";

    this.resultsArea = document.createElement("div");

    this.element.appendChild(this.chipsRow);
    this.element.appendChild(this.actionBar);
    this.element.appendChild(this.resultsArea);

    this.renderChips();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  // Se llama cada vez que la vista se vuelve visible (ver main.ts), para suscribirse a los
  // estados globales y cargar los resultados de la categoría actualmente seleccionada.
  activate() {
    this.unsubscribeScanState = scanState.subscribe(() => {
      this.renderActionBar();
    });
    this.unsubscribeViewState = viewState.subscribe(() => {
      this.renderChips();
      this.renderActionBar();
      this.loadAndRenderResults();
    });
    this.loadAndRenderResults();
  }

  // Se llama al salir de la vista (volver al dashboard), para no seguir escuchando cambios
  // ni pisar el estado de otra vista.
  deactivate() {
    this.unsubscribeScanState?.();
    this.unsubscribeViewState?.();
    this.unsubscribeScanState = null;
    this.unsubscribeViewState = null;
  }

  private renderChips() {
    this.chipsRow.innerHTML = "";
    const active = viewState.getSelectedCategory();
    SCAN_CATEGORIES.forEach((cat) => {
      const chip = document.createElement("button");
      chip.className = "hera-scan-chip" + (cat.id === active.id ? " is-active" : "");
      chip.textContent = cat.label;
      chip.addEventListener("click", () => viewState.selectCategory(cat.id));
      this.chipsRow.appendChild(chip);
    });
  }

  private renderActionBar() {
    const cat = viewState.getSelectedCategory();
    const isScanning = scanState.getState().isScanning;
    this.actionBar.innerHTML = "";

    if (cat.id === "custom") {
      this.actionBar.appendChild(this.buildCustomForm(isScanning));
      return;
    }

    const label = document.createElement("span");
    label.className = "hera-scanview-action-bar-label hera-scanview-action-label";
    label.textContent = `RESULTADOS — ${cat.label.toUpperCase()}`;

    const runBtn = document.createElement("button");
    runBtn.className = "hera-scanview-run-btn";
    runBtn.disabled = isScanning;
    runBtn.textContent = isScanning ? "Escaneando..." : "Ejecutar";
    runBtn.addEventListener("click", async () => {
      await scanState.startScan(cat.id);
      this.loadAndRenderResults();
    });

    this.actionBar.appendChild(label);
    this.actionBar.appendChild(runBtn);
  }

  private buildCustomForm(isScanning: boolean): HTMLElement {
    const form = document.createElement("div");
    form.className = "hera-custom-form";

    // Protocolo
    const protocolField = this.buildSelectField(
      "Protocolo",
      [
        { value: "tcp", label: "TCP" },
        { value: "udp", label: "UDP" },
        { value: "sctp", label: "SCTP" },
      ],
      this.customForm.protocol,
      (val) => {
        this.customForm.protocol = val as CustomScanParams["protocol"];
        this.renderActionBar();
      }
    );
    form.appendChild(protocolField);

    // Tipo TCP (solo si protocolo === tcp)
    if (this.customForm.protocol === "tcp") {
      const tcpTypeField = this.buildSelectField(
        "Tipo de escaneo",
        [
          { value: "syn", label: "SYN" },
          { value: "connect", label: "Connect" },
          { value: "fin", label: "FIN" },
          { value: "null", label: "NULL" },
          { value: "xmas", label: "Xmas" },
        ],
        this.customForm.tcpType ?? "syn",
        (val) => {
          this.customForm.tcpType = val as CustomScanParams["tcpType"];
        }
      );
      form.appendChild(tcpTypeField);
    }

    // Timing
    const timingField = this.buildSelectField(
      "Intensidad (T1-T5)",
      [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `T${n}` })),
      String(this.customForm.timing),
      (val) => {
        this.customForm.timing = parseInt(val, 10);
      }
    );
    form.appendChild(timingField);

    // Modo de puertos
    const portModeField = this.buildSelectField(
      "Puertos",
      [
        { value: "specific", label: "Especificar" },
        { value: "top", label: "Top Ports" },
        { value: "ratio", label: "Port Ratio" },
        { value: "all", label: "Todos (-p-)" },
      ],
      this.customForm.portMode,
      (val) => {
        this.customForm.portMode = val as CustomScanParams["portMode"];
        this.renderActionBar();
      }
    );
    form.appendChild(portModeField);

    // Valor de puertos (según el modo elegido)
    if (this.customForm.portMode !== "all") {
      const valueField = document.createElement("div");
      valueField.className = "hera-custom-field";
      const valueLabel = document.createElement("label");
      const placeholderMap: Record<string, string> = {
        specific: "Ej: 80,443",
        top: "Ej: 1000",
        ratio: "Ej: 0.5",
      };
      valueLabel.textContent =
        this.customForm.portMode === "specific"
          ? "Puertos"
          : this.customForm.portMode === "top"
          ? "Cantidad"
          : "Ratio (0-1)";
      const valueInput = document.createElement("input");
      valueInput.type = "text";
      valueInput.value = this.customForm.portValue;
      valueInput.placeholder = placeholderMap[this.customForm.portMode] ?? "";
      valueInput.addEventListener("input", () => {
        this.customForm.portValue = valueInput.value;
      });
      valueField.appendChild(valueLabel);
      valueField.appendChild(valueInput);
      form.appendChild(valueField);
    }

    // Botón ejecutar
    const runBtn = document.createElement("button");
    runBtn.className = "hera-scanview-run-btn";
    runBtn.disabled = isScanning;
    runBtn.textContent = isScanning ? "Escaneando..." : "Ejecutar";
    runBtn.addEventListener("click", async () => {
      await scanState.startCustomScan(this.customForm);
      this.loadAndRenderResults();
    });
    form.appendChild(runBtn);

    return form;
  }

  private buildSelectField(
    labelText: string,
    options: { value: string; label: string }[],
    selected: string,
    onChange: (value: string) => void
  ): HTMLElement {
    const field = document.createElement("div");
    field.className = "hera-custom-field";

    const label = document.createElement("label");
    label.textContent = labelText;

    const select = document.createElement("select");
    options.forEach((opt) => {
      const optionEl = document.createElement("option");
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      if (opt.value === selected) optionEl.selected = true;
      select.appendChild(optionEl);
    });
    select.addEventListener("change", () => onChange(select.value));

    field.appendChild(label);
    field.appendChild(select);
    return field;
  }

  private async loadAndRenderResults() {
    const cat = viewState.getSelectedCategory();
    this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">Cargando resultados...</p>`;

    if (cat.id === "custom") {
      // El backend genera archivos con el mismo file_base "personalizado" que el CLI.
    }

    try {
      const result = await heraApi.getCategoryResults(cat.file_base);
      if (!result.found || result.devices.length === 0) {
        this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">Sin resultados previos para esta categoría. Ejecuta un escaneo para ver datos aquí.</p>`;
        return;
      }
      this.renderDevices(cat, result.devices);
    } catch (err: any) {
      this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">⚠ Error al leer resultados: ${err?.message ?? err}</p>`;
    }
  }

  private renderDevices(cat: ScanCategory, devices: CategoryDevice[]) {
    this.resultsArea.innerHTML = "";
    const grid = document.createElement("div");
    // La categoría 'vuln' necesita más ancho por card: cada una se divide en 2 columnas
    // (Confirmadas/Posibles) que no caben cómodamente en el ancho mínimo genérico de 300px.
    grid.className = "hera-scan-devices-grid" + (cat.id === "vuln" ? " is-vuln-grid" : "");

    devices.forEach((dev) => {
      const card = document.createElement("div");
      card.className = "hera-scan-device-card";

      const header = document.createElement("div");
      header.className = "hera-scan-device-header";
      header.innerHTML = `
        <span class="hera-scan-device-ip">${dev.ip}</span>
        <span class="hera-scan-device-name">${dev.device || "N/D"}</span>
      `;
      card.appendChild(header);

      if (cat.id === "admin") {
        card.appendChild(this.renderAdminPorts(dev));
      } else if (cat.id === "consumo") {
        card.appendChild(this.renderConsumoPorts(dev));
      } else {
        card.appendChild(this.renderGenericBadges(dev));
      }

      if (cat.id === "vuln") {
        card.appendChild(this.renderVulnSplit(dev));
      } else if (dev.vulnerabilities.length > 0) {
        // Otras categorías (ej. full_pack) también pueden traer hallazgos confirmados:
        // se muestran como badges simples, sin el desglose de dos columnas de "vuln".
        card.appendChild(this.renderSimpleVulnBadges(dev.vulnerabilities));
      }

      grid.appendChild(card);
    });

    this.resultsArea.appendChild(grid);
  }

  private renderGenericBadges(dev: CategoryDevice): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges";
    if (dev.services.length === 0) {
      wrap.innerHTML = `<span class="hera-scan-empty-note">Sin puertos abiertos detectados</span>`;
      return wrap;
    }
    dev.services.forEach((srv) => {
      const badge = document.createElement("span");
      badge.className = "hera-scan-badge";
      badge.textContent = srv;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  private renderAdminPorts(dev: CategoryDevice): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges";
    if (dev.ports.length === 0) {
      wrap.innerHTML = `<span class="hera-scan-empty-note">Sin puertos de gestión abiertos</span>`;
      return wrap;
    }
    dev.ports.forEach((port) => {
      const badge = document.createElement("span");
      const standard = isAdminPortStandard(port);
      badge.className = "hera-scan-badge" + (standard ? "" : " is-warning");
      badge.textContent = standard
        ? `${port}/${adminPortLabel(port)}`
        : `${port}/${adminPortLabel(port)} ⚠ no estándar`;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  private renderConsumoPorts(dev: CategoryDevice): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges";
    if (dev.ports.length === 0) {
      wrap.innerHTML = `<span class="hera-scan-empty-note">Sin protocolos de consumo detectados abiertos</span>`;
      return wrap;
    }
    dev.ports.forEach((port) => {
      const badge = document.createElement("span");
      badge.className = "hera-scan-badge";
      badge.textContent = consumoPortLabel(port);
      wrap.appendChild(badge);
    });
    return wrap;
  }

  private renderSimpleVulnBadges(vulns: Vulnerability[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges";
    wrap.style.marginTop = "8px";
    vulns.slice(0, 4).forEach((v) => {
      const badge = document.createElement("span");
      badge.className = `hera-vuln-row-sev ${v.severity}`;
      badge.title = v.output;
      badge.textContent = v.cve_count ? `${v.id} (${v.cve_count})` : v.id;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  private renderVulnSplit(dev: CategoryDevice): HTMLElement {
    // Si el dispositivo no tiene NINGÚN hallazgo (ni confirmado ni posible), no vale la pena
    // ocupar espacio con dos bloques vacíos repitiendo "Ninguna" — se muestra una sola nota.
    if (dev.vulnerabilities.length === 0 && dev.possible_vulnerabilities.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hera-scan-empty-note";
      empty.style.marginTop = "10px";
      empty.textContent = "Sin hallazgos de vulnerabilidades en este dispositivo.";
      return empty;
    }

    const wrap = document.createElement("div");
    wrap.className = "hera-vuln-split";

    const confirmadasBlock = document.createElement("div");
    confirmadasBlock.className = "hera-vuln-block confirmadas";
    confirmadasBlock.innerHTML = `<div class="hera-vuln-block-title">⚠ CONFIRMADAS (${dev.vulnerabilities.length})</div>`;
    if (dev.vulnerabilities.length === 0) {
      confirmadasBlock.innerHTML += `<span class="hera-scan-empty-note">Ninguna</span>`;
    } else {
      dev.vulnerabilities.forEach((v) => {
        confirmadasBlock.appendChild(this.buildVulnRow(v.id, v.severity, v.sev_label, v.output, v.cve_count));
      });
    }

    const posiblesBlock = document.createElement("div");
    posiblesBlock.className = "hera-vuln-block posibles";
    posiblesBlock.innerHTML = `<div class="hera-vuln-block-title">? POSIBLES — SIN CONFIRMAR (${dev.possible_vulnerabilities.length})</div>`;
    if (dev.possible_vulnerabilities.length === 0) {
      posiblesBlock.innerHTML += `<span class="hera-scan-empty-note">Ninguna</span>`;
    } else {
      dev.possible_vulnerabilities.forEach((v) => {
        const row = this.buildVulnRow(v.id, "posible", "Sin confirmar", v.output);
        posiblesBlock.appendChild(row);
      });
    }

    wrap.appendChild(confirmadasBlock);
    wrap.appendChild(posiblesBlock);
    return wrap;
  }

  private buildVulnRow(id: string, sevClass: string, sevLabel: string, output: string, cveCount?: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "hera-vuln-row";
    row.title = output;
    const title = document.createElement("span");
    title.className = "hera-vuln-row-title";
    title.textContent = cveCount ? `${id} (${cveCount})` : id;
    const sev = document.createElement("span");
    sev.className = `hera-vuln-row-sev ${sevClass}`;
    sev.textContent = sevLabel;
    row.appendChild(title);
    row.appendChild(sev);
    return row;
  }
}