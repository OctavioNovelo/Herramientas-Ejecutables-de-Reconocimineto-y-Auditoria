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
import { heraApi, CustomScanParams, ScanTimeInfo, ToolStatus } from "../api/heraApi";
import { renderCategoryResults } from "./ScanResults";
import { formatoReloj, esc } from "../utils/security";
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

  // Solicitud de instalación de la herramienta que le falta a la categoría (cat.requiresTool),
  // mostrada en lugar de la barra de acción. Se abre al pulsar Ejecutar si falta la herramienta.
  private installPrompt: {
    tool: string;
    status: ToolStatus;
    installing: boolean;
    error: string | null;
  } | null = null;

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

    if (this.installPrompt && this.installPrompt.tool !== cat.requiresTool) {
      this.installPrompt = null; // se cambió de categoría
    }
    if (this.installPrompt) {
      this.actionBar.appendChild(this.renderInstallPrompt(cat));
      return;
    }

    const label = document.createElement("span");
    label.className = "hera-scanview-action-bar-label hera-scanview-action-label";
    label.textContent = cat.label;

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

    const runBtn = this.buildRunControl();

    runBtn.addEventListener("click", async () => {
      if (scanState.getState().isScanning) return;

      if (cat.requiresTool) {
        let status: ToolStatus;
        try {
          status = await heraApi.getToolStatus(cat.requiresTool);
        } catch (err: any) {
          status = { installed: false, version: null, download_size: null };
          this.installPrompt = { tool: cat.requiresTool, status, installing: false, error: String(err?.message ?? err) };
          this.renderActionBar();
          return;
        }
        if (!status.installed) {
          this.installPrompt = { tool: cat.requiresTool, status, installing: false, error: null };
          this.renderActionBar();
          return;
        }
      }

      await this.runScan(cat);
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

  private buildCustomForm(_isScanning: boolean): HTMLElement {
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
    const runBtn = this.buildRunControl();

    runBtn.addEventListener("click", async () => {
      if (scanState.getState().isScanning) return;

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

  // Control de ejecución: botón "Ejecutar" en reposo; durante un escaneo, un bloque de
  // progreso (qué corre + reloj) con un botón "Cancelar escaneo" siempre visible. Sustituye
  // al antiguo "pasa el cursor para cancelar", que no se descubría ni funcionaba con teclado.
  private progressTimer: number | null = null;

  private buildRunControl(): HTMLElement {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    const st = scanState.getState();
    if (!st.isScanning) {
      const runBtn = document.createElement("button");
      runBtn.className = "hera-scanview-run-btn";
      runBtn.textContent = "Ejecutar";
      return runBtn;
    }

    const box = document.createElement("div");
    box.className = "hera-progress";
    box.setAttribute("role", "status");
    box.innerHTML = `
      <span class="hera-progress-pulse" aria-hidden="true"></span>
      <span class="hera-progress-text">Escaneando: ${esc(st.scanLabel ?? "")}</span>
      <span class="hera-progress-clock">00:00</span>`;
    const clock = box.querySelector(".hera-progress-clock") as HTMLElement;
    const tick = () => (clock.textContent = formatoReloj(Date.now() - (st.scanStartedAt ?? Date.now())));
    tick();
    this.progressTimer = window.setInterval(tick, 1000);

    const cancel = document.createElement("button");
    cancel.className = "hera-progress-cancel";
    cancel.textContent = "Cancelar escaneo";
    cancel.addEventListener("click", () => scanState.cancelScan());
    box.appendChild(cancel);
    return box;
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
      el.textContent = `${message}`;
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
  private async runScan(cat: ScanCategory) {
    await scanState.startScan(cat.id, this.targetInput, cat.supportsEvasion ? this.evasionEnabled : false, cat.label);
    this.loadAndRenderResults();
  }

  // Pide permiso para instalar la herramienta que falta. Al aceptar, la instala (descarga de la
  // release oficial + verificación SHA-256 en tools/<herramienta>.py) y lanza el escaneo, igual
  // que el CLI (CLI.py::_herramienta_lista).
  private renderInstallPrompt(cat: ScanCategory): HTMLElement {
    const prompt = this.installPrompt!;
    const box = document.createElement("div");
    box.className = "hera-install-prompt";

    const text = document.createElement("p");
    text.className = "hera-install-prompt-text";
    const version = prompt.status.version ? ` ${prompt.status.version}` : "";
    const size = prompt.status.download_size ? ` (${prompt.status.download_size})` : "";
    text.textContent =
      `${cat.label} necesita ${prompt.tool}${version}, que no está instalado. HERA puede descargarlo ` +
      `de su release oficial${size} y verificar su SHA-256 antes de instalarlo.`;
    box.appendChild(text);

    const buttons = document.createElement("div");
    buttons.className = "hera-install-prompt-buttons";

    const installBtn = document.createElement("button");
    installBtn.className = "hera-scanview-run-btn";
    installBtn.textContent = prompt.installing ? "Instalando..." : `Instalar ${prompt.tool}`;
    installBtn.disabled = prompt.installing;
    installBtn.addEventListener("click", async () => {
      prompt.installing = true;
      prompt.error = null;
      this.renderActionBar();
      try {
        await heraApi.installTool(prompt.tool);
      } catch (err: any) {
        prompt.installing = false;
        prompt.error = typeof err === "string" ? err : String(err?.message ?? err);
        this.renderActionBar();
        return;
      }
      this.installPrompt = null;
      this.renderActionBar();
      await this.runScan(cat);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "hera-install-prompt-cancel";
    cancelBtn.textContent = "Cancelar";
    cancelBtn.disabled = prompt.installing;
    cancelBtn.addEventListener("click", () => {
      this.installPrompt = null;
      this.renderActionBar();
    });

    buttons.appendChild(installBtn);
    buttons.appendChild(cancelBtn);
    box.appendChild(buttons);

    if (prompt.error) {
      const error = document.createElement("p");
      error.className = "hera-custom-form-error";
      error.textContent = prompt.error;
      box.appendChild(error);
    }
    return box;
  }

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
      this.resultsArea.innerHTML = "";
      this.resultsArea.appendChild(renderCategoryResults(cat, result.devices, this.lastScanTime));
    } catch (err: any) {
      this.resultsArea.innerHTML = `<p class="hera-scan-empty-note">No se pudieron leer los resultados: ${esc(err?.message ?? err)}</p>`;
    }
  }
}
