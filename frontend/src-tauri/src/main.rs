// Archivo: frontend/src-tauri/src/main.rs
// Razón: Implementa los comandos nativos de Rust para leer directorios del sistema de forma
// segura, obtener la dirección de red auditada, correr subprocesos de escaneo, y exponer el
// análisis ya procesado por utils/parser.py (fuente única de verdad, compartida con el CLI).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::collections::HashSet;
//agregado
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;

// Estado del proceso de escaneo actualmente ejecutándose.
// Permite que trigger_nmap_scan / trigger_custom_scan
// compartan el proceso con cancel_nmap_scan.
#[derive(Default)]
struct ScanProcessState {
    child: Mutex<Option<Child>>,
    cancelled: AtomicBool,

    // Archivos que ya existían antes de comenzar el escaneo.
    // Se utilizan para eliminar únicamente los archivos nuevos
    // si el usuario cancela el escaneo.
    files_before_scan: Mutex<Option<HashSet<PathBuf>>>,
}
//------------

// Estructura para devolver los archivos XML de escaneo crudos al frontend (uso puntual/futuro,
// p. ej. exportar el XML original; el dashboard ya NO depende de esto, ver get_dashboard_data).
#[derive(serde::Serialize)]
struct ScanFile {
    name: String,
    content: String,
    modified: u64,
}

// Helper para encontrar la raíz del espacio de trabajo de HERA
// Localiza la raíz del proyecto buscando hacia arriba en el árbol de carpetas hasta
// encontrar HERA.py (el punto de entrada del CLI). Se usa HERA.py como marcador —y NO
// utils/Resultados/— porque esa carpeta de resultados se crea de forma perezosa recién
// cuando corre el primer escaneo (ver _escribir_hosts_file en tools/nmap.py). En una
// instalación limpia, sin ningún escaneo previo, utils/Resultados/ no existe en ningún
// lado del árbol, la búsqueda nunca encuentra nada, y el fallback termina devolviendo el
// directorio de trabajo del proceso de Tauri (típicamente frontend/src-tauri/ en modo
// dev) — la raíz equivocada, lo que rompe cualquier `from utils.xxx import ...` con
// "No module named 'utils'". HERA.py, en cambio, existe desde el primer `git clone`.
fn find_workspace_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("HERA.py").exists() {
            return Some(dir);
        }
        if let Some(parent) = dir.parent() {
            dir = parent.to_path_buf();
        } else {
            break;
        }
    }
    std::env::current_dir().ok()
}

// Helper para detectar la carpeta correspondiente al OS
fn get_os_folder() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "Windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(any(target_os = "linux", target_os = "freebsd"))]
    {
        "Linux"
    }
}

// Comando para obtener la dirección de red auditada (leída de hosts.txt, generado por el
// último escaneo) y el hostname local. NO usa la IP local de la máquina: HERA audita una red
// completa, así que lo relevante es qué subred se escaneó, no la IP propia del equipo.
#[tauri::command]
fn get_host_info() -> Result<serde_json::Value, String> {
    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;
    let os_folder = get_os_folder();
    let hosts_file = root
        .join("utils")
        .join("Resultados")
        .join(os_folder)
        .join("Nmap")
        .join("hosts.txt");

    let hostname = std::process::Command::new("hostname")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "localhost".to_string());

    let red = if hosts_file.exists() {
        std::fs::read_to_string(&hosts_file)
            .ok()
            .and_then(|content| content.lines().next().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Sin red detectada".to_string())
    } else {
        "Sin escaneos previos".to_string()
    };

    Ok(serde_json::json!({ "ip": red, "hostname": hostname }))
}

// Comando para leer los archivos XML crudos de resultados (disponible para uso futuro,
// p. ej. exportar/descargar el reporte original de Nmap). El dashboard combinado usa
// get_dashboard_data en su lugar, que ya procesa esta información en Python.
#[tauri::command]
fn read_scan_results() -> Result<Vec<ScanFile>, String> {
    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;

    let os_folder = get_os_folder();
    let nmap_dir = root.join("utils").join("Resultados").join(os_folder).join("Nmap");

    if !nmap_dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    let entries = std::fs::read_dir(nmap_dir)
        .map_err(|e| format!("Error al abrir el directorio de resultados: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() && path.extension().map_or(false, |ext| ext == "xml") {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Error al leer el archivo {}: {}", name, e))?;

                let modified = path
                    .metadata()
                    .and_then(|m| m.modified())
                    .and_then(|t| {
                        t.duration_since(std::time::SystemTime::UNIX_EPOCH)
                            .map_err(|_| std::io::ErrorKind::Other.into())
                    })
                    .map(|d| d.as_secs())
                    .unwrap_or(0);

                files.push(ScanFile {
                    name,
                    content,
                    modified,
                });
            }
        }
    }

    files.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(files)
}

// Comando principal del dashboard combinado: invoca utils/parser.py (la MISMA lógica que usa
// el CLI) para obtener dispositivos agrupados y estadísticas ya calculadas, evitando reimplementar
// el análisis de vulnerabilidades en TypeScript. Devuelve {devices, stats} en una sola llamada.
#[tauri::command]
fn get_dashboard_data() -> Result<serde_json::Value, String> {
    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;

    let python_code = r#"
import sys, json
sys.path.append('.')
try:
    from utils.system_info import obtener_sistema_operativo, obtener_carpeta_os
    from utils.parser import obtener_dispositivos_para_dashboard, obtener_estadisticas_dashboard

    os_name = obtener_sistema_operativo()
    os_folder = obtener_carpeta_os(os_name)

    devices = obtener_dispositivos_para_dashboard(os_folder)
    stats = obtener_estadisticas_dashboard(os_folder)

    print(json.dumps({"devices": devices, "stats": stats}))
except Exception as e:
    print(f"Error al leer resultados: {e}", file=sys.stderr)
    sys.exit(1)
"#;

    let output = std::process::Command::new("python3")
        .arg("-c")
        .arg(python_code)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Fallo al iniciar el subproceso de Python: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("No se pudieron leer los resultados.\nSTDERR: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Respuesta inesperada del backend Python: {} (raw: {})", e, stdout))
}

fn obtener_archivos_resultados() -> HashSet<PathBuf> {
    let mut archivos = HashSet::new();

    let Some(root) = find_workspace_root() else {
        return archivos;
    };

    let os_folder = get_os_folder();

    let nmap_dir = root
        .join("utils")
        .join("Resultados")
        .join(os_folder)
        .join("Nmap");

    if let Ok(entries) = std::fs::read_dir(nmap_dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_file() {
                archivos.insert(path);
            }
        }
    }

    archivos
}

fn eliminar_archivos_nuevos(state: &ScanProcessState) {
    let archivos_anteriores = match state.files_before_scan.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => {
            eprintln!("No se pudo acceder a la lista de archivos anteriores.");
            return;
        }
    };

    let Some(archivos_anteriores) = archivos_anteriores else {
        return;
    };

    let archivos_actuales = obtener_archivos_resultados();

    for archivo in archivos_actuales {
        if !archivos_anteriores.contains(&archivo) {
            match std::fs::remove_file(&archivo) {
                Ok(_) => {
                    println!(
                        "Archivo temporal de escaneo eliminado: {:?}",
                        archivo
                    );
                }
                Err(e) => {
                    eprintln!(
                        "No se pudo eliminar el archivo {:?}: {}",
                        archivo, e
                    );
                }
            }
        }
    }

    if let Ok(mut guard) = state.files_before_scan.lock() {
        *guard = None;
    }
}

//Agregado
// Ejecuta un proceso de Python de forma cancelable.
// El proceso se guarda en ScanProcessState para que otro comando Tauri
// pueda terminarlo mientras el escaneo está en curso.
fn ejecutar_proceso_escaneo(
    mut command: Command,
    state: &ScanProcessState,
) -> Result<bool, String> {

    {
        let mut child_guard = state
            .child
            .lock()
            .map_err(|_| "No se pudo acceder al estado del proceso de escaneo.".to_string())?;

        if child_guard.is_some() {
            return Err("Ya hay un escaneo en ejecución.".to_string());
        }

        // Guardamos los archivos existentes antes de comenzar.
        let archivos_anteriores = obtener_archivos_resultados();

        let mut archivos_guard = state
            .files_before_scan
            .lock()
            .map_err(|_| "No se pudo guardar el estado de los archivos.".to_string())?;

        *archivos_guard = Some(archivos_anteriores);

        state.cancelled.store(false, Ordering::SeqCst);

        command.stdout(Stdio::null());
        command.stderr(Stdio::null());

        let child = command
            .spawn()
            .map_err(|e| format!("Fallo al iniciar el subproceso de Python: {}", e))?;

        *child_guard = Some(child);
    }

    loop {
        let terminado = {
            let mut child_guard = state
                .child
                .lock()
                .map_err(|_| "No se pudo acceder al proceso de escaneo.".to_string())?;

            if let Some(child) = child_guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        child_guard.take();
                        Some(status.success())
                    }
                    Ok(None) => None,
                    Err(e) => {
                        child_guard.take();
                        return Err(format!(
                            "Error al comprobar el proceso de escaneo: {}",
                            e
                        ));
                    }
                }
            } else {
                return Err("No hay un proceso de escaneo activo.".to_string());
            }
        };

        if let Some(exito) = terminado {
            let fue_cancelado = state.cancelled.load(Ordering::SeqCst);

            if fue_cancelado {
                return Ok(false);
            }

            return Ok(exito);
        }

        std::thread::sleep(Duration::from_millis(100));
    }
}

//Agregado
// Cancela el proceso de escaneo actualmente ejecutándose.
#[tauri::command]
fn cancel_nmap_scan(
    state: tauri::State<'_, ScanProcessState>,
) -> Result<String, String> {

    state.cancelled.store(true, Ordering::SeqCst);

    {
        let mut child_guard = state
            .child
            .lock()
            .map_err(|_| "No se pudo acceder al proceso de escaneo.".to_string())?;

        let child = match child_guard.as_mut() {
            Some(child) => child,
            None => {
                state.cancelled.store(false, Ordering::SeqCst);
                return Ok("No había ningún escaneo en ejecución.".to_string());
            }
        };

        #[cfg(target_os = "windows")]
        {
            let pid = child.id().to_string();

            let status = Command::new("taskkill")
                .args(["/PID", &pid, "/T", "/F"])
                .status()
                .map_err(|e| {
                    format!("No se pudo cancelar el escaneo: {}", e)
                })?;

            if !status.success() {
                return Err(
                    "No se pudo terminar el proceso de escaneo.".to_string()
                );
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            child
                .kill()
                .map_err(|e| {
                    format!("No se pudo cancelar el escaneo: {}", e)
                })?;
        }
    }

    // El proceso ya fue terminado.
    // Eliminamos los archivos que aparecieron durante este escaneo.
    eliminar_archivos_nuevos(&state);

    Ok("Escaneo cancelado.".to_string())
}


// Comando de integración para iniciar un escaneo de red real. Despacha según 'scan_type' a la
// función correspondiente de tools/nmap.py — cada categoría de la pestaña "Escaneo" llama a su
// propia función, no siempre full_pack. La categoría 'custom' (personalizado) queda excluida
// a propósito: esa función usa input() interactivo (CLI), lo cual se colgaría indefinidamente
// si se invoca sin una terminal real, como ocurre al lanzarla desde un subprocess de Tauri.
#[tauri::command]
async fn trigger_nmap_scan(scan_type: String,target: Option<String>,state: tauri::State<'_, ScanProcessState>,) -> Result<String, String> {
    println!(
        "Iniciando escaneo real de tipo: {} en el backend de HERA",
        scan_type
    );

    let funcion_python = match scan_type.as_str() {
        "rapido" => "nmap.escaneo_rapido(context, target=target)",
        "vuln" => "nmap.vulnerabilidades(context, target=target)",
        "ocultos" => "nmap.dispositivos_ocultos(context, target=target)",
        "admin" => "nmap.admin_audit(context, target=target)",
        "id" => "nmap.indentificar_dispositivos(context, target=target)",
        "consumo" => "nmap.monitor_consumo(context, target=target)",
        "full" | "full_pack" => "nmap.full_pack(context, target=target)",
        "custom" => {
            return Err(
                "El escaneo personalizado usa un comando distinto (trigger_custom_scan), no trigger_nmap_scan.".to_string()
            )
        }
        otro => return Err(format!("Tipo de escaneo desconocido: '{}'", otro)),
    };

    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;

    // El objetivo (target) se pasa como argumento de proceso (sys.argv), NO interpolado
    // directamente en el código Python, porque es un valor que escribe el usuario y no debe
    // poder romper la sintaxis del script embebido (mismo criterio que get_category_results
    // y trigger_custom_scan).
    let python_code = format!(
        r#"
import sys
sys.path.append('.')
import core.executor as ejec
import tools.nmap as nmap
from utils.system_info import obtener_sistema_operativo, obtener_carpeta_os

try:
    target = sys.argv[1] if sys.argv[1] != '__NONE__' else None
    os_name = obtener_sistema_operativo()
    os_folder = obtener_carpeta_os(os_name)
    print("1. Resolviendo configuración de red local...")
    context = ejec.ejecutar_herramienta('Nmap', os_folder)
    if target:
        print(f"2. Iniciando escaneo en objetivo personalizado: {{target}}")
    else:
        print(f"2. Iniciando escaneo en subredes: {{context.get('redes')}}")
    {funcion_python}
    print("3. Escaneo finalizado con éxito.")
except Exception as e:
    print(f"Error durante la ejecución del escaneo HERA: {{e}}", file=sys.stderr)
    sys.exit(1)
"#,
        funcion_python = funcion_python
    );

    let target_arg = target.unwrap_or_else(|| "__NONE__".to_string());

    let command = {
        let mut command = Command::new("python3");

        command
            .arg("-c")
            .arg(&python_code)
            .arg(&target_arg)
            .current_dir(&root);

        command
    };

    let resultado = ejecutar_proceso_escaneo(command, &state)?;

    if !resultado {
        return Err("ESCANEO_CANCELADO".to_string());
    }

    Ok(format!("El escaneo '{}' se completó correctamente y los datos han sido guardados.", scan_type))
}

// Comando para la pestaña "Escaneo": busca el archivo XML más reciente de una categoría
// específica (mismo criterio que buscar_escaneos en utils/parser.py) y devuelve sus resultados
// ya procesados (dispositivos agrupados + vulnerabilidades confirmadas/posibles).
#[tauri::command]
fn get_category_results(file_base: String) -> Result<serde_json::Value, String> {
    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;

    let python_code = r#"
import sys, json
sys.path.append('.')
try:
    from pathlib import Path
    from utils.system_info import obtener_sistema_operativo, obtener_carpeta_os
    from utils.parser import buscar_escaneos, obtener_resultados_categoria

    os_name = obtener_sistema_operativo()
    os_folder = obtener_carpeta_os(os_name)
    file_base = sys.argv[1]

    resultados_dir = Path('.') / 'utils' / 'Resultados' / os_folder / 'Nmap'
    archivos = buscar_escaneos(resultados_dir, file_base, extension='.xml')

    if not archivos:
        print(json.dumps({"devices": [], "found": False}))
    else:
        resultado = obtener_resultados_categoria(archivos[0])
        resultado["found"] = "error" not in resultado
        print(json.dumps(resultado))
except Exception as e:
    print(f"Error al leer resultados de categoría: {e}", file=sys.stderr)
    sys.exit(1)
"#;

    let output = std::process::Command::new("python3")
        .arg("-c")
        .arg(python_code)
        .arg(&file_base)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Fallo al iniciar el subproceso de Python: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("No se pudieron leer los resultados de la categoría.\nSTDERR: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Respuesta inesperada del backend Python: {} (raw: {})", e, stdout))
}

// Comando para lanzar el escaneo "Personalizado" desde la interfaz, con los parámetros que en
// el CLI se piden por teclado (ver tools/nmap.py::personalizado). Llama a personalizado_gui(),
// la versión no interactiva escrita específicamente para no depender de stdin.
// Los parámetros se pasan como argumentos de línea de comandos (sys.argv), NO interpolados
// directamente en el código Python, para evitar cualquier riesgo de inyección si algún valor
// contuviera comillas u otros caracteres especiales.
#[tauri::command]
async fn trigger_custom_scan(
    protocol: String,
    tcp_type: Option<String>,
    timing: u8,
    port_mode: String,
    port_value: String,
    target: Option<String>,
    state: tauri::State<'_, ScanProcessState>,
) -> Result<String, String> {
    let root = find_workspace_root()
        .ok_or_else(|| "No se pudo localizar el directorio de resultados de HERA.".to_string())?;

    let python_code = r#"
import sys
sys.path.append('.')
import core.executor as ejec
import tools.nmap as nmap
from utils.system_info import obtener_sistema_operativo, obtener_carpeta_os

try:
    protocol = sys.argv[1]
    tcp_type = sys.argv[2] if sys.argv[2] != '__NONE__' else None
    timing = int(sys.argv[3])
    port_mode = sys.argv[4]
    port_value = sys.argv[5]
    target = sys.argv[6] if sys.argv[6] != '__NONE__' else None

    os_name = obtener_sistema_operativo()
    os_folder = obtener_carpeta_os(os_name)
    print("1. Resolviendo configuración de red local...")
    context = ejec.ejecutar_herramienta('Nmap', os_folder)
    if target:
        print(f"2. Iniciando escaneo personalizado en objetivo: {target}")
    else:
        print(f"2. Iniciando escaneo personalizado en subredes: {context.get('redes')}")
    nmap.personalizado_gui(
        context,
        protocol=protocol,
        tcp_type=tcp_type,
        timing=timing,
        port_mode=port_mode,
        port_value=port_value,
        target=target,
    )
    print("3. Escaneo personalizado finalizado con éxito.")
except Exception as e:
    print(f"Error durante la ejecución del escaneo HERA: {e}", file=sys.stderr)
    sys.exit(1)
"#;

    let tcp_type_arg = tcp_type.unwrap_or_else(|| "__NONE__".to_string());
    let target_arg = target.unwrap_or_else(|| "__NONE__".to_string());

        let command = {
            let mut command = Command::new("python3");

            command
                .arg("-c")
                .arg(python_code)
                .arg(&protocol)
                .arg(&tcp_type_arg)
                .arg(timing.to_string())
                .arg(&port_mode)
                .arg(&port_value)
                .arg(&target_arg)
                .current_dir(&root);

            command
        };

        let resultado = ejecutar_proceso_escaneo(command, &state)?;

        if !resultado {
            return Err("ESCANEO_CANCELADO".to_string());
        }



    Ok("El escaneo personalizado se completó correctamente y los datos han sido guardados.".to_string())
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
    .manage(ScanProcessState::default())
    .invoke_handler(tauri::generate_handler![
        get_host_info,
        read_scan_results,
        get_dashboard_data,
        get_category_results,
        trigger_nmap_scan,
        trigger_custom_scan,
        cancel_nmap_scan
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}