// Óptica de la pluma: barbas y raquis instanciados + ocelos por SDF. Toda la geometría sale del
// vertex shader a partir de un puñado de valores por pluma, así los muelles de app.js solo mueven números.
import * as T from "three";

// nPlumas: cuántos equipos hay. Los valores por pluma viajan como uniformes (3 vec4 por pluma).
// shortcut: tope práctico de unas 300 plumas por el límite de uniformes del vertex shader; con redes mayores, pasarlos por textura.
export function crear(canvas, nPlumas) {
  const N = Math.max(1, nPlumas), NB = 56, EYE_U = 0.9, LREF = 760;
  const COMUN = `
    precision highp float;
    uniform vec4 uA[${N}]; uniform vec4 uB[${N}]; uniform vec4 uC[${N}];
    uniform vec2 uRes; uniform float uTime; uniform vec2 uLight; uniform float uEyeR;
    vec3 rampa(float t){
      t = fract(t) * 4.0;
      vec3 a = vec3(0.66,0.43,0.17), b = vec3(0.07,0.44,0.31), c = vec3(0.05,0.47,0.66), d = vec3(0.33,0.24,0.66);
      float f = smoothstep(0.0,1.0,fract(t));
      return t < 1.0 ? mix(a,b,f) : t < 2.0 ? mix(b,c,f) : t < 3.0 ? mix(c,d,f) : mix(d,a,f);
    }
    // La cola baja: cada pluma gira hacia atrás sobre su base, se aleja y se apaga.
    vec2 caer(vec2 W, vec2 O, float c){
      float th = clamp(c, 0.0, 1.0) * 1.5; vec2 d = W - O;
      float f = uRes.y * 1.3, s = f / (f + max(0.0, -d.y) * sin(th));
      return O + vec2(d.x, d.y * cos(th)) * s;
    }
    float velo(float c){ return 1.0 - smoothstep(0.45, 0.98, c); }
    vec3 colorEstado(float s){ return s > 1.5 ? vec3(1.0,0.38,0.22) : s > 0.5 ? vec3(0.96,0.70,0.22) : vec3(0.80,0.78,0.70); }
  `;
  const VS_BARBA = COMUN + `
    attribute vec4 aI;   // pluma, s (a lo largo del raquis), lado, azar
    attribute vec2 aJ;   // índice de barba en su lado, tipo (0 barba, 1 raquis)
    uniform float uSlotU[${NB}]; uniform float uSlotD[${NB}]; uniform float uPortLen; uniform vec3 uPortS;
    varying vec2 vT; varying float vAcross; varying float vFase; varying vec4 vMix; varying vec2 vW; varying float vTt; varying float vG; varying float vF;
    vec2 punto(float t, float s, float lado, float rnd, float k, float L, float splay, float e, float slot, out float w){
      float phi = mix(0.09, 0.62 + rnd*0.10, splay);
      float len = k * (20.0 + 104.0*smoothstep(0.05,0.9,s)) * (0.82 + 0.36*rnd) * mix(0.55,1.0,splay);
      float pt = phi * (1.0 - 0.5*t);
      vec2 p = vec2(lado*sin(pt), cos(pt)) * len * t;
      p.x += lado * (1.2*k + e * 12.0);
      w = (0.9 + 0.5*k) * (1.0 - 0.75*t);
      if (slot > -0.5) {            // barba-puerto: recta, larga, separada si está bajo el cursor
        vec2 d = vec2(lado*sin(0.9), cos(0.9));
        vec2 q = d * (uPortLen * t + 8.0); q.x += lado*4.0;
        p = mix(p, q, e); w = mix(w, 2.6 - 1.2*t, e);
      }
      return vec2(p.x, s*L + p.y);
    }
    void main(){
      int i = int(aI.x + 0.5);
      vec4 A = uA[i], B = uB[i], C = uC[i];
      float L = A.w, k = L / ${LREF}.0, e = C.x;
      float t = position.y, w; vec2 P, P2;
      float slot = -1.0;
      if (aJ.y < 0.5) {
        int j = int(aJ.x + 0.5);
        slot = aI.z > 0.0 ? uSlotU[j] : uSlotD[j];
        slot = mix(-1.0, slot, step(0.001, e));
        float w2, sB = aI.y;
        if (slot > -0.5) sB = mix(sB, uPortS.x + (aJ.x - uPortS.z) * uPortS.y, e);
        P = punto(t, sB, aI.z, aI.w, k, L, B.w, e, slot, w);
        P2 = punto(t + 0.02, sB, aI.z, aI.w, k, L, B.w, e, slot, w2);
      } else {
        P = vec2(0.0, t * L * ${EYE_U}); P2 = P + vec2(0.0, 1.0);
        w = mix(2.6, 1.1, t) * (0.6 + 0.6*k);
      }
      vec2 dir = vec2(sin(A.z), -cos(A.z)), per = vec2(cos(A.z), sin(A.z));
      vec2 W = A.xy + dir*P.y + per*P.x, W2 = A.xy + dir*P2.y + per*P2.x;
      vec2 T = normalize(W2 - W);
      W += vec2(-T.y, T.x) * position.x * (w + 0.7);
      W = caer(W, A.xy, C.w); vF = velo(C.w);
      vT = T; vAcross = position.x; vW = W; vTt = t;
      vFase = 0.08 + 0.62*aI.y + 0.30*t + 0.10*aI.w + float(i)*0.013;
      vMix = vec4(B.x, slot, aJ.y, e); vG = C.z;
      gl_Position = vec4(W.x/uRes.x*2.0-1.0, 1.0-W.y/uRes.y*2.0, 0.0, 1.0);
    }`;
  const FS_BARBA = COMUN + `
    varying vec2 vT; varying float vAcross; varying float vFase; varying vec4 vMix; varying vec2 vW; varying float vTt; varying float vG; varying float vF;
    void main(){
      vec2 Ld = uLight - vW; float dl = length(Ld); Ld /= max(dl, 1.0);
      float tl = dot(normalize(vT), Ld);
      float brillo = pow(max(0.0, 1.0 - tl*tl), 14.0);          // reflejo anisótropo: banda donde la barba cruza la luz
      float fase = vFase + 0.30*tl + dl/1700.0 + 0.03*sin(uTime*0.25 + vFase*9.0);
      float glow = vG; float e = vMix.w;
      vec3 col = rampa(fase) * (0.42 + 0.30*(1.0-abs(vAcross))) + rampa(fase+0.22) * brillo * 0.95;
      float a = (1.0 - smoothstep(0.55,1.0,abs(vAcross))) * 0.80 * (1.0 - smoothstep(0.82,1.0,vTt));
      float b = vMix.x;
      if (vMix.z > 0.5) { col = mix(vec3(0.60,0.55,0.44)*0.5, vec3(0.90,0.85,0.72), brillo*0.18 + e*0.6); a = (0.55 + 0.4*e)*(1.0 - smoothstep(0.6,1.0,abs(vAcross))); }
      else if (vMix.y > -0.5) {
        float sl = mod(vMix.y, 100.0); float f = mod(sl, 10.0), h = step(9.5, sl);
        vec3 pc = f > 0.5 ? colorEstado(f) : vec3(0.72,0.80,0.78);
        col = mix(col, pc * (0.85 + 0.35*h), e); a = mix(a, 1.0 - smoothstep(0.6,1.0,abs(vAcross)), e); b = mix(b, 1.0, e);
      } else { a *= 1.0 - 0.22*e; }
      col *= b; col += glow * rampa(fase) * 0.25;
      gl_FragColor = vec4(col * a, a) * vF;
    }`;
  const VS_OJO = COMUN + `
    attribute float aI; varying vec2 vP; varying vec4 vS; varying float vE; varying vec2 vL; varying float vF;
    void main(){
      int i = int(aI + 0.5); vec4 A = uA[i], B = uB[i], C = uC[i];
      vec2 dir = vec2(sin(A.z), -cos(A.z));
      float R = uEyeR * C.y, ae = A.z * (1.0 - C.x);          // al tenderse la pluma, el ojo se endereza para leerse
      vec2 ed = vec2(sin(ae), -cos(ae)), ep = vec2(cos(ae), sin(ae));
      vec2 c0 = A.xy + dir*A.w*${EYE_U};
      vec2 W = c0 + (ep*position.x - ed*position.y) * R * 1.4;
      vec2 lc = uLight - c0; float dl = length(lc);           // la luz, vista desde el ojo: de ahí salen el brillo, la cáustica y hacia dónde mira
      vL = vec2(dot(lc, ep), -dot(lc, ed)) / max(dl, 1.0) * min(1.0, dl / (R*4.0 + 1.0));
      W = caer(W, A.xy, C.w); vF = velo(C.w);
      vP = position.xy * 1.4; vS = vec4(B.x, B.y, B.z, C.z); vE = C.x;
      gl_Position = vec4(W.x/uRes.x*2.0-1.0, 1.0-W.y/uRes.y*2.0, 0.0, 1.0);
    }`;
  const FS_OJO = COMUN + `
    uniform vec4 uRings;  // n anillos, anillo bajo el cursor (-1 ninguno, 99 pupila), -, -
    varying vec2 vP; varying vec4 vS; varying float vE; varying vec2 vL; varying float vF;
    vec3 vidrio(float s, float t){     // la rampa de la pluma en el color del estado: gris, ámbar o brasa
      t = 0.5 - 0.5*cos(t*6.2832);
      vec3 a = vec3(0.07,0.09,0.13), b = vec3(0.40,0.45,0.52), c = vec3(0.84,0.88,0.93);
      if (s > 1.5) { a = vec3(0.30,0.01,0.03); b = vec3(0.90,0.13,0.08); c = vec3(1.0,0.50,0.30); }
      else if (s > 0.5) { a = vec3(0.40,0.19,0.01); b = vec3(0.95,0.64,0.07); c = vec3(1.0,0.90,0.48); }
      return t < 0.5 ? mix(a,b,t*2.0) : mix(b,c,t*2.0-1.0);
    }
    void main(){
      vec2 p = vP; float r = length(p), ang = atan(p.y, p.x);
      float px = fwidth(r) * 1.2;
      float bright = vS.x, open = vS.y, st = vS.z, e = vE * step(0.5, uRings.x);   // sin servicios no hay anillos que desarmar
      float k = 1.0 - e;                                       // en la ficha no hay vidrio: el ocelo se desarma
      float lm = length(vL); vec2 Ld = vL / max(lm, 0.001); vec2 pn = normalize(p + 0.0001);
      float lz = dot(pn, Ld) * lm;
      float estr = 0.86 + 0.14*sin(ang*70.0 + r*9.0);          // estrías: el ocelo también está hecho de barbas
      // anillos naturales del ocelo
      float fase = 0.05 + (1.0 - r)*0.62 + 0.10*lz + 0.02*sin(uTime*0.3);
      vec3 nat = rampa(fase) * estr * (0.55 + 0.45*smoothstep(1.0,0.2,r));
      nat = mix(nat, vec3(0.05,0.07,0.16), smoothstep(0.34,0.28,r));
      nat += pow(max(0.0, lz), 6.0) * 0.20 * rampa(fase + 0.2);
      nat *= mix(0.62, 0.40, step(0.5, st));
      // anillos desarmados: uno por familia de servicio
      float n = max(uRings.x, 1.0), rr = (r - 0.36) / 0.64 * n, kk = floor(rr), fr = fract(rr);
      float hov = step(abs(kk - uRings.y), 0.1);
      float enAnillo = step(0.36, r) * step(r, 1.0) * step(0.5, uRings.x) * smoothstep(0.0,0.10,fr - 0.16 + hov*0.10) * smoothstep(0.0,0.10,0.92 + hov*0.06 - fr);
      vec3 des = rampa(0.30 + kk*0.21 + 0.12*lz) * estr * (0.80 + 0.5*hov) * enAnillo;
      // la canica: vidrio del color del estado, con fondo. El gris deja ver el ocelo a través.
      float z = sqrt(max(0.0, 1.0 - r*r));
      float fv = (1.0 - r)*0.46 + 0.30*lz + 0.03*sin(uTime*0.3 + ang);
      vec3 tono = mix(vidrio(0.0, fv), vidrio(st, fv), open), claro = mix(vidrio(0.0, 0.5), vidrio(st, 0.5), open);
      float caust = pow(max(0.0, -dot(pn, Ld)), 2.0) * smoothstep(0.20, 0.82, r) * lm;   // la luz cruza el vidrio y se junta al otro lado
      float g = 0.5 - 0.5*dot(p, Ld)*lm;                       // 0 del lado de la luz, 1 del contrario: el vidrio se aclara hacia el fondo
      vec3 can = mix(nat * 1.7, tono * estr, mix(0.55, 0.90, open)) * (0.10 + 0.22*z + 0.58*g*g);
      can += claro * caust * 0.85;
      can *= 1.0 - 0.62*smoothstep(0.84, 1.0, r);
      vec3 col = mix(can, des, e);
      float a = mix(1.0 - smoothstep(1.0 - px, 1.0, r), max(enAnillo, step(r, 0.33)), e);
      float halo = (1.0 - smoothstep(0.96, 1.42, length(p + Ld*lm*0.16))) * 0.72 * k;   // la sombra cae al lado contrario de la luz
      // el ojo, dentro del vidrio: párpado en almendra que mira hacia la luz; al desarmar se encoge a pupila
      float sc = mix(1.0, 0.30 * (1.0 + 0.14*step(98.0, uRings.y)), e);
      vec2 q = (p - vL*0.07*k) / sc; float qr = length(q), w = 0.80;
      float h = 0.60 * open * (st > 1.5 ? 1.0 : 0.52);
      float arco = 1.0 - (q.x/w)*(q.x/w);
      float qpx = px / sc;
      vec3 ce = colorEstado(st);
      if (abs(q.x) < w) {
        float borde = abs(abs(q.y) - h*arco);
        float dentro = step(abs(q.y), h*arco);
        if (dentro > 0.5 && h > 0.02) {
          vec3 iris = mix(ce, vec3(1.0,0.95,0.78), 0.45*step(st, 1.5)*k) * (0.55 + 0.45*sin(atan(q.y,q.x)*40.0)*0.3 + 0.35*(1.0 - qr*1.6));
          vec3 in_ = mix(vec3(0.03,0.04,0.09), iris, 1.0 - smoothstep(0.40, 0.40 + qpx*2.0, qr));
          if (st > 1.5) { in_ = mix(in_, vec3(0.02,0.02,0.05), 1.0 - smoothstep(0.17, 0.17 + qpx*2.0, qr)); in_ += vec3(1.0) * (1.0 - smoothstep(0.03,0.06,length(q - vec2(-0.09,0.10)))) * 0.9 * e; }
          col = in_; a = 1.0;
        }
        float linea = 1.0 - smoothstep(0.035, 0.035 + qpx*2.0, borde);   // párpado: cerrado es una sola línea curva
        float cierra = step(h, 0.02);
        float lc = 1.0 - smoothstep(0.04, 0.04 + qpx*2.0, abs(q.y + 0.16*arco - 0.06));
        vec3 cl = mix(ce, vec3(0.74,0.76,0.72), cierra);
        float la = mix(linea, lc * 0.85, cierra) * smoothstep(w, w - 0.08, abs(q.x));
        col = mix(col, cl, la); a = max(a, la);
      }
      // anillo exterior: punteado en alerta, continuo en riesgo
      if (st > 0.5) {
        float ra = r / sc;
        float an = smoothstep(0.86,0.89,ra) * (1.0 - smoothstep(0.96,0.99,ra)) * open;
        if (st < 1.5) an *= step(0.42, fract(ang * 16.0 / 6.2832));
        col = mix(col, ce * mix(1.0, 0.35 + 0.80*g, k), an); a = max(a, an);
      }
      // la cara del vidrio: un brillo que sigue a la luz y el canto que la recoge
      float dentroC = step(r, 1.0) * k;
      float spec = pow(max(0.0, dot(vec3(p, z), normalize(vec3(Ld * (0.30 + 0.50*lm), 0.80)))), 60.0);
      col += (vec3(1.0,0.98,0.94) * spec * 0.9 + claro * pow(1.0 - z, 3.0) * 0.30) * dentroC;
      col *= bright; col += vS.w * ce * 0.10;
      vec3 derrame = claro * pow(max(0.0, -dot(pn, Ld)), 3.0) * (1.0 - smoothstep(1.0, 1.36, r)) * step(1.0, r) * 0.40 * lm * k * bright;   // luz teñida sobre la pluma
      gl_FragColor = vec4(col * a + derrame * (1.0 - a), max(a, halo)) * vF;
    }`;
  const FS_FONDO = `precision highp float; uniform vec2 uRes; uniform vec2 uLight; uniform float uTime; varying vec2 vUv;
    void main(){ vec2 p = vUv*uRes; float d = length(p - uLight)/uRes.x;
      float b = 0.5 + 0.5*sin(d*9.0 - uTime*0.12 + sin(p.x/uRes.x*3.0 + uTime*0.05)*1.4);
      vec3 c = mix(vec3(0.03,0.16,0.20), vec3(0.11,0.08,0.24), b) * (0.16 * exp(-d*1.6));
      gl_FragColor = vec4(c, 0.0); }`;

    let renderer = null;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); }
    catch (e) { console.warn("Sin WebGL: el abanico no se dibuja.", e); }
    const scene = new T.Scene(), cam = new T.Camera();
    const U = {
      uA: { value: new Float32Array(N * 4) }, uB: { value: new Float32Array(N * 4) }, uC: { value: new Float32Array(N * 4) },
      uRes: { value: new T.Vector2(1, 1) }, uTime: { value: 0 }, uLight: { value: new T.Vector2(0, 0) }, uEyeR: { value: 26 },
      uSlotU: { value: new Float32Array(NB).fill(-1) }, uSlotD: { value: new Float32Array(NB).fill(-1) }, uPortLen: { value: 150 }, uPortS: { value: new T.Vector3(0.2, 0.05, 10) },
      uRings: { value: new T.Vector4(0, -1, 0, 0) },
    };
    const mat = (vs, fs) => new T.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, side: T.DoubleSide, transparent: true, depthTest: false, depthWrite: false, blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, extensions: { derivatives: true } });
    const add = (g, m, orden) => { const o = new T.Mesh(g, m); o.frustumCulled = false; o.renderOrder = orden; scene.add(o); return o; };

    // fondo
    const gf = new T.BufferGeometry(); gf.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    add(gf, new T.ShaderMaterial({ uniforms: U, vertexShader: "varying vec2 vUv; void main(){ vUv = vec2(position.x*0.5+0.5, 0.5-position.y*0.5); gl_Position = vec4(position.xy,0.0,1.0); }", fragmentShader: FS_FONDO, transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending }), 0);

    // tira de la barba: 8 tramos
    const SEG = 8, pos = [], idx = [];
    for (let s = 0; s <= SEG; s++) pos.push(-1, s / SEG, 0, 1, s / SEG, 0);
    for (let s = 0; s < SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const gb = new T.InstancedBufferGeometry(); gb.setAttribute("position", new T.BufferAttribute(new Float32Array(pos), 3)); gb.setIndex(idx);
    const aI = [], aJ = [];
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // hilera larga al fondo, corta al frente
    const ordenTier = [...Array(N).keys()].sort((a, b) => [0, 2, 1][a % 3] - [0, 2, 1][b % 3]);
    for (const i of ordenTier) {
      for (let j = 0; j < NB; j++) for (const lado of [1, -1]) { aI.push(i, 0.1 + 0.88 * Math.pow(j / (NB - 1), 0.8), lado, rnd()); aJ.push(j, 0); }
      aI.push(i, 0, 0, 0); aJ.push(0, 1);
    }
    gb.setAttribute("aI", new T.InstancedBufferAttribute(new Float32Array(aI), 4)); gb.setAttribute("aJ", new T.InstancedBufferAttribute(new Float32Array(aJ), 2));
    gb.instanceCount = nPlumas ? aJ.length / 2 : 0;
    add(gb, mat(VS_BARBA, FS_BARBA), 1);

    const go = new T.InstancedBufferGeometry(); go.setAttribute("position", new T.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); go.setIndex([0, 1, 2, 0, 2, 3]);
    go.setAttribute("aI", new T.InstancedBufferAttribute(new Float32Array(ordenTier), 1)); go.instanceCount = nPlumas ? N : 0;
    add(go, mat(VS_OJO, FS_OJO), 2);

    return {
      U, N, NB, EYE_U, LREF, barbas: gb.instanceCount,
      s: (j) => 0.1 + 0.88 * Math.pow(j / (NB - 1), 0.8),
      sinGL: !renderer,
      resize(w, h) { renderer && renderer.setSize(w, h, false); U.uRes.value.set(w, h); },
      render() { renderer && renderer.render(scene, cam); },
      destruir() { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } },
    };
}
