// Pestaña "Escaneo" — selector de categoría, botón de ejecución (o formulario para
// "Personalizado"), y resultados presentados según el tipo de escaneo elegido:
//   - "vuln": separa hallazgos Confirmados de Posibles (sin confirmar)
//   - "admin": solo puertos ABIERTOS de gestión, marcando los no estándar
//   - resto: grid genérico de cards por dispositivo (IP, MAC, puertos/servicios, vulnerabilidades)
// "Personalizado" no tiene botón "Ejecutar" directo: requiere completar un formulario
// (protocolo, timing, puertos) antes de poder lanzarse, igual que el formulario del CLI
// (frontend/CLI.py::formulario_personalizado). Ambos terminan en tools/nmap.py::personalizado.

import { viewState, ScanCategory } from "../state/viewState";
import { scanState } from "../state/scanState";
import { heraApi, CategoryDevice, Vulnerability, PossibleVulnerability, CustomScanParams, ScanTimeInfo } from "../api/heraApi";
import { adminPortLabel, isAdminPortStandard } from "../utils/portLabels";
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
    target: "",
    evasion: false,
  };

  // IP/red objetivo para las 7 categorías que NO son "Personalizado". Por defecto vacío
  // (usa la subred local detectada automáticamente); el usuario puede escribir cualquier
  // IP, rango o CIDR que Nmap acepte en un archivo -iL.
  private targetInput: string = "";

  // Evasión de firewall/IDS para las categorías no personalizadas que la admiten
  // (cat.supportsEvasion). Apagada por defecto; el Personalizado guarda la suya en customForm.
  private evasionEnabled: boolean = false;

  // Duración del último escaneo cargado para la categoría actual (viene de
  // obtener_resultados_categoria -> 'scan_time'). Se resetea en cada carga.
  private lastScanTime: ScanTimeInfo | null = null;

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
    // Solo se muestran las categorías del grupo correspondiente a la pestaña activa
    // (Mapear o Detectar) — este mismo componente se reutiliza para ambas.
    viewState.getCategoriesForCurrentView().forEach((cat) => {
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

    const targetField = document.createElement("div");
    targetField.className = "hera-custom-field hera-target-field";
    const targetLabel = document.createElement("label");
    targetLabel.textContent = "IP / red objetivo (opcional)";
    const targetInputEl = document.createElement("input");
    targetInputEl.type = "text";
    targetInputEl.placeholder = "Vacío = red local detectada";
    targetInputEl.value = this.targetInput;
    targetInputEl.addEventListener("input", () => {
      this.targetInput = targetInputEl.value;
    });
    targetField.appendChild(targetLabel);
    targetField.appendChild(targetInputEl);

    const runBtn = document.createElement("button");
    runBtn.className = "hera-scanview-run-btn";

    const updateRunButton = () => {
      if (scanState.getState().isScanning) {
        runBtn.classList.add("is-scanning");
        runBtn.textContent = "Escaneando...";
        runBtn.title = "Pasar el cursor aquí para cancelar";
      } else {
        runBtn.classList.remove("is-scanning");
        runBtn.textContent = "Ejecutar";
        runBtn.title = "";
      }
    };

    updateRunButton();

    runBtn.addEventListener("mouseenter", () => {
      if (scanState.getState().isScanning) {
        runBtn.textContent = "Cancelar";
      }
    });

    runBtn.addEventListener("mouseleave", () => {
      if (scanState.getState().isScanning) {
        runBtn.textContent = "Escaneando...";
      }
    });

    runBtn.addEventListener("click", async () => {
      if (scanState.getState().isScanning) {
        await scanState.cancelScan();
        return;
      }

      await scanState.startScan(cat.id, this.targetInput, cat.supportsEvasion ? this.evasionEnabled : false);
      this.loadAndRenderResults();
    });

    this.actionBar.appendChild(label);
    this.actionBar.appendChild(targetField);
    if (cat.supportsEvasion) {
      this.actionBar.appendChild(
        this.buildEvasionToggle(this.evasionEnabled, (checked) => {
          this.evasionEnabled = checked;
        })
      );
    }
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

    // IP / red objetivo (opcional) — mismo campo conceptual que las otras 7 categorías
    const targetField = document.createElement("div");
    targetField.className = "hera-custom-field hera-target-field";
    const targetLabel = document.createElement("label");
    targetLabel.textContent = "IP / red objetivo (opcional)";
    const targetInputEl = document.createElement("input");
    targetInputEl.type = "text";
    targetInputEl.placeholder = "Vacío = red local detectada";
    targetInputEl.value = this.customForm.target ?? "";
    targetInputEl.addEventListener("input", () => {
      this.customForm.target = targetInputEl.value;
    });
    targetField.appendChild(targetLabel);
    targetField.appendChild(targetInputEl);
    form.appendChild(targetField);

    form.appendChild(
      this.buildEvasionToggle(this.customForm.evasion ?? false, (checked) => {
        this.customForm.evasion = checked;
      })
    );

    // Botón ejecutar (con validación previa — ver validateCustomForm)
    const runBtn = document.createElement("button");
    runBtn.className = "hera-scanview-run-btn";

    const updateRunButton = () => {
      if (scanState.getState().isScanning) {
        runBtn.classList.add("is-scanning");
        runBtn.textContent = "Escaneando...";
        runBtn.title = "Pasar el cursor aquí para cancelar";
      } else {
        runBtn.classList.remove("is-scanning");
        runBtn.textContent = "Ejecutar";
        runBtn.title = "";
      } 
    };

    updateRunButton();

    runBtn.addEventListener("mouseenter", () => {
      if (scanState.getState().isScanning) {
        runBtn.textContent = "Cancelar";
      }
    });

    runBtn.addEventListener("mouseleave", () => {
      if (scanState.getState().isScanning) {
        runBtn.textContent = "Escaneando...";
      } 
    });

    runBtn.addEventListener("click", async () => {
      if (scanState.getState().isScanning) {
        await scanState.cancelScan();
        return;
      }

      const validationError = this.validateCustomForm();

      if (validationError) {
        this.showCustomFormError(validationError);
        return;
      }

      this.clearCustomFormError();

      await scanState.startCustomScan(this.customForm);
      this.loadAndRenderResults();
    });
    form.appendChild(runBtn);

    // Contenedor de error de validación (vacío por defecto, se llena en showCustomFormError)
    const errorEl = document.createElement("p");
    errorEl.className = "hera-custom-form-error";
    errorEl.id = "hera-custom-form-error";
    errorEl.style.display = "none";
    form.appendChild(errorEl);

    return form;
  }

  // Valida los parámetros del formulario "Personalizado" del lado del cliente, antes de
  // siquiera invocar Tauri — evita un viaje redondo a Rust/Python solo para recibir un
  // error de validación. La MISMA validación se repite en tools/nmap.py::validar_parametros_personalizado
  // como defensa del lado del backend (por si algún día hay otro llamador de trigger_custom_scan
  // que no pase por este formulario). Devuelve un mensaje de error, o null si todo es válido.
  private validateCustomForm(): string | null {
    const f = this.customForm;

    if (!["tcp", "udp", "sctp"].includes(f.protocol)) {
      return "Protocolo inválido.";
    }
    if (f.protocol === "tcp" && !["syn", "connect", "fin", "null", "xmas"].includes(f.tcpType ?? "")) {
      return "Tipo de escaneo TCP inválido.";
    }
    if (!Number.isInteger(f.timing) || f.timing < 1 || f.timing > 5) {
      return "La intensidad debe estar entre T1 y T5.";
    }
    if (!["specific", "top", "ratio", "all"].includes(f.portMode)) {
      return "Modo de puertos inválido.";
    }

    if (f.portMode === "specific") {
      const tokens = f.portValue.split(",").map((t) => t.trim()).filter(Boolean);
      if (tokens.length === 0) {
        return "Especifica al menos un puerto (ej: 80,443).";
      }
      for (const tok of tokens) {
        const rangeMatch = tok.match(/^(\d{1,5})-(\d{1,5})$/);
        if (rangeMatch) {
          const a = parseInt(rangeMatch[1], 10);
          const b = parseInt(rangeMatch[2], 10);
          if (a < 1 || b > 65535 || a > b) {
            return `Rango de puertos inválido: ${tok}`;
          }
        } else if (/^\d{1,5}$/.test(tok)) {
          const n = parseInt(tok, 10);
          if (n < 1 || n > 65535) {
            return `Puerto fuera de rango (1-65535): ${tok}`;
          }
        } else {
          return `Formato de puerto no reconocido: ${tok}`;
        }
      }
    } else if (f.portMode === "top") {
      const n = parseInt(f.portValue, 10);
      if (!Number.isInteger(n) || String(n) !== f.portValue.trim() || n < 1 || n > 65535) {
        return "La cantidad de 'top ports' debe ser un entero entre 1 y 65535.";
      }
    } else if (f.portMode === "ratio") {
      const r = parseFloat(f.portValue);
      if (isNaN(r) || r < 0 || r > 1) {
        return "El port-ratio debe ser un número entre 0 y 1.";
      }
    }

    return null;
  }

  private showCustomFormError(message: string) {
    const el = document.getElementById("hera-custom-form-error");
    if (el) {
      el.textContent = `⚠ ${message}`;
      el.style.display = "block";
    }
  }

  private clearCustomFormError() {
    const el = document.getElementById("hera-custom-form-error");
    if (el) {
      el.textContent = "";
      el.style.display = "none";
    }
  }

  // Casilla opcional de evasión de firewall/IDS (fragmentación, señuelos, orden aleatorio).
  // Usa su propia clase y no .hera-custom-field, porque ese estilo quita la apariencia nativa
  // de los <input> y dejaría la casilla invisible.
  private buildEvasionToggle(checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
    const label = document.createElement("label");
    label.className = "hera-evasion-toggle";
    label.title =
      "Fragmentación, señuelos y orden aleatorio. Solo útil para probar si tu propio firewall/IDS " +
      "detecta un escaneo sigiloso: vuelve el escaneo más lento y menos preciso.";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => onChange(checkbox.checked));

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode("Evasión de firewall/IDS"));
    return label;
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
      this.lastScanTime = result.scan_time ?? null;
      if (!result.found) {
        this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">Sin resultados previos para esta categoría. Ejecuta un escaneo para ver datos aquí.</p>`;
        return;
      }
      if (result.devices.length === 0) {
        // Un escaneo terminado sin dispositivos es un resultado en sí: en "ocultos" significa
        // que todos los hosts activos responden al ping.
        const nota =
          cat.id === "ocultos"
            ? "Ningún dispositivo oculto: todos los hosts activos responden al ping."
            : "El último escaneo no encontró dispositivos activos.";
        this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">${nota}</p>`;
        return;
      }
      this.renderDevices(cat, result.devices);
    } catch (err: any) {
      this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">⚠ Error al leer resultados: ${err?.message ?? err}</p>`;
    }
  }

  private renderDevices(cat: ScanCategory, devices: CategoryDevice[]) {
    this.resultsArea.innerHTML = "";

    // Duración del escaneo que generó estos resultados (ausente si el backend no la manda
    // todavía para esta categoría, o si el XML no traía <runstats><finished>).
    if (this.lastScanTime && this.lastScanTime.duracion_str !== "N/D") {
      const timeNote = document.createElement("p");
      timeNote.className = "hera-scan-time-note";
      timeNote.textContent = `⏱ Duración del escaneo: ${this.lastScanTime.duracion_str}`;
      this.resultsArea.appendChild(timeNote);
    }

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

      // Detección de SO (si la categoría corrió -O y Nmap logró algo). Se muestra para
      // cualquier categoría excepto 'vuln', que mantiene su presentación propia.
      if (cat.id !== "vuln") {
        const osBlock = this.renderOsInfo(dev);
        if (osBlock) card.appendChild(osBlock);
      }

      if (cat.id === "admin") {
        card.appendChild(this.renderAdminPorts(dev));
      } else {
        card.appendChild(this.renderGenericBadges(dev));
      }

      // Puertos filtrados (probable firewall).
      const filteredBlock = this.renderFilteredPorts(dev);
      if (filteredBlock) card.appendChild(filteredBlock);

      // URLs "Location:" (SSDP/UPnP) — pistas de identificación del dispositivo.
      if (cat.id !== "vuln") {
        const locBlock = this.renderLocationUrls(dev);
        if (locBlock) card.appendChild(locBlock);
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

  // Resume la detección de SO de un dispositivo (Device type / Running / OS details, o los
  // "guesses" más probables cuando no hay match exacto). Devuelve null si no hay nada que
  // mostrar (categoría no corrió -O, o Nmap no encontró ningún osmatch).
  private renderOsInfo(dev: CategoryDevice): HTMLElement | null {
    const os = dev.os_info;
    if (!os) return null;

    const wrap = document.createElement("div");
    wrap.className = "hera-scan-os-info";

    if (os.exact_match) {
      const parts: string[] = [];
      if (os.device_types.length > 0) parts.push(os.device_types.join(", "));
      if (os.running) parts.push(os.running);
      if (parts.length === 0 && os.details) parts.push(os.details);
      if (parts.length === 0) return null;
      wrap.innerHTML = `<span class="hera-scan-os-label">SO:</span> ${parts.join(" — ")}`;
      if (os.details) wrap.title = os.details;
    } else {
      if (os.guesses.length === 0) return null;
      const guessText = os.guesses
        .map((g) => `${g.name ?? "?"} (${g.accuracy ?? "?"}%)`)
        .join(", ");
      wrap.innerHTML = `<span class="hera-scan-os-label">SO (sin match exacto):</span> ${guessText}`;
    }

    return wrap;
  }

  // Puertos que respondieron "filtered" en vez de "open"/"closed" — probable firewall
  // bloqueando la respuesta. Se muestran en naranja, sin emoji, distintos al estilo de los
  // puertos abiertos.
  private renderFilteredPorts(dev: CategoryDevice): HTMLElement | null {
    if (dev.filtered_ports.length === 0) return null;

    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges hera-scan-filtered-badges";
    dev.filtered_services.forEach((srv) => {
      const badge = document.createElement("span");
      badge.className = "hera-scan-badge is-filtered";
      badge.textContent = srv;
      wrap.appendChild(badge);
    });
    return wrap;
  }

  // URLs "Location:" (SSDP/UPnP) capturadas por scripts NSE — suelen apuntar a un XML de
  // descripción del dispositivo (fabricante, modelo). Se listan como enlaces clicables.
  private renderLocationUrls(dev: CategoryDevice): HTMLElement | null {
    if (dev.location_urls.length === 0) return null;

    const wrap = document.createElement("div");
    wrap.className = "hera-scan-location-urls";
    dev.location_urls.forEach((url) => {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = url;
      wrap.appendChild(link);
    });
    return wrap;
  }

  private renderGenericBadges(dev: CategoryDevice): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "hera-scan-badges";
    if (dev.services.length === 0) {
      wrap.innerHTML = `<span class="hera-scan-empty-note">Sin puertos abiertos detectados</span>`;
      return wrap;
    }
    dev.ports.forEach((port, i) => {
      const badge = document.createElement("span");
      badge.className = "hera-scan-badge";
      badge.textContent = dev.services[i] ?? `${port}`;
      const detail = dev.service_details.find((d) => d.port === port && d.state === "open");
      if (detail) {
        const bits = [detail.product, detail.version, detail.extrainfo].filter(Boolean);
        if (bits.length > 0) {
          badge.title = bits.join(" ");
        } else if (!detail.reconocido && detail.fingerprint) {
          badge.title = "Servicio no reconocido — fingerprint disponible";
        }
      }
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
      // Título de la página (http-title): dice QUÉ panel es, no solo que el puerto está abierto.
      const title = dev.service_details.find((d) => d.port === port && d.state === "open" && d.title)?.title;
      const base = title ? `${port}/${adminPortLabel(port)} "${title}"` : `${port}/${adminPortLabel(port)}`;
      badge.textContent = standard ? base : `${base} ⚠ no estándar`;
      if (title) badge.title = title;
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