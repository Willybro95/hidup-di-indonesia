// ================= HIDUP DI INDONESIA · 3D board (Three.js r128, global THREE) =================
// Owns the WebGL scene: an island board in the sea, tiles, landmarks, vehicle tokens, buildings, dice, card draws,
// and money pop-ups. The UI calls sync() with committed state; rules and money live in the engine.
import { BOARD, GROUPS, PCOLORS, AVATARS, rpShort } from '../supabase/functions/_shared/engine.js';

// ---------- hexagon geometry (shared with the 2D fallback) ----------
// 6 sides × 6 spaces. Vertex k sits at angle 60°+60°k (x right, z toward the viewer); space 0 is the bottom-right
// vertex and play runs left along the bottom edge, then around. Corner spaces sit on the vertices.
export const HexGeo = (() => {
  const SP = 1.15, R = 6 * SP, W = 1.05, D = 1.2, CR = 0.6;
  const V = k => { const a = (60 + 60 * (k % 6)) * Math.PI / 180; return [R * Math.cos(a), R * Math.sin(a)]; };
  function tile(i) {
    const k = Math.floor(i / 6), t = i % 6, [ax, az] = V(k), [bx, bz] = V(k + 1);
    let ex = bx - ax, ez = bz - az; const L = Math.hypot(ex, ez); ex /= L; ez /= L;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ml = Math.hypot(mx, mz), nx = -mx / ml, nz = -mz / ml;
    if (t === 0) { const ul = Math.hypot(ax, az); return { x: ax, z: az, nx: -ax / ul, nz: -az / ul, ex, ez, corner: true }; }
    const px = ax + (bx - ax) * t / 6, pz = az + (bz - az) * t / 6;
    return { x: px + nx * D / 2, z: pz + nz * D / 2, nx, nz, ex, ez, corner: false };
  }
  const rotY = t => Math.atan2(-t.nx, -t.nz);                 // 3D: texture top faces the centre
  const rotSvg = t => Math.atan2(t.nx, -t.nz) * 180 / Math.PI; // 2D: same, in SVG degrees
  const vertices = () => [0, 1, 2, 3, 4, 5].map(V);
  const innerR = () => (R * Math.cos(Math.PI / 6) - D) / Math.cos(Math.PI / 6);
  return { tile, rotY, rotSvg, vertices, innerR, R, W, D, CR, SP };
})();

export const Board3D = (() => {
  let renderer, scene, camera, controls, raf = 0, host = null, ok = false, water = null, waterBase = null;
  const tiles = [], strips = [], flags = [], builds = [], pawns = {}, tweens = [], lastCash = {}, lastH = {};
  let dice = [], ring = null, selRing = null, onPick = null, animating = null, lastSync = null, decks = {}, follow = null;
  const clock = { t: 0 }, ro = { obs: null };
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });

  function tilePos(i) { const t = HexGeo.tile(i); return new THREE.Vector3(t.x, 0, t.z); }
  function inward(i) { const t = HexGeo.tile(i); return new THREE.Vector3(t.nx, 0, t.nz); }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c) { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return t; }
  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(' '); let line = ''; const lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line); const y0 = y - (lines.length - 1) * lh / 2; lines.forEach((l, k) => ctx.fillText(l, x, y0 + k * lh));
  }
  const ICON = { start: '💰', event: '🍀', reality: '📰', jam: '🚗', rest: '🌴', gojam: '🚧', utility: '💡', market: '🏮', arisan: '🎉' };
  const CORNER_BG = { start: '#FFE08A', jam: '#FFD2C2', rest: '#CDEFC4', gojam: '#FFD0D6', market: '#FFE3B3', arisan: '#E7D9FF' };
  const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
  function tileTexture(i) {
    const s = BOARD[i], corner = i % 6 === 0, H = corner ? 256 : 292, c = canvas(256, H), x = c.getContext('2d');
    x.fillStyle = corner ? CORNER_BG[s.t] : '#FFF8E8'; x.fillRect(0, 0, 256, H);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#17201B';
    if (s.t === 'city') {
      x.fillStyle = GROUPS[s.g].color; x.fillRect(0, 0, 256, 74);
      x.fillStyle = '#17201B'; x.font = `800 38px ${FONT}`; wrapText(x, s.n.toUpperCase(), 128, 158, 230, 40);
      x.font = `700 30px ${FONT}`; x.fillText(rpShort(s.price), 128, 252);
    } else if (corner) {
      x.font = `800 34px ${FONT}`; wrapText(x, s.n.toUpperCase(), 128, 200, 220, 36);
    } else {
      let ic = ICON[s.t] || '•';
      if (s.t === 'transport') ic = s.n.includes('Ferry') ? '⛴️' : s.n.includes('Air') ? '✈️' : '🚆';
      if (s.t === 'utility') ic = s.n.includes('Water') ? '🚰' : '💡';
      const bg = { event: '#DDF3D8', reality: '#FFE1DF' }[s.t]; if (bg) { x.fillStyle = bg; x.fillRect(0, 0, 256, H); }
      x.fillStyle = '#17201B'; x.font = '84px serif'; x.fillText(ic, 128, 88);
      x.font = `800 32px ${FONT}`; wrapText(x, s.n.toUpperCase(), 128, 182, 236, 34);
      if (s.price) { x.font = `700 28px ${FONT}`; x.fillText(rpShort(s.price), 128, 258); }
    }
    if (!corner) { x.strokeStyle = '#17201B'; x.lineWidth = 6; x.strokeRect(3, 3, 250, H - 6); }
    return tex(c);
  }

  // ---------- the archipelago in the middle: raised islands with a pin for every city ----------
  const ISLANDS = [
    [[.02, .14], [.08, .10], [.16, .25], [.24, .42], [.28, .58], [.24, .62], [.17, .52], [.09, .36], [.03, .22]],
    [[.27, .66], [.34, .64], [.45, .67], [.52, .70], [.51, .73], [.40, .72], [.30, .70]],
    [[.33, .30], [.40, .18], [.48, .15], [.52, .22], [.50, .38], [.44, .48], [.37, .46], [.32, .38]],
    [[.55, .28], [.62, .22], [.67, .24], [.60, .30], [.60, .35], [.66, .33], [.64, .38], [.60, .42], [.61, .52], [.58, .53], [.56, .42], [.55, .36]],
    [[.80, .35], [.86, .30], [.93, .36], [.99, .40], [.99, .62], [.93, .60], [.87, .50], [.82, .45]],
  ];
  const SMALL = [[.545, .725, .012], [.585, .735, .011], [.62, .742, .012], [.68, .75, .013], [.72, .38, .014], [.75, .45, .011], [.70, .50, .01]];
  const DOTS = { Kupang: [.665, .78], Mataram: [.555, .73], Padang: [.11, .40], Medan: [.085, .22], Palembang: [.22, .52], Pontianak: [.36, .33], Balikpapan: [.50, .38], Samarinda: [.49, .32], Makassar: [.57, .51], Manado: [.66, .245], Palu: [.565, .33], 'Labuan Bajo': [.64, .745], Ambon: [.73, .45], Jayapura: [.965, .39], Semarang: [.41, .67], Solo: [.425, .69], Yogyakarta: [.41, .705], Bandung: [.33, .69], Surabaya: [.475, .685], Malang: [.47, .71], Bali: [.535, .725], Jakarta: [.305, .665] };
  const MAP = { w: 8.4, h: 4.4, x0: -4.2, z0: -1.25 };
  const mapXZ = ([a, b]) => [MAP.x0 + a * MAP.w, MAP.z0 + b * MAP.h];
  function seaTexture() {
    const c = canvas(1024, 1024), x = c.getContext('2d');
    const gr = x.createRadialGradient(512, 560, 80, 512, 512, 620); gr.addColorStop(0, '#2AA3B3'); gr.addColorStop(1, '#0F5A6E'); x.fillStyle = gr; x.fillRect(0, 0, 1024, 1024);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 3;
    for (let k = 0; k < 26; k++) { const y = 40 + k * 38; x.beginPath(); for (let px = 0; px <= 1024; px += 16) x.lineTo(px, y + Math.sin(px / 40 + k) * 5); x.stroke(); }
    x.textAlign = 'center'; x.fillStyle = '#FFF8E8'; x.font = '400 86px Bungee, "Arial Black", Impact, sans-serif'; x.fillText('HIDUP DI', 512, 190);
    x.fillStyle = '#FFBE1A'; x.fillText('INDONESIA', 512, 282);
    x.fillStyle = 'rgba(255,248,232,.9)'; x.font = `800 32px ${FONT}`; x.fillText('SALARY IN, TROUBLE OUT', 512, 850);
    return tex(c);
  }
  function buildArchipelago() {
    const grp = new THREE.Group(), sand = M('#E9D9A6', { roughness: .9 }), green = M('#7DBE6A', { roughness: .85 });
    const shapeOf = (pts) => { const s = new THREE.Shape(); pts.forEach((p, k) => { const [x, z] = mapXZ(p); k ? s.lineTo(x, -z) : s.moveTo(x, -z); }); s.closePath(); return s; };
    for (const pts of ISLANDS) {
      const geo = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .04, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, sand); m.castShadow = m.receiveShadow = true; grp.add(m);
      const top = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(pts)).rotateX(-Math.PI / 2), green); top.scale.set(.9, 1, .9);
      const cx = pts.reduce((s, p) => s + mapXZ(p)[0], 0) / pts.length, cz = pts.reduce((s, p) => s + mapXZ(p)[1], 0) / pts.length;
      top.position.set(cx * .1, .115, cz * .1); top.receiveShadow = true; grp.add(top);
    }
    for (const [a, b, r] of SMALL) { const [x, z] = mapXZ([a, b]); const m = new THREE.Mesh(new THREE.CylinderGeometry(r * MAP.w, r * MAP.w * 1.15, .1, 10), sand); m.position.set(x, .05, z); m.castShadow = true; grp.add(m); }
    for (const s of BOARD) if (s.t === 'city') {
      const [x, z] = mapXZ(DOTS[s.n]), pin = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .26, 6), M('#17201B')); stick.position.y = .13;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), M(GROUPS[s.g].color, { roughness: .35 })); head.position.y = .28;
      head.castShadow = true; pin.add(stick, head); pin.position.set(x, .1, z); grp.add(pin);
    }
    return grp;
  }

  // ---------- props: landmarks, trees, tokens, buildings ----------
  function palm(h = .7) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.03, .05, h, 6), M('#8B5A3C')); trunk.position.y = h / 2; trunk.rotation.z = .12; g.add(trunk);
    for (let k = 0; k < 5; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(.06, .45, 4), M('#2E9E5B')); leaf.position.set(Math.cos(k * 1.26) * .16 + .05, h + .02, Math.sin(k * 1.26) * .16); leaf.rotation.set(Math.sin(k * 1.26) * 1.2, 0, -Math.cos(k * 1.26) * 1.2); g.add(leaf); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
  }
  function miniCar(color) { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .09, .16), M(color, { roughness: .4 })); b.position.y = .08; const c = new THREE.Mesh(new THREE.BoxGeometry(.16, .07, .14), M('#DDEFF5', { roughness: .2 })); c.position.set(-.02, .16, 0); g.add(b, c); for (const [x, z] of [[-.1, .08], [.1, .08], [-.1, -.08], [.1, -.08]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .03, 10), M('#17201B')); w.rotation.x = Math.PI / 2; w.position.set(x, .035, z); g.add(w); } g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; }
  function landmark(type) {
    const g = new THREE.Group();
    if (type === 'start') { for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .045, 18), M('#F2C230', { metalness: .6, roughness: .3 })); c.position.set((k % 2) * .03, .03 + k * .05, 0); g.add(c); } const c2 = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .045, 18), M('#F2C230', { metalness: .6, roughness: .3 })); c2.position.set(.3, .03, .1); g.add(c2); }
    if (type === 'jam') { const a = miniCar('#E23E6B'); a.position.set(-.12, 0, -.06); a.rotation.y = .3; const b = miniCar('#2FB3A3'); b.position.set(.16, 0, .1); b.rotation.y = .1; const c = miniCar('#FFBE1A'); c.position.set(-.05, 0, .22); c.rotation.y = -.2; g.add(a, b, c); }
    if (type === 'rest') { const p1 = palm(.6); p1.position.set(-.1, 0, 0); const p2 = palm(.45); p2.position.set(.18, 0, .12); p2.rotation.y = 1; g.add(p1, p2); }
    if (type === 'gojam') { for (const x of [-.22, .22]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .3, 8), M('#17201B')); post.position.set(x, .15, 0); g.add(post); } const bar = new THREE.Mesh(new THREE.BoxGeometry(.56, .08, .04), [M('#E2453D'), M('#E2453D'), M('#FFFFFF'), M('#FFFFFF'), M('#E2453D'), M('#FFFFFF')]); bar.position.y = .27; g.add(bar); const cone = new THREE.Mesh(new THREE.ConeGeometry(.06, .16, 10), M('#F28A45')); cone.position.set(.05, .08, .16); g.add(cone); }
    if (type === 'market') { const roof = new THREE.Mesh(new THREE.ConeGeometry(.3, .16, 4), M('#E2453D')); roof.position.y = .36; roof.rotation.y = Math.PI / 4; const table = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, .22), M('#8B5A3C')); table.position.y = .07; g.add(roof, table); for (const x of [-.17, .17]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .3, 6), M('#17201B')); pole.position.set(x, .2, .1); g.add(pole); const lamp = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), M('#FF5A3C', { emissive: '#FF6B3D', emissiveIntensity: .7 })); lamp.position.set(x, .24, .15); g.add(lamp); } }
    if (type === 'arisan') { const box = new THREE.Mesh(new THREE.BoxGeometry(.26, .2, .26), M('#9B6BD6')); box.position.y = .1; const r1 = new THREE.Mesh(new THREE.BoxGeometry(.27, .205, .05), M('#FFBE1A')); r1.position.y = .1; const r2 = r1.clone(); r2.rotation.y = Math.PI / 2; const bow = new THREE.Mesh(new THREE.TorusGeometry(.05, .018, 6, 12), M('#FFBE1A')); bow.position.y = .23; g.add(box, r1, r2, bow); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  // Six vehicle tokens, one per seat colour: car, bajaj, ojol motorbike, boat, bus, plane.
  function makeToken(seat, color, emoji) {
    const g = new THREE.Group(), body = M(color, { roughness: .35, metalness: .1 }), dark = M('#17201B'), glass = M('#DDEFF5', { roughness: .15 });
    const wheel = (x, z, r = .05) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .035, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, r, z); return w; };
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    switch (seat % 6) {
      case 0: add(new THREE.BoxGeometry(.42, .11, .22), body, 0, .1, 0); add(new THREE.BoxGeometry(.22, .1, .2), glass, -.03, .2, 0); [[-.13, .11], [.13, .11], [-.13, -.11], [.13, -.11]].forEach(([x, z]) => g.add(wheel(x, z))); break; // car
      case 1: add(new THREE.BoxGeometry(.34, .16, .22), body, 0, .14, 0); add(new THREE.BoxGeometry(.3, .03, .24), dark, 0, .25, 0); add(new THREE.BoxGeometry(.06, .12, .2), glass, .16, .15, 0); g.add(wheel(.14, 0)); g.add(wheel(-.1, .1)); g.add(wheel(-.1, -.1)); break; // bajaj
      case 2: add(new THREE.BoxGeometry(.32, .07, .08), body, 0, .1, 0); add(new THREE.BoxGeometry(.12, .1, .1), body, -.02, .17, 0); add(new THREE.CylinderGeometry(.008, .008, .16), dark, .13, .17, 0).rotation.x = Math.PI / 2; g.add(wheel(.13, 0, .06)); g.add(wheel(-.13, 0, .06)); add(new THREE.SphereGeometry(.05, 10, 8), M('#17201B', { roughness: .3 }), -.03, .27, 0); break; // ojol motorbike + helmet
      case 3: { const hull = add(new THREE.CylinderGeometry(.12, .07, .4, 10, 1, false, 0, Math.PI), body, 0, .1, 0); hull.rotation.set(Math.PI / 2, 0, Math.PI / 2); add(new THREE.BoxGeometry(.14, .1, .12), M('#FFF8E8'), -.03, .14, 0); add(new THREE.CylinderGeometry(.008, .008, .3), dark, .06, .25, 0); break; } // boat
      case 4: add(new THREE.BoxGeometry(.46, .18, .2), body, 0, .15, 0); add(new THREE.BoxGeometry(.4, .06, .205), glass, 0, .19, 0); [[-.15, .1], [.15, .1], [-.15, -.1], [.15, -.1]].forEach(([x, z]) => g.add(wheel(x, z))); break; // bus
      default: add(new THREE.CylinderGeometry(.05, .04, .44, 10), body, 0, .14, 0).rotation.z = Math.PI / 2; add(new THREE.BoxGeometry(.12, .02, .46), body, .02, .14, 0); add(new THREE.BoxGeometry(.08, .1, .02), body, -.19, .19, 0); add(new THREE.SphereGeometry(.05, 10, 8), glass, .2, .15, 0); add(new THREE.CylinderGeometry(.01, .01, .1), dark, 0, .05, 0); break; // plane on a stand
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const c = canvas(128, 128), x = c.getContext('2d'); x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fillStyle = '#FFFFFF'; x.fill(); x.lineWidth = 9; x.strokeStyle = color; x.stroke(); x.font = '70px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(emoji, 64, 70);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c) })); sp.scale.set(.36, .36, .36); sp.position.y = .52; g.add(sp);
    g.scale.setScalar(1.35); sp.position.y = .5; const holder = new THREE.Group(); holder.add(g); holder.userData.body = g; return holder;
  }
  function makeHouse(color) {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(.19, .16, .19), M(color, { roughness: .55 })); walls.position.y = .08;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(.17, .14, 4), M('#B5452C', { roughness: .6 })); roof.position.y = .23; roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(.05, .08, .01), M('#17201B')); door.position.set(0, .04, .096);
    walls.castShadow = roof.castShadow = true; g.add(walls, roof, door); return g;
  }
  function makeTower(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.34, .95, .34), M(color, { roughness: .35, metalness: .15 })); body.position.y = .475; body.castShadow = true;
    const win = M('#FFF3B0', { emissive: '#FFE16B', emissiveIntensity: .45 });
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(.08, .07, .345), win); w.position.set(sx * .08, .13 + k * .12, 0); g.add(w); const w2 = w.clone(); w2.rotation.y = Math.PI / 2; g.add(w2); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(.24, .06, .24), M('#FFFFFF')); top.position.y = .98;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .2), M('#17201B')); mast.position.y = 1.1;
    const blink = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), M('#FF3B3B', { emissive: '#FF3B3B', emissiveIntensity: 1 })); blink.position.y = 1.21; blink.userData.blink = true;
    g.add(body, top, mast, blink); return g;
  }
  function makeFlag(color) {
    const g = new THREE.Group(); g.scale.setScalar(1.25);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .42, 6), M('#17201B')); pole.position.y = .21;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(.2, .12, 4, 1), M(color, { side: THREE.DoubleSide, roughness: .5 })); flag.position.set(.1, .35, 0); flag.userData.wave = true;
    pole.castShadow = flag.castShadow = true; g.add(pole, flag); return g;
  }
  function deckMesh(label, bg, fg) {
    const c = canvas(512, 320), x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 512, 320); x.strokeStyle = fg; x.lineWidth = 14; x.strokeRect(14, 14, 484, 292); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '400 52px Bungee, "Arial Black", sans-serif'; wrapText(x, label, 256, 165, 440, 58);
    const side = M('#FFF8E8'), top = new THREE.MeshStandardMaterial({ map: tex(c), roughness: .6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, .16, .88), [side, side, top, side, side, side]); m.castShadow = true; m.userData.top = top; return m;
  }
  function diceFace(n) {
    const c = canvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#17201B'; x.lineWidth = 8; x.strokeRect(4, 4, 120, 120);
    const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[n];
    for (const [px, py] of P) { x.beginPath(); x.arc(px, py, 11, 0, 7); x.fillStyle = n === 1 ? '#E23E6B' : '#17201B'; x.fill(); }
    return tex(c);
  }
  function textSprite(text, color) {
    const c = canvas(256, 96), x = c.getContext('2d'); x.font = `800 54px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#17201B'; x.strokeText(text, 128, 50); x.fillStyle = color; x.fillText(text, 128, 50);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthTest: false })); s.scale.set(1.1, .41, 1); s.renderOrder = 10; return s;
  }

  // ---------- setup ----------
  function init(el, pick) {
    host = el; onPick = pick;
    try { if (!window.THREE) throw new Error('no three'); renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); if (!renderer.getContext()) throw new Error('no webgl'); }
    catch (e) { ok = false; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.fog = new THREE.Fog('#BFE3EA', 26, 60);
    camera = new THREE.PerspectiveCamera(36, 1, .1, 120);
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#3E7C8A', .8));
    const sun = new THREE.DirectionalLight('#FFF1D6', .85); sun.position.set(-7, 15, 9); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 45 }); sun.shadow.bias = -.0005; scene.add(sun);
    // sea with gentle waves
    const wg = new THREE.PlaneGeometry(90, 90, 70, 70); wg.rotateX(-Math.PI / 2); waterBase = Float32Array.from(wg.attributes.position.array);
    water = new THREE.Mesh(wg, M('#1D7D93', { roughness: .35, metalness: .05, flatShading: true })); water.position.y = -.75; water.receiveShadow = true; scene.add(water);
    // island: sandy beach ring, dark board slab, palms
    const R = HexGeo.R;
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 2.2, .5, 6).rotateY(Math.PI / 2), M('#E9D9A6', { roughness: .95 })); beach.position.y = -.62; beach.receiveShadow = true; scene.add(beach);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(R + .85, R + .95, .42, 6).rotateY(Math.PI / 2), M('#17201B', { roughness: .8 })); slab.position.y = -.26; slab.receiveShadow = true; slab.castShadow = true; scene.add(slab);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + .62, R + .62, .02, 6).rotateY(Math.PI / 2), M('#2A3530', { roughness: .9 })); rim.position.y = -.07; rim.receiveShadow = true; scene.add(rim);
    HexGeo.vertices().forEach(([x, z], k) => { for (const f of [-.35, .35]) { const p = palm(.55 + (k % 3) * .12); const ang = Math.atan2(z, x) + f * .35, rr = R + 1.45; p.position.set(Math.cos(ang) * rr, -.37, Math.sin(ang) * rr); p.rotation.y = k + f; scene.add(p); } });
    // sea inside the ring and the raised archipelago
    const sea = new THREE.Mesh(new THREE.CircleGeometry(HexGeo.innerR(), 6).rotateX(-Math.PI / 2), M('#FFFFFF', { map: seaTexture(), roughness: .5 }));
    sea.position.y = -.03; sea.receiveShadow = true; scene.add(sea);
    const arch = buildArchipelago(); arch.position.y = -.03; scene.add(arch);
    // tiles
    const side = M('#E9DFC6', { roughness: .8 });
    for (let i = 0; i < BOARD.length; i++) {
      const t = HexGeo.tile(i), top = new THREE.MeshStandardMaterial({ map: tileTexture(i), roughness: .85 });
      let m;
      if (t.corner) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(HexGeo.CR + .1, HexGeo.CR + .14, .16, 6).rotateY(Math.PI / 2), M('#17201B', { roughness: .7 }));
        const face = new THREE.Mesh(new THREE.PlaneGeometry(.94, .94), top); face.rotation.x = -Math.PI / 2; face.position.y = .081; face.rotation.z = HexGeo.rotY(t); face.userData.i = i;
        m.add(face); tiles.push(face); m.position.set(t.x, .02, t.z);
        const lm = landmark(BOARD[i].t); lm.position.set(t.x - t.nx * .12, .1, t.z - t.nz * .12); lm.rotation.y = HexGeo.rotY(t) + Math.PI; lm.scale.setScalar(.95); scene.add(lm);
      } else {
        m = new THREE.Mesh(new THREE.BoxGeometry(HexGeo.W, .1, HexGeo.D), [side, side, top, side, side, side]);
        m.position.set(t.x, 0, t.z); m.rotation.y = HexGeo.rotY(t); tiles.push(m);
      }
      m.receiveShadow = true; m.userData.i = i; scene.add(m);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(HexGeo.W - .08, .03, .1), M('#FFFFFF', { roughness: .4 }));
      const out = inward(i).clone().multiplyScalar(-(HexGeo.D / 2 - .1)); strip.position.set(t.x + out.x, .065, t.z + out.z); strip.rotation.y = HexGeo.rotY(t); strip.visible = false; scene.add(strip); strips.push(strip);
      flags.push(null);
    }
    decks.event = deckMesh('LIFE EVENT', '#5CC07A', '#17201B'); decks.event.position.set(-2.4, .06, 1.95); decks.event.rotation.y = .3;
    decks.reality = deckMesh('INDONESIA REALITY', '#E9566B', '#FFF8E8'); decks.reality.position.set(2.4, .06, 1.95); decks.reality.rotation.y = -.3;
    scene.add(decks.event, decks.reality);
    const faces = [3, 4, 1, 6, 2, 5].map(n => new THREE.MeshStandardMaterial({ map: diceFace(n), roughness: .3 }));
    for (let k = 0; k < 2; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .42), faces); d.castShadow = true; d.position.set(-.35 + k * .7, .21, 2.0); scene.add(d); dice.push(d); }
    const ringGeo = new THREE.RingGeometry(.4, .5, 4, 1, Math.PI / 4); ringGeo.rotateX(-Math.PI / 2); ringGeo.scale(HexGeo.W * 1.4, 1, HexGeo.D * 1.4);
    ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#E23E6B', transparent: true, opacity: .9 })); ring.position.y = .09; ring.visible = false; scene.add(ring);
    selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#FFBE1A', transparent: true, opacity: .95 })); selRing.position.y = .095; selRing.visible = false; scene.add(selRing);
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, minDistance: 6, maxDistance: 34, minPolarAngle: .12, maxPolarAngle: 1.25, rotateSpeed: .7 });
    }
    let down = null;
    renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; down = null;
      const r = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(v, camera); const hit = rc.intersectObjects(tiles)[0];
      onPick && onPick(hit ? hit.object.userData.i : null);
    });
    ro.obs = new ResizeObserver(resize); ro.obs.observe(el); resize(); resetView();
    ok = true; loop(0);
    return true;
  }
  let fitted = 0;
  function resize() { if (!renderer || !host) return; const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); const was = camera.aspect; camera.aspect = w / h; camera.updateProjectionMatrix(); if (!fitted || Math.abs(was - camera.aspect) > .05) { fitted = 1; resetView(); } }
  function resetView() {
    const a = camera.aspect || 1, v = THREE.MathUtils.degToRad(camera.fov), h = 2 * Math.atan(Math.tan(v / 2) * a);
    const d = Math.max(5.6 / Math.sin(v / 2), 7.6 / Math.sin(h / 2)), steep = a < 1.05 ? .8 : .7;
    camera.position.set(0, d * steep, d * Math.sqrt(1 - steep * steep)); home.set(0, 0, .45);
    if (controls) { controls.target.copy(home); controls.update(); } else camera.lookAt(home);
  }
  const home = { x: 0, y: 0, z: .45, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const raw = Math.max(0, (ts - clock.t) / 1000 || 0), tdt = Math.min(.25, raw); clock.t = ts;
    for (let k = tweens.length - 1; k >= 0; k--) { const tw = tweens[k]; tw.e += tdt; const u = Math.min(1, tw.e / tw.d); tw.f(u); if (u >= 1) { tweens.splice(k, 1); tw.done && tw.done(); } }
    // waves
    const pos = water.geometry.attributes.position, s = ts / 1000;
    for (let k = 0; k < pos.count; k++) { const x = waterBase[k * 3], z = waterBase[k * 3 + 2]; pos.array[k * 3 + 1] = Math.sin(x * .45 + s * 1.1) * .06 + Math.cos(z * .5 + s * .8) * .05; }
    pos.needsUpdate = true; if ((ts | 0) % 3 === 0) water.geometry.computeVertexNormals();
    if (ring.visible) ring.material.opacity = .55 + .35 * Math.sin(ts / 260);
    for (const f of flags) if (f) f.children[1].rotation.y = Math.sin(ts / 300 + f.position.x) * .35;
    for (const b of builds) if (b) b.grp.traverse(o => { if (o.userData.blink) o.visible = Math.sin(ts / 400 + b.grp.position.x) > -.2; });
    for (const id in pawns) { const pw = pawns[id]; if (pw.active && !pw.moving) pw.g.userData.body.position.y = Math.abs(Math.sin(ts / 380)) * .06; else if (!pw.moving) pw.g.userData.body.position.y = 0; }
    if (controls) {
      if (follow) { controls.target.lerp(new THREE.Vector3(follow.x * .35, 0, follow.z * .35 + .3), .06); }
      else if (controls.target.distanceTo(new THREE.Vector3(home.x, home.y, home.z)) > .01 && !followBack.off) controls.target.lerp(new THREE.Vector3(home.x, home.y, home.z), .04);
      controls.update();
    }
    renderer.render(scene, camera);
  }
  const followBack = { off: false };
  // Tweens run on real time (slow devices skip frames instead of going slow-motion). In fast mode (tab hidden or
  // a safety timeout fired) they jump straight to the end so the game never waits on an animation.
  let fast = false;
  const tween = (d, f, done) => new Promise(res => { if (fast || document.hidden) { f(1); done && done(); res(); return; } tweens.push({ e: 0, d, f, done: () => { done && done(); res(); } }); });
  function flush() { fast = true; while (tweens.length) { const tw = tweens.shift(); tw.f(1); tw.done && tw.done(); } }
  // Runs an animation, but never for longer than ms: after that it is fast-forwarded to its end.
  async function capped(p, ms) {
    let t; const timer = new Promise(r => { t = setTimeout(() => r('late'), ms); });
    if (await Promise.race([p, timer]) === 'late') { flush(); await p; }
    clearTimeout(t); fast = false;
  }
  const ease = u => u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;

  function slot(i, k, n) { // spot for token k of n on tile i, toward the outer half of the tile
    const p = tilePos(i), inw = inward(i), side = new THREE.Vector3(-inw.z, 0, inw.x), corner = i % 6 === 0;
    const cols = Math.min(3, n), row = Math.floor(k / 3), col = k % 3;
    const off = side.clone().multiplyScalar((col - (cols - 1) / 2) * .3).add(inw.clone().multiplyScalar((corner ? .3 : -.2) + row * -.24));
    return p.add(off);
  }
  const headingAt = i => { const t = HexGeo.tile(i); return Math.atan2(-t.ez, t.ex); }; // tokens face the direction of play

  function sync(g, me) {
    if (!ok) return; const first = lastSync === null || lastSync.gameId !== g.gameId; lastSync = g;
    for (let i = 0; i < BOARD.length; i++) {
      const pr = g.props?.[i], strip = strips[i], t = HexGeo.tile(i);
      const col = pr && pr.o && g.ps[pr.o] ? PCOLORS[g.ps[pr.o].col % PCOLORS.length] : null;
      strip.visible = !!col; if (col) strip.material.color.set(col);
      const mt = tiles[i].material, top = Array.isArray(mt) ? mt[2] : mt; top.color.set(pr && pr.m ? '#8C8C8C' : '#FFFFFF');
      const fkey = col ? `${pr.o}:${pr.m ? 1 : 0}` : '';
      if ((flags[i]?.userData.key || '') !== fkey) {
        if (flags[i]) scene.remove(flags[i]); flags[i] = null;
        if (col && !pr.m) { const f = makeFlag(col), side = new THREE.Vector3(-t.nz, 0, t.nx); f.position.set(t.x - t.nx * .38 + side.x * .4, .05, t.z - t.nz * .38 + side.z * .4); f.userData.key = fkey; scene.add(f); flags[i] = f; if (!first) { f.scale.setScalar(.01); tween(.4, u => f.scale.setScalar(.01 + .99 * ease(u))); } }
      }
      const want = col ? `${pr.o}:${pr.h}` : '';
      if (builds[i]?.key !== want) {
        if (builds[i]) scene.remove(builds[i].grp); builds[i] = null;
        if (col && pr.h) {
          const grp = new THREE.Group(), p = tilePos(i), inw = inward(i), side = new THREE.Vector3(-inw.z, 0, inw.x), ry = HexGeo.rotY(t);
          if (pr.h === 5) { const tw = makeTower(col); tw.position.copy(p.clone().add(inw.clone().multiplyScalar(.26))); tw.rotation.y = ry; grp.add(tw); }
          else for (let k = 0; k < pr.h; k++) { const h = makeHouse(col); h.position.copy(p.clone().add(inw.clone().multiplyScalar(.38)).add(side.clone().multiplyScalar((k - (pr.h - 1) / 2) * .25))); h.rotation.y = ry + Math.PI; grp.add(h); }
          grp.position.y = .05; grp.children.forEach(c => { c.scale.setScalar(1.3); }); scene.add(grp); builds[i] = { key: want, grp };
          if (!first && (lastH[i] || 0) < pr.h) { grp.scale.setScalar(.01); tween(.45, u => grp.scale.setScalar(.01 + .99 * (1 - Math.pow(1 - u, 3) * Math.cos(u * 6)))); }
        }
      }
      lastH[i] = pr ? pr.h : 0;
    }
    const ids = g.order || [], cur = ids[g.turnIdx];
    for (const id of Object.keys(pawns)) if (!ids.includes(id) || g.ps[id].out) { scene.remove(pawns[id].g); delete pawns[id]; }
    const byTile = {};
    ids.forEach(id => { if (g.ps[id].out) return; const pos = animating && animating.p === id ? -1 : g.ps[id].pos; (byTile[pos] = byTile[pos] || []).push(id); });
    ids.forEach(id => {
      const p = g.ps[id]; if (p.out) return;
      if (!pawns[id]) { pawns[id] = { g: makeToken(p.col, PCOLORS[p.col % PCOLORS.length], AVATARS[p.av] || AVATARS[0]) }; scene.add(pawns[id].g); const s0 = slot(p.pos, 0, 1); pawns[id].g.position.set(s0.x, .05, s0.z); pawns[id].g.rotation.y = headingAt(p.pos); }
      pawns[id].active = id === cur;
      // money pop-ups when a balance changes
      if (!first && lastCash[id] !== undefined && lastCash[id] !== p.cash) moneyPop(id, p.cash - lastCash[id]);
      lastCash[id] = p.cash;
      if (animating && animating.p === id) return;
      const list = byTile[p.pos], s = slot(p.pos, list.indexOf(id), list.length);
      pawns[id].g.position.x = s.x; pawns[id].g.position.z = s.z; pawns[id].g.position.y = .05; pawns[id].g.rotation.y = headingAt(p.pos);
    });
    if (first) for (const id of ids) lastCash[id] = g.ps[id].cash;
    if (cur && g.ps[cur] && !animating) { const t = HexGeo.tile(g.ps[cur].pos); ring.position.x = t.x; ring.position.z = t.z; ring.rotation.y = HexGeo.rotY(t); ring.visible = g.status === 'playing'; }
  }
  function moneyPop(id, delta) {
    const pw = pawns[id]; if (!pw || !delta) return;
    const s = textSprite(`${delta > 0 ? '+' : '−'}${rpShort(Math.abs(delta)).replace('Rp', 'Rp')}`, delta > 0 ? '#5CE08A' : '#FF6B63');
    const start = pw.g.position.clone(); s.position.set(start.x, .9, start.z); scene.add(s);
    tween(1.6, u => { s.position.y = .9 + u * .9; s.material.opacity = u < .7 ? 1 : 1 - (u - .7) / .3; }, () => scene.remove(s));
  }
  function select(i) { if (!ok) return; if (i === null || i === undefined) { selRing.visible = false; return; } const t = HexGeo.tile(i); selRing.position.x = t.x; selRing.position.z = t.z; selRing.rotation.y = HexGeo.rotY(t); selRing.visible = true; }

  // Dice tumble, landing with the rolled faces up. Face values by box side: +x3 −x4 +y1 −y6 +z2 −z5.
  const UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
  function rollDice(vals) {
    if (!ok) return Promise.resolve();
    return Promise.all(dice.map((d, k) => {
      const qFace = new THREE.Quaternion().setFromEuler(new THREE.Euler(...UP[vals[k]])), qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - .5) * 1.2);
      const end = qSpin.multiply(qFace), start = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      const ax = new THREE.Vector3(Math.random() - .5, 1, Math.random() - .5).normalize(), x0 = -2.4 + k * .5, x1 = -.35 + k * .7, z0 = 3.3, z1 = 2.0 + k * .12;
      return tween(1.05 + k * .08, u => {
        const e = ease(u); d.position.set(x0 + (x1 - x0) * e, .21 + Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u) * 1.4, z0 + (z1 - z0) * e);
        if (u < .75) { d.quaternion.copy(start); d.rotateOnAxis(ax, u * 22); }
        else { const mid = start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(ax, .75 * 22)); d.quaternion.copy(mid).slerp(end, ease((u - .75) / .25)); }
      });
    }));
  }
  // Hop a token along the tiles of a committed move (teleports arc high); the camera drifts with it.
  async function animate(g, mv) {
    if (!ok || !pawns[mv.p]) return;
    const pw = pawns[mv.p]; animating = { p: mv.p }; pw.moving = true; ring.visible = false;
    let cur = pw.g.position.clone();
    for (let k = 0; k < mv.path.length; k++) {
      const to = slot(mv.path[k], 0, 1), jump = mv.jumps && mv.jumps.includes(k), from = cur.clone();
      const h0 = pw.g.rotation.y, h1 = jump ? h0 + Math.PI * 2 : Math.atan2(-(to.z - from.z), to.x - from.x);
      let dh = h1 - h0; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      follow = to;
      await tween(jump ? .85 : .19, u => { pw.g.position.set(from.x + (to.x - from.x) * u, .05 + Math.sin(u * Math.PI) * (jump ? 1.7 : .3), from.z + (to.z - from.z) * u); pw.g.rotation.y = h0 + dh * Math.min(1, u * 2); });
      cur = to;
    }
    follow = null; pw.moving = false; animating = null; if (lastSync) sync(lastSync);
  }
  // A card lifts off its deck, flips toward the camera and fades — played before the card's popup appears.
  function drawCard(deck) {
    if (!ok || !decks[deck]) return Promise.resolve();
    const src = decks[deck], card = new THREE.Mesh(new THREE.BoxGeometry(1.2, .03, .76), [M('#FFF8E8'), M('#FFF8E8'), src.userData.top, M('#FFF8E8', { transparent: true }), M('#FFF8E8'), M('#FFF8E8')]);
    card.material.forEach(m => { m.transparent = true; }); card.position.copy(src.position); card.position.y = .2; card.rotation.y = src.rotation.y; scene.add(card);
    const camDir = camera.position.clone().sub(controls ? controls.target : new THREE.Vector3()).normalize(), end = src.position.clone().add(camDir.multiplyScalar(3.2)); end.y = Math.max(end.y, 3.2);
    const p0 = card.position.clone();
    return tween(.9, u => { const e = ease(u); card.position.lerpVectors(p0, end, e); card.rotation.x = -e * (Math.PI / 2 - .2); card.rotation.z = Math.sin(e * Math.PI) * .5; card.material.forEach(m => { m.opacity = u > .75 ? 1 - (u - .75) / .25 : 1; }); }, () => scene.remove(card));
  }
  function destroy() { cancelAnimationFrame(raf); if (ro.obs) ro.obs.disconnect(); if (renderer) { renderer.dispose(); renderer.domElement.remove(); } ok = false; tiles.length = strips.length = builds.length = flags.length = 0; dice = []; tweens.length = 0; for (const k in pawns) delete pawns[k]; for (const k in lastCash) delete lastCash[k]; for (const k in lastH) delete lastH[k]; host = null; lastSync = null; follow = null; }
  function hold(pid) { animating = pid ? { p: pid } : null; if (!pid && lastSync) sync(lastSync); }
  return { init, sync, select, capped, rollDice, animate, drawCard, resetView, destroy, hold, get ok() { return ok; }, get cam() { return camera ? camera.position.toArray().map(v => +v.toFixed(2)) : null; } };
})();
