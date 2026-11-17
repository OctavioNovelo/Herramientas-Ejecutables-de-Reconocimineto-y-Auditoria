/* La esfera: la otra vista de la red, para cuando el abanico no alcanza (propuesta argos-esfera).
   Aquí solo se dibuja y se navega. El filtro, el buscador, el plan y la ficha son los de Argos (app.js),
   que le pasa a la esfera qué resaltar y recibe qué equipo se eligió. Cada montura de app.js crea la suya. */
import * as T from 'three';

// H: el modelo de datos.ts. opciones: coincide(e), alElegir(e), decir(texto), estorbos().
export function iniciar(H, opciones) {
const $ = (id) => document.getElementById(id);
const COL = { tinta: '#070d1a', hueso: '#ece5d2', bronce: '#c08a3e', seguro: '#5cc7a1', alerta: '#f4b540', riesgo: '#ff7350', relleno: '#1b2d55' };
const EST = { riesgo: { t: 'En riesgo', n: 2 }, alerta: { t: 'En alerta', n: 1 }, seguro: { t: 'Sin pendientes', n: 0 } };
const TIPO = {}, UNO = {}; H.TIPOS.forEach((t) => { TIPO[t[0]] = t[1]; UNO[t[0]] = t[3]; });   // plural para el casquete, singular para la pista
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducido = () => RM.matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

function ojo(est) {
  const alm = '<path d="M2 8Q12 -1 22 8Q12 17 2 8Z"/>';
  const d = est === 'riesgo' ? alm + '<circle cx="12" cy="8" r="3.3"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/>'
    : est === 'alerta' ? alm + '<circle cx="12" cy="8" r="2.2" fill="currentColor" stroke="none"/>'
    : '<path d="M2 6Q12 13 22 6"/>';
  return '<svg class="oj ' + est + '" viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' + d + '</svg>';
}

const op = opciones;

/* ---------- modelo ---------- */
let modo = 'tipo', caps = [], devs = [], porE = new Map();
const S = { foco: null, sel: null, hover: null, hoverCap: null, res: new Set() };
let escan = null; // durante un escaneo: { k: casquetes ya vistos, ojos: ya se sabe su estado }

// Reparte los casquetes: área según el número de equipos, separados por repulsión hasta que no se tocan.
function repartir() {
  const N = caps.length, W = caps.map((c) => Math.pow(c.n, 0.7)), sw = W.reduce((a, b) => a + b, 0);
  const tmp = new T.Vector3(), tmp2 = new T.Vector3(), viejo = new T.Vector3();
  caps.forEach((c, i) => {
    c.theta = Math.acos(1 - 2 * 0.47 * W[i] / sw);
    const y = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - y * y), a = i * 2.399963;
    c.c = new T.Vector3(rr * Math.cos(a), y, rr * Math.sin(a));
  });
  const alejar = (ci, cj, dot, t) => { // mueve ci por el círculo máximo, lejos de cj
    tmp.copy(cj).addScaledVector(ci, -dot);
    if (tmp.lengthSq() < 1e-9) tmp.set(ci.y, ci.z, ci.x).addScaledVector(ci, -tmp.dot(ci));
    tmp.normalize(); ci.multiplyScalar(Math.cos(t)).addScaledVector(tmp, -Math.sin(t)).normalize();
  };
  for (let pasada = 0; pasada < 14; pasada++) {
    let ok = true;
    for (let it = 0; it < 400; it++) {
      ok = true;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const ci = caps[i].c, cj = caps[j].c, dot = clamp(ci.dot(cj), -1, 1);
        const falta = caps[i].theta + caps[j].theta + 0.07 - Math.acos(dot);
        if (falta > 0) { ok = false; viejo.copy(ci); alejar(ci, cj, dot, falta * 0.5 + 0.002); alejar(cj, tmp2.copy(viejo), dot, falta * 0.5 + 0.002); }
      }
      if (ok) break;
    }
    if (ok) return;
    caps.forEach((c) => { c.theta *= 0.96; });
  }
  console.error('Esfera: no se pudieron separar los casquetes');
}

// Un casquete por subred. Si toda la red cabe en una sola subred, un casquete por tipo de equipo.
function agrupar() {
  const seg =(e) => e.ip.split('.').slice(0, 3).join('.') + '.0/24';
  modo = new Set(H.equipos.map(seg)).size > 1 ? 'segmento' : 'tipo';
  const mapa = new Map();
  H.equipos.forEach((e) => {
    const k = modo === 'segmento' ? seg(e) : e.tipo;
    if (!mapa.has(k)) mapa.set(k, { clave: k, nombre: modo === 'segmento' ? k : (TIPO[k] || k), devs: [] });
    mapa.get(k).devs.push({ e: e });
  });
  caps = Array.from(mapa.values()); devs = []; porE = new Map();
  caps.forEach((c, i) => {
    c.i = i; c.n = c.devs.length;
    c.devs.sort((a, b) => EST[b.e.estado].n - EST[a.e.estado].n); // lo peor queda al centro del casquete
    c.riesgo = c.devs.filter((d) => d.e.estado === 'riesgo').length;
    c.alerta = c.devs.filter((d) => d.e.estado === 'alerta').length;
    c.peor = c.riesgo ? 'riesgo' : c.alerta ? 'alerta' : 'seguro';
    c.prueba = c.devs.every((d) => d.e.sintetico);
  });
}
function construir() {
  agrupar();
  repartir();
  const up = new T.Vector3();
  caps.forEach((c) => {
    up.set(0, 1, 0).addScaledVector(c.c, -c.c.y);
    if (up.lengthSq() < 1e-4) up.set(0, 0, -1);
    c.y = up.clone().normalize(); c.x = new T.Vector3().crossVectors(c.y, c.c);
    const util = c.theta * 0.86, area = 2 * Math.PI * (1 - Math.cos(util));
    c.tam = clamp(0.36 * Math.sqrt(area / c.n), 0.02, 0.07);
    // girasol: reparto uniforme en área, sin encimar y sin simulación
    c.devs.forEach((d, k) => {
      const cf = 1 - (k + 0.5) / c.n * (1 - Math.cos(util)), sf = Math.sqrt(1 - cf * cf), az = k * 2.399963 + 0.6;
      d.pos = new T.Vector3().addScaledVector(c.c, cf).addScaledVector(c.x, sf * Math.cos(az)).addScaledVector(c.y, sf * Math.sin(az));
      d.cap = c; d.i = devs.length; devs.push(d); porE.set(d.e, d);
    });
  });
}
const coincide = (d) => op.coincide(d.e);
const visto = (c) => !escan || c.i < escan.k;

/* ---------- 3D ---------- */
const FOV = 28, TF = Math.tan(FOV * Math.PI / 360);
let cont, lienzo, etiquetas, pista, pie;
let gl = null, W = 1, Hh = 1, activa = false;
const enc = { izq: 0, der: 0 }; // lo que el menú de Argos ocupa a cada lado: la esfera se encuadra en lo que queda
const cam = { q: new T.Quaternion(), d: 5, shift: 0, rev: 0 };
let meta = null, inercia = null, pend = false, cuadros = 0, ultimo = 0;

const V_CAP = 'varying vec2 vUv; varying float vF; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vF=dot(normalize(normalMatrix*normal),normalize(-mv.xyz)); gl_Position=projectionMatrix*mv; }';
const F_CAP = [
  'uniform vec3 uR,uA,uS,uFill; uniform float uPR,uPA,uTheta,uHover,uDim,uFoco; varying vec2 vUv; varying float vF;',
  'void main(){',
  '  float r=vUv.x*uTheta, borde=uTheta-r, aa=fwidth(r)*1.3, a=vUv.y;',
  // el borde es la composición del casquete: arco grueso en riesgo, medio en alerta, fino sin pendientes
  '  float esR=step(a,uPR), esA=(1.-esR)*step(a,uPA);',
  '  vec3 cb=mix(mix(uS,uA,esA),uR,esR); float w=mix(mix(.005,.011,esA),.019,esR);',
  '  float banda=1.-smoothstep(w,w+aa,borde);',
  '  vec3 col=uFill; float al=.34+.10*vUv.x+.16*uHover+.10*uFoco;',
  '  col=mix(col,cb,banda); al=max(al,banda);',
  '  al*=mix(.16,1.,smoothstep(-.2,.2,vF))*mix(1.,.4,uDim);',
  '  gl_FragColor=vec4(col,al); }'].join('\n');
const V_OJO = [
  'attribute vec3 aPos; attribute vec3 aDat; attribute vec2 aFx; uniform float uFoco,uRev;',
  'varying vec2 vP; varying float vEst,vRes,vAl;',
  'void main(){',
  '  float res=aFx.x, vis=max(abs(aDat.z-uFoco)<.5?uRev:0., step(.5,res));',
  '  vec3 n=normalize(normalMatrix*aPos);',
  '  vec4 c=modelViewMatrix*vec4(aPos*(1.006+.035*step(1.5,res)),1.);', // el elegido se separa de la superficie
  // el ojo descansa sobre la superficie pero siempre queda derecho en pantalla
  '  vec3 u=vec3(0.,1.,0.); u=normalize(u-n*dot(u,n)); vec3 rr=cross(u,n);',
  '  float s=aDat.x*(1.+.12*step(.5,res)+.68*step(1.5,res))*mix(.5,1.,vis);',
  '  float cara=smoothstep(.03,.22,dot(n,normalize(-c.xyz)));',
  '  c.xyz+=(rr*position.x+u*position.y)*s;',
  '  vP=position.xy; vEst=aDat.y; vRes=res; vAl=vis*cara*mix(1.,.13,aFx.y*(1.-step(.5,res)));',
  '  gl_Position=vAl<.01?vec4(2.,2.,2.,1.):projectionMatrix*c; }'].join('\n');
const F_OJO = [
  'uniform vec3 uR,uA,uS,uTinta,uHueso; varying vec2 vP; varying float vEst,vRes,vAl;',
  'const float AW=.92, AH=.47;',
  'float alm(vec2 p){ float R=(AW*AW+AH*AH)/(2.*AH), o=R-AH; return max(length(p-vec2(0.,-o))-R,length(p-vec2(0.,o))-R); }',
  'void main(){',
  '  float k=vRes>.5?1.32:1.; vec2 p=vP*k; float aa=fwidth(p.x)*1.4, t=.05*k, l=length(p);',
  '  vec3 ce=vEst<.5?uS:(vEst<1.5?uA:uR); vec3 col=ce; float a=0.;',
  '  if(vEst<.5){', // seguro: línea de párpado
  '    float R=(AW*AW+AH*AH)/(2.*AH); float d=max(abs(length(p-vec2(0.,R-AH*.5))-R)-t, abs(p.x)-AW*.9);',
  '    a=1.-smoothstep(0.,aa,d);',
  '  } else {', // alerta: almendra con punto. riesgo: almendra con diana
  '    float d=alm(p), dentro=1.-smoothstep(0.,aa,d), trazo=1.-smoothstep(0.,aa,abs(d)-t);',
  '    float pup=vEst<1.5 ? 1.-smoothstep(0.,aa,l-.19) : max(1.-smoothstep(0.,aa,abs(l-.29)-.05),1.-smoothstep(0.,aa,l-.11));',
  '    col=mix(uTinta,ce,max(trazo,pup)); a=max(dentro*.92,trazo);',
  '  }',
  '  if(vRes>.5){ float lp=length(vP), aro=1.-smoothstep(0.,aa/k,abs(lp-.94)-.028);', // aro: resaltado o elegido
  '    col=mix(col,vRes>1.5?uHueso:ce,aro); a=max(a,aro); }',
  '  gl_FragColor=vec4(col,a*vAl); }'].join('\n');

function iniciar3D() {
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true }); }
  catch (e) { lienzo.hidden = true; return; }
  T.ColorManagement.enabled = false; renderer.outputColorSpace = T.LinearSRGBColorSpace; // colores tal cual la paleta
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(FOV, 1, 0.1, 40), globo = new T.Group();
  scene.add(globo);
  // cáscara translúcida: solo el canto brilla, el centro deja ver el módem
  const cascara = new T.Mesh(new T.SphereGeometry(0.998, 96, 64), new T.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uC: { value: new T.Color('#6f9fd0') } },
    vertexShader: 'varying float vF; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vF=dot(normalize(normalMatrix*normal),normalize(-mv.xyz)); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uC; varying float vF; void main(){ float f=1.-abs(vF); gl_FragColor=vec4(uC,pow(f,3.2)*.6+.035); }' }));
  globo.add(cascara);
  // núcleo: el módem
  const lz = document.createElement('canvas'); lz.width = lz.height = 128;
  const g = lz.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(236,229,210,1)'); gr.addColorStop(0.16, 'rgba(226,170,84,.85)'); gr.addColorStop(0.45, 'rgba(192,138,62,.22)'); gr.addColorStop(1, 'rgba(192,138,62,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const halo = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(lz), blending: T.AdditiveBlending, depthWrite: false, depthTest: false }));
  halo.scale.set(0.62, 0.62, 1); halo.renderOrder = 1; globo.add(halo);
  const capas = new T.Group(); globo.add(capas);
  gl = { renderer: renderer, scene: scene, camera: camera, globo: globo, capas: capas, ray: new T.Raycaster(), esfera: new T.Sphere(new T.Vector3(), 1.004) };
}

function montar() {
  if (!gl) return;
  const cp = gl.capas, col = (k) => ({ value: new T.Color(COL[k]) });
  // casquetes
  caps.forEach((c) => {
    const an = 22, seg = 120, pos = [], uv = [], idx = [], v = new T.Vector3();
    for (let i = 0; i <= an; i++) for (let j = 0; j <= seg; j++) {
      const ph = i / an * c.theta, az = j / seg * Math.PI * 2 + Math.PI / 2; // la composición arranca arriba
      v.set(0, 0, 0).addScaledVector(c.c, Math.cos(ph)).addScaledVector(c.x, Math.sin(ph) * Math.cos(az)).addScaledVector(c.y, Math.sin(ph) * Math.sin(az));
      pos.push(v.x, v.y, v.z); uv.push(i / an, j / seg);
      if (i < an && j < seg) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    // arcos mínimos visibles: una fracción diminuta en riesgo no debe desaparecer
    c.fr = c.riesgo ? Math.max(c.riesgo / c.n, 0.035) : 0; c.fa = c.alerta ? Math.max(c.alerta / c.n, 0.035) : 0;
    const mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, vertexShader: V_CAP, fragmentShader: F_CAP,
      uniforms: { uR: col('riesgo'), uA: col('alerta'), uS: col('seguro'), uFill: col('relleno'), uPR: { value: c.fr }, uPA: { value: c.fr + c.fa },
        uTheta: { value: c.theta }, uHover: { value: 0 }, uDim: { value: 0 }, uFoco: { value: 0 } } });
    c.malla = new T.Mesh(geo, mat); c.malla.renderOrder = 3; cp.add(c.malla);
  });
  // hilos: del módem a cada equipo. Es lo único que HERA sabe de la topología.
  const n = devs.length, lp = new Float32Array(n * 6);
  devs.forEach((d, i) => { lp[i * 6] = d.pos.x * 0.05; lp[i * 6 + 1] = d.pos.y * 0.05; lp[i * 6 + 2] = d.pos.z * 0.05; lp[i * 6 + 3] = d.pos.x; lp[i * 6 + 4] = d.pos.y; lp[i * 6 + 5] = d.pos.z; });
  const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 6), 3));
  gl.hilos = new T.LineSegments(lg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  gl.hilos.renderOrder = 2; cp.add(gl.hilos);
  // ojos: un solo dibujo instanciado
  const og = new T.InstancedBufferGeometry();
  og.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); og.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new Float32Array(n * 3), aDat = new Float32Array(n * 3);
  devs.forEach((d, i) => { d.pos.toArray(aPos, i * 3); aDat[i * 3] = d.cap.tam; aDat[i * 3 + 1] = EST[d.e.estado].n; aDat[i * 3 + 2] = d.cap.i; });
  og.setAttribute('aPos', new T.InstancedBufferAttribute(aPos, 3)); og.setAttribute('aDat', new T.InstancedBufferAttribute(aDat, 3));
  og.setAttribute('aFx', new T.InstancedBufferAttribute(new Float32Array(n * 2), 2)); og.instanceCount = n;
  gl.ojos = new T.Mesh(og, new T.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, vertexShader: V_OJO, fragmentShader: F_OJO,
    uniforms: { uR: col('riesgo'), uA: col('alerta'), uS: col('seguro'), uTinta: col('tinta'), uHueso: col('hueso'), uFoco: { value: -1 }, uRev: { value: 0 } } }));
  gl.ojos.frustumCulled = false; gl.ojos.renderOrder = 4; cp.add(gl.ojos);
}

// Vuelca el estado (elegido, resaltados, filtro, foco, escaneo) a los búferes. No dibuja: pide un cuadro.
function marcar() {
  if (!gl) return;
  const fx = gl.ojos.geometry.attributes.aFx, lc = gl.hilos.geometry.attributes.color, c = new T.Color();
  const aten = clamp(20 / Math.max(1, devs.length), 0.25, 1); // muchos equipos: los hilos se aclaran para no saturar los casquetes
  devs.forEach((d, i) => {
    const res = !visto(d.cap) ? 0 : d === S.sel ? 2 : (S.res.has(d) || d === S.hover || (d.cap === S.hoverCap && d.cap !== S.foco)) ? 1 : 0, pasa = coincide(d);
    fx.array[i * 2] = res; fx.array[i * 2 + 1] = pasa ? 0 : 1;
    let a = 0.12 * aten, b = 0.012 * aten;
    if (res) { c.set(res === 2 ? COL.hueso : COL[d.e.estado]); a = b = 0.9; }
    else { c.set(COL.bronce); const k = !visto(d.cap) ? 0.06 : !pasa ? 0.15 : S.foco ? (d.cap === S.foco ? 1.5 : 0.3) : 1; a *= k; b *= k; }
    lc.array[i * 6] = c.r * a; lc.array[i * 6 + 1] = c.g * a; lc.array[i * 6 + 2] = c.b * a;
    lc.array[i * 6 + 3] = c.r * b; lc.array[i * 6 + 4] = c.g * b; lc.array[i * 6 + 5] = c.b * b;
  });
  fx.needsUpdate = true; lc.needsUpdate = true;
  caps.forEach((cp) => { cp.rad = -1; cp.pasan = 0; });
  devs.forEach((d) => { if (S.res.has(d) || d === S.hover) d.cap.rad = Math.max(d.cap.rad, d.pos.angleTo(d.cap.c)); if (coincide(d)) d.cap.pasan++; });
  caps.forEach((cp) => { const u = cp.malla.material.uniforms, sabe = !escan || escan.ojos;
    u.uHover.value = cp === S.hoverCap && cp !== S.foco ? 1 : 0; u.uFoco.value = cp === S.foco ? 1 : 0;
    u.uDim.value = (S.foco && cp !== S.foco) || !visto(cp) || !cp.pasan ? 1 : 0;
    u.uPR.value = sabe ? cp.fr : 0; u.uPA.value = sabe ? cp.fr + cp.fa : 0; }); // a medio escaneo aún no se sabe qué hay en riesgo
  if (S.foco) gl.ojos.material.uniforms.uFoco.value = S.foco.i; // al salir se conserva para que el fundido tenga a quién apagar
  pedir();
}

/* ---------- cámara: gira el globo con un cuaternión (sin bloqueo de ejes) ---------- */
const m4 = new T.Matrix4(), va = new T.Vector3(), vb = new T.Vector3(), vc = new T.Vector3();
function qCara(dir, arriba) { // cuaternión que trae `dir` al frente con `arriba` hacia arriba
  const z = va.copy(dir).normalize(), y = vb.copy(arriba).addScaledVector(z, -arriba.dot(z));
  if (y.lengthSq() < 1e-6) y.set(z.y, z.z, z.x).addScaledVector(z, -y.dot(z));
  y.normalize(); const x = vc.crossVectors(y, z);
  return new T.Quaternion().setFromRotationMatrix(m4.makeBasis(x, y, z)).invert();
}
const arribaActual = () => new T.Vector3(0, 1, 0).applyQuaternion((meta ? meta.a.q : cam.q).clone().invert());
const lado = () => Math.max(160, Math.min(Hh, W - enc.izq - enc.der));
const shift0 = () => (enc.der - enc.izq) / 2;
function d0() { const k = 0.84 * lado() * TF / Hh; return 1 / Math.sin(Math.atan(k)); }
function dCap(c) { return Math.cos(c.theta) + Math.sin(c.theta) * Hh / (2 * TF * 0.41 * lado()); }
const dAhora = () => (S.foco ? dCap(S.foco) : d0());

function ir(dest, dur) {
  const a = { q: (dest.q || (meta ? meta.a.q : cam.q)).clone(), d: dest.d != null ? dest.d : (meta ? meta.a.d : cam.d),
    shift: dest.shift != null ? dest.shift : (meta ? meta.a.shift : cam.shift), rev: dest.rev != null ? dest.rev : (meta ? meta.a.rev : cam.rev) };
  inercia = null;
  if (reducido() || dur === 0 || !activa) { cam.q.copy(a.q); cam.d = a.d; cam.shift = a.shift; cam.rev = a.rev; meta = null; } // sin movimiento, o sin nadie mirando: corte directo
  else meta = { de: { q: cam.q.clone(), d: cam.d, shift: cam.shift, rev: cam.rev }, a: a, t0: performance.now(), dur: dur || 560 };
  pedir();
}
function soltarMeta() { if (meta) { cam.rev = meta.a.rev; cam.shift = meta.a.shift; meta = null; } }

function avanzar(ahora) {
  const dt = Math.min(50, ahora - ultimo); ultimo = ahora;
  let vivo = false;
  if (meta) {
    const k = clamp((ahora - meta.t0) / meta.dur, 0, 1), e = 1 - Math.pow(1 - k, 3), l = (x, y) => x + (y - x) * e;
    cam.q.slerpQuaternions(meta.de.q, meta.a.q, e); cam.d = l(meta.de.d, meta.a.d); cam.shift = l(meta.de.shift, meta.a.shift); cam.rev = l(meta.de.rev, meta.a.rev);
    if (k >= 1) meta = null; else vivo = true;
  }
  if (inercia) { // inercia corta, sin rebote
    cam.q.premultiply(new T.Quaternion().setFromAxisAngle(inercia.eje, inercia.v * dt));
    inercia.v *= Math.exp(-dt / 170);
    if (inercia.v < 4e-5) inercia = null; else vivo = true;
  }
  return vivo;
}
// Dibuja solo bajo demanda y solo si la esfera está a la vista: sin animación pendiente no hay bucle.
function pedir() { if (!pend && activa && gl) { pend = true; requestAnimationFrame(cuadro); } }
function cuadro() {
  pend = false; const vivo = avanzar(performance.now());
  pintar(); cuadros++;
  if (vivo) pedir();
}
function pintar() {
  if (!gl) return;
  const c = gl.camera;
  c.position.set(0, 0, cam.d); c.setViewOffset(W, Hh, cam.shift, 0, W, Hh); c.updateMatrixWorld();
  gl.globo.quaternion.copy(cam.q); gl.ojos.material.uniforms.uRev.value = cam.rev;
  gl.renderer.render(gl.scene, c);
  superponer();
}
function medir() {
  W = cont.clientWidth || 1; Hh = cont.clientHeight || 1;
  if (!gl) return;
  gl.renderer.setSize(W, Hh, false); gl.camera.aspect = W / Hh;
  if (!meta) { cam.d = Math.min(cam.d, d0()); if (!S.foco) cam.d = d0(); cam.shift = shift0(); }
  pedir();
}

/* ---------- capa HTML: etiquetas proyectadas en cada cuadro ---------- */
const P = { x: 0, y: 0, cara: 0 }, t1 = new T.Vector3(), t2 = new T.Vector3();
function proy(v) {
  t1.copy(v).applyQuaternion(cam.q); t2.copy(gl.camera.position).sub(t1).normalize();
  P.cara = t2.dot(t1) / (t1.length() || 1);
  t1.project(gl.camera); P.x = (t1.x * 0.5 + 0.5) * W; P.y = (0.5 - t1.y * 0.5) * Hh; return P;
}
const pon = (el, x, y) => { el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)'; };
let fondo = [], nucleoB = null;

function crearEtiquetas() {
  etiquetas.textContent = '';
  caps.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cap-b'; c.boton = b; b._c = c;
    // ya dentro del casquete, Intro abre el equipo que las flechas señalan
    b.addEventListener('click', () => { if (escan) return; if (c === S.foco && S.hover && S.hover.cap === c) op.alElegir(S.hover.e); else enfocar(c); });
    b.addEventListener('mouseenter', () => { if (escan) return; S.hoverCap = c; marcar(); });
    b.addEventListener('mouseleave', () => { S.hoverCap = null; marcar(); });
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) mostrar([c.c]); });
    b.addEventListener('blur', () => { if (S.hover) { S.hover = null; marcar(); } });
    etiquetas.appendChild(b);
  });
  textoCaps();
  // la puerta de enlace: HERA no la nombra; se toma el router (el de IP .1 si hay varios)
  const modem = devs.find((d) => d.e.tipo === 'router' && /\.1$/.test(d.e.ip)) || devs.find((d) => d.e.tipo === 'router');
  nucleoB = document.createElement('button'); nucleoB.type = 'button'; nucleoB.className = 'nucleo-b';
  nucleoB.innerHTML = modem ? ojo(modem.e.estado) + 'Módem · ' + EST[modem.e.estado].t.toLowerCase() : 'Módem';
  if (modem) nucleoB.addEventListener('click', () => { if (!escan) op.alElegir(modem.e); });
  etiquetas.appendChild(nucleoB);
  fondo = [];
  for (let i = 0; i < 70; i++) { const d = document.createElement('div'); d.className = 'eq'; d.hidden = true; etiquetas.appendChild(d); fondo.push(d); }
}
// Teclado: Tab recorre los casquetes; dentro del que está abierto, las flechas recorren sus equipos.
function teclas(ev) {
  const c = ev.target._c, paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
  if (!c || c !== S.foco || !paso) return;
  ev.preventDefault();
  const l = c.devs.filter(coincide); if (!l.length) return;
  const k = l.indexOf(S.hover), d = l[k < 0 ? (paso > 0 ? 0 : l.length - 1) : (k + paso + l.length) % l.length];
  S.hover = d; marcar();
  op.decir(d.e.nombre + ', ' + d.e.ip + ', ' + EST[d.e.estado].t.toLowerCase() + '. Intro para abrir su ficha.');
}
function cuenta(c) {
  const partes = [];
  if (c.riesgo) partes.push('<span class="r">' + c.riesgo + ' en riesgo</span>');
  if (c.alerta) partes.push('<span class="a">' + c.alerta + ' en alerta</span>');
  return partes.length ? partes.join(' · ') : '<span class="s">sin pendientes</span>';
}
const equipos = (c, n) => (n === c.n ? plural(c.n, 'equipo', 'equipos') : n + ' de ' + c.n + ' equipos') + (c.prueba ? ' <span class="prueba">de prueba</span>' : '');
function textoCaps() {
  const sabe = !escan || escan.ojos;
  caps.forEach((c) => {
    c.boton.innerHTML = '<b>' + (sabe ? ojo(c.peor) : '') + esc(c.nombre) + '</b><span>' + equipos(c, c.devs.filter(coincide).length) + (sabe ? '<br>' + cuenta(c) : '') + '</span>';
    c.bw = c.boton.offsetWidth / 2 + 6;
    c.boton.setAttribute('aria-label', c.nombre + ', ' + plural(c.n, 'equipo', 'equipos') + (c.prueba ? ' de prueba' : '') + ', ' + c.riesgo + ' en riesgo, ' + c.alerta + ' en alerta');
  });
}
function pintarPie() {
  const c = S.foco;
  if (!c) { pie.innerHTML = '<span class="ayuda">Arrastra para girar. Rueda o clic en un ' + (modo === 'segmento' ? 'segmento' : 'grupo') + ' para acercar.</span>'; return; }
  pie.innerHTML = '<button type="button">Esfera completa</button><i aria-hidden="true">/</i><strong>' + esc(c.nombre) + '</strong><span class="det">' + equipos(c, c.n) + ' · ' + cuenta(c) + '</span>';
  pie.firstChild.addEventListener('click', () => enfocar(null));
}

function superponer() {
  const ppu = Hh / (2 * TF * Math.max(0.4, cam.d - 1)); // píxeles por unidad sobre la superficie cercana
  const est = op.estorbos(), tapa = (x, y, bw) => est.some((o) => x + bw > o.left - 4 && x - bw < o.right + 4 && y + 28 > o.top && y - 28 < o.bottom);
  let libre = true; const centro = proy(t2.set(0, 0, 0)), cx = centro.x, cy = centro.y;
  if (pie._x !== Math.round(cx)) { pie._x = Math.round(cx); pie.style.left = pie._x + 'px'; }
  const ocupados = []; // las etiquetas de casquete no se apilan: gana la de más riesgo, las demás se apagan
  caps.slice().sort((a, b) => EST[b.peor].n - EST[a.peor].n).forEach((c) => {
    // con equipos encendidos dentro: si son pocos llevan nombre y la etiqueta del casquete se quita; si son muchos, baja y deja ver el racimo
    const p = proy(c.c), con = c.rad >= 0 && S.res.size <= 12;
    if (c.rad >= 0 && !con) p.y += (Math.sin(c.rad) + c.tam) * ppu * Math.max(0.5, p.cara) + 30;
    p.x = clamp(p.x, c.bw, W - c.bw);
    let fuera = p.cara < 0.2 || (c === S.foco && cam.rev > 0.4) || con || !visto(c) || tapa(p.x, p.y, c.bw); // nunca debajo del menú
    if (!fuera) { const r = { a: p.x - c.bw, b: p.x + c.bw, c: p.y - 26, d: p.y + 26 };
      if (ocupados.some((o) => r.a < o.b && r.b > o.a && r.c < o.d && r.d > o.c)) fuera = true; else ocupados.push(r); }
    c.boton.classList.toggle('atras', fuera); c.boton.classList.toggle('lejos', !!S.foco); c.boton.classList.toggle('nada', !c.pasan);
    pon(c.boton, p.x, p.y);
    if (!fuera && Math.abs(p.x - cx) < 150 && Math.abs(p.y - (cy + 34)) < 40) libre = false;
  });
  nucleoB.hidden = !libre || cam.rev > 0.4 || !!escan; if (!nucleoB.hidden) pon(nucleoB, cx, cy + 34);

  // etiquetas de equipo: primero lo urgente; lo demás solo cuando hay sitio
  const cand = [], puestos = [], ojos = [];
  const mete = (d, pri) => { const p = proy(d.pos); if (p.cara < 0.25 || p.x < 50 || p.x > W - 50 || p.y < 20 || p.y > Hh - 40) return;
    const e = d.cap.tam * ppu; if (d === S.sel) puestos.push({ a: p.x - e * 1.8, b: p.x + e * 1.8, c: p.y - e * 1.8, d: p.y + e * 1.8 }); // nada tapa al elegido
    else ojos.push({ a: p.x - e * 0.9, b: p.x + e * 0.9, c: p.y - e * 0.45, d: p.y + e * 0.45 });
    if (pri >= 0) cand.push({ d: d, pri: pri, x: p.x, y: p.y }); };
  let todas = true; const dentro = S.foco && cam.rev > 0.5;
  if (dentro) {
    todas = S.foco.tam * 2 * ppu > 58;
    S.foco.devs.forEach((d) => { if (!coincide(d)) return;
      const pri = d === S.hover ? -1 : d === S.sel ? 0 : S.res.has(d) ? 1 : d.e.estado === 'riesgo' ? 2 : d.e.estado === 'alerta' ? 3 : 4;
      mete(d, pri < 4 || todas ? pri : -1); });
  }
  if (S.sel && !(dentro && S.sel.cap === S.foco)) mete(S.sel, 0);
  // muchos resaltados a la vez (una acción del plan que toca a decenas): bastan los aros, sin sembrar nombres
  if (S.res.size <= 12) S.res.forEach((d) => { if (d !== S.hover && d !== S.sel && !(dentro && d.cap === S.foco)) mete(d, 1); });
  cand.sort((a, b) => a.pri - b.pri);
  let usados = 0;
  for (let i = 0; i < cand.length && usados < fondo.length; i++) {
    const k = cand[i], d = k.d, alto = d === S.sel ? d.cap.tam * ppu * 1.9 + 18 : d.cap.tam * ppu * (k.pri < 2 ? 1.1 : 0.5) + 19;   // el elegido lleva su nombre bajo el aro
    const w = Math.min(130, Math.max(d.e.nombre.length * 6.5, 40)) + 8, r = { a: k.x - w / 2, b: k.x + w / 2, c: k.y + alto - 13, d: k.y + alto + 14 };
    const choca = (o) => r.a < o.b && r.b > o.a && r.c < o.d && r.d > o.c;
    if (puestos.some(choca) || (k.pri >= (todas ? 4 : 3) && ojos.some(choca))) continue; // el riesgo se nombra aunque roce un ojo vecino
    puestos.push(r);
    const el = fondo[usados++];
    if (el._d !== d) { el._d = d; el.innerHTML = '<b>' + esc(d.e.nombre) + '</b><i>.' + esc(d.e.ip.split('.').pop()) + '</i>'; }
    el.hidden = false; pon(el, k.x, k.y + alto);
  }
  for (let i = usados; i < fondo.length; i++) fondo[i].hidden = true;

  // pista bajo el cursor
  const h = S.hover, ph = h && proy(h.pos);
  if (h && ph.cara > 0.1) {
    if (pista._d !== h) { pista._d = h; pista.innerHTML = '<b>' + ojo(h.e.estado) + ' ' + esc(h.e.nombre) + '</b><span><span class="ip">' + esc(h.e.ip) + '</span> · ' + esc(UNO[h.e.tipo] || h.e.tipo) + ' · ' + EST[h.e.estado].t + '</span>'; }
    pista.hidden = false;
    const pw = pista.offsetWidth, px = clamp(ph.x - pw / 2, 8, W - pw - 8), py = ph.y - h.cap.tam * ppu * 1.5 - pista.offsetHeight - 6;
    pista.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py < 8 ? ph.y + h.cap.tam * ppu * 1.5 + 8 : py) + 'px)';
  } else pista.hidden = true;
}

/* ---------- elegir con el puntero: rayo contra la esfera, sin recorrer mallas ---------- */
const ndc = new T.Vector2(), golpe = new T.Vector3(), qi = new T.Quaternion();
function tocar(ev) {
  if (!gl) return {};
  const r = lienzo.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / W * 2 - 1, 1 - (ev.clientY - r.top) / Hh * 2);
  gl.ray.setFromCamera(ndc, gl.camera);
  if (!gl.ray.ray.intersectSphere(gl.esfera, golpe)) return {};
  golpe.normalize().applyQuaternion(qi.copy(cam.q).invert());
  const cap = caps.find((c) => golpe.dot(c.c) > Math.cos(c.theta));
  // equipos visibles: los del casquete enfocado y los resaltados
  let mejor = null, md = 0;
  const prueba = (d) => { const k = golpe.dot(d.pos); if (k > md && k > Math.cos(d.cap.tam * 1.25) && coincide(d)) { md = k; mejor = d; } };
  if (cap) cap.devs.forEach(prueba); // el casquete bajo el puntero muestra sus ojos y cada uno da su ficha
  S.res.forEach(prueba); if (S.sel) prueba(S.sel);
  return { cap: cap, dev: mejor };
}

const punteros = new Map(); let arrastre = null;
function alBajar(ev) {
  lienzo.setPointerCapture(ev.pointerId); punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (punteros.size === 1) { arrastre = { x0: ev.clientX, y0: ev.clientY, movido: false, t: performance.now(), eje: new T.Vector3(0, 1, 0), v: 0 }; inercia = null; }
  else arrastre = { pinza: distPinza(), movido: true };
}
const distPinza = () => { const p = Array.from(punteros.values()); return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
function alMover(ev) {
  const p = punteros.get(ev.pointerId);
  if (!p) { // sin botón: solo señalar
    const t = escan ? {} : tocar(ev), hc = t.cap && t.cap !== S.foco ? t.cap : null;
    lienzo.classList.toggle('apunta', !!(t.dev || hc));
    if ((t.dev || null) !== S.hover || hc !== S.hoverCap) { S.hover = t.dev || null; S.hoverCap = hc; marcar(); }
    return;
  }
  const dx = ev.clientX - p.x, dy = ev.clientY - p.y; p.x = ev.clientX; p.y = ev.clientY;
  if (punteros.size === 2 && arrastre.pinza) { const d = distPinza(); acercar(arrastre.pinza / d); arrastre.pinza = d; return; }
  if (!arrastre || arrastre.pinza) return;
  if (!arrastre.movido && Math.hypot(ev.clientX - arrastre.x0, ev.clientY - arrastre.y0) < 4) return;
  if (!arrastre.movido) { arrastre.movido = true; soltarMeta(); lienzo.classList.add('agarra'); if (S.hover) { S.hover = null; marcar(); } }
  const dist = Math.hypot(dx, dy); if (!dist) return;
  const ang = dist / (Hh / (2 * TF * Math.max(0.5, cam.d - 0.55))), ahora = performance.now(), dt = Math.max(1, ahora - arrastre.t);
  arrastre.eje.set(dy / dist, dx / dist, 0); arrastre.v = ang / dt; arrastre.t = ahora;
  cam.q.premultiply(new T.Quaternion().setFromAxisAngle(arrastre.eje, ang)); pedir();
}
function alSubir(ev) {
  if (!punteros.delete(ev.pointerId)) return;
  lienzo.classList.remove('agarra');
  const a = arrastre; arrastre = null; if (!a) return;
  if (a.pinza) { punteros.clear(); return; }
  if (!a.movido) { if (ev.type === 'pointerup') clic(ev); return; }
  if (!reducido() && performance.now() - a.t < 70 && a.v > 2e-4) { inercia = { eje: a.eje.clone(), v: Math.min(a.v, 0.006) }; ultimo = performance.now(); pedir(); }
}
function clic(ev) {
  if (escan) return;
  const t = tocar(ev);
  // ficha solo si el ojo está a la vista (enfocado, resaltado o bajo el puntero); el resto del casquete acerca
  if (t.dev && (t.dev.cap === S.foco || t.dev === S.hover || S.res.has(t.dev) || t.dev === S.sel)) op.alElegir(t.dev.e);
  else if (t.cap && t.cap !== S.foco) enfocar(t.cap);
  else if (t.dev) op.alElegir(t.dev.e);
  else if (t.cap && S.sel) { S.sel = null; marcar(); }
}
// Zoom semántico: al cruzar el umbral cambia lo que se muestra, no solo el tamaño.
function acercar(factor) {
  if (escan) return;
  soltarMeta(); inercia = null;
  const base = d0(); cam.d = clamp(cam.d * factor, 1.32, base);
  if (!S.foco && cam.d < base * 0.8) {
    const frente = new T.Vector3(0, 0, 1).applyQuaternion(qi.copy(cam.q).invert());
    let mejor = null, md = 9; caps.forEach((c) => { const a = Math.acos(clamp(frente.dot(c.c), -1, 1)) - c.theta; if (a < md) { md = a; mejor = c; } });
    S.foco = mejor; ir({ rev: 1 }, 220); alCambiar();
  } else if (S.foco && cam.d > base * 0.94) { S.foco = null; S.sel = null; ir({ rev: 0 }, 220); alCambiar(); }
  else pedir();
}

/* ---------- niveles: la esfera entera o un casquete ---------- */
function alCambiar() { pintarPie(); marcar(); }
function enfocar(c) {
  S.sel = null; S.hover = null; S.hoverCap = null; S.foco = c;
  if (c) { ir({ q: qCara(c.c, c.y), d: dCap(c), shift: shift0(), rev: 1 }); op.decir(c.nombre + ': ' + plural(c.n, 'equipo', 'equipos') + ', ' + c.riesgo + ' en riesgo, ' + c.alerta + ' en alerta. Usa las flechas para recorrerlos.'); }
  else { ir({ d: d0(), shift: shift0(), rev: 0 }); op.decir('Esfera completa.'); }
  alCambiar();
}
// Gira lo justo para que algo resaltado no quede en la cara oculta.
function mostrar(dirs) {
  if (!dirs.length || !gl) return;
  const m = new T.Vector3(); dirs.forEach((v) => m.add(v)); if (m.lengthSq() < 1e-6) return; m.normalize();
  const z = t1.copy(m).applyQuaternion(meta ? meta.a.q : cam.q).z;
  if (z < 0.55) ir({ q: qCara(m, arribaActual()) }, 420);
}

/* ---------- sin WebGL: los mismos casquetes como lista, con teclado ---------- */
function listaPlana() {
  agrupar();
  const raiz = $('sin3d-lista'); if (!raiz) return;
  const fila = (c) => '<li><button data-c="' + c.i + '"><b>' + esc(c.nombre) + '</b> ' + plural(c.n, 'equipo', 'equipos') + ' · ' + EST[c.peor].t + '</button></li>';
  const verCaps = () => { raiz.innerHTML = '<ul>' + caps.map(fila).join('') + '</ul>'; raiz.querySelector('button').focus({ preventScroll: true }); };
  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const c = +b.dataset.c;
    if (c < 0) return verCaps();
    if (b.dataset.k != null) return op.alElegir(caps[c].devs[+b.dataset.k].e);
    raiz.innerHTML = '<button data-c="-1">← Todos los casquetes</button><h2>' + esc(caps[c].nombre) + '</h2><ul>' + caps[c].devs.map((d, k) => '<li><button data-c="' + c + '" data-k="' + k + '">' + ojo(d.e.estado) + '<b>' + esc(d.e.nombre) + '</b> ' + esc(d.e.ip) + ' · ' + EST[d.e.estado].t + '</button></li>').join('') + '</ul>';
    raiz.querySelector('button').focus({ preventScroll: true });
  });
  raiz.innerHTML = '<ul>' + caps.map(fila).join('') + '</ul>';
}

/* ---------- lo que app.js maneja ---------- */
const api = {
  ok: false,
  get caps() { return caps.map((c) => c.nombre); },
  get elegido() { return S.sel ? S.sel.e : null; },
  get cuadros() { return cuadros; },
  // a la vista o no. Al aparecer se acerca un poco: llega, no se enciende de golpe.
  activar(on) {
    if (on === activa) return; activa = on; if (!on || !gl) return;
    medir();
    if (!S.foco && !reducido()) { cam.d = d0() * 1.16; ir({ d: d0() }, 900); }
    pedir();
  },
  // el menú cambió de sitio (red, plan): se reencuadra en el hueco libre
  encuadrar(izq, der) {
    if (!gl || (enc.izq === izq && enc.der === der)) return;
    enc.izq = izq; enc.der = der; ir({ d: dAhora(), shift: shift0() }, 620);
  },
  // equipos a encender (una acción del plan, pocos resultados del buscador); también refresca filtro y cuentas
  // `girar`: el filtro o la búsqueda acaban de cambiar; si lo que coincide quedó en la cara oculta, la esfera gira hacia ello
  resaltar(lista, girar) {
    if (!gl) return;
    const antes = S.res; S.res = new Set(lista.map((e) => porE.get(e)).filter(Boolean));
    textoCaps(); marcar();
    if (S.res.size) { if (S.res.size !== antes.size || Array.from(S.res).some((d) => !antes.has(d))) mostrar(Array.from(S.res).map((d) => d.pos)); }
    else if (girar && !S.foco) { const con = caps.filter((c) => c.pasan); if (con.length < caps.length) mostrar(con.map((c) => c.c.clone().multiplyScalar(c.pasan))); }
  },
  enfocar(i) { if (gl) enfocar(i == null ? null : caps[clamp(i, 0, caps.length - 1)]); },
  // el equipo cuya ficha se abrió: al volver, su casquete está al frente y él lleva el aro claro
  elegir(e) {
    const d = e && porE.get(e); if (!gl) return;
    if (!d) { if (S.sel) { S.sel = null; marcar(); } return; }
    S.sel = d; S.foco = d.cap; S.hover = null; S.hoverCap = null;
    ir({ q: qCara(d.cap.c, d.cap.y), d: dCap(d.cap), shift: shift0(), rev: 1 });
    alCambiar();
  },
  atras() { if (!S.foco && !S.sel) return false; enfocar(null); return true; },
  // escaneo: k casquetes ya vistos; ojos = ya se sabe en qué estado está cada uno. null = sin escaneo.
  escaneo(k, ojos) {
    if (!gl || (k == null && !escan)) return;
    if (k != null && !escan && S.foco) { S.foco = null; S.sel = null; ir({ d: d0(), shift: shift0(), rev: 0 }, 0); pintarPie(); }
    escan = k == null ? null : { k: k, ojos: !!ojos };
    cont.classList.toggle('escan', !!escan);
    if (escan && !ojos && k > 0 && k <= caps.length) ir({ q: qCara(caps[k - 1].c, arribaActual()) }, 600);   // el casquete que acaba de aparecer viene al frente
    textoCaps(); marcar();
  },
};

// los elementos son del esqueleto de index.html: al remontar, main.ts los cambia por otros y sus oyentes se van con ellos
let ro = null;
api.destruir = () => { activa = false; if (ro) ro.disconnect(); if (gl) { gl.renderer.dispose(); gl.renderer.forceContextLoss(); gl = null; } };
cont = $('esfera'); lienzo = $('lienzo'); etiquetas = $('etiquetas'); pista = $('pista'); pie = $('esf-pie');
if (H.equipos.length) iniciar3D();   // sin equipos no hay esfera que dibujar: queda el abanico (primer arranque)
api.ok = !!gl;
if (!gl) { if (H.equipos.length) listaPlana(); return api; }
construir(); montar(); crearEtiquetas();
const c0 = caps[0]; cam.q.copy(qCara(va.copy(c0.c).addScaledVector(c0.x, 0.42).addScaledVector(c0.y, -0.2).clone(), c0.y));
medir(); pintarPie(); marcar();
lienzo.addEventListener('pointerdown', alBajar); lienzo.addEventListener('pointermove', alMover);
lienzo.addEventListener('pointerup', alSubir); lienzo.addEventListener('pointercancel', alSubir);
lienzo.addEventListener('pointerleave', () => { if (!punteros.size && (S.hover || S.hoverCap)) { S.hover = null; S.hoverCap = null; marcar(); } });
cont.addEventListener('wheel', (ev) => { ev.preventDefault(); acercar(Math.exp(clamp(ev.deltaY, -240, 240) * 0.0013)); }, { passive: false }); // también sobre las etiquetas
etiquetas.addEventListener('keydown', teclas);
ro = new ResizeObserver(medir); ro.observe(cont);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (gl) { textoCaps(); pedir(); } });
return api;
}
