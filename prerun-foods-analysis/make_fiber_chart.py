"""Scatter chart: fiber vs calories (per 100 g) for the USDA pre-run foods list.

Writes, next to this script:
  fiber_vs_calories.svg   static chart with everyday foods labelled
  fiber_vs_calories.html  same chart, plus a checker: search the list or enter a nutrition
                          label to plot your own food and see its pre-run score and rank

Uses only the Python standard library.

Run:  python3 make_fiber_chart.py [path/to/prerun_foods_usda.csv]
"""
import csv
import json
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "prerun_foods_usda.csv"
OUT_SVG = HERE / "fiber_vs_calories.svg"
OUT_HTML = HERE / "fiber_vs_calories.html"

FITS = "#2f6fd6"
NOFIT = "#aab2bf"
INK = "#1f2430"
MUTED = "#6b7280"
GRID = "#e5e7eb"
GUIDE = "#e07b24"
BG = "#ffffff"
FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
LIMIT = 3.0  # g fiber per 100 kcal: highest value among foods flagged as fitting

# Everyday foods to label: (start of the USDA name, short label).
MAIN_FOODS = [
    ("Bananas, raw", "Banana"),
    ("Bagels, plain, enriched, with calcium propionate (includes onion, poppy, sesame)", "Plain bagel"),
    ("Bread, white, commercially prepared, toasted", "White toast"),
    ("Bread, whole-wheat, commercially prepared", "Whole-wheat bread"),
    ("Cereals, oats, instant, fortified, plain, prepared with water", "Oatmeal (cooked)"),
    ("Cereals, oats, regular and quick, not fortified, dry", "Rolled oats (dry)"),
    ("Pasta, cooked, enriched, without added salt", "Pasta (cooked)"),
    ("English muffins, whole grain white", "English muffin"),
    ("Peanut butter, smooth style, without salt", "Peanut butter"),
    ("Nuts, almonds", "Almonds"),
    ("Seeds, chia seeds, dried", "Chia seeds"),
    ("Seeds, flaxseed", "Flaxseed"),
    ("Blueberries, raw", "Blueberries"),
    ("Grapes, red or green", "Grapes"),
    ("Apples, raw, gala", "Apple"),
    ("Oranges, raw, all commercial varieties", "Orange"),
    ("Avocados, raw, all commercial varieties", "Avocado"),
    ("Beans, black, mature seeds, cooked, boiled, without salt", "Black beans"),
    ("Lentils, mature seeds, cooked, boiled, without salt", "Lentils"),
    ("Cereals ready-to-eat, SUN COUNTRY, KRETSCHMER Toasted Wheat Bran", "Wheat bran cereal"),
]


def num(v):
    return float(v) if v not in ("", None) else None


foods, skipped = [], 0
with open(SRC, newline="") as f:
    for r in csv.DictReader(f):
        kcal, fiber = num(r["calories_kcal"]), num(r["fiber_g"])
        if kcal is None or fiber is None:
            skipped += 1
            continue
        foods.append({
            "name": r["food"], "group": r["group"], "kcal": kcal, "fiber": fiber,
            "carbs": num(r["carbs_g"]), "protein": num(r["protein_g"]), "fat": num(r["fat_g"]),
            "sugar": num(r["sugar_g"]), "pc": num(r["pct_cal_carbs"]), "pp": num(r["pct_cal_protein"]),
            "pf": num(r["pct_cal_fat"]), "f100": num(r["fiber_per_100kcal"]),
            "fdc": r["fdc_id"], "fits": r["fits_prerun_rule"] == "yes", "label": None,
        })

for prefix, label in MAIN_FOODS:
    match = next((d for d in foods if d["name"].lower().startswith(prefix.lower())), None)
    if match:
        match["label"] = label
    else:
        print(f"  note: no food starting with {prefix!r}; skipped label")

n_fit = sum(d["fits"] for d in foods)

W, H = 960, 660
left, right, top, bottom = 70, 40, 120, 80
x_max = 100 * -(-max(d["kcal"] for d in foods) // 100)
y_max = 5 * -(-max(d["fiber"] for d in foods) // 5)


def x(v):
    return left + v / x_max * (W - left - right)


def y(v):
    return H - bottom - v / y_max * (H - top - bottom)


# ---- label placement: greedy, avoiding other labels and the labelled dots ----
CHAR_W, LABEL_H = 6.7, 14


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


labelled = sorted([d for d in foods if d["label"]], key=lambda d: -d["fiber"])
boxes = [(x(d["kcal"]) - 6, y(d["fiber"]) - 6, x(d["kcal"]) + 6, y(d["fiber"]) + 6) for d in labelled]
placements = []
for d in labelled:
    px, py = x(d["kcal"]), y(d["fiber"])
    w = len(d["label"]) * CHAR_W
    best = None
    for dist in (10, 22, 36, 52, 70, 90):
        for dx, dy in ((1, 0), (-1, 0), (0, -1), (0, 1), (1, -1), (-1, -1), (1, 1), (-1, 1)):
            lx = px + dx * dist + (0 if dx >= 0 else -w) + (-w / 2 if dx == 0 else 0)
            ly = py + dy * dist * 0.8
            box = (lx - 2, ly - LABEL_H / 2 - 1, lx + w + 2, ly + LABEL_H / 2 + 1)
            if box[0] < left + 2 or box[2] > W - right or box[1] < top or box[3] > H - bottom - 2:
                continue
            if any(overlaps(box, b) for b in boxes):
                continue
            best = (lx, ly, box, dist)
            break
        if best:
            break
    if best is None:  # fall back to the right of the dot
        best = (px + 10, py, (px + 8, py - 8, px + 12 + w, py + 8), 10)
    lx, ly, box, dist = best
    boxes.append(box)
    placements.append((d, lx, ly, box, dist))

# ---- SVG ----
svg = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="{FONT}" role="img" aria-label="Scatter chart of fiber versus calories per 100 grams for {len(foods)} foods">',
    f'<rect width="{W}" height="{H}" fill="{BG}"/>',
    f'<text x="24" y="38" font-size="24" font-weight="600" fill="{INK}">Fiber vs calories in pre-run foods</text>',
    f'<text x="24" y="62" font-size="14" fill="{MUTED}">{len(foods)} USDA foods, per 100 g. '
    f'{n_fit} fit the pre-run rule; all of them sit at or below {LIMIT:g} g fiber per 100 kcal.</text>',
    f'<circle cx="30" cy="86" r="5" fill="{FITS}"/>',
    f'<text x="42" y="90" font-size="13" fill="{INK}">Fits pre-run rule ({n_fit})</text>',
    f'<circle cx="210" cy="86" r="5" fill="{NOFIT}"/>',
    f'<text x="222" y="90" font-size="13" fill="{INK}">Doesn’t fit ({len(foods) - n_fit})</text>',
    f'<line x1="372" y1="86" x2="396" y2="86" stroke="{GUIDE}" stroke-width="2" stroke-dasharray="6 4"/>',
    f'<text x="404" y="90" font-size="13" fill="{INK}">{LIMIT:g} g fiber per 100 kcal</text>',
]
for t in range(0, int(x_max) + 1, 100):
    svg.append(f'<line x1="{x(t):.1f}" y1="{top}" x2="{x(t):.1f}" y2="{H - bottom}" stroke="{GRID}"/>')
    svg.append(f'<text x="{x(t):.1f}" y="{H - bottom + 20}" font-size="12" fill="{MUTED}" text-anchor="middle">{t}</text>')
for t in range(0, int(y_max) + 1, 5):
    svg.append(f'<line x1="{left}" y1="{y(t):.1f}" x2="{W - right}" y2="{y(t):.1f}" stroke="{GRID}"/>')
    svg.append(f'<text x="{left - 10}" y="{y(t) + 4:.1f}" font-size="12" fill="{MUTED}" text-anchor="end">{t}</text>')
svg.append(f'<text x="{(left + W - right) / 2:.1f}" y="{H - bottom + 46}" font-size="13" fill="{INK}" text-anchor="middle">Calories (kcal per 100 g)</text>')
svg.append(f'<text transform="translate(22 {(top + H - bottom) / 2:.1f}) rotate(-90)" font-size="13" fill="{INK}" text-anchor="middle">Fiber (g per 100 g)</text>')

gx_end = min(x_max, y_max / LIMIT * 100)
svg.append(f'<line x1="{x(0):.1f}" y1="{y(0):.1f}" x2="{x(gx_end):.1f}" y2="{y(gx_end * LIMIT / 100):.1f}" '
           f'stroke="{GUIDE}" stroke-width="2" stroke-dasharray="6 4"/>')

order = sorted(range(len(foods)), key=lambda i: (foods[i]["fits"], foods[i]["label"] is not None))
svg.append('<g id="dots">')
for i in order:
    d = foods[i]
    col = FITS if d["fits"] else NOFIT
    stroke = INK if d["label"] else BG
    tip = f'{d["name"]} ({d["group"]}): {d["kcal"]:g} kcal, {d["fiber"]:g} g fiber'
    svg.append(f'<circle class="dot" data-i="{i}" cx="{x(d["kcal"]):.1f}" cy="{y(d["fiber"]):.1f}" '
               f'r="{5.5 if d["label"] else 4.5}" fill="{col}" fill-opacity="{0.95 if d["label"] else 0.7}" '
               f'stroke="{stroke}" stroke-width="{1.2 if d["label"] else 0.8}"><title>{escape(tip)}</title></circle>')
svg.append("</g>")

svg.append('<g id="labels">')
for d, lx, ly, box, dist in placements:
    px, py = x(d["kcal"]), y(d["fiber"])
    i = foods.index(d)
    if dist > 12:
        ex = min(max(px, box[0]), box[2])
        ey = min(max(py, box[1]), box[3])
        svg.append(f'<line x1="{px:.1f}" y1="{py:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="{MUTED}" stroke-width="0.8"/>')
    common = f'x="{lx:.1f}" y="{ly + 4:.1f}" font-size="12" font-weight="600"'
    svg.append(f'<text {common} fill="{BG}" stroke="{BG}" stroke-width="3.5" stroke-linejoin="round">{escape(d["label"])}</text>')
    svg.append(f'<text class="lbl" data-i="{i}" {common} fill="{INK}">{escape(d["label"])}</text>')
svg.append("</g>")
svg.append(f'<text x="24" y="{H - 14}" font-size="12" fill="{MUTED}">Source: USDA FoodData Central (SR Legacy). '
           f'{skipped} foods with no fiber or calorie value are left out.</text>')
svg.append("</svg>")
svg_text = "\n".join(svg)
OUT_SVG.write_text(svg_text, encoding="utf-8")

# ---- HTML: same chart, plus "check your food" (search the list or enter a label) ----
# Pre-run rule, reverse-engineered from the CSV's fits_prerun_rule column (matches all rows):
RULE = {"min_carb_pct": 60, "max_fat_pct": 20, "max_protein_pct": 30, "max_fiber_per_100kcal": LIMIT}

data = [{k: d[k] for k in ("name", "group", "kcal", "fiber", "carbs", "protein", "fat", "sugar",
                           "pc", "pp", "pf", "f100", "fdc", "fits", "label")} for d in foods]
config = {"W": W, "H": H, "left": left, "right": right, "top": top, "bottom": bottom,
          "xMax": x_max, "yMax": y_max, "rule": RULE}

HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pre-Run Food Checker</title>
<style>
  :root { --ink:__INK__; --muted:__MUTED__; --line:__GRID__; --fits:__FITS__; --no:__NOFIT__; --accent:__GUIDE__;
          --mine:#c2255c; --good:#1f7a4d; --goodbg:#e2f3ea; --mid:#8a5a00; --midbg:#fbf0d9; --bad:#a1262e; --badbg:#fbe4e5;
          color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f4f5f7; color:var(--ink); font-family:__FONT__; font-size:14px; }
  .wrap { display:flex; flex-wrap:wrap; gap:20px; padding:20px max(16px, env(safe-area-inset-left)); align-items:flex-start; }
  .card { background:#fff; border:1px solid var(--line); border-radius:8px; }
  .checker { flex:1 1 100%; padding:18px; }
  .checker h1 { font-size:18px; margin:0 0 4px; }
  .checker .sub { color:var(--muted); margin:0 0 14px; line-height:1.45; }
  .tabs { display:flex; gap:6px; margin-bottom:12px; }
  .tabs button { font:inherit; padding:6px 14px; border-radius:999px; border:1px solid var(--line); background:#fff; color:var(--ink); cursor:pointer; }
  .tabs button[aria-selected="true"] { background:var(--ink); color:#fff; border-color:var(--ink); }
  .searchbox { position:relative; max-width:560px; }
  input[type=text], input[type=number] { font:inherit; padding:8px 10px; border:1px solid #cfd4dc; border-radius:6px; width:100%; background:#fff; color:var(--ink); }
  input:focus { outline:2px solid #9ec0f5; outline-offset:0; border-color:#2f6fd6; }
  .results { list-style:none; margin:4px 0 0; padding:4px 0; position:absolute; z-index:5; left:0; right:0; background:#fff;
             border:1px solid var(--line); border-radius:6px; box-shadow:0 6px 18px rgba(0,0,0,.08); max-height:300px; overflow:auto; }
  .results li { padding:7px 10px; cursor:pointer; display:flex; justify-content:space-between; gap:10px; }
  .results li[aria-selected="true"], .results li:hover { background:#eef3fc; }
  .results small { color:var(--muted); white-space:nowrap; }
  .results .none { color:var(--muted); cursor:default; }
  form.label { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px 12px; align-items:end; }
  form.label label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
  form.label .wide { grid-column:1 / -1; max-width:560px; }
  .btn { font:inherit; font-weight:600; padding:8px 16px; border-radius:6px; border:0; background:var(--mine); color:#fff; cursor:pointer; }
  .btn.ghost { background:#fff; color:var(--ink); border:1px solid var(--line); font-weight:500; }
  .err { color:var(--bad); margin:8px 0 0; min-height:1em; }
  .mine-list { margin-top:16px; border-top:1px solid var(--line); padding-top:12px; }
  .mine-list h3 { font-size:13px; margin:0 0 8px; display:flex; justify-content:space-between; align-items:center; }
  .mine-list ol { margin:0; padding:0; list-style:none; display:flex; flex-wrap:wrap; gap:8px; }
  .chip { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:999px; padding:3px 4px 3px 10px; cursor:pointer; background:#fff; }
  .chip:hover { border-color:#b9c0cb; }
  .chip b { font-variant-numeric:tabular-nums; }
  .chip .x { border:0; background:none; color:var(--muted); cursor:pointer; font-size:15px; line-height:1; padding:2px 6px; border-radius:999px; }
  .chip .x:hover { background:#eceef1; color:var(--ink); }
  .empty { color:var(--muted); margin:0; }
  .chart { flex:1 1 640px; min-width:0; overflow:hidden; }
  .chart svg { width:100%; height:auto; display:block; }
  .dot, .lbl, .mine { cursor:pointer; }
  .dot:hover { stroke:var(--ink); stroke-width:2; }
  aside { flex:0 1 340px; min-width:260px; padding:18px; position:sticky; top:20px; }
  aside h2 { margin:0 0 4px; font-size:17px; line-height:1.3; }
  .group { color:var(--muted); margin:0 0 12px; }
  .pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:600; margin-bottom:12px; }
  .pill.yes { background:#e3ecfb; color:#1d4fa3; }
  .pill.no { background:#eceef1; color:#4b5563; }
  .pill.you { background:#fbe3ec; color:var(--mine); margin-left:4px; }
  .score { display:flex; gap:14px; align-items:center; padding:12px; border-radius:8px; margin:0 0 12px; }
  .score.good { background:var(--goodbg); color:var(--good); } .score.mid { background:var(--midbg); color:var(--mid); } .score.bad { background:var(--badbg); color:var(--bad); }
  .score .big { font-size:30px; font-weight:700; font-variant-numeric:tabular-nums; line-height:1; }
  .score .big small { font-size:13px; font-weight:600; }
  .score .verdict { font-weight:700; }
  .score .rank { font-size:12px; color:var(--ink); margin-top:2px; }
  .checks { list-style:none; padding:0; margin:0 0 12px; }
  .checks li { display:flex; gap:8px; padding:3px 0; }
  .checks .ok { color:var(--good); font-weight:700; } .checks .miss { color:var(--bad); font-weight:700; }
  .checks span:last-child { color:var(--muted); margin-left:auto; font-variant-numeric:tabular-nums; }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
  td { padding:5px 0; border-bottom:1px solid var(--line); }
  td:last-child { text-align:right; font-weight:600; }
  .bar { display:flex; height:10px; border-radius:5px; overflow:hidden; margin:14px 0 4px; background:var(--line); }
  .bar span:nth-child(1) { background:#3b82f6; } .bar span:nth-child(2) { background:#10b981; } .bar span:nth-child(3) { background:#f59e0b; }
  .legend { font-size:12px; color:var(--muted); }
  .hint { color:var(--muted); line-height:1.5; margin:0; }
  .note { font-size:12px; color:var(--muted); line-height:1.45; margin:10px 0 0; }
  .near { font-size:12px; color:var(--muted); margin:12px 0 0; line-height:1.5; }
  .near button { font:inherit; border:0; background:none; color:#1d4fa3; padding:0; cursor:pointer; text-decoration:underline; }
  a { color:#1d4fa3; }
  .src { font-size:12px; margin-top:12px; }
  details.how { margin-top:12px; font-size:12px; color:var(--muted); line-height:1.5; }
  details.how summary { cursor:pointer; color:var(--ink); }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<div class="wrap">
  <section class="card checker" aria-labelledby="chk-h">
    <h1 id="chk-h">Check a food you eat</h1>
    <p class="sub">Find it in the USDA list, or type in its nutrition label. It’s placed on the chart and scored 0–100 against the
      pre-run rule (mostly carbs, little fat, little fiber, not too much protein), then ranked against all __N__ foods.</p>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-search" aria-selected="true" aria-controls="pane-search">Search USDA list</button>
      <button type="button" role="tab" id="tab-label" aria-selected="false" aria-controls="pane-label">Enter nutrition label</button>
    </div>
    <div id="pane-search" role="tabpanel" aria-labelledby="tab-search">
      <div class="searchbox">
        <input id="q" type="text" placeholder="Try “banana”, “bagel”, “peanut butter”…" autocomplete="off"
               role="combobox" aria-expanded="false" aria-controls="results" aria-autocomplete="list">
        <ul id="results" class="results" role="listbox" hidden></ul>
      </div>
    </div>
    <div id="pane-label" role="tabpanel" aria-labelledby="tab-label" hidden>
      <form class="label" id="label-form" novalidate>
        <label class="wide">Food name<input type="text" name="name" placeholder="e.g. Honey Stinger waffle" required></label>
        <label>Serving size (g)<input type="number" name="grams" min="1" step="any" value="100" required></label>
        <label>Calories<input type="number" name="kcal" min="1" step="any" required></label>
        <label>Total carbs (g)<input type="number" name="carbs" min="0" step="any" required></label>
        <label>Fiber (g)<input type="number" name="fiber" min="0" step="any" required></label>
        <label>Protein (g)<input type="number" name="protein" min="0" step="any" required></label>
        <label>Fat (g)<input type="number" name="fat" min="0" step="any" required></label>
        <label>Sugar (g, optional)<input type="number" name="sugar" min="0" step="any"></label>
        <div><button class="btn" type="submit">Add to chart</button></div>
      </form>
      <p class="err" id="form-err" role="alert"></p>
    </div>
    <div class="mine-list">
      <h3><span>Your foods, best pre-run pick first</span>
        <button type="button" class="btn ghost" id="clear-mine" hidden>Clear all</button></h3>
      <ol id="mine"></ol>
      <p class="empty" id="mine-empty">Nothing added yet. Foods you check show up here and stay saved in this browser.</p>
    </div>
  </section>
  <div class="card chart">__SVG__</div>
  <aside class="card" id="panel" aria-live="polite">
    <p class="hint">Click any dot (or a label) to see that food’s nutrition per 100 g and how it scores, or check one of your own foods above.</p>
  </aside>
</div>
<script>
const FOODS = __DATA__;
const CFG = __CONFIG__;
const RULE = CFG.rule;
const SVGNS = 'http://www.w3.org/2000/svg';
const MINE = '#c2255c';
const svg = document.querySelector('.chart svg');
const panel = document.getElementById('panel');
const STORE_KEY = 'prerun-my-foods-v1';

// ---------- scoring ----------
// Each part is 0..1; 1 = ideal pre-run. Weights: carbs 40%, fat 30%, fiber 30%.
const clamp01 = v => Math.max(0, Math.min(1, v));
function parts(d) {
  return {
    carbs: clamp01((d.pc - 40) / (80 - 40)),           // 40% of calories → 0, 80%+ → 1
    fat: clamp01(1 - d.pf / 40),                       // 0% → 1, 40%+ → 0
    fiber: clamp01(1 - d.f100 / (2 * RULE.max_fiber_per_100kcal)), // 0 g → 1, 6 g+ per 100 kcal → 0
  };
}
function score(d) {
  if (d.pc === null || d.pf === null || d.f100 === null) return null;
  const p = parts(d);
  return Math.round(100 * (0.4 * p.carbs + 0.3 * p.fat + 0.3 * p.fiber));
}
function passes(d) {
  return d.pc >= RULE.min_carb_pct && d.pf <= RULE.max_fat_pct && d.pp <= RULE.max_protein_pct && d.f100 <= RULE.max_fiber_per_100kcal;
}
FOODS.forEach(d => { d.score = score(d); });
const RANKED = FOODS.filter(d => d.score !== null).sort((a, b) => b.score - a.score);
function rankOf(s) {   // 1 + number of USDA foods that score strictly higher
  let n = 0; for (const d of RANKED) { if (d.score > s) n++; else break; }
  return n + 1;
}
function verdict(s) {
  if (s >= 80) return ['good', 'Great pre-run pick'];
  if (s >= 60) return ['mid', 'OK before a run'];
  return ['bad', 'Better after the run'];
}

// ---------- chart helpers ----------
const xs = v => CFG.left + v / CFG.xMax * (CFG.W - CFG.left - CFG.right);
const ys = v => CFG.H - CFG.bottom - v / CFG.yMax * (CFG.H - CFG.top - CFG.bottom);
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
function plotXY(d) {
  const kx = Math.min(d.kcal, CFG.xMax), fy = Math.min(d.fiber, CFG.yMax);
  return { cx: xs(kx), cy: ys(fy), off: kx !== d.kcal || fy !== d.fiber };
}
const ring = svgEl('circle', { r: 10, fill: 'none', stroke: '__GUIDE__', 'stroke-width': 2.5, visibility: 'hidden', 'pointer-events': 'none' });
const mineLayer = svgEl('g', { id: 'mine-layer' });
svg.append(mineLayer, ring);
// legend entry for "your foods"
const lg = svgEl('g', {});
lg.append(svgEl('path', { d: diamond(600, 86, 6), fill: MINE, stroke: '#fff', 'stroke-width': 1 }));
const lgt = svgEl('text', { x: 612, y: 90, 'font-size': 13, fill: '__INK__' }); lgt.textContent = 'Your foods';
lg.append(lgt); svg.append(lg);
function diamond(cx, cy, r) { return `M${cx},${cy - r}L${cx + r},${cy}L${cx},${cy + r}L${cx - r},${cy}Z`; }
function pointAt(cx, cy) {
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('visibility', 'visible');
}

// ---------- detail panel ----------
const fmt = (v, unit = '') => v === null || v === undefined || Number.isNaN(v) ? '—' : (Math.round(v * 10) / 10) + unit;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function show(d) {
  if (d.mine) { pointAt(d._cx, d._cy); } else {
    const dot = document.querySelector('.dot[data-i="' + FOODS.indexOf(d) + '"]');
    pointAt(dot.getAttribute('cx'), dot.getAttribute('cy'));
  }
  panel.replaceChildren();
  panel.append(el('h2', '', d.label || d.name));
  if (d.label) panel.append(el('p', 'group', d.name));
  if (d.group) panel.append(el('p', 'group', d.group));
  const fits = passes(d);
  const pills = el('div');
  pills.append(el('span', 'pill ' + (fits ? 'yes' : 'no'), fits ? 'Fits pre-run rule' : 'Doesn’t fit pre-run rule'));
  if (d.mine) pills.append(el('span', 'pill you', 'Your food'));
  panel.append(pills);

  if (d.score !== null) {
    const [cls, words] = verdict(d.score);
    const r = rankOf(d.score);
    const better = RANKED.filter(o => o.score < d.score).length;
    const box = el('div', 'score ' + cls);
    const big = el('div', 'big', String(d.score)); big.append(el('small', '', '/100'));
    const txt = el('div');
    txt.append(el('div', 'verdict', words));
    const tied = RANKED.filter(o => o.score === d.score && o !== d).length;
    txt.append(el('div', 'rank', `Ranks #${r} of ${RANKED.length}${tied ? ' (tied)' : ''} · beats ${Math.round(100 * better / RANKED.length)}% of foods`));
    box.append(big, txt);
    panel.append(box);

    const checks = el('ul', 'checks');
    [[d.pc >= RULE.min_carb_pct, `At least ${RULE.min_carb_pct}% of calories from carbs`, fmt(d.pc, '%')],
     [d.pf <= RULE.max_fat_pct, `No more than ${RULE.max_fat_pct}% from fat`, fmt(d.pf, '%')],
     [d.pp <= RULE.max_protein_pct, `No more than ${RULE.max_protein_pct}% from protein`, fmt(d.pp, '%')],
     [d.f100 <= RULE.max_fiber_per_100kcal, `No more than ${RULE.max_fiber_per_100kcal} g fiber per 100 kcal`, fmt(d.f100, ' g')]]
      .forEach(([ok, text, val]) => {
        const li = el('li'); li.append(el('span', ok ? 'ok' : 'miss', ok ? '✓' : '✗'), el('span', '', text), el('span', '', val)); checks.append(li);
      });
    panel.append(checks);
  }

  const t = el('table');
  [['Calories', fmt(d.kcal, ' kcal')], ['Carbs', fmt(d.carbs, ' g')], ['Sugar', fmt(d.sugar, ' g')],
   ['Fiber', fmt(d.fiber, ' g')], ['Protein', fmt(d.protein, ' g')], ['Fat', fmt(d.fat, ' g')]]
    .forEach(([k, v]) => { const tr = el('tr'); tr.append(el('td', '', k), el('td', '', v)); t.append(tr); });
  panel.append(el('p', 'legend', 'Per 100 g' + (d.mine ? ` · your ${fmt(d.grams, ' g')} serving is ${fmt(d.kcal * d.grams / 100, ' kcal')}` : '')));
  panel.append(t);
  if (d.pc !== null) {
    const bar = el('div', 'bar');
    [d.pc, d.pp, d.pf].forEach(p => { const s = el('span'); s.style.width = Math.max(0, p || 0) + '%'; bar.append(s); });
    panel.append(bar);
    panel.append(el('div', 'legend', `Calories from carbs ${fmt(d.pc, '%')} · protein ${fmt(d.pp, '%')} · fat ${fmt(d.pf, '%')}`));
  }
  if (d.mine && d._off) panel.append(el('p', 'note', 'This food is beyond the chart’s axes, so its marker is pinned to the edge.'));

  // nearby foods in the ranking, so the number means something
  if (d.score !== null) {
    const others = RANKED.filter(o => o !== d);
    const above = others.filter(o => o.score >= d.score).slice(-2);
    const below = others.filter(o => o.score < d.score).slice(0, 2);
    const near = [...above, ...below];
    if (near.length) {
      const p = el('p', 'near', 'Scores nearby: ');
      near.forEach((o, k) => {
        const b = el('button', '', `${o.label || shortName(o.name)} (${o.score})`);
        b.type = 'button'; b.addEventListener('click', () => show(o));
        p.append(b); if (k < near.length - 1) p.append(', ');
      });
      panel.append(p);
    }
  }
  if (d.fdc) {
    const p = el('p', 'src');
    const a = el('a', '', 'View on USDA FoodData Central');
    a.href = 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/' + encodeURIComponent(d.fdc) + '/nutrients';
    a.target = '_blank'; a.rel = 'noopener';
    p.append(a); panel.append(p);
  }
  const how = el('details', 'how');
  how.append(el('summary', '', 'How the score works'));
  how.append(el('p', '', 'Score = 40% carbs + 30% fat + 30% fiber. Carbs earn full marks at 80%+ of calories and none below 40%. ' +
    'Fat earns full marks at 0% of calories and none at 40%+. Fiber earns full marks at 0 g per 100 kcal and none at 6 g+. ' +
    'The pass/fail rule is separate and is the one used to colour the dots.'));
  panel.append(how);
}
function shortName(n) { const s = n.replace(/\s*\([^)]*\)/g, ''); return s.length > 34 ? s.slice(0, 33).replace(/[ ,]+$/, '') + '…' : s; }

document.querySelectorAll('.dot, .lbl').forEach(n => n.addEventListener('click', () => show(FOODS[+n.dataset.i])));

// ---------- your foods (saved in this browser) ----------
let mine = [];
try { mine = JSON.parse(localStorage.getItem(STORE_KEY) || '[]').filter(m => m && m.name); } catch (e) { mine = []; }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(mine.map(({ _cx, _cy, _off, score, ...rest }) => rest))); } catch (e) {} }

function fromLabel(v) {   // label values for one serving → per-100 g record
  const k = 100 / v.grams;
  const kcal = v.kcal * k;
  return {
    mine: true, name: v.name, group: null, grams: v.grams,
    kcal, carbs: v.carbs * k, protein: v.protein * k, fat: v.fat * k, fiber: v.fiber * k,
    sugar: v.sugar === null ? null : v.sugar * k,
    pc: v.carbs * 4 / v.kcal * 100, pp: v.protein * 4 / v.kcal * 100, pf: v.fat * 9 / v.kcal * 100,
    f100: v.fiber / v.kcal * 100, label: null, fdc: null,
  };
}
function renderMine() {
  mineLayer.replaceChildren();
  mine.forEach(m => { m.score = m.usda !== undefined ? FOODS[m.usda].score : score(m); });
  const sorted = [...mine].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const list = document.getElementById('mine');
  list.replaceChildren();
  sorted.forEach(m => {
    const d = m.usda !== undefined ? FOODS[m.usda] : m;
    if (m.usda === undefined) {
      const { cx, cy, off } = plotXY(m); m._cx = cx; m._cy = cy; m._off = off;
      const g = svgEl('g', { class: 'mine' });
      const title = svgEl('title', {}); title.textContent = `${m.name}: ${fmt(m.kcal)} kcal, ${fmt(m.fiber)} g fiber per 100 g`;
      g.append(svgEl('path', { d: diamond(cx, cy, 8), fill: MINE, stroke: '#fff', 'stroke-width': 1.5 }), title);
      const tx = svgEl('text', { x: cx + 11, y: cy - 8, 'font-size': 12, 'font-weight': 700, fill: MINE, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' });
      tx.textContent = m.name.length > 24 ? m.name.slice(0, 23) + '…' : m.name;
      g.append(tx);
      g.addEventListener('click', () => show(m));
      mineLayer.append(g);
    } else {
      // USDA food: mark its existing dot with a diamond outline
      const dot = document.querySelector('.dot[data-i="' + m.usda + '"]');
      const cx = +dot.getAttribute('cx'), cy = +dot.getAttribute('cy');
      const g = svgEl('g', { class: 'mine' });
      g.append(svgEl('path', { d: diamond(cx, cy, 9), fill: 'none', stroke: MINE, 'stroke-width': 2.2 }));
      g.addEventListener('click', () => show(d));
      mineLayer.append(g);
    }
    const li = el('li');
    const chip = el('span', 'chip');
    chip.tabIndex = 0;
    chip.append(el('span', '', d.label || shortName(d.name)), el('b', '', String(d.score ?? '—')));
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + (d.label || d.name));
    x.addEventListener('click', e => { e.stopPropagation(); mine = mine.filter(o => o !== m); save(); renderMine(); });
    chip.append(x);
    chip.addEventListener('click', () => show(d));
    chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(d); } });
    li.append(chip); list.append(li);
  });
  document.getElementById('mine-empty').hidden = mine.length > 0;
  document.getElementById('clear-mine').hidden = mine.length === 0;
}
document.getElementById('clear-mine').addEventListener('click', () => { mine = []; save(); renderMine(); });
function addUsda(i) {
  if (!mine.some(m => m.usda === i)) { mine.push({ usda: i, name: FOODS[i].name }); save(); renderMine(); }
  show(FOODS[i]);
}

// ---------- tabs ----------
const tabs = [['tab-search', 'pane-search'], ['tab-label', 'pane-label']];
tabs.forEach(([t, p]) => document.getElementById(t).addEventListener('click', () => {
  tabs.forEach(([t2, p2]) => { document.getElementById(t2).setAttribute('aria-selected', t2 === t); document.getElementById(p2).hidden = p2 !== p; });
}));

// ---------- search ----------
const q = document.getElementById('q');
const results = document.getElementById('results');
let hits = [], active = -1;
function search(text) {
  const words = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  return FOODS.map((d, i) => ({ d, i, hay: ((d.label || '') + ' ' + d.name).toLowerCase() }))
    .filter(o => words.every(w => o.hay.includes(w)))
    .sort((a, b) => (!!b.d.label - !!a.d.label) || (a.hay.startsWith(words[0]) ? -1 : 0) - (b.hay.startsWith(words[0]) ? -1 : 0) || a.d.name.length - b.d.name.length)
    .slice(0, 12);
}
function renderResults() {
  results.replaceChildren();
  if (!q.value.trim()) { results.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  if (!hits.length) {
    const li = el('li', 'none', 'Not in the USDA list — try “Enter nutrition label”.'); results.append(li);
  }
  hits.forEach((h, k) => {
    const li = el('li'); li.setAttribute('role', 'option'); li.id = 'opt-' + k;
    li.setAttribute('aria-selected', k === active);
    li.append(el('span', '', h.d.label ? `${h.d.label} — ${shortName(h.d.name)}` : h.d.name), el('small', '', `${h.d.group} · ${h.d.score}`));
    li.addEventListener('mousedown', e => { e.preventDefault(); pick(k); });
    results.append(li);
  });
  results.hidden = false; q.setAttribute('aria-expanded', 'true');
  if (active >= 0) q.setAttribute('aria-activedescendant', 'opt-' + active); else q.removeAttribute('aria-activedescendant');
}
function pick(k) { const h = hits[k]; if (!h) return; q.value = ''; hits = []; active = -1; renderResults(); addUsda(h.i); }
q.addEventListener('input', () => { hits = search(q.value); active = hits.length ? 0 : -1; renderResults(); });
q.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { active = Math.min(hits.length - 1, active + 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); renderResults(); e.preventDefault(); }
  else if (e.key === 'Enter') { pick(active); e.preventDefault(); }
  else if (e.key === 'Escape') { q.value = ''; hits = []; renderResults(); }
});
q.addEventListener('blur', () => { results.hidden = true; q.setAttribute('aria-expanded', 'false'); });
q.addEventListener('focus', () => { if (q.value.trim()) renderResults(); });

// ---------- label form ----------
const form = document.getElementById('label-form');
const ferr = document.getElementById('form-err');
form.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(form);
  const n = k => { const s = String(f.get(k) ?? '').trim(); return s === '' ? null : Number(s); };
  const v = { name: String(f.get('name') || '').trim(), grams: n('grams'), kcal: n('kcal'), carbs: n('carbs'),
              fiber: n('fiber'), protein: n('protein'), fat: n('fat'), sugar: n('sugar') };
  if (!v.name) return void (ferr.textContent = 'Give the food a name.');
  for (const k of ['grams', 'kcal', 'carbs', 'fiber', 'protein', 'fat']) {
    if (v[k] === null || !Number.isFinite(v[k]) || v[k] < 0) return void (ferr.textContent = 'Fill in serving size, calories, carbs, fiber, protein and fat (0 is fine).');
  }
  if (v.grams <= 0 || v.kcal <= 0) return void (ferr.textContent = 'Serving size and calories need to be more than 0.');
  if (v.fiber > v.carbs) return void (ferr.textContent = 'Fiber is part of total carbs, so it can’t be more than total carbs.');
  ferr.textContent = '';
  const rec = fromLabel(v);
  mine.push(rec); save(); renderMine(); show(rec);
  form.reset(); form.elements.grams.value = 100;
});

// restore saved foods (drop any that no longer match the data)
mine = mine.map(m => m.usda !== undefined ? (FOODS[m.usda] ? m : null) : m).filter(Boolean);
renderMine();
</script>
</body>
</html>
"""

replacements = {
    "__INK__": INK, "__MUTED__": MUTED, "__GRID__": GRID, "__FITS__": FITS, "__NOFIT__": NOFIT,
    "__GUIDE__": GUIDE, "__FONT__": FONT, "__N__": str(len(foods)), "__SVG__": svg_text,
    "__DATA__": json.dumps(data).replace("</", "<\\/"), "__CONFIG__": json.dumps(config),
}
html = HTML_TEMPLATE
for k, v in replacements.items():
    html = html.replace(k, v)
OUT_HTML.write_text(html, encoding="utf-8")

# sanity check: the reverse-engineered rule must agree with the CSV's own flag
mismatch = [d["name"] for d in foods
            if (d["pc"] >= RULE["min_carb_pct"] and d["pf"] <= RULE["max_fat_pct"]
                and d["pp"] <= RULE["max_protein_pct"]
                and d["f100"] <= RULE["max_fiber_per_100kcal"]) != d["fits"]]
if mismatch:
    print(f"  warning: pre-run rule disagrees with CSV for {len(mismatch)} foods, e.g. {mismatch[:3]}")
print(f"Wrote {OUT_SVG.name} and {OUT_HTML.name} ({len(foods)} foods, {skipped} skipped, "
      f"{len(placements)} labelled)")
