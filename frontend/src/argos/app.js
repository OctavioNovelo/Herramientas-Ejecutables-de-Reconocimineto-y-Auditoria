// Argos: estado, muelles y rótulos. El dibujo vive en pluma.js; aquí solo se mueven números con masa.
import { crear } from "./pluma.js";
import { iniciar as iniciarGrupos } from "./grupos.js";   // esfera.js sigue en el árbol, pero ya no es una lente

// EL UMBRAL. Hasta 60 equipos la red abre en abanico; con más, por grupos (el abanico de abanicos).
// También es el tope de plumas del abanico: con más de 60 las tres hileras ya no se leen.
const UMBRAL = 60;

// Las plumas del abanico. Si la red no cabe, van las más urgentes (en el orden de datos.ts) y queda un hueco de más:
// la pluma invitada, que presta su sitio a la ficha de cualquier equipo que no esté en el abanico.
function abanico(todos) {
  if (todos.length <= UMBRAL) return [todos, -1];
  const PESO = { riesgo: 0, alerta: 1, seguro: 2 };
  const dentro = new Set(todos.map((d, k) => [d, k]).sort((a, b) => PESO[a[0].estado] - PESO[b[0].estado] || a[1] - b[1]).slice(0, UMBRAL).map((x) => x[0]));
  const E = todos.filter((d) => dentro.has(d)).concat(todos.find((d) => !dentro.has(d)));
  todos.forEach((d) => (d.i = -1)); E.forEach((d, i) => (d.i = i));
  return [E, UMBRAL];
}

// H: el modelo que arma datos.ts (H.grupo: el abanico de un solo grupo). puente: lo que la vista le pide a la app
// (lanzar, cancelar, instalar, pestana, grupo).
// Devuelve cómo avisarle del escaneo y cómo desmontarla; con datos nuevos se monta otra.
export function montar(H, puente) {
  const TODOS = H.equipos, [E, G] = abanico(TODOS), N = E.length, NV = G < 0 ? N : G, corte = new AbortController();   // E: las plumas. G: la invitada (-1 si toda la red cabe). NV: plumas a la vista.
  const porIp = new Map(TODOS.map((d) => [d.ip, d]));
  const addEventListener = (t, f, o) => window.addEventListener(t, f, { ...(o || {}), signal: corte.signal });   // lo que se cuelga de la ventana muere al desmontar
  const trama = (t) => new URL(`./cartas/${t}.png`, import.meta.url).href;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const calma = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = crear($("#gl"), N); document.body.classList.toggle("sin-gl", gl.sinGL);
  const ESTADO_TXT = { riesgo: "en riesgo", alerta: "en alerta", seguro: "sin pendientes" }, ESTADO_N = { seguro: 0, alerta: 1, riesgo: 2 };
  const PRIO_TXT = { riesgo: "Hazlo hoy", alerta: "Esta semana", info: "Cuando puedas" };
  const REV = 4600;   // lo que dura el revelado cuando termina un escaneo

  const glifo = (e) => `<svg class="g g-${e}" viewBox="0 0 20 20" aria-hidden="true">` + (e === "riesgo"
    ? '<path d="M1.5 10q8.5-9 17 0q-8.5 9-17 0z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="3" fill="currentColor"/>'
    : e === "alerta" ? '<circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="1.6 2.9"/><path d="M4 10q6-3.4 12 0q-6 3.4-12 0z" fill="currentColor"/>'
    : '<path d="M3 8.5q7 6 14 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>') + "</svg>";

  // ---- estado ----
  const S = { vista: "red", lente: "abanico", lenteFija: false, sel: 0, filtro: null, q: "", accion: null, fija: null, hover: -1, datos: N > 0, scan: null, parte: null, antes: "red" };
  const est = new Float32Array(N);            // forma del ojo que se dibuja (0 cerrado, 1 alerta, 2 riesgo)
  const alzada = new Uint8Array(N);           // durante el escaneo: plumas ya alzadas

  // ---- huecos del abanico: un grupo por tipo, con aire entre grupos ----
  const grupos = H.TIPOS.map(([k, plural, icono]) => ({ k, plural, icono, ids: E.filter((d) => d.tipo === k && d.i !== G).map((d) => d.i) })).filter((g) => g.ids.length);
  const pos = new Float32Array(N), grupoDe = new Uint8Array(N); let total = 0;
  grupos.forEach((g, gi) => { g.ids.forEach((i) => { pos[i] = total++; grupoDe[i] = gi; }); total += 0.9; }); total -= 1.9; if (G >= 0) pos[G] = total / 2;
  const TIER = [1, 0.8, 0.9];

  // ---- muelles ----
  const P = 11, OX = 0, OY = 1, AN = 2, LE = 3, BR = 4, OP = 5, SP = 6, EX = 7, ES = 8, GW = 9, CA = 10;   // CA: la cola baja (0 alzada, 1 caída hacia atrás)
  const val = new Float32Array(N * P), vel = new Float32Array(N * P), tgt = new Float32Array(N * P), cola = [];
  const RIG = [70, 70, 60, 70, 60, 46, 60, 50, 60, 90, 34], AMO = [0.86, 0.86, 0.8, 0.86, 1, 0.9, 0.9, 1, 0.95, 1, 0.92];
  let quieto = false, ahora = performance.now();
  function poner(i, o, espera) {
    if (espera > 0 && !calma) { cola.push({ at: ahora + espera, i, o }); return; }
    for (let p = 0; p < P; p++) if (o[p] !== undefined) tgt[i * P + p] = o[p];
    quieto = false;
  }
  function paso(dt) {
    for (let c = cola.length - 1; c >= 0; c--) if (cola[c].at <= ahora) { const { i, o } = cola[c]; cola.splice(c, 1); poner(i, o, 0); }
    let mov = 0;
    for (let n = 0; n < N * P; n++) {
      const p = n % P;
      if (calma) { val[n] = tgt[n]; continue; }
      const a = RIG[p] * (tgt[n] - val[n]) - 2 * Math.sqrt(RIG[p]) * AMO[p] * vel[n];
      vel[n] += a * dt; val[n] += vel[n] * dt;
      mov = Math.max(mov, Math.abs(vel[n]) * (p === AN ? 400 : p < 4 ? 1 : 200));
    }
    quieto = mov < 0.4 && !cola.length;
  }
  const saltar = () => { cola.forEach(({ i, o }) => { for (let p = 0; p < P; p++) if (o[p] !== undefined) tgt[i * P + p] = o[p]; }); cola.length = 0; val.set(tgt); vel.fill(0); };

  // ---- composición por vista ----
  let W = 0, Hh = 0, R = 0, eyeR = 0, det = null;
  function medidas() {
    W = innerWidth; Hh = innerHeight;
    gl.resize(W, Hh);
    R = Math.min(W * 0.44, Hh * 0.8); eyeR = R * 0.037 * Math.min(1, Math.sqrt(43 / Math.max(1, NV))); gl.U.uEyeR.value = eyeR;   // con más plumas que las 43 de Argos, ojos algo menores
    const len = Math.min(W * 0.66, 1080), Re = Math.min(150, Hh * 0.165, W * 0.095);
    det = { ox: W * 0.07, oy: Hh * 0.45, bajo: Math.max(96, Hh * 0.17), len, Re, ex: W * 0.07 + len * gl.EYE_U, Lp: Math.min(150, Hh * 0.16) };
    gl.U.uPortLen.value = det.Lp;
  }
  const coincide = (d) => {
    if (S.filtro && d.estado !== S.filtro) return false;
    if (!S.q) return true;
    const t = d._t || (d._t = [d.nombre, d.ip, d.mac, d.os, d.ports.join(" "), d.sds.map((s) => s.service + " " + (s.product || "")).join(" "), d.vulns.map((v) => v.id + " " + (v.cve_ids || []).join(" ")).join(" ")].join(" ").toLowerCase());   // con cientos de equipos se busca a cada tecla
    return S.q.toLowerCase().split(/\s+/).every((w) => t.includes(w));
  };
  const accionViva = () => S.accion || S.fija;

  // ---- la otra lente: los grupos (grupos.js), que se crea más abajo, cuando ya existen las cajas del menú ----
  // Dentro de un grupo (H.grupo) la lente es siempre el abanico; "Grupos" vuelve a la vista de grupos.
  S.lente = TODOS.length > UMBRAL ? "grupos" : "abanico";   // la vista con la que abre: por tamaño de red
  const enEscena = () => S.vista === "red" || S.vista === "plan" || S.vista === "escaneo";
  // qué grupos se encienden: los de la acción del plan bajo el cursor o, si no, los del buscador y el filtro
  const refGrupos = () => { const a = accionViva(); gru().resaltar(a ? a.hosts : S.q || S.filtro ? TODOS.filter(coincide) : null); };
  const aGrupo = (k, p) => { history.replaceState(null, "", k ? "#grupos," + k : "#grupos"); puente.grupo(k, p || 0); };   // main.ts vuelve a montar la vista
  function rotulos() {      // los pocos textos del menú que nombran la vista
    const gru = S.lente === "grupos";
    $("#volver").firstChild.textContent = gru || (H.grupo && S.vista === "red") ? "Volver a los grupos " : "Volver al abanico ";
    $("#inicio").setAttribute("aria-label", "HERA, volver " + (gru ? "a los grupos" : "al abanico"));
    $("#plan-sub").textContent = "Lo que Argos vio, por urgencia. Pasa por una acción y se encienden sus " + (gru ? "grupos." : "plumas.");
    $$("#lente button[data-lente]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lente === S.lente));
    $("#lente [data-lente=\"abanico\"]").title = !gru && G >= 0 ? `Aquí van los ${NV} equipos más urgentes de ${TODOS.length}. Por grupos los ves todos.` : "";
    const pg = $("#paginas"); pg.hidden = !(H.paginas > 1);
    if (!pg.hidden) { pg.querySelector("span").textContent = `Página ${H.pagina + 1} de ${H.paginas}`; pg.querySelector('[data-pag="-1"]').disabled = !H.pagina; pg.querySelector('[data-pag="1"]').disabled = H.pagina >= H.paginas - 1; }
  }
  function lente(l) {
    if (l === S.lente || S.scan || (S.vista !== "red" && S.vista !== "plan")) return;
    if (H.grupo) return l === "grupos" && aGrupo(null);   // dentro de un grupo, la otra lente es salir de él
    S.lente = l; S.lenteFija = true;
    ir(S.vista, { sinFoco: true });
    vivo.textContent = l === "grupos" ? (crearGru().ok ? "Ahora ves la red por grupos." : "Este equipo no puede dibujar los grupos.") : "Ahora ves la red como abanico.";
  }
  function objetivos(escalonar) {
    cola.length = 0;   // todo se recalcula: lo pendiente ya no vale
    const rad = Math.PI / 180, Rv = Math.min(Hh * 0.8, R * 1.09);
    const hayFiltro = S.filtro || S.q, acc = accionViva(), esf = S.lente === "grupos" && enEscena();   // con los grupos en escena, la cola baja
    for (const d of E) {
      const i = d.i, u = total > 0 ? pos[i] / total : 0.5, tier = TIER[i % 3], st = ESTADO_N[d.estado];
      let o;
      const plegada = (k, br) => [W / 2, Hh + 10, (u - 0.5) * 20 * rad, R * k * (0.86 + 0.14 * tier), br, 0, 0.1, 0, 0, 0];
      if (esf) o = plegada(0.5, 0.85);
      else if (S.vista === "red" || S.vista === "plan") {
        const enPlan = S.vista === "plan";
        const a = enPlan ? (5 + 80 * u) * rad : (-70 + 140 * u) * rad;
        const r = enPlan ? Math.min(Hh * 0.86, W * 0.52) : R + (Rv - R) * Math.cos(a) * Math.cos(a);
        let br = st ? 1 : 0.7, gw = 0;
        if (acc) { const en = acc.hosts.includes(d); br = en ? 1.15 : 0.42; gw = en ? 1 : 0; }
        else if (!enPlan && hayFiltro) br = coincide(d) ? 1.1 : 0.16;
        if (S.hover === i) { br = Math.max(br, 1) + 0.25; gw = 1; }
        o = [enPlan ? -20 : W / 2, Hh + (enPlan ? 20 : 10), a, r * tier, br, st ? 1 : 0, 1, 0, (enPlan ? 0.82 : 1) * (S.hover === i ? 1.16 : 1), gw];   // el ojo crece en su sitio: la zona de picado no se mueve
      } else if (S.vista === "equipo") {
        o = i === S.sel ? [det.ox, det.oy, 90 * rad, det.len, 1, st ? 1 : 0, 1, 1, det.Re / eyeR, 0] : plegada(0.42, 0.3);
      } else if (S.vista === "escaneo") {
        const a = (-70 + 140 * u) * rad, r = R + (Rv - R) * Math.cos(a) * Math.cos(a);
        o = alzada[i] ? [W / 2, Hh + 10, a, r * tier, 0.8, est[i] ? 1 : 0, 1, 0, 1, 0] : plegada(0.5, 0.42);
      } else if (S.vista === "vacio") { o = plegada(0.46, 0.62); }
      else o = plegada(0.5, 0.85);
      // la cola: primero se cierra y luego cae hacia atrás; al volver, se alza y luego se abre
      const cae = esf || S.vista === "lanzar" || (S.vista === "equipo" && i !== S.sel) || (i === G && S.vista !== "equipo") ? 1 : 0;   // la invitada solo se alza para su ficha
      if (escalonar && !calma) {
        const esp = S.vista !== "escaneo" ? Math.abs(i - N / 2) * 7 : 0, sube = !cae && tgt[i * P + CA] > 0.5 && S.vista !== "equipo";
        poner(i, { [CA]: cae }, esp + (cae ? 380 : 0)); poner(i, o, esp + (sube ? 300 : 0));
      } else { o[CA] = cae; poner(i, o, 0); }
    }
  }
  // la misma caída que hace el shader (pluma.js, caer), para que los rótulos sigan a la pluma
  const caer = (x, y, ox, oy, c) => { const th = Math.min(1, Math.max(0, c)) * 1.5, f = Hh * 1.3, s = f / (f + Math.max(0, oy - y) * Math.sin(th)); return [ox + (x - ox) * s, oy + (y - oy) * Math.cos(th) * s]; };
  const ojoXY = (i, v) => { const b = i * P, a = v[b + AN], l = v[b + LE] * gl.EYE_U; return [...caer(v[b + OX] + Math.sin(a) * l, v[b + OY] - Math.cos(a) * l, v[b + OX], v[b + OY], v[b + CA]), Math.sin(a), -Math.cos(a)]; };

  // ---- capa de rótulos: un botón por ojo (se pica, se enfoca, se recorre con flechas) ----
  const capaOjos = $("#ojos");
  capaOjos.innerHTML = E.map((d) => `<button class="ojo" data-i="${d.i}"${d.i === G ? " hidden" : ""} tabindex="${d.i === 0 ? 0 : -1}" aria-label="${esc(d.nombre)}, ${esc(d.ip)}, ${ESTADO_TXT[d.estado]}"><span class="nombre"><b>${esc(d.nombre)}</b><i>${esc(d.ip)}, ${ESTADO_TXT[d.estado]}</i></span></button>`).join("");
  const ojos = $$(".ojo", capaOjos);
  $("#grupos").innerHTML = grupos.map((g) => `<span class="grupo">${g.icono}${g.plural} <b>${g.ids.length}</b></span>`).join("");
  const rotGrupos = $$("#grupos .grupo");
  let anchoG = [], estorbos = {};
  function cajas() {     // lo que un rótulo de grupo no debe pisar, y cuánto mide cada rótulo
    anchoG = rotGrupos.map((el) => el.offsetWidth);
    estorbos = { red: ["#diag", "#urgente", "#buscar", "#lanza", "#pestanas", "#lente", ...(H.grupo ? ["#volver"] : [])], plan: ["#plan", "#volver", "#lente"], escaneo: ["#escaneo"] };   // dentro de un grupo, #volver también se ve en la red
    for (const v in estorbos) estorbos[v] = estorbos[v].map((s) => $(s).getBoundingClientRect());
  }
  // La vista de grupos solo existe cuando se usa: cada contexto WebGL cuesta. Fuera de la lente de grupos, o dentro de un grupo, las llamadas no hacen nada.
  let GRU = null;
  const NADA = { ok: false, caps: [], activar() {}, escaneo() {}, resaltar() {}, destruir() {} };
  const gru = () => GRU || NADA;
  const crearGru = () => { if (!GRU && !H.grupo) GRU = iniciarGrupos(H, { alElegir: (k) => aGrupo(k), estorbos: () => estorbos[S.vista] || [] }); return gru(); };
  if (S.lente === "grupos") crearGru();
  function colocar() {
    const centros = [], puestos = [];
    for (const d of E) {
      const i = d.i, [x, y, dx, dy] = ojoXY(i, val), b = ojos[i], s = val[i * P + ES];
      b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      const lado = dx < -0.3 ? "izq" : dx > 0.3 ? "der" : "cen", off = eyeR * s + 13;
      const n = b.firstChild; n.dataset.lado = lado; n.style.transform = `translate(${(dx * off).toFixed(1)}px,${(dy * off).toFixed(1)}px)`;
      b.classList.toggle("ver", S.hover === i); b.classList.toggle("sobre", S.hover === i);
      centros.push({ left: x - eyeR, right: x + eyeR, top: y - eyeR, bottom: y + eyeR });
      b.dataset.e = d.estado;
    }
    grupos.forEach((g, gi) => {
      const m = g.ids[Math.floor((g.ids.length - 1) / 2)], m2 = g.ids[Math.ceil((g.ids.length - 1) / 2)];
      const a = (val[m * P + AN] + val[m2 * P + AN]) / 2, r = Math.max(...g.ids.map((i) => val[i * P + LE])) / Math.max(...g.ids.map((i) => TIER[i % 3])) + 30;
      const el = rotGrupos[gi], dx = Math.sin(a);
      const lado = (el.dataset.lado = dx < -0.3 ? "izq" : dx > 0.3 ? "der" : "cen"), ox = val[m * P + OX], oy = val[m * P + OY], ca = val[m * P + CA];
      const x = Math.max(dx < -0.3 ? 132 : 12, Math.min(W - (dx > 0.3 ? 156 : 12), ox + dx * r));
      let [, y] = caer(x, oy - Math.cos(a) * r, ox, oy, ca);
      const wl = anchoG[gi] || 0, alto = lado === "cen" ? [-24, 0] : [-12, 12]; let x0 = lado === "izq" ? x - wl : lado === "der" ? x : x - wl / 2;
      const pisa = (o, a, b) => a < o.right + 8 && a + wl > o.left - 8 && b + alto[0] < o.bottom + 6 && b + alto[1] > o.top - 6;
      const o = (estorbos[S.vista] || []).find((o) => pisa(o, x0, y));
      if (o) {   // pisa un panel: va debajo (o encima) de él y, si ahí tapa un ojo u otro rótulo, a su lado
        const ops = [[x0, o.top < Hh / 2 ? o.bottom + 6 - alto[0] : o.top - 6 - alto[1]], [o.left < W / 2 ? o.right + 9 : o.left - 9 - wl, y]];
        [x0, y] = ops.find(([a, b]) => ![...centros, ...puestos].some((c) => pisa(c, a, b))) || ops[0];
      }
      puestos.push({ left: x0, right: x0 + wl, top: y + alto[0], bottom: y + alto[1] });
      el.style.transform = `translate(${(x0 + (lado === "izq" ? wl : lado === "der" ? 0 : wl / 2)).toFixed(1)}px,${y.toFixed(1)}px)`;
      el.classList.toggle("ver", S.datos && ca < 0.3 && (S.vista === "red" || (S.vista === "escaneo" && g.ids.every((i) => alzada[i] && Math.abs(val[i * P + AN] - tgt[i * P + AN]) < 0.06))));
    });
  }

  // ---- vistas ----
  const vivo = $("#vivo");
  function ir(vista, opc) {
    opc = opc || {};
    if (corte.signal.aborted) return;
    if (S.lente === "grupos") crearGru();   // la lente puede venir del hash, después del arranque
    if (/red|plan|equipo/.test(vista) && !S.datos) vista = "vacio";
    if (S.scan && vista !== "escaneo") return;
    S.vista = vista; S.hover = -1; S.accion = null; S.parte = null;
    if (vista !== "plan") S.fija = null;
    document.body.dataset.vista = vista; document.body.dataset.lente = S.lente;
    if (H.grupo) document.body.dataset.grupo = H.grupo; else delete document.body.dataset.grupo;
    // la vista elegida a mano viaja en el hash (#grupos, #abanico, #plan,grupos); la que sale del tamaño de la red, no.
    // Dentro de un grupo siempre viaja: #grupos,<tipo> en la red, #plan,grupos,<tipo> en lo demás.
    const hv = vista + (vista === "equipo" ? "=" + E[S.sel].ip : ""), lt = H.grupo ? "grupos," + H.grupo : S.lenteFija ? S.lente : "";
    const h = "#" + (!lt ? hv : vista === "red" ? lt : hv + "," + lt);
    if (location.hash !== h && !opc.sinHash) history.replaceState(null, "", h);
    if (vista === "equipo") ficha();
    E.forEach((d) => { if (vista !== "escaneo") est[d.i] = S.datos ? ESTADO_N[d.estado] : 0; });
    rotulos(); cajas();
    if (vista !== "escaneo") gru().escaneo(null);
    gru().activar(S.lente === "grupos" && enEscena(), vista === "plan");
    partes(); objetivos(true); pintarPlan(); refGrupos();
    if (opc.salto) saltar();
    const foco = { plan: "#plan h2", lanzar: '#cartas [data-d="0"] button', equipo: "#ficha .raquis h2", vacio: "#vacio h1", escaneo: "#cancelar" }[vista];
    if (foco && !opc.salto && !opc.sinFoco) { const el = $(foco); el && el.focus({ preventScroll: true }); }
  }
  const alojar = (d) => { if (d.i < 0) { E[G].i = -1; E[G] = d; d.i = G; } return d.i; };   // la pluma de un equipo; si no está en el abanico, ocupa la invitada
  function elegir(d) { if (typeof d === "number") d = E[d]; S.sel = alojar(d); S.antes = S.vista === "plan" ? "plan" : "red"; ir("equipo"); }   // la misma ficha, venga del abanico, del plan o del buscador
  const otro = (p) => { S.sel = S.sel >= NV ? (p > 0 ? 0 : NV - 1) : (S.sel + p + NV) % NV; ir("equipo"); };   // pluma anterior o siguiente; desde la invitada se vuelve al abanico

  // ---- diagnóstico (esquina superior izquierda) ----
  function diagnostico() {
    $("#diag h1").textContent = H.titulo; $("#diag .pie").textContent = H.pie;
    const pest = (p, det) => `<button class="pest${p.nueva ? " nueva" : ""}" data-p="${p.id}" aria-pressed="${p.activa}">${esc(p.label)}<small>${det ? `${esc(p.cuando)} · ${p.n} ${p.n === 1 ? "equipo" : "equipos"}` : p.nueva ? "nuevo" : esc(p.cuando)}</small></button>`;
    // opción C: Todo + los 3 escaneos más recientes en fila; el resto en un desplegable (solo presentación, el filtro no cambia)
    const escs = H.pestanas.slice(1).sort((a, b) => (b.fin || "").localeCompare(a.fin || "")), mas = escs.slice(3), act = mas.find((p) => p.activa);
    $("#pestanas").innerHTML = $("#esc-pestanas").innerHTML = H.pestanas.length < 2 ? "" : '<p class="sub">Ver lo que encontró</p>' + [H.pestanas[0], ...escs.slice(0, 3)].map((p) => pest(p)).join("") +
      (mas.length ? `<details class="mas-esc${act ? " activa" : ""}"><summary aria-label="Más escaneos, ${mas.length}${act ? `; activo: ${esc(act.label)}` : ""}">${act ? esc(act.label) : `Más escaneos (${mas.length})`}</summary><div>${mas.map((p) => pest(p, true)).join("")}</div></details>` : "");
    $("#cifras").innerHTML = ["riesgo", "alerta", "seguro"].map((e) => `<button class="cifra" data-e="${e}" aria-pressed="${S.filtro === e}">${glifo(e)}<b>${H.cuenta(e)}</b> ${ESTADO_TXT[e]}</button>`).join("");
  }
  $("#cifras").addEventListener("click", (ev) => { const b = ev.target.closest(".cifra"); if (!b) return; S.filtro = S.filtro === b.dataset.e ? null : b.dataset.e; diagnostico(); objetivos(); refGrupos(); const el = $(`.cifra[data-e="${b.dataset.e}"]`); el && el.focus(); });
  // en el panel del escaneo la pestaña activa también se puede elegir: saca de la espera y deja el escaneo en segundo plano
  addEventListener("click", (ev) => { const b = ev.target.closest(".pest"); if (b && (b.getAttribute("aria-pressed") !== "true" || S.scan) && !(S.scan && S.scan.rev)) puente.pestana(b.dataset.p); });
  const campo = $("#q");
  campo.addEventListener("input", () => { S.q = campo.value.trim(); const n = TODOS.filter(coincide).length; $("#qn").textContent = S.q ? (n ? `${n} de ${TODOS.length}` : "Ninguno coincide") : ""; objetivos(); refGrupos(); });
  campo.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { const d = E.slice(0, NV).find(coincide) || TODOS.find(coincide); if (d && S.q) elegir(d); } });

  // ---- plan ----
  const filaAccion = (a, n) => `<li><button class="accion" data-a="${n}" aria-expanded="false"><span class="t">${esc(a.titulo)}</span><span class="quien">${a.hosts.slice(0, 6).map((d) => glifo(d.estado)).join("")}<em>${a.hosts.length === 1 ? esc(a.hosts[0].nombre) : a.hosts.length + " equipos"}</em></span></button>
    <div class="mas"><p>${esc(a.motivo)}</p><ol>${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol><p class="hosts">${a.hosts.slice(0, 8).map((d) => `<button class="hilo" data-ip="${esc(d.ip)}">${esc(d.nombre)} <span class="ip">${esc(d.ip)}</span></button>`).join("")}${a.hosts.length > 8 ? `<em>y ${a.hosts.length - 8} más</em>` : ""}</p></div></li>`;   // por IP: con red grande el equipo puede no tener pluma
  $("#plan-lista").innerHTML = ["riesgo", "alerta", "info"].map((p) => { const l = H.plan.map((a, n) => [a, n]).filter(([a]) => a.prioridad === p); return `<h3>${PRIO_TXT[p]} <b>${l.length}</b></h3><ul>${l.map(([a, n]) => filaAccion(a, n)).join("")}</ul>`; }).join("");
  $("#urgente-lista").innerHTML = H.plan.slice(0, 3).map((a, n) => `<li><button class="accion corta" data-a="${n}"><span class="t">${esc(a.titulo)}</span></button></li>`).join("") || '<li class="sub">Nada pendiente.</li>';
  $("#ver-plan").textContent = `Ver el plan, ${H.plan.length} ${H.plan.length === 1 ? "acción" : "acciones"}`; $("#ver-plan").style.display = H.plan.length ? "" : "none";
  function pintarPlan() { const v = accionViva(); $$(".accion").forEach((b) => { const on = v === H.plan[+b.dataset.a]; b.classList.toggle("viva", on); if (b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", on); }); }
  function senalar(a) { if (S.accion === a) return; S.accion = a; objetivos(); pintarPlan(); refGrupos(); }
  for (const cont of [$("#plan"), $("#urgente")]) {
    cont.addEventListener("pointerover", (ev) => { const b = ev.target.closest(".accion"); if (b) senalar(H.plan[+b.dataset.a]); });
    cont.addEventListener("pointerleave", () => senalar(null));
    cont.addEventListener("focusin", (ev) => { const b = ev.target.closest(".accion"); if (b) senalar(H.plan[+b.dataset.a]); });
    cont.addEventListener("focusout", (ev) => { if (!cont.contains(ev.relatedTarget)) senalar(null); });
    cont.addEventListener("click", (ev) => {
      const h = ev.target.closest(".hilo"); if (h) return elegir(porIp.get(h.dataset.ip));
      const b = ev.target.closest(".accion"); if (!b) return;
      const a = H.plan[+b.dataset.a];
      if (S.vista !== "plan") { ir("plan"); S.fija = a; } else S.fija = S.fija === a ? null : a;
      objetivos(); pintarPlan(); refGrupos();
    });
  }

  // ---- lanzar: dos ruedas de cartas, Mapear y Detectar; la flecha del costado pasa de una a otra ----
  const CARTAS = [...H.ESCANEOS.mapear.map((o) => ["Mapear", ...o]), ...H.ESCANEOS.detectar.map((o) => ["Detectar", ...o]), ["Vulnerar", "Vulnerar", "Comprobará si los fallos se pueden aprovechar de verdad.", null]];
  const SUBS = { Mapear: "Despliega el abanico: qué equipos hay y qué tienen abierto.", Detectar: "Abre los ojos: busca fallos en lo que ya está mapeado.", Vulnerar: "Comprobar los fallos de forma controlada. Aún no está disponible." };
  const TRAMAS = ["iris", "io", "cerbero", "esfinge", "argos", "hefesto", "aquiles", "atenea", "heracles"];   // un personaje por carta, en trama de puntos (tramar.py)
  const NM = H.ESCANEOS.mapear.length, RUEDAS = [{ n: "Mapear", de: 0, hasta: NM }, { n: "Detectar", de: NM, hasta: CARTAS.length }], rueda = $("#cartas");
  rueda.innerHTML = CARTAS.map(([g, n, d, t, cat], k) => `<li class="carta${g === "Vulnerar" ? " pronto" : ""}" data-k="${k}"><i class="trama" style="--m:url(${trama(TRAMAS[k])})" aria-hidden="true"></i><p class="gr">${g}</p><h3>${n}</h3><p class="d">${d}</p>
    <p class="base"><span class="dur">${g === "Vulnerar" ? "aún no disponible" : cat.falta ? "<small>hay que descargarlo</small>" + esc(cat.falta) : t ? "<small>la última vez</small>" + esc(t) : "sin registro"}</span><button class="vano lleno" aria-label="Lanzar: ${esc(n)}. ${esc(d)}"${g === "Vulnerar" ? " disabled" : ""}>${g === "Vulnerar" ? "Pronto" : cat.falta ? "Instalar " + esc(cat.requiresTool) : "Lanzar"}</button></p></li>`).join("");
  $("#lz-fondo").innerHTML = TRAMAS.map((t) => `<i style="--m:url(${trama(t)})"></i>`).join(""); const ecos = $$("#lz-fondo i");   // el personaje de la carta de enfrente, enorme y tenue, llena el fondo
  const cartas = $$(".carta", rueda), alFrente = () => Math.round(giro), sitio = [0, NM];
  let cual = 0, giro = 0, arr = null, arrastro = false, tRueda = 0;
  function girar(g, foco) {     // g: índice de la carta que queda al frente (con decimales mientras se arrastra); no sale de su rueda
    const r = RUEDAS[cual]; giro = Math.max(r.de, Math.min(r.hasta - 1, g));
    const k = (sitio[cual] = alFrente()), gr = CARTAS[k][0], R = rueda.offsetWidth * 2.2;
    cartas.forEach((c, j) => {
      const en = j >= r.de && j < r.hasta, d = en ? Math.min(4, Math.abs(j - k)) : 9;
      c.style.setProperty("--k", j - giro); c.style.setProperty("--dx", en ? "0px" : j < r.de ? "-70vw" : "70vw");   // la otra rueda espera fuera, de su lado
      // la misma rueda proyectada a mano (perspectiva de 1500px), para el respaldo .plano de argos.css
      const th = (j - giro) * 0.4538, cs = Math.cos(th), s = 1500 / (1500 + R * (1 - cs)), p = (n, v) => c.style.setProperty(n, v);
      p("--px", (s * R * Math.sin(th)).toFixed(1) + "px"); p("--py", (s * R * 0.122 * (cs - 1)).toFixed(1) + "px"); p("--sx", (s * Math.max(0.05, cs)).toFixed(3)); p("--s", s.toFixed(3)); p("--sk", (-th * 6).toFixed(2) + "deg"); p("--z", 9 - d);
      c.dataset.d = d; c.classList.toggle("fuera", !en); $$("button, input", c).forEach((el) => (el.tabIndex = d ? -1 : 0));
    });
    ecos.forEach((e, j) => e.classList.toggle("ve", j === k));
    $("#lz-grupo").textContent = gr; $("#lz-sub").textContent = SUBS[gr]; $("#lz-pie").textContent = `${k - r.de + 1} de ${r.hasta - r.de}. Gira con las flechas, la rueda o arrastrando.`;
    if (foco) { const el = $("button:not(:disabled)", cartas[k]); el && el.focus({ preventScroll: true }); }
  }
  // Sin composición acelerada (WebKitGTK, tal como arranca la app en Linux) el 3D de CSS se pinta aplanado. Medirlo no sirve
  // (las cajas se calculan con el 3D aunque no se pinte), así que lo dice quien monta la vista: H.plano.
  $("#lanzar").classList.toggle("plano", !!H.plano);
  function cambiar(a, k, foco) {
    cual = a; const b = $("#lz-otra"), otra = RUEDAS[1 - a].n;
    b.dataset.lado = a ? "izq" : "der"; b.setAttribute("aria-label", "Ir a " + otra); b.lastChild.textContent = otra;
    girar(k === undefined ? sitio[a] : k, foco);
  }
  $("#lz-otra").addEventListener("click", () => cambiar(1 - cual));
  const lanzarCarta = (k) => { const [g, , , , cat] = CARTAS[k]; if (g === "Vulnerar") return; if (cat.falta) return instalar(k); if (S.curso) return avisar("Ya hay un escaneo en curso."); const p = cat.id === "custom"; catPers = cat; $("#pers-t").textContent = cat.label; $("#p-pers").hidden = $("#p-pers").disabled = !p; $("#p-evas").hidden = !cat.supportsEvasion; $("#p-evasion").checked = false; pers.returnValue = ""; ajustarPers(); pers.showModal(); };
  // Un diálogo para todas las cartas: el objetivo (vacío = la red de hosts.txt), la evasión si la carta la admite y, en Personalizado, lo demás. El backend valida de nuevo (tools/nmap.py).
  const pers = $("#pers"), pv = $("#p-valor"), MODOS = { top: ["Cuántos puertos, los más comunes", "1000", "[1-9]\\d{0,4}"], specific: ["Puertos o rangos, separados por comas", "80,443,8000-8100", "\\d{1,5}(-\\d{1,5})?(\\s*,\\s*\\d{1,5}(-\\d{1,5})?)*"], ratio: ["Frecuencia mínima, de 0 a 1", "0.5", "0?\\.\\d+|[01]"] };
  let catPers = null; $("#rg").placeholder = H.red || "toda la red"; $("#rg-sub").textContent = `Una IP, un rango o un nombre. Vacío: toda tu red${H.red ? " (" + H.red + ")" : ""}.`;
  function ajustarPers(ev) {
    $("#p-tipo").disabled = $("#p-proto").value !== "tcp";
    const m = MODOS[$("#p-modo").value]; pv.disabled = !m; $("#p-valor-f").hidden = !m; if (!m) return;
    $("#p-valor-l").textContent = m[0]; pv.placeholder = m[1]; pv.pattern = m[2];
    if (ev && ev.target.id === "p-modo") pv.value = $("#p-modo").value === "top" ? "1000" : "";
  }
  pers.addEventListener("change", ajustarPers);
  pers.addEventListener("close", () => {
    if (pers.returnValue !== "si") return;
    const tcp = $("#p-proto").value === "tcp", evasion = $("#p-evasion").checked;
    if (catPers.id !== "custom") return puente.lanzar(catPers, $("#rg").value, { evasion });
    puente.lanzar(catPers, $("#rg").value, { protocol: $("#p-proto").value, tcpType: tcp ? $("#p-tipo").value : undefined, timing: +$("#p-ritmo").value, portMode: $("#p-modo").value, portValue: pv.disabled ? "" : pv.value.trim(), evasion });
  });
  async function instalar(k) {   // la herramienta que falta se descarga solo cuando la persona pulsa "Instalar"
    const cat = CARTAS[k][4], b = $("button", cartas[k]); b.disabled = true; b.textContent = "Instalando";
    try { await puente.instalar(cat.requiresTool); cat.falta = null; b.textContent = "Lanzar"; $(".dur", cartas[k]).textContent = "sin registro"; avisar(cat.requiresTool + " quedó instalado."); }
    catch (e) { b.textContent = "Instalar " + cat.requiresTool; avisar(String((e && e.message) || e), 12000); }
    b.disabled = false;
  }
  rueda.addEventListener("click", (ev) => {
    const c = ev.target.closest(".carta"); if (!c || arrastro) return;
    if (+c.dataset.d) return girar(+c.dataset.k, true);   // una carta de lado viene al frente
    if (ev.target.closest("button")) lanzarCarta(+c.dataset.k);
  });
  rueda.addEventListener("pointerdown", (ev) => { if (!ev.target.closest("input")) arr = { x: ev.clientX, g: giro }; });
  addEventListener("pointermove", (ev) => {
    if (!arr) return; const dx = ev.clientX - arr.x; if (!arrastro && Math.abs(dx) < 6) return;
    arrastro = true; rueda.classList.add("arrastra"); girar(arr.g - dx / (rueda.offsetWidth * 1.1));
  });
  const soltar = () => { if (!arr) return; arr = null; rueda.classList.remove("arrastra"); if (arrastro) girar(alFrente()); setTimeout(() => (arrastro = false), 0); };
  addEventListener("pointerup", soltar); addEventListener("pointercancel", soltar);
  $("#lanzar").addEventListener("wheel", (ev) => { if (pers.open) return; ev.preventDefault(); if (ahora - tRueda < 240) return; tRueda = ahora; girar(alFrente() + (ev.deltaY + ev.deltaX > 0 ? 1 : -1)); }, { passive: false });
  cambiar(0);

  // ---- escaneo: el backend no da avance, solo se sabe el tiempo y lo que tardó la vez anterior.
  // Mientras corre, la cola espera recogida; al terminar llega un abanico nuevo (otra montura) y se revela.
  const reloj = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const tituloScan = (o) => ($("#esc-titulo").textContent = (o.grupo === "Detectar" ? "Detectando" : "Mapeando") + ": " + o.nombre.toLowerCase());
  let tAviso = 0;
  function avisar(t, ms) { const a = $("#aviso"); vivo.textContent = a.textContent = t; a.classList.add("ver"); clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove("ver"), ms || 4200); }
  function escaneando(o) {     // o: grupo, nombre, t0 (en el reloj de performance.now), previo (segundos de la vez anterior, 0 si no hay), previoTxt
    if (S.scan) return;
    alzada.fill(0);
    const esf = S.lente === "grupos" && gru().ok;
    S.scan = { t0: o.t0, grupo: o.grupo, antes: S.datos ? "red" : "vacio", previo: o.previo, esf };
    if (esf) gru().escaneo(0);
    ir("escaneo");
    tituloScan(o);
    $("#esc-antes").textContent = o.previo ? "La vez anterior tardó " + o.previoTxt + "." : "No hay registro de la vez anterior.";
    $("#esc-fase").textContent = "El abanico se recoge mientras Argos mira.";   // el mismo aviso en las dos lentes: no hay avance que mostrar
    $("#cancelar").style.display = "";
    vivo.textContent = "Escaneo en curso. Puedes cancelarlo.";
    cajas();   // el panel del escaneo cambió de alto con su texto
    setTimeout(() => { if (S.scan) est.fill(0); }, 500);
  }
  // El escaneo sigue mientras se miran otros resultados: la vista es la normal y una ficha abajo lleva el reloj y Cancelar.
  function enCurso(o) { S.curso = { t0: o.t0, s: -1 }; $("#curso-t").textContent = (o.grupo === "Detectar" ? "Detectando" : "Mapeando") + ": " + o.nombre.toLowerCase(); $("#curso").hidden = false; }
  $("#curso-cancelar").addEventListener("click", () => { $("#curso-cancelar").disabled = true; puente.cancelar(); });
  function revelar(o) {        // o: grupo, nombre, ms (lo que tardó). Las plumas se alzan por grupo, se abren los ojos y queda el abanico.
    alzada.fill(0); est.fill(0);
    const esf = S.lente === "grupos" && gru().ok;   // en las dos lentes se revela grupo a grupo; en la de grupos, una pluma por fase
    S.scan = { t0: ahora, grupo: o.grupo, rev: true, fase: 0, ojos: false, esf, fases: esf ? gru().caps.map((n) => ({ plural: n })) : grupos };
    if (esf) gru().escaneo(0);
    ir("escaneo", { salto: true });
    tituloScan(o);
    $("#esc-reloj").textContent = reloj(o.ms); $("#esc-antes").textContent = "Escaneo terminado."; $("#esc-fase").textContent = "";
    $("#cancelar").style.display = "none";
    cajas();
  }
  function latido() {
    if (S.curso) { const s = Math.floor((ahora - S.curso.t0) / 1000); if (s !== S.curso.s) { S.curso.s = s; $("#curso-reloj").textContent = reloj(s * 1000); } }
    const sc = S.scan; if (!sc) return;
    const t = ahora - sc.t0;
    if (!sc.rev) {
      $("#esc-reloj").textContent = reloj(t);
      if (sc.previo && !sc.tarde && t > sc.previo * 1000 + 400) { sc.tarde = true; $("#esc-antes").textContent = "Está tardando más que la vez anterior."; }
      return;
    }
    const fs = sc.fases, inicio = 300, fin = REV - 1900, g = Math.floor((t - inicio) / ((fin - inicio) / fs.length));
    while (sc.fase <= Math.min(g, fs.length - 1)) {
      const gr = fs[sc.fase++];
      if (sc.esf) gru().escaneo(sc.fase); else gr.ids.forEach((i) => { alzada[i] = 1; });
      $("#esc-fase").textContent = (sc.grupo === "Detectar" ? "Mirando: " : "Se alzan: ") + gr.plural.toLowerCase() + ".";
      objetivos();
    }
    if (!sc.ojos && t > REV - 1400) {
      sc.ojos = true; $("#esc-fase").textContent = "Se abren los ojos."; if (sc.esf) gru().escaneo(fs.length, true);
      E.forEach((d) => setTimeout(() => { if (S.scan === sc) { est[d.i] = ESTADO_N[d.estado]; poner(d.i, { [OP]: est[d.i] ? 1 : 0, [BR]: est[d.i] ? 1 : 0.7 }, 0); } }, calma ? 0 : 150 + (total > 0 ? pos[d.i] / total : 0) * 700));
    }
    if (t > REV + 400 && sc.fase >= fs.length && sc.ojos) {
      S.scan = null; S.filtro = null; diagnostico(); ir("red");
      vivo.textContent = `Escaneo terminado. ${H.cuenta("riesgo")} equipos en riesgo, ${H.cuenta("alerta")} en alerta, ${H.cuenta("seguro")} sin pendientes.`;
    }
  }
  $("#cancelar").addEventListener("click", () => { if (!S.scan || S.scan.rev) return; document.body.dataset.cancel = "1"; $("#esc-fase").textContent = "Cancelando."; puente.cancelar(); });
  function terminado(error) {  // cancelado o fallido: se repliega y vuelve a lo que había
    if (S.curso) { S.curso = null; $("#curso").hidden = true; $("#curso-cancelar").disabled = false; return avisar(error || "Escaneo cancelado. Conservas el resultado anterior.", error ? 12000 : 4200); }
    const sc = S.scan; if (!sc) return;
    alzada.fill(0); objetivos(); if (sc.esf) gru().escaneo(0);
    S.scan = null; document.body.dataset.cancel = "1";
    avisar(error || (sc.antes === "red" ? "Escaneo cancelado. Conservas el resultado anterior." : "Escaneo cancelado."), error ? 12000 : 4200);
    setTimeout(() => { delete document.body.dataset.cancel; ir(sc.antes); }, calma ? 0 : 750);
  }

  // ---- ficha: la pluma desarmada con sus rótulos ----
  let puertos = [], S0 = 0.2, DS = 0.05;
  function ficha() {
    const d = E[S.sel], J0 = 10, sds = d.sds.slice(0, gl.NB - J0), n = sds.length;   // shortcut: la pluma tiene 46 barbas-puerto; si un equipo abre más, se dibujan las primeras y el rótulo lo dice
    // las barbas suben a 0.9 rad: para no cruzar el ocelo, la última nace a más de Re / sin(0.9) del centro del ojo
    const tramo = Math.max(0.2, gl.EYE_U - (det.Re * 1.28 + 12) / det.len - 0.2);
    S0 = n > 1 ? 0.2 : 0.42; DS = n > 1 ? Math.min(0.085, tramo / (n - 1)) : 0; gl.U.uPortS.value.set(S0, DS, J0);
    const flag = (s) => { const v = d.vulns.find((v) => +v.port === s.port); return v ? (/critical|high/.test(v.severity) ? 2 : 1) : H.SENSIBLES.has(s.port) ? 1 : 0; };
    puertos = sds.map((s, k) => ({ s, j: J0 + k, u: S0 + k * DS, f: flag(s) }));
    const fam = d.familias, nf = fam.length;
    const sin = Math.sin(0.9), cos = Math.cos(0.9);
    const conHallazgo = puertos.filter((p) => p.f).length;
    let h = `<div class="parte raquis" data-parte="raquis" style="left:${det.ox + 20}px;top:${det.oy + det.bajo}px"><p class="rot">Raquis <span>el equipo y su sistema</span></p>
      <h2 tabindex="-1">${esc(d.nombre)}</h2><p class="estado" data-e="${d.estado}">${glifo(d.estado)} ${ESTADO_TXT[d.estado]}</p>
      <dl><dt>IP</dt><dd class="mono">${esc(d.ip)}</dd><dt>MAC</dt><dd class="mono">${esc(d.mac || "Sin dato")}</dd><dt>Sistema</dt><dd>${esc(d.os || "Sin identificar")}</dd><dt>Tipo</dt><dd>${H.TIPOS.find((t) => t[0] === d.tipo)[3]}</dd><dt>Respuesta</dt><dd class="mono">${(+d.latency || 0).toFixed(1)} ms</dd>${d.filtered.length ? `<dt>Filtrados</dt><dd class="mono">${d.filtered.map((p) => p + (H.ETIQ[p] ? " " + H.ETIQ[p] : "")).join(", ")}</dd>` : ""}</dl></div>`;
    h += `<p class="rot barbas" style="left:${det.ox + 14}px;top:${det.oy - det.Lp * 0.78 - 64}px">Barbas <span>${n ? `${d.sds.length} ${d.sds.length === 1 ? "puerto abierto" : "puertos abiertos"}${d.sds.length > n ? `, aquí los primeros ${n}` : ""}${conHallazgo ? `, ${conHallazgo} por revisar` : ""}` : "ningún puerto abierto"}</span></p>`;
    puertos.forEach((p, k) => {
      const L = det.Lp + 8, x = det.ox + p.u * det.len + cos * L, y = det.oy - (sin * L + 4);
      h += `<button class="puerto" data-parte="p${k}" data-f="${p.f}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" title="${esc(p.s.product || p.s.service)}">${p.f ? glifo(p.f === 2 ? "riesgo" : "alerta") : ""}<b>${+p.s.port}</b> ${esc(p.s.service)}</button>`;
    });
    const lx = det.ex + det.Re + 46, fila = nf ? Math.min(62, (det.Re * 2.1) / nf) : 0, y0 = det.oy - (fila * (nf - 1)) / 2;
    let lineas = "";
    h += `<p class="rot ocelo" style="left:${lx}px;top:${y0 - fila / 2 - 34}px">Ocelo <span>${nf ? "servicios, un anillo por familia" : "sin servicios a la vista"}</span></p>`;
    fam.forEach((f, k) => {
      const y = y0 + (nf - 1 - k) * fila, rm = det.Re * (0.36 + (0.64 * (k + 0.55)) / nf), a = Math.atan2(y - det.oy, lx - det.ex) * 0.9;
      lineas += `<path d="M${det.ex + Math.cos(a) * rm} ${det.oy + Math.sin(a) * rm} L${lx - 26} ${y} H${lx - 6}"/>`;
      h += `<button class="anillo" data-parte="a${k}" style="left:${lx}px;top:${y}px;max-width:${Math.max(120, W - lx - 16)}px" title="${esc(f.sds.map((s) => s.port + " " + (s.product || s.service)).join(", "))}"><b>${esc(f.nombre)}</b><span>${esc(f.sds.map((s) => s.product || s.service).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</span></button>`;
    });
    const py = det.oy + det.Re + 40, pw = Math.min(430, W - (det.ex - 150) - 20);
    lineas += `<path d="M${det.ex} ${det.oy + det.Re * 0.36} V${py - 8}"/><path d="M${det.ox + 44} ${det.oy + 8} V${det.oy + det.bajo - 8}"/>`;
    h += `<div class="parte pupila" data-parte="pupila" style="left:${det.ex - 150}px;top:${py}px;width:${pw}px;max-height:${Hh - py - 14}px"><p class="rot">Pupila <span>${d.vulns.length ? "lo que encontró y cómo corregirlo" : "hallazgos"}</span></p>` +
      (d.vulns.map((v) => `<article data-e="${/critical|high/.test(v.severity) ? "riesgo" : "alerta"}"><h3>${glifo(/critical|high/.test(v.severity) ? "riesgo" : "alerta")}${esc(v.id)} <span>${esc(v.sev)}${v.port ? ", puerto " + esc(v.port) : ""}</span></h3><p>${esc(v.output)}</p><p class="corr"><b>Corrección.</b> ${esc(v.remediation)}</p>${v.cve_ids && v.cve_ids.length ? `<p class="cves mono">${esc(v.cve_ids.join("  "))}</p>` : ""}</article>`).join("") ||
        `<p class="nada">${d.estado === "alerta" ? "Sin fallos confirmados. Está en alerta por tener abierto un puerto sensible: mira las barbas encendidas." : "Sin hallazgos. El ojo sigue cerrado."}</p>`) +
      d.posibles.map((v) => `<article class="posible"><h3>${esc(v.id)} <span>sin confirmar${v.port ? ", puerto " + esc(v.port) : ""}</span></h3><p>${esc(v.output)}</p></article>`).join("") + "</div>";
    $("#ficha-cuerpo").innerHTML = h;
    $("#guias").innerHTML = lineas;
    gl.U.uRings.value.x = nf;
    partes();
  }
  function partes() {     // qué parte está bajo el cursor o el foco: se separa un poco
    const U = gl.U, p = S.vista === "equipo" ? S.parte : null;
    U.uSlotU.value.fill(-1); U.uSlotD.value.fill(-1);
    if (S.vista === "equipo") puertos.forEach((q, k) => { U.uSlotD.value[q.j] = q.f + (p === "p" + k ? 10 : 0); });
    U.uRings.value.y = p && p[0] === "a" ? +p.slice(1) : p === "pupila" ? 99 : -1;
    $$("#ficha-cuerpo [data-parte]").forEach((el) => el.classList.toggle("sobre", el.dataset.parte === p));
  }
  const ponParte = (p) => { if (S.parte !== p) { S.parte = p; partes(); } };
  const fc = $("#ficha-cuerpo");
  fc.addEventListener("pointerover", (ev) => { const el = ev.target.closest("[data-parte]"); if (el) ponParte(el.dataset.parte); });
  fc.addEventListener("focusin", (ev) => { const el = ev.target.closest("[data-parte]"); if (el) ponParte(el.dataset.parte); });
  fc.addEventListener("focusout", () => ponParte(null));
  function parteEn(x, y) {    // el cursor sobre la pluma misma, no solo sobre el rótulo
    const dx = x - det.ex, dy = y - det.oy, r = Math.hypot(dx, dy) / det.Re, nf = E[S.sel].familias.length;
    if (r < 0.34) return "pupila";
    if (r < 1) return nf ? "a" + Math.min(nf - 1, Math.max(0, Math.floor(((r - 0.36) / 0.64) * nf))) : null;
    const sin = Math.sin(0.9), cos = Math.cos(0.9);
    for (let k = 0; k < puertos.length; k++) {
      const q = puertos[k], x0 = det.ox + q.u * det.len, L = det.Lp + 8;
      const t = Math.max(0, Math.min(L, (x - x0) * cos - (y - det.oy) * sin)), d = Math.hypot(x - x0 - cos * t, y - det.oy + sin * t);
      if (d < 7) return "p" + k;
    }
    if (Math.abs(y - det.oy) < 10 && x > det.ox && x < det.ex - det.Re) return "raquis";
    return null;
  }

  // ---- entrada ----
  let luzX = 0, luzY = 0, lx = 0, ly = 0, ultimoMov = -1e9;
  addEventListener("pointermove", (ev) => {
    luzX = ev.clientX; luzY = ev.clientY; ultimoMov = ahora;
    if (S.vista === "equipo" && (ev.target === document.body || ev.target.id === "capa" || ev.target.id === "ficha" || ev.target.id === "ficha-cuerpo")) ponParte(parteEn(ev.clientX, ev.clientY));
  });
  const sobre = (i) => { if (S.hover !== i && (S.vista === "red" || S.vista === "plan")) { S.hover = i; objetivos(); } };
  capaOjos.addEventListener("pointerover", (ev) => { const b = ev.target.closest(".ojo"); if (b) sobre(+b.dataset.i); });
  capaOjos.addEventListener("pointerout", (ev) => { if (ev.target.closest(".ojo")) sobre(-1); });
  capaOjos.addEventListener("focusin", (ev) => { const b = ev.target.closest(".ojo"); if (b) { sobre(+b.dataset.i); ojos.forEach((o) => (o.tabIndex = o === b ? 0 : -1)); } });
  capaOjos.addEventListener("focusout", () => sobre(-1));
  capaOjos.addEventListener("click", (ev) => { const b = ev.target.closest(".ojo"); if (b) elegir(+b.dataset.i); });
  capaOjos.addEventListener("keydown", (ev) => {
    const b = ev.target.closest(".ojo"); if (!b) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[ev.key], i = +b.dataset.i;
    if (d) { ev.preventDefault(); ojos[(i + d + NV) % NV].focus(); }
    if (ev.key === "Home") ojos[0].focus(); if (ev.key === "End") ojos[NV - 1].focus();
  });
  addEventListener("keydown", (ev) => {
    if (pers.open) return;   // el diálogo se queda con Esc y las flechas
    const enCampo = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (ev.key === "Escape") { if (S.scan) return; if (enCampo && campo.value) { campo.value = ""; campo.dispatchEvent(new Event("input")); return; } if (H.grupo && S.vista === "red") return aGrupo(null); ir(S.vista === "equipo" ? S.antes : "red"); }   // en el abanico de un grupo, Esc vuelve a los grupos
    if ((ev.key === "v" || ev.key === "V") && !enCampo && !ev.ctrlKey && !ev.metaKey && !ev.altKey) lente(S.lente === "grupos" ? "abanico" : "grupos");
    if (ev.key === "/" && !enCampo && S.vista === "red") { ev.preventDefault(); campo.focus(); }
    if (S.vista === "lanzar" && !enCampo && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) { ev.preventDefault(); const p = ev.key === "ArrowRight" ? 1 : -1, k = alFrente() + p, r = RUEDAS[cual]; k >= r.hasta && !cual ? cambiar(1, NM, true) : k < r.de && cual ? cambiar(0, NM - 1, true) : girar(k, true); }
    if (S.vista === "equipo" && !enCampo && (ev.key === "ArrowRight" || ev.key === "ArrowLeft") && !ev.target.closest("#ficha-cuerpo")) otro(ev.key === "ArrowRight" ? 1 : -1);
  });
  addEventListener("click", (ev) => {
    const l = ev.target.closest("button[data-lente]"); if (l) return lente(l.dataset.lente);   // solo los botones: el body también lleva data-lente
    const pg = ev.target.closest("button[data-pag]"); if (pg) return pg.disabled || aGrupo(H.grupo, H.pagina + +pg.dataset.pag);
    const b = ev.target.closest("[data-ir]"); if (!b || b.disabled) return;
    if (b.dataset.ir === "volver") return H.grupo && S.vista === "red" ? aGrupo(null) : ir(S.vista === "equipo" ? S.antes : "red");
    if (b.dataset.ir === "otro") return otro(+b.dataset.paso);
    if (b.dataset.ir === "rapido") return S.curso ? avisar("Ya hay un escaneo en curso.") : puente.lanzar(H.ESCANEOS.mapear[0][3], "");
    if (b.dataset.carta) cambiar(+b.dataset.carta ? 1 : 0, +b.dataset.carta);
    ir(b.dataset.ir);
  });
  // Hashes de Argos (#red, #equipo=IP, #plan, #lanzar) más la vista elegida a mano: #grupos, #abanico, o tras una coma (#plan,grupos).
  // Un grupo va detrás de "grupos": #grupos,computadora. Si no es el grupo montado, main.ts monta el que pide (si existe).
  function deHash(salto) {
    let v, arg, l, gk = null;
    const ps = decodeURIComponent(location.hash.slice(1)).split(",").filter(Boolean);
    ps.forEach((p, j) => { const [k, a] = p.split("="); if (k === "grupos" || k === "abanico") l = k; else if (ps[j - 1] === "grupos" && H.TIPOS.some((t) => t[0] === k)) gk = k; else if (!v) { v = k; arg = a; } });
    if (!S.scan && (gk || null) !== (H.grupo || null) &&(!gk || TODOS.some((d) => d.tipo === gk))) { setTimeout(() => puente.grupo(gk, 0)); return true; }   // después: montar() aún no ha vuelto
    if (H.grupo) { if (v === "red" || !v) return false; l = null; }   // el abanico del grupo se abre desde plegado, como al arrancar
    if (l) { S.lente = l; S.lenteFija = true; v = v || "red"; }
    if (!v) return false;
    if (["red", "plan", "lanzar", "equipo"].includes(v)) { if (v === "equipo" && arg) { const d = porIp.get(arg); if (d) S.sel = alojar(d); } ir(v, { salto }); if (v === "plan" && salto && H.plan.length && S.datos) { S.fija = H.plan[0]; objetivos(); pintarPlan(); saltar(); } }
    else return false;
    return true;
  }
  addEventListener("hashchange", () => deHash(false));
  addEventListener("resize", () => { medidas(); cajas(); if (S.vista === "equipo") ficha(); objetivos(); saltar(); subir(); colocar(); gl.render(); });   // al cambiar de tamaño no hay muelle: se recoloca y se pinta ya

  // ---- cuadro ----
  function subir() {
    const A = gl.U.uA.value, B = gl.U.uB.value, C = gl.U.uC.value;
    for (let i = 0; i < N; i++) {
      const b = i * P, o = i * 4;
      A[o] = val[b + OX]; A[o + 1] = val[b + OY]; A[o + 2] = val[b + AN]; A[o + 3] = val[b + LE];
      B[o] = val[b + BR]; B[o + 1] = Math.max(0, val[b + OP]); B[o + 2] = est[i]; B[o + 3] = val[b + SP];
      C[o] = Math.max(0, val[b + EX]); C[o + 1] = Math.max(0, val[b + ES]); C[o + 2] = Math.max(0, val[b + GW]); C[o + 3] = val[b + CA];
    }
  }
  let tAnt = 0;
  function cuadro(t) {
    const dt = Math.min(0.034, (t - tAnt) / 1000 || 0.016); tAnt = t; ahora = t;
    latido();
    const estaba = quieto;
    paso(dt / 2); paso(dt / 2);
    subir();
    // la luz deriva sola y sigue al cursor con retraso: la iridiscencia nunca está quieta
    const libre = !calma && ahora - ultimoMov > 3500, s = t / 1000;
    const tx = libre ? W * (0.5 + 0.36 * Math.sin(s * 0.13)) : luzX, ty = libre ? Hh * (0.34 + 0.2 * Math.sin(s * 0.09 + 1)) : luzY;
    const kL = calma ? 1 : 1 - Math.exp(-dt * 2.2); lx += (tx - lx) * kL; ly += (ty - ly) * kL;
    gl.U.uLight.value.set(lx, ly); gl.U.uTime.value = calma ? 0 : s;
    if (!estaba || !quieto) colocar();
    if (!(estaba && quieto && S.lente === "grupos" && enEscena())) gl.render();   // con los grupos en escena y la cola ya abajo, el abanico no se pinta
    rafId = requestAnimationFrame(cuadro);
  }

  medidas(); diagnostico();
  cajas();
  lx = luzX = W * 0.62; ly = luzY = Hh * 0.3;
  if (!deHash(true)) {   // arranque sin hash: el abanico se abre una vez, desde plegado
    S.vista = "lanzar"; objetivos(); saltar(); ir("red");
  }
  document.fonts && document.fonts.ready.then(() => { cajas(); quieto = false; });
  window.ARGOS = { S, H, E, ir, elegir, lente, get grupos() { return GRU; } };   // para herramientas/prueba.mjs
  let rafId = requestAnimationFrame(cuadro);
  return { escaneando, enCurso, revelar, terminado, avisar, destruir() { corte.abort(); cancelAnimationFrame(rafId); clearTimeout(tAviso); gl.destruir(); gru().destruir(); } };
}
