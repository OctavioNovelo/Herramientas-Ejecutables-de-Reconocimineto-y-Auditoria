// Prueba de interacción por CDP (sin dependencias). Con `npm run dev:demogrande` corriendo: node herramientas/prueba.mjs
// URL=... cambia la dirección; CAP=... la carpeta de capturas (por defecto, una temporal del sistema).
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const BASE = process.env.URL || "http://127.0.0.1:3001/", D = process.env.CAP || fs.mkdtempSync(path.join(os.tmpdir(), "hera-prueba-")), PORT = 9377; fs.mkdirSync(D, { recursive: true });
const ch = spawn("chromium", ["--headless=new", "--no-sandbox", ...(process.env.GPU ? ["--use-angle=vulkan", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]), "--hide-scrollbars", `--remote-debugging-port=${PORT}`, "--user-data-dir=" + (fs.mkdirSync(D + "/.cdp", { recursive: true }), D + "/.cdp"), "about:blank"], { stdio: "ignore" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(), errs = [], out = {};
try {
  let tabs; for (let i = 0; i < 40 && !tabs; i++) { await dormir(250); try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch {} }
  ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 300)); else if (d.method === "Runtime.consoleAPICalled" && /error|assert/.test(d.params.type)) errs.push(d.params.args.map((a) => a.value).join(" ").slice(0, 300)); };
  const cdp = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cdp("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(e + " -> " + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  const foto = async (n) => fs.writeFileSync(`${D}/${n}.png`, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  const raton = (type, x, y, extra = {}) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra });
  const mover = async (x, y) => { await raton("mouseMoved", x - 3, y - 3); await raton("mouseMoved", x, y); };
  const clic = async (x, y) => { await mover(x, y); await raton("mousePressed", x, y, { button: "left", clickCount: 1 }); await raton("mouseReleased", x, y, { button: "left", clickCount: 1 }); };
  const centro = (sel, n = 0) => ev(`(() => { const r = [...document.querySelectorAll(${JSON.stringify(sel)})][${n}].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const tecla = async (key, text) => { const p = { key, code: key.length === 1 ? undefined : key, windowsVirtualKeyCode: { Enter: 13, Escape: 27, ArrowRight: 39, ArrowLeft: 37, Tab: 9 }[key] || key.toUpperCase().charCodeAt(0), text: text ?? (key === "Enter" ? "\r" : key.length === 1 ? key : undefined) }; await cdp("Input.dispatchKeyEvent", { type: "keyDown", ...p }); await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...p }); };
  const st = () => ev(`(() => { const S = ARGOS.S; return [document.body.dataset.vista, location.hash, "sel=" + ARGOS.H.equipos[S.sel].nombre, "hover=" + S.hover, "filtro=" + S.filtro, "parte=" + S.parte, "acc=" + (S.accion && S.accion.titulo), "scan=" + !!S.scan, "datos=" + S.datos].join(" | "); })()`);
  const lanzarCarta = async () => { await clic(...(await centro('.carta[data-d="0"] button'))); await dormir(300); await clic(...(await centro('#pers button[value="si"]'))); };   // la carta abre su diálogo (objetivo, evasión); se acepta tal cual
  const tam = async (w, h) => cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp("Runtime.enable"); await cdp("Page.enable"); await tam(1600, 950);
  const abrir = async (h) => { await cdp("Page.navigate", { url: BASE + h }); await dormir(1500); };

  // capturas de los seis estados a 1600x950 y dos a 1280x720
  for (const [h, n] of [["#red", "red"], ["#equipo", "equipo"], ["#plan", "plan"], ["#lanzar", "lanzar"], ["#equipo=192.168.1.10", "equipo-24-puertos"], ["#equipo=192.168.1.77", "equipo-sin-puertos"]]) { await abrir("about:blank" === h ? "" : h); await cdp("Page.navigate", { url: "about:blank" }); await abrir(h); await foto(n); }
  await tam(1280, 720); for (const [h, n] of [["#red", "red-1280"], ["#equipo", "equipo-1280"], ["#plan", "plan-1280"], ["#lanzar", "lanzar-1280"]]) { await cdp("Page.navigate", { url: "about:blank" }); await abrir(h); await foto(n); }
  await tam(1600, 950); await cdp("Page.navigate", { url: "about:blank" });

  // interacción real, arranque sin hash
  await abrir(""); await dormir(1800); out.inicio = await st(); await foto("x-arranque");
  out.fps_swiftshader = await ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)); }; requestAnimationFrame(f); })`);
  out.gpu = await ev(`(() => { const g = document.createElement("canvas").getContext("webgl2"), e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "n/d"; })()`);
  if (process.env.GPU) throw new Error("solo fps");
  { const [x, y] = await centro('.ojo[aria-label^="MikroTik"]'); await mover(x + 4, y + 13); const m = []; for (let i = 0; i < 10; i++) { await dormir(150); m.push(await ev("ARGOS.S.hover")); } out.hoverEstable = m.join(","); await clic(x + 4, y + 13); await dormir(900); out.clicOjo = await st(); await tecla("Escape"); await dormir(1300); }
  await mover(...(await centro('.ojo[aria-label^="Hikvision DS-2CD2043"]'))); await dormir(700); out.hover = await st(); await foto("x-hover");
  await clic(...(await centro('.cifra[data-e="alerta"]'))); await dormir(1000); out.filtro = await st(); out.rotulosAlerta = await ev(`document.querySelectorAll("#ojos .ojo.ver").length`); await foto("x-filtro");
  await clic(...(await centro('.cifra[data-e="alerta"]'))); await mover(800, 20);
  await tecla("/"); for (const c of "samba") await tecla(c); await dormir(600); out.busca = await ev(`document.activeElement.id + ": " + document.querySelector("#qn").textContent`); await foto("x-busca");
  await tecla("Enter"); await dormir(2000); out.trasEnter = await st();
  await mover(...(await centro('.puerto:not([data-f="0"])'))); await dormir(400); out.partePuerto = await st();
  await mover(...(await centro(".anillo", 1))); await dormir(500); out.parteAnillo = await st(); await foto("x-parte");
  const det = [1600 * 0.07, 950 * 0.45, Math.min(1600 * 0.66, 1080)];
  await mover(det[0] + det[2] * 0.9, det[1]); await dormir(300); out.pupilaGL = await st();
  await mover(det[0] + det[2] * 0.9 + 100, det[1] + 30); await dormir(300); out.anilloGL = await st();
  await mover(det[0] + 60, det[1] + 2); await dormir(300); out.raquisGL = await st();
  await mover(800, 900); await ev("document.activeElement.blur()"); await tecla("ArrowRight"); await dormir(500); out.siguiente = await st();
  await tecla("Escape"); await dormir(1500); out.esc = await st();
  await ev(`document.querySelector("#ojos .ojo").focus()`); await tecla("ArrowRight"); await tecla("ArrowRight"); out.foco = await ev(`document.activeElement.getAttribute("aria-label")`); await foto("x-foco");
  await tecla("Enter"); await dormir(700); out.enterOjo = await st();
  await ev(`location.hash = "#plan"`); await dormir(1800); out.plan = await st();
  await mover(...(await centro("#plan .accion", 6))); await dormir(900); out.planHover = await st(); out.planRotulos = await ev(`[...document.querySelectorAll(".ojo.ver b")].map(b => b.textContent).join(", ")`); await foto("x-plan-hover");
  await ev(`location.hash = "#lanzar"`); await dormir(1300);
  await lanzarCarta(); await dormir(5000);
  out.escaneando = await st(); out.cancelar = await ev(`(() => { const b = document.querySelector("#cancelar"), r = b.getBoundingClientRect(); return b.textContent + " visible=" + (getComputedStyle(b.closest("section")).opacity === "1" && r.width > 0) + " reloj=" + document.querySelector("#esc-reloj").textContent + " titulo=" + document.querySelector("#esc-titulo").textContent; })()`); await foto("x-escaneo-vivo");
  await clic(...(await centro("#cancelar"))); await dormir(300); await foto("x-cancelando"); await dormir(2500); out.cancelado = await st(); out.aviso = await ev(`document.querySelector("#aviso").textContent`); await foto("x-cancelado");
  await ev(`location.hash = "#lanzar"`); await dormir(1600);
  await lanzarCarta(); await dormir(9000 + 3600); await foto("x-escaneo-ojos"); await dormir(3200); out.fin = await st(); out.vivo = await ev(`document.querySelector("#vivo").textContent`); await foto("x-fin");

  // ventana chica (1257x662): nada se pisa, el nombre sale solo con el cursor encima, y la rueda de cartas gira con rueda y arrastre sin lanzar nada
  const pisan = (a, b) => ev(`(() => { const vis = (s) => [...document.querySelectorAll(s)].filter((e) => { let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return getComputedStyle(e).visibility !== "hidden" && o > 0.05; }).map((e) => [e, e.getBoundingClientRect()]);
    const r = []; for (const [x, p] of vis(${JSON.stringify(a)})) for (const [y, q] of vis(${JSON.stringify(b)})) if (x !== y && !x.contains(y) && !y.contains(x) && p.width && q.width && p.left < q.right - 1 && p.right > q.left + 1 && p.top < q.bottom - 1 && p.bottom > q.top + 1) r.push(x.textContent.trim().slice(0, 16) + " x " + (y.id || y.className) + " " + y.textContent.trim().slice(0, 16)); return r; })()`);
  const frente = () => ev(`document.querySelector('.carta[data-d="0"] h3').textContent`);
  await tam(1257, 662); await cdp("Page.navigate", { url: "about:blank" }); await abrir("#red"); await mover(8, 400); await dormir(1200); await foto("red-1257");
  out.chica = { nombresEnReposo: await ev(`document.querySelectorAll("#ojos .ojo.ver").length`), pisanRed: await pisan(".grupo.ver", "#diag, #urgente, #buscar, #lanza, .ojo, .grupo.ver") };
  await mover(...(await centro('.ojo[aria-label^="Synology"]'))); await dormir(600); out.chica.nombresConCursor = await ev(`[...document.querySelectorAll(".ojo.ver b")].map((b) => b.textContent).join("|")`);
  await clic(...(await centro('#lanza [data-carta="0"]'))); await dormir(2600); await foto("lanzar-1257");
  out.chica.pisanLanzar = await pisan("#inicio, #volver, #lanzar header, #lz-pie", '#lanzar header, #lz-pie, .carta[data-d="0"], .carta[data-d="1"]');
  out.chica.frente = await frente();
  await raton("mouseWheel", 628, 400, { deltaX: 0, deltaY: 120 }); await dormir(1100); out.chica.trasRueda = await frente();
  await raton("mousePressed", 628, 400, { button: "left", clickCount: 1 }); for (const x of [600, 520, 440, 400]) await raton("mouseMoved", x, 400, { button: "left", buttons: 1 }); await raton("mouseReleased", 400, 400, { button: "left", clickCount: 1 }); await dormir(1100); out.chica.trasArrastre = await frente() + " | " + await st();
  await clic(...(await centro("#lz-otra"))); await dormir(1100); out.chica.otraRueda = await frente(); out.chica.pisanFlecha = await pisan("#lz-otra", '.carta[data-d="0"], .carta[data-d="1"], #volver');
  await clic(...(await centro("#volver"))); await dormir(1600); out.chica.volverConClic = await ev("document.body.dataset.vista");
  await ev(`location.hash = "#plan"`); await dormir(1500); await clic(...(await centro("#volver"))); await dormir(1300); out.chica.volverDesdePlan = await ev("document.body.dataset.vista");
  await clic(...(await centro("#ojos .ojo"))); await dormir(1500); await clic(...(await centro("#volver"))); await dormir(1300); out.chica.volverDesdeFicha = await ev("document.body.dataset.vista");
  await clic(...(await centro('#lanza [data-carta="0"]'))); await dormir(2400); await lanzarCarta(); await dormir(4500);
  out.chica.pisanEscaneo = await pisan(".grupo.ver", "#escaneo, #cancelar, .grupo.ver"); await clic(...(await centro("#cancelar"))); await dormir(1500);
} catch (e) { out.FALLO = String(e).slice(0, 400); } finally { out.errs = errs; console.log(JSON.stringify(out, null, 1)); try { ws && ws.close(); } catch {} ch.kill("SIGKILL"); }
