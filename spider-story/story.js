// ---------- Watercolor paper, painted once and shared by the story and the game ----------
(() => {
  const n = 384, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, n, n);
  // cockled paper: soft, tiling stains
  for (let i = 0; i < 46; i++) {
    const px = Math.random() * n, py = Math.random() * n, r = 30 + Math.random() * 110;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, 'rgba(120,96,64,.045)');
      g.addColorStop(.85, 'rgba(120,96,64,.06)');
      g.addColorStop(1, 'rgba(120,96,64,0)');
      x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  // cotton fibres
  x.lineWidth = 1;
  for (let i = 0; i < 320; i++) {
    const px = Math.random() * n, py = Math.random() * n, a = Math.random() * 6.28, l = 4 + Math.random() * 14;
    x.strokeStyle = `rgba(100,80,55,${.04 + Math.random() * .06})`;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(a + .6) * l * .5, py + Math.sin(a + .6) * l * .5, px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  const d = x.getImageData(0, 0, n, n);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = (Math.random() - .5) * 26;
    d.data[i] += g; d.data[i + 1] += g; d.data[i + 2] += g;
  }
  x.putImageData(d, 0, 0);
  document.documentElement.style.setProperty('--paper-tex', `url(${c.toDataURL()})`);
})();

// ---------- Scroll engine ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const scenes = [...document.querySelectorAll('.scene')];
const stages = {};
document.querySelectorAll('.stage').forEach(s => { stages[s.dataset.scene] = s; });
scenes.forEach(s => { s.style.height = (+s.dataset.len * 100) + 'vh'; });

const beats = {};
for (const [name, el] of Object.entries(stages)) beats[name] = [...el.querySelectorAll('[data-in]')];

// place a crawling spider (fractions of its drawing; r in degrees, 0 = head up)
const setBug = (el, x, y, r) => {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--r', r + 'deg');
};
// the "camera": zoom toward a focus point of a drawing
const frameShot = (el, z, fx, fy, rot = 0) => {
  el.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
  el.style.transform = `translate(-50%, -50%) scale(${z}) rotate(${rot}deg)`;
};
const lerp = (a, b, t) => a + (b - a) * t;
// lying in bed: put point (fx, fy) of the drawing mid-screen and roll the view onto its side,
// zooming in at least enough that no corner of the screen runs off the drawing
const lieShot = (el, z, fx, fy, rot) => {
  const W = window.innerWidth, H = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight;
  const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  let need = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * W / 2, y = sy * H / 2;
    const u = x * cos + y * sin, v = y * cos - x * sin;
    need = Math.max(need, u / (u > 0 ? (1 - fx) * w : -fx * w), v / (v > 0 ? (1 - fy) * h : -fy * h));
  }
  el.style.transformOrigin = `${fx * 100}% ${fy * 100}%`;
  el.style.transform = `translate(-50%, -50%) translate(${(.5 - fx) * w}px, ${(.5 - fy) * h}px) rotate(${rot}deg) scale(${Math.max(z, need * 1.01)})`;
};
const ROLL = -78; // head on the pillow
const tuck = (el, lie, rip = 0) => {
  el.style.transform = `translateY(${(1 - lie) * 110 + rip * 140}%) rotate(${rip * -10}deg)`;
};

const hooks = {
  intro(p) {
    const y = lerp(.08, .36, ease(seg(p, 0, .7)));
    $('introThread').setAttribute('y2', (y * 100 - 3).toFixed(2));
    setBug($('introSpider'), .5, y, 180 + Math.sin(p * 9) * 4);
    $('titleCard').style.opacity = 1 - seg(p, .7, .9);
  },

  island(p) {
    frameShot($('shotBridge'), 1 + seg(p, 0, .5) * .12, .3, .55);
    frameShot($('shotIsland'), 1.14 - seg(p, .45, 1) * .12, .5, .45);
  },

  spiders(p) {
    frameShot($('shotBath'), 1 + seg(p, 0, .38) * .14, .6, .15);
    setBug($('bathSpider'), .6, .12 + Math.sin(p * 60) * .003, 180 + Math.sin(p * 30) * 6);
    const t = seg(p, .4, .7);
    frameShot($('shotShoes'), 1.04 + t * .06, .5, .55);
    setBug($('shoeSpider'), .12 + t * .7, .64 - t * .1 + Math.sin(t * 14) * .025, 90 - Math.cos(t * 14) * 18);
    const a = seg(p, .7, 1) * Math.PI * 1.4;
    frameShot($('shotSky'), 1 + seg(p, .7, 1) * .1, .45, .5);
    setBug($('skySpider'), .45 + Math.cos(a) * .14, .5 + Math.sin(a) * .18, a * 180 / Math.PI + 180);
    $('spCount').textContent = Math.max(1, Math.round(Math.pow(seg(p, .2, 1), 1.6) * 214));
  },

  bed(p) {
    // lie down and roll onto your side, stare at the wall while the spider climbs it,
    // then sit bolt upright as the blankets fly
    const lie = ease(seg(p, 0, .16)), push = ease(seg(p, .05, .55)), up = ease(seg(p, .78, .88));
    const look = push * (1 - up);
    const shakeOn = !reduceMotion && p > .58 && p < .78;
    const sx = shakeOn ? (Math.random() - .5) * .01 : 0, sy = shakeOn ? (Math.random() - .5) * .01 : 0;
    lieShot($('shotBed'), lerp(1, 1.5, look), lerp(.5, .8, look) + sx, lerp(.5, .45, look) + sy, ROLL * lie * (1 - up));
    tuck($('bedBlanket'), lie, up);
    const climb = seg(p, .1, .6);
    setBug($('bedSpider'), .87 + Math.sin(climb * 18) * .006, lerp(.44, .1, climb), Math.sin(climb * 18) * 10);
    $('bedScribble').style.opacity = seg(p, .56, .62) * (1 - seg(p, .76, .82));
  },

  living(p) {
    frameShot($('shotLiving'), 1 + seg(p, 0, .14) * .1, .32, .48);
    const tilt = seg(p, .58, .64) * (1 - seg(p, .7, .74));
    frameShot($('shotCinder'), 1.06 + seg(p, .14, 1) * .08, .7, .35, tilt * -2.5);
  },

  arm(p) {
    const broom = ease(seg(p, .2, .4)), duster = ease(seg(p, .5, .66));
    $('armBroom').style.transform = `translateX(${(1 - broom) * -70}vw)`;
    $('armDuster').style.transform = `translateX(${(1 - duster) * 70}vw)`;
  },

  dance(p) {
    // look around the room, then up at the ceiling for the showdown
    const lookUp = ease(seg(p, .58, .68));
    frameShot($('shotDance'), 1.15, .5, lerp(.62, .04, lookUp));
    const flee = seg(p, .3, .58);
    document.querySelectorAll('#exSpiders .evictee').forEach((g, i) => {
      const [fx, fy] = g.dataset.from.split(' ').map(Number);
      const [tx, ty] = g.dataset.to.split(' ').map(Number);
      const t = clamp(flee * 1.3 - i * .1);
      g.style.left = lerp(fx, tx, t) * 100 + '%';
      g.style.top = (lerp(fy, ty, t) + Math.sin(t * 20 + i) * .008) * 100 + '%';
      g.style.opacity = t >= 1 ? 0 : 1;
    });
    const run = seg(p, .76, 1);
    setBug($('ceilSpider'), lerp(.5, .95, run), .05 + Math.sin(run * 30) * .004, 90 + Math.sin(run * 30) * 12);
  },

  night(p) {
    const lie = ease(seg(p, .02, .16));
    lieShot($('shotNight'), 1.05 + p * .08, .5, .4, ROLL * lie);
    tuck($('nightBlanket'), lie);
  },

  morning(p) {
    frameShot($('shotMorning'), 1.02 + p * .1, .45, .5);
  },
};

let activeName = null;
const leavingTimers = new Map();

function switchStage(name) {
  if (activeName) {
    // the old scene stays painted underneath while the new one washes in over it
    const prev = stages[activeName];
    prev.classList.remove('active');
    prev.classList.add('leaving');
    clearTimeout(leavingTimers.get(prev));
    leavingTimers.set(prev, setTimeout(() => prev.classList.remove('leaving'), 1100));
  }
  const next = stages[name];
  clearTimeout(leavingTimers.get(next));
  next.classList.remove('leaving');
  next.classList.add('active');
  activeName = name;
}

function frame(y) {
  const vh = window.innerHeight;
  let current = null, p = 0;

  scenes.forEach((sc, i) => {
    const top = sc.offsetTop, h = sc.offsetHeight;
    if (y >= top && y < top + h) {
      current = sc;
      const span = i === scenes.length - 1 ? Math.max(1, h - vh) : h;
      p = clamp((y - top) / span);
    }
  });
  // past the story: keep the last stage around while the game slides up
  if (!current && y >= scenes[scenes.length - 1].offsetTop) { current = scenes[scenes.length - 1]; p = 1; }
  if (!current) current = scenes[0];

  const name = current.dataset.scene;
  if (name !== activeName) switchStage(name);
  for (const el of beats[name]) {
    const a = +el.dataset.in, b = el.dataset.out !== undefined ? +el.dataset.out : 2;
    el.classList.toggle('on', p >= a && p < b);
  }
  hooks[name]?.(p, stages[name]);
}

// Ease the scenes toward the real scroll position, so motion glides instead of stepping
let shownY = window.scrollY, gliding = false, lastT = 0;
function glide(t) {
  const target = window.scrollY;
  const dt = lastT ? Math.min(64, t - lastT) : 16;
  lastT = t;
  if (reduceMotion || Math.abs(target - shownY) > window.innerHeight * 4) shownY = target;
  else shownY += (target - shownY) * (1 - Math.exp(-dt / 120));
  if (Math.abs(target - shownY) < .5) shownY = target;
  frame(shownY);
  if (shownY !== target) requestAnimationFrame(glide);
  else { gliding = false; lastT = 0; }
}
const kick = () => { if (!gliding) { gliding = true; requestAnimationFrame(glide); } };
window.addEventListener('scroll', kick, { passive: true });
window.addEventListener('resize', kick);
window.addEventListener('load', kick);
// keep the shake ticking even without scroll
setInterval(() => { if (activeName === 'bed') frame(shownY); }, 60);
frame(shownY);
