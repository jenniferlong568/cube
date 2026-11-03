// ================= GAME: a first-person spider hunt through the apartment =================
(() => {
const el = id => document.getElementById(id);
const clampV = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ================= MUSIC: a loud little dubstep/EDM loop, all synthesized =================
const Rave = (() => {
  const BPM = 140, STEP = 60 / BPM / 4;            // 16th-note length
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const ROOTS = [41, 37, 44, 39];                    // F, Db, Ab, Eb (bass)
  const CHORDS = [[65, 68, 72], [61, 65, 68], [68, 72, 75], [63, 67, 70]];
  const WOBBLE = [BPM / 60 * 2, BPM / 60 * 4, BPM / 60 * 3, BPM / 60 * 1];   // 1/8, 1/16, triplets, 1/4

  let ctx, master, out, noise, bassGain, bassFilter, lfo, bassOscs = [], delay;
  let step = 0, nextTime = 0, timer = null, startTime = 0, muted = false;

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = muted ? 0 : .9;
    master.connect(comp); comp.connect(ctx.destination);
    out = ctx.createGain(); out.connect(master);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // wobble bass: detuned saws + sub through a resonant lowpass, LFO on cutoff
    bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass'; bassFilter.frequency.value = 500; bassFilter.Q.value = 9;
    bassGain = ctx.createGain(); bassGain.gain.value = 0;
    bassFilter.connect(bassGain); bassGain.connect(out);
    [[-14, 'sawtooth'], [14, 'sawtooth'], [0, 'square']].forEach(([det, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.detune.value = det;
      o.frequency.value = midi(41); o.connect(bassFilter); o.start(); bassOscs.push(o);
    });
    const sub = ctx.createOscillator(); sub.frequency.value = midi(29);
    const subG = ctx.createGain(); subG.gain.value = .5; sub.connect(subG); subG.connect(bassGain); sub.start();
    bassOscs.push(sub);
    lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = WOBBLE[0];
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 1100;
    lfo.connect(lfoAmt); lfoAmt.connect(bassFilter.frequency); lfo.start();

    delay = ctx.createDelay(); delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = .35;
    delay.connect(fb); fb.connect(delay); delay.connect(out);
  }

  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
  }
  function noiseHit(t, type, freq, peak, dur) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, peak, dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + dur + .02);
    return f;
  }
  let bassLevel = 0;
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + .11);
    env(g, t, 1.2, .38); o.connect(g); g.connect(out); o.start(t); o.stop(t + .4);
    // sidechain pump on the bass
    bassGain.gain.cancelScheduledValues(t);
    bassGain.gain.setValueAtTime(bassLevel * .15, t);
    bassGain.gain.linearRampToValueAtTime(bassLevel, t + .16);
  }
  function snare(t, peak = .7) {
    noiseHit(t, 'bandpass', 1900, peak, .2);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + .08);
    env(g, t, peak * .6, .1); o.connect(g); g.connect(out); o.start(t); o.stop(t + .12);
  }
  function clap(t) { [0, .012, .026].forEach(d => noiseHit(t + d, 'bandpass', 1200, .5, .12)); }
  function hat(t, open) { noiseHit(t, 'highpass', 8000, open ? .22 : .16, open ? .16 : .04); }
  function pluck(t, note, peak = .16) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = midi(note);
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(400, t + .18);
    env(g, t, peak, .2); o.connect(f); f.connect(g); g.connect(out); g.connect(delay);
    o.start(t); o.stop(t + .22);
  }
  function riser(t, dur) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.01, t); g.gain.exponentialRampToValueAtTime(.4, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur);
  }

  function playStep(i, t) {
    const bar = Math.floor(i / 16) % 16, s = i % 16;
    const chord = bar % 4, drop = bar >= 8;
    if (s === 0) {
      const root = midi(ROOTS[chord]);
      bassOscs.slice(0, 3).forEach(o => o.frequency.setValueAtTime(root, t));
      bassOscs[3].frequency.setValueAtTime(root / 2, t);
      bassLevel = drop ? .5 : .16;
      bassGain.gain.setValueAtTime(bassLevel, t);
      if (bar === 6) riser(t, STEP * 32);
    }
    if (drop && s % 8 === 0) {
      lfo.frequency.setValueAtTime(WOBBLE[(bar * 2 + s / 8) % 4], t);
    } else if (!drop && s === 0) lfo.frequency.setValueAtTime(BPM / 60, t);

    if (!drop) {
      // build: four-on-the-floor + arps, snare roll in bar 7
      if (s % 4 === 0 && bar !== 7) kick(t);
      if (s % 4 === 2) hat(t, true);
      if (s === 4 || s === 12) clap(t);
      if (bar === 7) snare(t, .2 + s * .04);
      const ch = CHORDS[chord], arp = [0, 1, 2, 1, 2, 0, 1, 2];
      pluck(t, ch[arp[s % 8]] + (s >= 8 ? 12 : 0));
    } else {
      // the drop: half-time dubstep
      if (s === 0 || s === 10) kick(t);
      if (s === 8) snare(t, .9);
      hat(t, false);
      if (s % 4 === 0) pluck(t, CHORDS[chord][0] + 12, .07);
    }
  }

  function tick() {
    while (nextTime < ctx.currentTime + .12) {
      playStep(step, nextTime);
      nextTime += STEP; step++;
    }
  }

  return {
    start() {
      if (!ctx) init();
      ctx.resume();
      if (timer) return;
      step = 0; nextTime = ctx.currentTime + .05; startTime = nextTime;
      timer = setInterval(tick, 25);
    },
    stop() {
      clearInterval(timer); timer = null;
      if (bassGain) { bassGain.gain.cancelScheduledValues(ctx.currentTime); bassGain.gain.setValueAtTime(0, ctx.currentTime); }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : .9, ctx.currentTime, .02);
      return muted;
    },
    isMuted() { return muted; },
    // 0..1 position within the current beat, for lights pulsing in time
    beat() { return ctx && timer ? ((ctx.currentTime - startTime) * BPM / 60) % 1 : 0; },
    splat(gold) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      noiseHit(t, 'lowpass', 900, .9, .14);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(gold ? 900 : 320, t); o.frequency.exponentialRampToValueAtTime(gold ? 1800 : 70, t + .12);
      env(g, t, .5, .14); o.connect(g); g.connect(out); o.start(t); o.stop(t + .16);
    },
    swoosh() {
      if (!ctx || muted) return;
      const f = noiseHit(ctx.currentTime, 'bandpass', 2400, .18, .12);
      f.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + .12);
    },
  };
})();

// ================= SETUP =================
const WEAPONS = {
  broom:   { name: 'Dorota',        reach: 2.5, cone: .36, multi: true,  cd: 520 },
  duster:  { name: 'the Duster',    reach: 1.8, cone: .2,  multi: false, cd: 150 },
  slipper: { name: 'the Flip-Flop', reach: 2.2, cone: .24, multi: false, cd: 300 },
  vacuum:  { name: 'the Vacuum',    reach: 3.3, cone: .26, multi: true,  cd: 950 },
};
const ROUND = 60, START_SPIDERS = 16, MAX_SPIDERS = 34;
const SIZES = { normal: 1.45, party: 1.3, gold: 1.05 };
const SPEEDS = { normal: .32, party: .5, gold: .9 };
const POINTS = { normal: 1, party: 2, gold: 5 };

const gameEl = el('game');
const screens = { choose: el('gChoose'), play: el('gPlay'), over: el('gOver') };
function show(name) {
  Object.entries(screens).forEach(([k, s]) => s.classList.toggle('active', k === name));
}

if (!window.THREE) {
  el('gLoadErr').hidden = false;
  document.querySelectorAll('.weapon').forEach(b => { b.disabled = true; });
  return;
}

// ---------- The apartment (meters; y is up) ----------
const H = 2.6, EYE = 1.6, T = .16, DOOR_H = 2.1, RADIUS = .28;
const ROOMS = [
  { name: 'living', x0: 0, x1: 8, z0: 0, z1: 6 },
  { name: 'bed',    x0: 0, x1: 4, z0: -4, z1: 0 },
  { name: 'bath',   x0: 4, x1: 7, z0: -3, z1: 0 },
];
// "along: 'x'" runs along x at z = at; "along: 'z'" runs along z at x = at
const WALLS = [
  { along: 'x', at: 0,  from: 0,  to: 8, doors: [[1.4, 2.4], [5, 6]] },
  { along: 'x', at: 6,  from: 0,  to: 8, doors: [] },
  { along: 'z', at: 0,  from: -4, to: 6, doors: [] },
  { along: 'z', at: 8,  from: 0,  to: 6, doors: [] },
  { along: 'x', at: -4, from: 0,  to: 4, doors: [] },
  { along: 'z', at: 4,  from: -4, to: 0, doors: [] },
  { along: 'x', at: -3, from: 4,  to: 7, doors: [] },
  { along: 'z', at: 7,  from: -3, to: 0, doors: [] },
];

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
let renderer, scene, camera, viewmodel = null, clubLights = [], discoBall;
let splatTex, splatGeo;
const solids = [];      // footprints the player bumps into
const furnFloor = [];   // footprints spiders walk around
const occluders = [];   // meshes that block a swing
const surfaces = [];    // where spiders can crawl
const templates = {};

// ---------- Watercolor textures ----------
function shade(hex, dl, ds = 0) {
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h);
  c.setHSL(h.h, clampV(h.s + ds, 0, 1), clampV(h.l + dl, 0, 1));
  return '#' + c.getHexString();
}
function grain(c, amount) {
  const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = (Math.random() - .5) * amount;
    d.data[i] += g; d.data[i + 1] += g; d.data[i + 2] += g;
  }
  x.putImageData(d, 0, 0);
}
// a flat wash with tiling blooms whose pigment pools at the edges
function washCanvas(hex, n = 256, blooms = 24, strength = .1) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = hex; x.fillRect(0, 0, n, n);
  for (let i = 0; i < blooms; i++) {
    const px = Math.random() * n, py = Math.random() * n, r = n * rand(.1, .45);
    const col = new THREE.Color(shade(hex, rand(-.09, .07), rand(-.06, .06)));
    const rgb = `${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0}`;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, `rgba(${rgb},${strength * .5})`);
      g.addColorStop(.8, `rgba(${rgb},${strength})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  grain(c, 14);
  return c;
}
function woodCanvas() {
  const n = 512, c = washCanvas('#b48a60', n, 30, .1), x = c.getContext('2d');
  const rows = 8, h = n / rows;
  for (let r = 0; r < rows; r++) {
    x.fillStyle = r % 2 ? 'rgba(120,80,45,.12)' : 'rgba(205,165,115,.12)';
    x.fillRect(0, r * h, n, h);
    x.strokeStyle = 'rgba(80,52,30,.35)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, r * h); x.lineTo(n, r * h); x.stroke();
    const off = (r * 137) % n;
    x.beginPath(); x.moveTo(off, r * h); x.lineTo(off, r * h + h); x.stroke();
    x.strokeStyle = 'rgba(90,60,35,.13)'; x.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      const y = r * h + rand(4, h - 4);
      x.beginPath(); x.moveTo(0, y);
      for (let i = 0; i <= n; i += 24) x.lineTo(i, y + Math.sin(i * .03 + k) * 2);
      x.stroke();
    }
  }
  return c;
}
function tileCanvas() {
  const n = 256, c = washCanvas('#cddfe1', n, 18, .12), x = c.getContext('2d');
  x.strokeStyle = 'rgba(250,250,245,.75)'; x.lineWidth = 4;
  for (let i = 0; i <= n; i += n / 4) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, n); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(n, i); x.stroke();
  }
  return c;
}
function splatCanvas() {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  for (let i = 0; i < 12; i++) {
    const a = rand(0, 6.28), d = rand(0, 30), r = rand(8, 22);
    const px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(96,108,48,.3)');
    g.addColorStop(.8, 'rgba(78,88,36,.55)');
    g.addColorStop(1, 'rgba(78,88,36,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(40,32,26,.7)'; x.lineWidth = 3; x.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.28 + rand(-.2, .2);
    x.beginPath(); x.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12);
    x.quadraticCurveTo(64 + Math.cos(a + .3) * 34, 64 + Math.sin(a + .3) * 34, 64 + Math.cos(a + .1) * 50, 64 + Math.sin(a + .1) * 50);
    x.stroke();
  }
  return c;
}
function texFrom(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}
const matCache = {};
function wash(hex) {
  return matCache[hex] || (matCache[hex] = new THREE.MeshLambertMaterial({ map: texFrom(washCanvas(hex, 128, 14, .13)) }));
}

// ---------- Building blocks ----------
function box(x0, x1, y0, y1, z0, z1, mat, { collide = true, furniture = true, block = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), typeof mat === 'string' ? wash(mat) : mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  scene.add(m);
  if (collide) solids.push({ x0, x1, z0, z1 });
  if (furniture && y0 < .1) furnFloor.push({ x0, x1, z0, z1 });
  if (block) occluders.push(m);
  return m;
}
// a flat decal or panel; N is the direction its face points
function panel(w, h, mat, pos, N) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.copy(pos);
  m.lookAt(pos.clone().add(N));
  scene.add(m);
  return m;
}
function limb(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * .8, r, len, 6), mat);
  m.position.copy(a).addScaledVector(d, .5);
  m.quaternion.setFromUnitVectors(v3(0, 1, 0), d.normalize());
  return m;
}
function subtract([from, to], holes) {
  const out = [];
  let cur = from;
  for (const [a, b] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < to) out.push([cur, to]);
  return out;
}

function buildWalls() {
  const mat = wash('#e4d7c1'), trim = wash('#f4eee2');
  const wallBox = (w, a, b, y0, y1, m, collide) => w.along === 'x'
    ? box(a, b, y0, y1, w.at - T / 2, w.at + T / 2, m, { collide, furniture: false })
    : box(w.at - T / 2, w.at + T / 2, y0, y1, a, b, m, { collide, furniture: false });
  for (const w of WALLS) {
    for (const [a, b] of subtract([w.from, w.to], w.doors)) {
      wallBox(w, a === w.from ? a - T / 2 : a, b === w.to ? b + T / 2 : b, 0, H, mat, true);
    }
    for (const [a, b] of w.doors) {
      wallBox(w, a, b, DOOR_H, H, mat, false);
      // door frame
      wallBox(w, a - .05, a, 0, DOOR_H, trim, false);
      wallBox(w, b, b + .05, 0, DOOR_H, trim, false);
    }
  }
}

function buildRooms() {
  const wood = new THREE.MeshLambertMaterial({ map: texFrom(woodCanvas(), 2, 2) });
  const tile = new THREE.MeshLambertMaterial({ map: texFrom(tileCanvas(), 4, 4) });
  const ceil = new THREE.MeshLambertMaterial({ map: texFrom(washCanvas('#f1ebe0', 256, 20, .08), 2, 2) });
  for (const r of ROOMS) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, c = v3((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2);
    const floorMat = r.name === 'bath' ? tile : wood.clone();
    if (r.name !== 'bath') { floorMat.map = wood.map.clone(); floorMat.map.needsUpdate = true; floorMat.map.repeat.set(w / 2.5, d / 2.5); }
    panel(w, d, floorMat, c, v3(0, 1, 0));
    panel(w, d, ceil, v3(c.x, H, c.z), v3(0, -1, 0));
  }
}

function buildFurniture() {
  // ---- living room / kitchen ----
  box(0, .65, 0, .9, .5, 3.6, '#8b809b');                                  // lower cabinets
  box(0, .7, .9, .95, .5, 3.6, '#d9d0c2');                                 // counter top
  box(0, .38, 1.55, 2.3, .5, 3.6, '#9a90aa', { collide: false, furniture: false });  // upper cabinets
  box(0, .75, 0, 1.85, 3.8, 4.6, '#dfe2e2');                               // fridge
  box(1.5, 2.4, .72, .77, 1.0, 1.9, '#b48a5c');                            // kitchen table top
  for (const [lx, lz] of [[1.55, 1.05], [2.35, 1.05], [1.55, 1.85], [2.35, 1.85]]) box(lx - .03, lx + .03, 0, .72, lz - .03, lz + .03, '#8c6a46', { collide: false, block: false });
  solids.push({ x0: 1.5, x1: 2.4, z0: 1.0, z1: 1.9 });
  box(2.6, 5.4, 0, .45, 3.0, 3.9, '#7b5a43');                              // couch seat
  box(2.6, 5.4, .45, .95, 3.0, 3.25, '#6f503b');                           // couch back
  box(2.6, 2.85, .45, .7, 3.25, 3.9, '#6f503b', { collide: false });
  box(5.15, 5.4, .45, .7, 3.25, 3.9, '#6f503b', { collide: false });
  box(3.0, 3.8, .45, .58, 3.3, 3.85, '#9a7a5e', { collide: false });       // cushions
  box(4.2, 5.0, .45, .58, 3.3, 3.85, '#9a7a5e', { collide: false });
  box(3.5, 4.5, 0, .42, 4.3, 4.9, '#a0784f');                              // coffee table
  panel(2.4, 1.6, wash('#b46e5e'), v3(4, .006, 4.6), v3(0, 1, 0));        // rug
  box(3.0, 5.0, 0, .5, 5.5, 5.92, '#4a3b33');                              // tv stand
  box(3.2, 4.8, .55, 1.45, 5.8, 5.88, '#1d1c1f', { collide: false });      // tv
  panel(1.5, .82, new THREE.MeshBasicMaterial({ map: texFrom(washCanvas('#3d5389', 128, 12, .2)) }), v3(4, 1.0, 5.795), v3(0, 0, -1));
  box(5.4, 5.8, 0, 1.1, 5.4, 5.85, '#29262f');                             // speaker
  box(7.4, 7.92, 0, .35, 1.3, 2.0, '#9c7b5a');                             // shoe rack
  box(7.45, 7.62, .35, .45, 1.35, 1.62, '#c25a4e', { collide: false });    // shoes
  box(7.68, 7.85, .35, .45, 1.35, 1.62, '#c25a4e', { collide: false });
  box(7.45, 7.62, .35, .45, 1.7, 1.96, '#34405a', { collide: false });
  box(7.9, 7.93, 0, 2.05, 2.2, 3.1, '#6d4c3a', { collide: false, furniture: false }); // front door
  box(.6, 1.0, 0, .35, 5.3, 5.7, '#b8694f');                               // plant pot
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(.4, 10, 8), wash('#6a8f5a'));
  leaves.position.set(.8, .75, 5.5); leaves.scale.set(1, 1.2, 1); scene.add(leaves);
  // window over the sea, and the skylight
  const sea = new THREE.MeshBasicMaterial({ map: texFrom(washCanvas('#9cc0d8', 128, 14, .18)) });
  panel(2.2, 1.2, sea, v3(1.8, 1.5, 5.915), v3(0, 0, -1));
  panel(1.5, 1.2, sea, v3(5.75, H - .01, 1.6), v3(0, -1, 0));
  // disco ball
  discoBall = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), new THREE.MeshLambertMaterial({ color: 0xcdd3da, flatShading: true, emissive: 0x222233 }));
  discoBall.position.set(4, H - .45, 2.6); scene.add(discoBall);

  // ---- bedroom ----
  box(.1, 1.75, 0, .5, -3.92, -1.8, '#e7e0d3');                            // bed frame
  box(.1, 1.75, .5, .58, -3.2, -1.8, '#5f7aa8', { collide: false });       // blanket
  box(.25, 1.6, .5, .66, -3.85, -3.4, '#f4f1ea', { collide: false });      // pillow
  box(1.9, 2.4, 0, .55, -3.9, -3.45, '#a0784f');                           // nightstand
  box(2.05, 2.25, .55, .85, -3.75, -3.6, '#efd9a8', { collide: false });   // lamp
  box(3.4, 3.92, 0, 1.0, -2.6, -1.2, '#9c7b5a');                           // dresser
  panel(.7, .9, wash('#c97b66'), v3(2.6, 1.6, -3.915), v3(0, 0, 1));      // "SEA" poster

  // ---- bathroom ----
  box(5.5, 6.92, 0, .55, -2.92, -2.15, '#f2f2ee');                         // tub
  box(4.1, 4.55, 0, .45, -2.9, -2.4, '#f2f2ee');                           // toilet
  box(4.1, 4.6, .72, .86, -1.6, -1.0, '#f2f2ee');                          // sink
  box(4.25, 4.45, 0, .72, -1.4, -1.2, '#e6e6e0');
  solids.push({ x0: 4.1, x1: 4.6, z0: -1.6, z1: -1.0 });
  panel(.5, .7, wash('#c9dbe2'), v3(4.085, 1.5, -1.3), v3(1, 0, 0));      // mirror
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xd9c7ae, 1.0));
  scene.add(new THREE.AmbientLight(0xfff1dc, .3));
  const lamp = (color, i, d, x, y, z) => { const l = new THREE.PointLight(color, i, d, 1.5); l.position.set(x, y, z); scene.add(l); return l; };
  lamp(0xffd9a0, .7, 6, 2.15, 1.1, -3.6);    // bedside lamp
  lamp(0xeaf4ff, .6, 5, 5.5, 2.3, -1.5);     // bathroom
  lamp(0xcfe6ff, .5, 6, 5.75, 2.3, 1.6);     // skylight
  clubLights = [
    [0xd9708a, 2, 2.2, 2], [0x6fa8c8, 5.5, 2.2, 1.5], [0x9a7ad0, 5.5, 2.2, 4.6],
  ].map(([c, x, y, z]) => ({ light: lamp(c, 1, 7, x, y, z), x, z }));
}

function addSurface(O, U, V, lu, lv, N, kind) {
  if (lu > .3 && lv > .3) surfaces.push({ O, U, V, lu, lv, N, kind, area: lu * lv * (kind === 'floor' ? 1.4 : 1) });
}
function buildSurfaces() {
  for (const r of ROOMS) {
    addSurface(v3(r.x0, 0, r.z0), v3(1, 0, 0), v3(0, 0, 1), r.x1 - r.x0, r.z1 - r.z0, v3(0, 1, 0), 'floor');
    addSurface(v3(r.x0, H, r.z0), v3(1, 0, 0), v3(0, 0, 1), r.x1 - r.x0, r.z1 - r.z0, v3(0, -1, 0), 'ceiling');
    const edges = [
      { along: 'x', at: r.z0, from: r.x0, to: r.x1, off: T / 2,  N: v3(0, 0, 1) },
      { along: 'x', at: r.z1, from: r.x0, to: r.x1, off: -T / 2, N: v3(0, 0, -1) },
      { along: 'z', at: r.x0, from: r.z0, to: r.z1, off: T / 2,  N: v3(1, 0, 0) },
      { along: 'z', at: r.x1, from: r.z0, to: r.z1, off: -T / 2, N: v3(-1, 0, 0) },
    ];
    for (const e of edges) {
      const doors = WALLS.filter(w => w.along === e.along && w.at === e.at).flatMap(w => w.doors)
        .map(([a, b]) => [Math.max(a - .05, e.from), Math.min(b + .05, e.to)]).filter(([a, b]) => b > a);
      const U = e.along === 'x' ? v3(1, 0, 0) : v3(0, 0, 1);
      const base = (s, y) => e.along === 'x' ? v3(s, y, e.at + e.off) : v3(e.at + e.off, y, s);
      for (const [a, b] of subtract([e.from + T / 2, e.to - T / 2], doors)) addSurface(base(a, 0), U, v3(0, 1, 0), b - a, H, e.N, 'wall');
      for (const [a, b] of doors) addSurface(base(a, DOOR_H), U, v3(0, 1, 0), b - a, H - DOOR_H, e.N, 'wall');
    }
  }
}

// ---------- Spiders ----------
function spiderTemplate(type) {
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const body = type === 'gold'
    ? new THREE.MeshLambertMaterial({ color: 0xd9a72c, emissive: 0x6a4a08 })
    : type === 'party'
      ? new THREE.MeshLambertMaterial({ color: 0x3a2a40, emissive: 0x2a0f3a })
      : new THREE.MeshLambertMaterial({ color: 0x3a2e26 });
  const legMat = new THREE.MeshLambertMaterial({ color: type === 'gold' ? 0xb7861c : 0x2a211c });
  const root = new THREE.Group(), model = new THREE.Group();
  root.add(model);
  const abdomen = new THREE.Mesh(sphere, body);
  abdomen.scale.set(.075, .06, .095); abdomen.position.set(0, .075, -.08);
  const thorax = new THREE.Mesh(sphere, body);
  thorax.scale.set(.05, .04, .055); thorax.position.set(0, .065, .04);
  model.add(abdomen, thorax);
  const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'gold' ? 0x111111 : 0xe9dccb });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(sphere, eyeMat);
    e.scale.setScalar(.011); e.position.set(sx * .018, .09, .085);
    model.add(e);
  }
  const fan = [.8, .28, -.22, -.7];
  for (const side of [-1, 1]) fan.forEach((f, i) => {
    const pivot = new THREE.Group();
    pivot.name = 'leg';
    pivot.position.set(side * .03, .065, .05 - i * .022);
    pivot.userData = { base: -side * f, off: (i % 2 ? 0 : Math.PI) + (side > 0 ? Math.PI : 0) };
    pivot.rotation.y = pivot.userData.base;
    const knee = v3(side * .1, .07, 0), foot = v3(side * .19, -.065, 0);
    pivot.add(limb(v3(0, 0, 0), knee, .009, legMat), limb(knee, foot, .007, legMat));
    model.add(pivot);
  });
  if (type === 'party') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(.025, .07, 10), new THREE.MeshLambertMaterial({ color: 0xd9708a, emissive: 0x5a1830 }));
    hat.name = 'hat'; hat.position.set(0, .135, .045);
    model.add(hat);
  }
  model.scale.setScalar(SIZES[type]);
  return root;
}

function surfacePoint(f, a, b, out) {
  return out.copy(f.O).addScaledVector(f.U, a).addScaledVector(f.V, b).addScaledVector(f.N, .004);
}
function onFurniture(p) {
  return furnFloor.some(f => p.x > f.x0 - .15 && p.x < f.x1 + .15 && p.z > f.z0 - .15 && p.z < f.z1 + .15);
}
function pickSurface() {
  let r = Math.random() * surfaces.reduce((s, f) => s + f.area, 0);
  for (const f of surfaces) { r -= f.area; if (r <= 0) return f; }
  return surfaces[0];
}
function randomType() {
  const r = Math.random();
  return r < .07 ? 'gold' : r < .32 ? 'party' : 'normal';
}

const tmpV = new THREE.Vector3(), tmpH = new THREE.Vector3(), tmpX = new THREE.Vector3(), tmpM = new THREE.Matrix4();
function placeSpider(s) {
  const f = s.surf;
  surfacePoint(f, s.a, s.b, s.mesh.position);
  tmpH.copy(f.U).multiplyScalar(Math.cos(s.h)).addScaledVector(f.V, Math.sin(s.h));
  tmpX.crossVectors(f.N, tmpH);
  tmpM.makeBasis(tmpX, f.N, tmpH);
  s.mesh.quaternion.setFromRotationMatrix(tmpM);
}

function spawnSpider(type) {
  const p = new THREE.Vector3();
  for (let tries = 0; tries < 16; tries++) {
    const surf = pickSurface(), m = .3;
    const a = rand(m, surf.lu - m), b = rand(m, surf.lv - m);
    surfacePoint(surf, a, b, p);
    if (surf.kind === 'floor' && onFurniture(p)) continue;
    if (p.distanceTo(camera.position) < 3) continue;
    const mesh = templates[type].clone();
    const legs = [];
    mesh.traverse(o => { if (o.name === 'leg') legs.push(o); });
    if (type === 'party') {
      const hat = mesh.getObjectByName('hat');
      hat.material = hat.material.clone();
      hat.material.color.setHSL(Math.random(), .55, .62);
    }
    const s = {
      mesh, legs, surf, a, b, type, h: rand(0, 6.28), phase: rand(0, 6),
      speed: SPEEDS[type] * rand(.85, 1.15), wander: type === 'party' ? 5 : 2.5, pause: rand(0, 1),
    };
    placeSpider(s);
    scene.add(mesh);
    G.spiders.push(s);
    return;
  }
}

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function animateLegs(s, amt) {
  for (const p of s.legs) p.rotation.y = p.userData.base + Math.sin(s.phase + p.userData.off) * .3 * amt;
}
function updateSpider(s, dt) {
  const f = s.surf;
  tmpV.subVectors(s.mesh.position, camera.position);
  let speed = s.speed;
  if (tmpV.length() < 2.4) {
    // scatter away from you
    const want = Math.atan2(tmpV.dot(f.V), tmpV.dot(f.U));
    s.h += angleDiff(want, s.h) * Math.min(1, dt * 5);
    speed *= 1.9; s.pause = 0;
  } else if (s.pause > 0) {
    s.pause -= dt; animateLegs(s, 0); return;
  } else if (Math.random() < dt * .35) s.pause = rand(.3, 1.4);
  s.h += (Math.random() - .5) * dt * s.wander;
  const pa = s.a, pb = s.b, m = .22;
  s.a += Math.cos(s.h) * speed * dt;
  s.b += Math.sin(s.h) * speed * dt;
  if (s.a < m || s.a > f.lu - m) { s.a = clampV(s.a, m, f.lu - m); s.h = Math.PI - s.h; }
  if (s.b < m || s.b > f.lv - m) { s.b = clampV(s.b, m, f.lv - m); s.h = -s.h; }
  if (f.kind === 'floor' && onFurniture(surfacePoint(f, s.a, s.b, tmpV))) {
    s.a = pa; s.b = pb; s.h += Math.PI * rand(.6, 1.4);
  }
  s.phase += dt * speed * 30;
  animateLegs(s, 1);
  placeSpider(s);
}

// ---------- What you're holding ----------
function buildViewmodel(key) {
  if (viewmodel) camera.remove(viewmodel);
  const g = new THREE.Group(), inner = new THREE.Group();
  g.add(inner);
  const M = hex => { const m = wash(hex).clone(); m.depthTest = false; return m; };
  const add = mesh => { mesh.renderOrder = 10; inner.add(mesh); return mesh; };
  const ball = (r, hex, p, s = [1, 1, 1]) => { const m = add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), M(hex))); m.position.copy(p); m.scale.set(...s); return m; };
  const block = (w, h, d, hex, p, along) => {
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(hex)));
    m.position.copy(p);
    if (along) m.quaternion.setFromUnitVectors(v3(0, 1, 0), along);
    return m;
  };
  if (key === 'broom') {
    const a = v3(0, -.3, .12), b = v3(-.08, .5, -.5), d = b.clone().sub(a).normalize();
    add(limb(a, b, .02, M('#b9875a')));
    block(.34, .07, .09, '#b84a5c', b.clone().addScaledVector(d, .02), d);
    block(.38, .26, .07, '#dcbb6f', b.clone().addScaledVector(d, .18), d);
    ball(.022, '#fbf7ef', b.clone().add(v3(-.06, 0, .05)));
    ball(.022, '#fbf7ef', b.clone().add(v3(.06, 0, .05)));
  } else if (key === 'duster') {
    const a = v3(0, -.22, .1), b = v3(-.05, .3, -.32), d = b.clone().sub(a).normalize();
    add(limb(a, b, .014, M('#8a5a3c')));
    const tip = b.clone().addScaledVector(d, .06);
    [[0, 0, 0, .07], [-.05, .02, .01, .05], [.05, .03, 0, .055], [0, .07, -.02, .055], [-.03, -.04, .03, .045], [.04, -.03, -.03, .05]]
      .forEach(([x, y, z, r], i) => ball(r, i % 2 ? '#efbcd2' : '#e39ab8', tip.clone().add(v3(x, y, z))));
  } else if (key === 'slipper') {
    const sole = ball(1, '#6f9fb5', v3(-.02, .08, -.2), [.07, .016, .16]);
    sole.rotation.x = -.9;
    const strap = add(new THREE.Mesh(new THREE.TorusGeometry(.05, .009, 6, 14, Math.PI), M('#f3ebdc')));
    strap.position.set(-.02, .11, -.22); strap.rotation.x = -.9;
  } else {
    const a = v3(0, -.3, .12), b = v3(-.06, .25, -.78), d = b.clone().sub(a).normalize();
    add(limb(a, b, .022, M('#8a8a8a')));
    block(.36, .05, .14, '#7d64a8', b.clone().addScaledVector(d, .03), d);
    ball(.07, '#7d64a8', a.clone().add(v3(0, .06, .02)), [1, 1.6, 1]);
  }
  g.position.set(.4, -.4, -.55);
  g.rotation.z = -.42;
  g.scale.setScalar(.72);
  camera.add(g);
  viewmodel = g;
  viewmodel.userData.inner = inner;
}

// ---------- Pencil-sketch render: outlines from depth and light, cross-hatched shadows, paper ----------
const SKETCH_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const SKETCH_FRAG = `
precision highp float;
uniform sampler2D tColor, tDepth;
uniform vec2 res;
uniform float near, far, dpr;
varying vec2 vUv;
float lin(float d) { float z = d * 2. - 1.; return (2. * near * far) / (far + near - z * (far - near)); }
float lum(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float hatch(vec2 px, float ang, float spacing) {
  float c = cos(ang), s = sin(ang);
  vec2 r = vec2(c * px.x - s * px.y, s * px.x + c * px.y);
  r.y += (noise(vec2(r.x * .012, r.y * .04)) - .5) * 3.;
  float d = abs(fract(r.y / spacing) - .5) * spacing;
  float stroke = step(.22, noise(vec2(r.x * .018, floor(r.y / spacing) * 7.31)));
  return (1. - smoothstep(.3, 1.05, d)) * stroke;
}
void main() {
  vec2 px = vUv * res / dpr;
  vec2 t = dpr / res;
  vec3 col = texture2D(tColor, vUv).rgb;
  float L = lum(col);
  float dc = lin(texture2D(tDepth, vUv).x);
  float gx = 0., gy = 0., lx = 0., ly = 0.;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 o = vec2(float(i), float(j));
    float w = (i == 0 || j == 0) ? 2. : 1.;
    vec2 uv = vUv + o * t * 1.2;
    float d = lin(texture2D(tDepth, uv).x);
    float l = lum(texture2D(tColor, uv).rgb);
    gx += d * o.x * w; gy += d * o.y * w;
    lx += l * o.x * w; ly += l * o.y * w;
  }
  float dEdge = sqrt(gx * gx + gy * gy) / max(dc, .05);
  float lEdge = sqrt(lx * lx + ly * ly);
  float edge = clamp(smoothstep(.05, .16, dEdge) + smoothstep(.22, .55, lEdge) * .75, 0., 1.);
  edge *= .55 + .45 * noise(px * .35);
  float shade = 1.;
  shade -= hatch(px, .72, 6.) * smoothstep(.74, .52, L) * .5;
  shade -= hatch(px, -.88, 5.5) * smoothstep(.52, .33, L) * .55;
  shade -= hatch(px, .12, 5.) * smoothstep(.33, .16, L) * .6;
  shade -= hatch(px, 1.45, 4.5) * smoothstep(.16, .05, L) * .6;
  float ink = clamp((1. - clamp(shade, 0., 1.)) + edge * .9, 0., 1.);
  float grain = noise(px * .9) * .05 + noise(px * .04) * .05;
  vec3 paper = vec3(.965, .945, .905) - grain;
  vec3 graphite = vec3(.18, .165, .15);
  vec3 outc = mix(paper, graphite, ink);
  outc = mix(outc, outc * clamp(col / max(L, .06), 0., 1.6), .16 * (1. - ink * .6));
  outc *= .9 + .1 * L;
  gl_FragColor = vec4(outc, 1.);
}`;
let sketchRT, sketchScene, sketchCam, sketchMat;
function buildSketchPass() {
  sketchRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  sketchRT.depthTexture = new THREE.DepthTexture(1, 1);
  sketchRT.depthTexture.type = THREE.UnsignedIntType;
  sketchMat = new THREE.ShaderMaterial({
    vertexShader: SKETCH_VERT, fragmentShader: SKETCH_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: sketchRT.texture }, tDepth: { value: sketchRT.depthTexture },
      res: { value: new THREE.Vector2(1, 1) }, near: { value: camera.near }, far: { value: camera.far }, dpr: { value: 1 },
    },
  });
  sketchScene = new THREE.Scene();
  sketchCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  sketchScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sketchMat));
}
function renderSketch() {
  renderer.setRenderTarget(sketchRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(sketchScene, sketchCam);
}

// ---------- Build once ----------
let built = false;
function build() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  el('g3d').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f1e7);
  scene.fog = new THREE.Fog(0xf6f1e7, 7, 18);
  camera = new THREE.PerspectiveCamera(70, 1, .03, 40);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  buildSketchPass();
  buildWalls(); buildRooms(); buildFurniture(); buildLights(); buildSurfaces();
  for (const t of ['normal', 'party', 'gold']) templates[t] = spiderTemplate(t);
  splatTex = new THREE.CanvasTexture(splatCanvas());
  splatGeo = new THREE.PlaneGeometry(.5, .5);
  bindControls();
  built = true;
}

function resize() {
  if (!renderer) return;
  const w = el('g3d').clientWidth, h = el('g3d').clientHeight;
  renderer.setSize(w, h, false);
  const dpr = renderer.getPixelRatio();
  sketchRT.setSize(Math.round(w * dpr), Math.round(h * dpr));
  sketchMat.uniforms.res.value.set(Math.round(w * dpr), Math.round(h * dpr));
  sketchMat.uniforms.dpr.value = dpr;
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ================= PLAY =================
let G = null, weaponKey = 'broom', running = false, last = 0;
const P = { x: 6.4, z: 1.4, yaw: 0, pitch: 0, y: 0, vy: 0, bob: 0 };
const keys = new Set();
const MOVE = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
const held = list => list.some(k => keys.has(k));

function collides(x, z) {
  return solids.some(s => x > s.x0 - RADIUS && x < s.x1 + RADIUS && z > s.z0 - RADIUS && z < s.z1 + RADIUS);
}
function movePlayer(dt) {
  const f = (held(MOVE.forward) ? 1 : 0) - (held(MOVE.back) ? 1 : 0);
  const r = (held(MOVE.right) ? 1 : 0) - (held(MOVE.left) ? 1 : 0);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const len = Math.hypot(f, r);
  if (len) {
    const sp = (run ? 4.6 : 2.5) * dt / len, sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const dx = (-sy * f + cy * r) * sp, dz = (-cy * f - sy * r) * sp;
    if (!collides(P.x + dx, P.z)) P.x += dx;
    if (!collides(P.x, P.z + dz)) P.z += dz;
    if (P.y === 0) P.bob += dt * (run ? 13 : 9);
  }
  P.vy -= 13 * dt;
  P.y = Math.max(0, P.y + P.vy * dt);
  if (P.y === 0) P.vy = 0;
}
function placeCamera() {
  camera.position.set(P.x, EYE + P.y + Math.sin(P.bob) * .03, P.z);
  camera.rotation.set(P.pitch, P.yaw, 0);
  camera.updateMatrixWorld();
}

const fwd = new THREE.Vector3(), ray = new THREE.Raycaster();
function targets(w) {
  camera.getWorldDirection(fwd);
  const found = [];
  for (const s of G.spiders) {
    const dir = s.mesh.position.clone().addScaledVector(s.surf.N, .06).sub(camera.position);
    const d = dir.length();
    if (d > w.reach) continue;
    const ang = fwd.angleTo(dir);
    if (ang > w.cone + Math.atan(.16 / d)) continue;
    found.push({ s, d, ang, dir: dir.normalize() });
  }
  found.sort((p, q) => p.ang - q.ang);
  const hits = [];
  for (const f of found) {
    ray.set(camera.position, f.dir);
    ray.far = f.d;
    const h = ray.intersectObjects(occluders, false)[0];
    if (h && h.distance < f.d - .2) continue;
    hits.push(f.s);
    if (!w.multi) break;
  }
  return hits;
}

function swing() {
  const w = WEAPONS[weaponKey], now = performance.now();
  if (!G || G.over || G.paused || G.countdown > 0 || now - G.lastSwing < w.cd) return;
  G.lastSwing = now; G.swingT = 1; G.swings++;
  el('gTip').style.opacity = 0;
  Rave.swoosh();
  const hits = targets(w);
  if (!hits.length) { G.combo = 0; updateHud(); return; }
  G.hits++;
  for (const s of hits) {
    G.combo++; G.best = Math.max(G.best, G.combo);
    const pts = POINTS[s.type] * comboMult();
    G.score += pts; G.kills[s.type]++;
    splat(s);
    floater(`+${pts}`, s.type === 'gold');
    Rave.splat(s.type === 'gold');
    scene.remove(s.mesh);
    s.dead = true;
  }
  G.spiders = G.spiders.filter(s => !s.dead);
  const ch = el('crosshair');
  ch.classList.remove('hit'); void ch.offsetWidth; ch.classList.add('hit');
  updateHud();
}

function splat(s) {
  const mat = new THREE.MeshBasicMaterial({
    map: splatTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, color: s.type === 'gold' ? 0xffd27a : 0xffffff,
  });
  const m = new THREE.Mesh(splatGeo, mat);
  m.position.copy(s.mesh.position).addScaledVector(s.surf.N, .008);
  m.lookAt(m.position.clone().add(s.surf.N));
  m.rotateZ(rand(0, 6.28));
  m.scale.setScalar(rand(.9, 1.3) * SIZES[s.type]);
  scene.add(m);
  G.splats.push({ m, t: 1 });
  if (G.splats.length > 40) { const old = G.splats.shift(); scene.remove(old.m); old.m.material.dispose(); }
}

function floater(text, gold) {
  const f = document.createElement('div');
  f.className = 'floater' + (gold ? ' gold' : '');
  f.textContent = text;
  f.style.marginLeft = `${rand(-30, 30)}px`;
  f.addEventListener('animationend', () => f.remove());
  el('floaters').appendChild(f);
}

const comboMult = () => 1 + Math.min(4, Math.floor(G.combo / 5));
function updateHud() {
  el('hScore').textContent = G.score;
  el('hCombo').textContent = '×' + comboMult();
  el('hTime').textContent = Math.ceil(Math.max(0, G.time));
  el('hLoose').textContent = G.spiders.length;
  el('comboNote').textContent = G.combo >= 5 ? `${G.combo} in a row!` : '';
}

function clearWorld() {
  if (!G) return;
  G.spiders.forEach(s => scene.remove(s.mesh));
  G.splats.forEach(sp => { scene.remove(sp.m); sp.m.material.dispose(); });
}

function startRound() {
  gameEl.scrollIntoView({ behavior: 'instant', block: 'start' });
  document.body.classList.add('locked', 'in-game');
  show('play');
  if (!built) build();
  resize();
  buildViewmodel(weaponKey);
  clearWorld();
  Object.assign(P, { x: 6.4, z: 1.4, y: 0, vy: 0, bob: 0, pitch: -.05, yaw: Math.atan2(-(4 - 6.4), -(3.6 - 1.4)) });
  placeCamera();
  G = {
    spiders: [], splats: [], score: 0, combo: 0, best: 0, kills: { normal: 0, party: 0, gold: 0 },
    swings: 0, hits: 0, time: ROUND, countdown: 3, spawnIn: 1, lastSwing: 0, swingT: 0, paused: false, over: false,
  };
  for (let i = 0; i < START_SPIDERS; i++) spawnSpider(randomType());
  el('gTip').style.opacity = 1;
  el('gPause').hidden = true;
  keys.clear();
  updateHud();
  requestLock();
  Rave.start();
  syncMute();
  last = performance.now();
  if (!running) { running = true; requestAnimationFrame(loop); }
}

function loop() {
  if (!G || G.over) { running = false; return; }
  const now = performance.now();
  const dt = clampV((now - last) / 1000, 0, .05);
  last = now;
  if (!G.paused) {
    if (G.countdown > 0) {
      G.countdown -= dt;
      el('countdown').textContent = G.countdown > 0 ? Math.ceil(G.countdown) : 'GO!';
      if (G.countdown <= 0) setTimeout(() => { if (G && !G.over) el('countdown').textContent = ''; }, 600);
    } else {
      G.time -= dt;
      G.spawnIn -= dt;
      const progress = 1 - G.time / ROUND;
      if (G.spawnIn <= 0) {
        if (G.spiders.length < MAX_SPIDERS) spawnSpider(randomType());
        G.spawnIn = 1.5 - progress * .9;
      }
      if (G.time <= 0) { endRound(); return; }
    }
    movePlayer(dt);
    placeCamera();
    for (const s of G.spiders) updateSpider(s, dt);
    for (const sp of G.splats) { sp.t -= dt * .05; sp.m.material.opacity = Math.min(1, sp.t * 3); }
    G.swingT = Math.max(0, G.swingT - dt * 4.5);
  }
  // the held appliance: a chop when you swing, a sway when you walk
  const inner = viewmodel.userData.inner, sw = G.swingT;
  inner.rotation.x = -Math.sin((1 - sw) * Math.PI) * (sw > 0 ? 1.1 : 0);
  inner.rotation.z = Math.sin((1 - sw) * Math.PI) * (sw > 0 ? .35 : 0);
  viewmodel.position.set(.4 + Math.sin(P.bob * .5) * .015, -.4 + Math.abs(Math.cos(P.bob * .5)) * .012, -.55);
  // club lights pump to the beat
  const pump = Math.pow(1 - Rave.beat(), 3), t = now / 1000;
  clubLights.forEach((c, i) => {
    c.light.intensity = .25 + pump * .8;
    c.light.position.x = c.x + Math.sin(t * .8 + i * 2) * .8;
    c.light.position.z = c.z + Math.cos(t * .6 + i) * .8;
  });
  discoBall.rotation.y = t * .8;
  el('crosshair').classList.toggle('lock', !G.paused && G.countdown <= 0 && targets(WEAPONS[weaponKey]).length > 0);
  updateHud();
  renderSketch();
  requestAnimationFrame(loop);
}

function endRound() {
  G.over = true;
  running = false;
  el('countdown').textContent = '';
  if (document.pointerLockElement) document.exitPointerLock();
  document.body.classList.remove('locked');
  Rave.stop();
  const sc = G.score;
  const rank = sc < 10 ? 'Spider Landlord' : sc < 30 ? 'Bouncer in Training' : sc < 60 ? 'Head of Security'
    : sc < 100 ? 'The Club Is Closed' : `${WEAPONS[weaponKey].name[0].toUpperCase() + WEAPONS[weaponKey].name.slice(1)} Would Be Proud`;
  el('oRank').textContent = rank;
  el('oScore').textContent = sc;
  const acc = G.swings ? Math.round(G.hits / G.swings * 100) : 0;
  el('oStats').textContent =
    `With ${WEAPONS[weaponKey].name}: ${G.kills.normal} regular spiders, ${G.kills.party} party spiders, ` +
    `${G.kills.gold} golden VIPs. Best combo: ${G.best}. Accuracy: ${acc}%.`;
  show('over');
}

// ---------- Controls ----------
let everLocked = false, dragLook = false;
const drag = { down: false, moved: 0 };
const isLocked = () => renderer && document.pointerLockElement === renderer.domElement;

function requestLock() {
  const c = renderer.domElement;
  if (!c.requestPointerLock) { dragLook = true; return; }
  try {
    const p = c.requestPointerLock();
    if (p && p.catch) p.catch(onLockError);
  } catch (e) { onLockError(); }
}
// no pointer lock available: fall back to click-and-drag to look
function onLockError() {
  if (everLocked) return;
  dragLook = true;
  if (G) G.paused = false;
  el('gPause').hidden = true;
}
function look(dx, dy) {
  P.yaw -= dx * .0022;
  P.pitch = clampV(P.pitch - dy * .0022, -1.45, 1.45);
}

function bindControls() {
  const c = renderer.domElement;
  document.addEventListener('pointerlockerror', onLockError);
  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) {
      everLocked = true; dragLook = false;
      if (G) G.paused = false;
      el('gPause').hidden = true;
    } else if (G && !G.over && !dragLook) {
      G.paused = true; keys.clear();
      el('gPause').hidden = false;
    }
  });
  el('gPause').addEventListener('click', requestLock);
  document.addEventListener('mousemove', e => {
    if (!G || G.over || G.paused) return;
    if (isLocked()) look(e.movementX, e.movementY);
    else if (dragLook && drag.down) { look(e.movementX * 1.4, e.movementY * 1.4); drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY); }
  });
  c.addEventListener('mousedown', e => {
    if (e.button !== 0 || !G || G.over) return;
    if (isLocked()) swing();
    else if (dragLook) { drag.down = true; drag.moved = 0; }
    else requestLock();
  });
  window.addEventListener('mouseup', () => {
    if (drag.down && drag.moved < 6) swing();
    drag.down = false;
  });
  window.addEventListener('keydown', e => {
    if (!G || G.over || !screens.play.classList.contains('active')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!G.paused && P.y === 0) P.vy = 4.4;
      return;
    }
    if (e.code === 'KeyM') { Rave.toggleMute(); syncMute(); return; }
    if (e.code.startsWith('Arrow')) e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

function syncMute() {
  el('muteBtn').textContent = Rave.isMuted() ? 'Sound off · M' : 'Sound on · M';
}
el('muteBtn').addEventListener('click', () => { Rave.toggleMute(); syncMute(); });

document.querySelectorAll('.weapon').forEach(btn => btn.addEventListener('click', () => {
  weaponKey = btn.dataset.w;
  startRound();
}));
el('againBtn').addEventListener('click', startRound);
el('switchBtn').addEventListener('click', () => show('choose'));
el('topBtn').addEventListener('click', () => {
  Rave.stop();
  document.body.classList.remove('locked', 'in-game');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => show('choose'), 600);
});

// silence the club when you scroll back up into the story
new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting && !(G && !G.over)) { Rave.stop(); document.body.classList.remove('in-game'); }
}).observe(gameEl);
})();
