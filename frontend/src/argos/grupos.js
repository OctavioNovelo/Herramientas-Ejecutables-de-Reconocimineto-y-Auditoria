// La lente de grupos: un abanico de abanicos. Una pluma por tipo de equipo, con el mismo dibujo (pluma.js), arco, radio,
// hileras y ojos que el abanico de la red; el ojo es el peor estado de sus equipos. Elegir una pluma no dibuja nada aquí:
// app.js le pide a main.ts que monte el abanico de siempre solo con ese grupo.
import { crear } from "./pluma.js";

const GMAX = 60;   // uniformes de tamaño fijo: cabe cualquier número de grupos
const P = 11, OX = 0, OY = 1, AN = 2, LE = 3, BR = 4, OP = 5, ES = 8, GW = 9, CA = 10;   // el mismo orden de valores que app.js
const RIG = [70, 70, 60, 70, 60, 46, 60, 50, 60, 90, 34], AMO = [0.86, 0.86, 0.8, 0.86, 1, 0.9, 0.9, 1, 0.95, 1, 0.92];   // los mismos muelles
const TIER = [1, 0.8, 0.9], ESTADO_N = { seguro: 0, alerta: 1, riesgo: 2 }, ESTADO = ["seguro", "alerta", "riesgo"];
const FUERA = [-1e5, -1e5, 0, 0, 0, 0, 0, 0, 0, 0, 1];   // pluma sin grupo: lejos y sin largo

// op: alElegir(tipo), estorbos() (las cajas del menú que un rótulo no debe pisar)
export function iniciar(H, op) {
  const raiz = document.querySelector("#vgrupos"), capa = raiz.querySelector(".capa"), corte = new AbortController();
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const calma = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const G = H.TIPOS.map(([k, plural]) => {
    const l = H.equipos.filter((d) => d.tipo === k), c = (e) => l.filter((d) => d.estado === e).length;
    return { k, plural, n: l.length, riesgo: c("riesgo"), alerta: c("alerta"), st: Math.max(0, ...l.map((d) => ESTADO_N[d.estado])) };
  }).filter((g) => g.n).slice(0, GMAX);
  const n = G.length, gl = crear(raiz.querySelector("canvas"), GMAX);
  const val = new Float32Array(GMAX * P), vel = new Float32Array(GMAX * P), tgt = new Float32Array(GMAX * P);
  for (let i = n; i < GMAX; i++) { tgt.set(FUERA, i * P); gl.U.uB.value[i * 4 + 2] = 0; }

  const texto = (g) => `${g.n} ${g.n === 1 ? "equipo" : "equipos"} · ${g.riesgo} en riesgo · ${g.alerta} en alerta`;
  capa.innerHTML = G.map((g, k) => `<button class="ojo" data-k="${k}" data-g="${g.k}" data-e="${ESTADO[g.st]}" tabindex="${k ? -1 : 0}" aria-label="${esc(g.plural)}: ${texto(g).replace(/ · /g, ", ")}. Abre su abanico."><span class="rg"><b>${esc(g.plural)}</b><i>${texto(g)}</i></span></button>`).join("");
  const bots = [...capa.querySelectorAll(".ojo")], rots = bots.map((b) => b.firstChild);

  let on = false, enPlan = false, hover = -1, alz = null, abiertos = true, luces = null, quieto = true;
  let W = 0, Hh = 0, R = 0, eyeR = 0, tam = [], off = [];
  function medidas() {
    W = innerWidth; Hh = innerHeight; gl.resize(W, Hh);
    R = Math.min(W * 0.44, Hh * 0.8); eyeR = R * 0.037 * Math.min(1, Math.sqrt(43 / Math.max(1, n))); gl.U.uEyeR.value = eyeR;
    tam = rots.map((r) => [r.offsetWidth, r.offsetHeight]);
  }
  // la misma caída que hace el shader (pluma.js, caer), para que los rótulos sigan a la pluma
  const caer = (x, y, ox, oy, c) => { const th = Math.min(1, Math.max(0, c)) * 1.5, f = Hh * 1.3, s = f / (f + Math.max(0, oy - y) * Math.sin(th)); return [ox + (x - ox) * s, oy + (y - oy) * Math.cos(th) * s]; };
  const ojoXY = (k, v) => { const b = k * P, a = v[b + AN], l = v[b + LE] * gl.EYE_U; return [...caer(v[b + OX] + Math.sin(a) * l, v[b + OY] - Math.cos(a) * l, v[b + OX], v[b + OY], v[b + CA]), Math.sin(a), -Math.cos(a)]; };

  function objetivos() {
    const rad = Math.PI / 180, Rv = Math.min(Hh * 0.8, R * 1.09);
    G.forEach((g, k) => {
      const u = n > 1 ? k / (n - 1) : 0.5, tier = TIER[k % 3], arriba = on && (alz === null || k < alz), st = abiertos ? g.st : 0;
      let o;
      if (!arriba) o = [W / 2, Hh + 10, (u - 0.5) * 20 * rad, R * 0.5 * (0.86 + 0.14 * tier), 0.85, 0, 0.1, 0, 0, 0, 1];   // plegada, con la cola abajo
      else {
        const a = enPlan ? (5 + 80 * u) * rad : (-70 + 140 * u) * rad, r = enPlan ? Math.min(Hh * 0.86, W * 0.52) : R + (Rv - R) * Math.cos(a) * Math.cos(a);
        let br = st ? 1 : 0.7, gw = 0;
        if (luces) { const en = luces.has(g.k); br = en ? 1.1 : 0.16; gw = en ? 1 : 0; }   // lo que busca el buscador o señala el plan
        if (hover === k) { br = Math.max(br, 1) + 0.25; gw = 1; }
        o = [enPlan ? -20 : W / 2, Hh + (enPlan ? 20 : 10), a, r * tier, br, st ? 1 : 0, 1, 0, (enPlan ? 0.82 : 1) * (hover === k ? 1.16 : 1), gw, 0];
      }
      tgt.set(o, k * P); gl.U.uB.value[k * 4 + 2] = st;
      bots[k].classList.toggle("ver", arriba); bots[k].dataset.e = ESTADO[st];
    });
    if (calma) val.set(tgt);
    quieto = false; rotular();
  }
  // Cada rótulo va al primer sitio libre junto a su ojo: hacia afuera, encima, debajo o al otro lado. Se decide con las
  // posiciones de destino (no cuadro a cuadro), así un rótulo no salta mientras la pluma se mueve.
  function rotular() {
    const puestos = [], ojos = G.map((g, k) => { const [x, y] = ojoXY(k, tgt); return [x, y]; });
    const caja = (x, y, w, h) => ({ l: x, t: y, r: x + w, b: y + h });
    const pisa = (a, o, m) => Math.max(0, Math.min(a.r, o.r + m) - Math.max(a.l, o.l - m)) * Math.max(0, Math.min(a.b, o.b + m) - Math.max(a.t, o.t - m));
    const estorbos = (op.estorbos() || []).map((o) => ({ l: o.left, t: o.top, r: o.right, b: o.bottom }));
    const ojosC = ojos.map(([x, y]) => caja(x - eyeR, y - eyeR, eyeR * 2, eyeR * 2));
    off = G.map((g, k) => {
      const [x, y] = ojos[k], [w, h] = tam[k] || [0, 0], [, , dx, dy] = ojoXY(k, tgt), d = eyeR * 1.16 + 10;
      const fuera = dx < -0.3 ? [x - d - w, y - h / 2] : dx > 0.3 ? [x + d, y - h / 2] : [x - w / 2, y + dy * d - h];
      const cands = [fuera, [x - w / 2, y - d - h], [x - w / 2, y + d], dx < 0 ? [x + d, y - h / 2] : [x - d - w, y - h / 2]];
      cands.push([Math.max(8, Math.min(W - 8 - w, fuera[0])), Math.max(8, Math.min(Hh - 8 - h, fuera[1]))]);   // último recurso: hacia afuera, sin salirse
      let mejor = cands[0], menos = Infinity;
      for (const [cx, cy] of cands) {
        const c = caja(cx, cy, w, h), sale = cx < 8 || cy < 8 || cx + w > W - 8 || cy + h > Hh - 8 ? 1e6 : 0;
        const s = sale + puestos.reduce((t, o) => t + pisa(c, o, 6), 0) + ojosC.reduce((t, o, j) => t + (j === k ? 0 : pisa(c, o, 4)), 0) + estorbos.reduce((t, o) => t + pisa(c, o, 6), 0);
        if (s < menos) { menos = s; mejor = [cx, cy]; } if (!s) break;
      }
      puestos.push(caja(mejor[0], mejor[1], w, h));
      return [mejor[0] - x, mejor[1] - y, dx < -0.3 && mejor === fuera ? "izq" : dx > 0.3 && mejor === fuera ? "der" : "cen"];
    });
  }
  function paso(dt) {
    let mov = 0;
    for (let m = 0; m < n * P; m++) {
      const p = m % P;
      const a = RIG[p] * (tgt[m] - val[m]) - 2 * Math.sqrt(RIG[p]) * AMO[p] * vel[m];
      vel[m] += a * dt; val[m] += vel[m] * dt;
      mov = Math.max(mov, Math.abs(vel[m]) * (p === AN ? 400 : p < 4 ? 1 : 200));
    }
    quieto = mov < 0.4;
  }
  function subir() {
    const A = gl.U.uA.value, B = gl.U.uB.value, C = gl.U.uC.value;
    for (let i = 0; i < GMAX; i++) {
      const b = i * P, o = i * 4, v = i < n ? val : tgt;
      A[o] = v[b + OX]; A[o + 1] = v[b + OY]; A[o + 2] = v[b + AN]; A[o + 3] = v[b + LE];
      B[o] = v[b + BR]; B[o + 1] = Math.max(0, v[b + OP]); B[o + 3] = v[b + 6];
      C[o] = Math.max(0, v[b + 7]); C[o + 1] = Math.max(0, v[b + ES]); C[o + 2] = Math.max(0, v[b + GW]); C[o + 3] = v[b + CA];
    }
  }
  function colocar() {
    G.forEach((g, k) => {
      const [x, y] = ojoXY(k, val), [ox, oy, lado] = off[k] || [0, 0, "cen"];
      bots[k].style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      rots[k].style.transform = `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px)`; rots[k].dataset.lado = lado;
      bots[k].classList.toggle("sobre", hover === k);
    });
  }

  // ---- luz y cuadro: la misma deriva que el abanico ----
  let luzX = 0, luzY = 0, lx = 0, ly = 0, ultimoMov = -1e9, tAnt = 0, rafId = 0, pintado = false;
  const escucha = (t, f) => window.addEventListener(t, f, { signal: corte.signal });
  escucha("pointermove", (ev) => { luzX = ev.clientX; luzY = ev.clientY; ultimoMov = performance.now(); });
  function cuadro(t) {
    const dt = Math.min(0.034, (t - tAnt) / 1000 || 0.016); tAnt = t;
    if (on || !quieto || !pintado) {
      const estaba = quieto;
      if (!calma) { paso(dt / 2); paso(dt / 2); } else { val.set(tgt); quieto = true; }
      subir();
      const libre = !calma && t - ultimoMov > 3500, s = t / 1000;
      const tx = libre ? W * (0.5 + 0.36 * Math.sin(s * 0.13)) : luzX, ty = libre ? Hh * (0.34 + 0.2 * Math.sin(s * 0.09 + 1)) : luzY;
      const kL = calma ? 1 : 1 - Math.exp(-dt * 2.2); lx += (tx - lx) * kL; ly += (ty - ly) * kL;
      gl.U.uLight.value.set(lx, ly); gl.U.uTime.value = calma ? 0 : s;
      if (!estaba || !quieto) colocar();
      gl.render(); pintado = true;
    }
    rafId = requestAnimationFrame(cuadro);
  }

  // ---- entrada: un botón por ojo, como en el abanico ----
  const sobre = (k) => { if (hover !== k) { hover = k; objetivos(); } };
  capa.addEventListener("pointerover", (ev) => { const b = ev.target.closest(".ojo"); if (b) sobre(+b.dataset.k); });
  capa.addEventListener("pointerout", (ev) => { if (ev.target.closest(".ojo")) sobre(-1); });
  capa.addEventListener("focusin", (ev) => { const b = ev.target.closest(".ojo"); if (b) { sobre(+b.dataset.k); bots.forEach((o) => (o.tabIndex = o === b ? 0 : -1)); } });
  capa.addEventListener("focusout", () => sobre(-1));
  capa.addEventListener("click", (ev) => { const b = ev.target.closest(".ojo"); if (b && on && alz === null) op.alElegir(b.dataset.g); });
  capa.addEventListener("keydown", (ev) => {
    const b = ev.target.closest(".ojo"); if (!b || !n) return;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[ev.key], k = +b.dataset.k;
    if (d) { ev.preventDefault(); bots[(k + d + n) % n].focus(); }
    if (ev.key === "Home") bots[0].focus(); if (ev.key === "End") bots[n - 1].focus();
  });
  escucha("resize", () => setTimeout(() => { if (corte.signal.aborted) return; medidas(); objetivos(); val.set(tgt); vel.fill(0); subir(); colocar(); gl.render(); }));   // al cambiar de tamaño no hay muelle; después de app.js, que mide de nuevo el menú
  medidas(); objetivos(); val.set(tgt); subir(); colocar();
  document.fonts && document.fonts.ready.then(() => { if (!corte.signal.aborted) { medidas(); objetivos(); } });
  lx = luzX = W * 0.62; ly = luzY = Hh * 0.3;
  rafId = requestAnimationFrame(cuadro);

  return {
    get ok() { return !gl.sinGL; },
    get caps() { return G.map((g) => g.plural); },   // las fases del revelado tras un escaneo: un grupo cada vez
    // on: la lente está en escena; plan: el plan ocupa la derecha y el abanico se recuesta como en la red
    activar(v, plan) { if (on === !!v && enPlan === !!plan) return; on = !!v; enPlan = !!plan; if (on) medidas(); objetivos(); },
    // f: null fuera del escaneo; si no, cuántos grupos ya se alzaron. abrir: los ojos ya muestran su estado.
    escaneo(f, abrir) { alz = f == null ? null : f; abiertos = f == null || !!abrir; objetivos(); },
    // r: los equipos que encienden su grupo (buscador o acción del plan); null, ninguno resaltado
    resaltar(r) { luces = r ? new Set(r.map((d) => d.tipo)) : null; objetivos(); },
    destruir() { corte.abort(); cancelAnimationFrame(rafId); gl.destruir(); },
  };
}
