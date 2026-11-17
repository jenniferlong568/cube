"""Bar chart: the top high-calorie, low-fiber foods in the USDA pre-run list.

"High calorie" = at least MIN_KCAL kcal per 100 g. Those foods are ranked by
fiber per 100 kcal (lowest first, ties broken by higher calories) and the top
TOP_N are drawn with their calories and fiber side by side.

Writes high_cal_low_fiber.svg next to this script. Standard library only.

Run:  python3 make_high_cal_low_fiber.py [path/to/prerun_foods_usda.csv]
"""
import csv
import re
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "prerun_foods_usda.csv"
OUT = HERE / "high_cal_low_fiber.svg"

MIN_KCAL = 300
TOP_N = 15

CAL = "#d9572b"
FIB = "#2e9e6b"
INK = "#1f2430"
MUTED = "#6b7280"
GRID = "#e5e7eb"
STRIPE = "#f7f8fa"
BG = "#ffffff"
FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

foods = []
with open(SRC, newline="") as f:
    for r in csv.DictReader(f):
        if not r["fiber_g"] or not r["calories_kcal"]:
            continue
        kcal, fiber = float(r["calories_kcal"]), float(r["fiber_g"])
        if kcal >= MIN_KCAL:
            foods.append({"name": r["food"], "group": r["group"], "kcal": kcal, "fiber": fiber,
                          "per100": fiber / kcal * 100, "fits": r["fits_prerun_rule"] == "yes"})

pool = len(foods)
top = sorted(foods, key=lambda d: (d["per100"], -d["kcal"]))[:TOP_N]


def tidy(name, n=46):
    name = re.sub(r"\s*\([^)]*\)", "", name).strip(" ,")
    return name if len(name) <= n else name[: n - 1].rstrip(" ,") + "…"


def nice_max(v, step):
    return step * -(-v // step)


W = 1000
name_w = 360
gap = 40
row_h = 34
top_y = 150
panel_w = (W - 24 - name_w - gap - 90) / 2   # two bar panels + a per-100-kcal column
cal_x0 = 24 + name_w
fib_x0 = cal_x0 + panel_w + gap
per_x = fib_x0 + panel_w + 50
H = top_y + len(top) * row_h + 70

kmax = nice_max(max(d["kcal"] for d in top), 100)
fmax = nice_max(max(d["fiber"] for d in top), 1)


def kx(v):
    return cal_x0 + v / kmax * panel_w


def fx(v):
    return fib_x0 + v / fmax * panel_w


def g(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


out = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
    f'font-family="{FONT}" role="img" aria-label="Top {TOP_N} high-calorie, low-fiber foods with calories and fiber per 100 grams">',
    f'<rect width="{W}" height="{H}" fill="{BG}"/>',
    f'<text x="24" y="38" font-size="24" font-weight="600" fill="{INK}">High calorie, low fiber: top {TOP_N} foods</text>',
    f'<text x="24" y="62" font-size="14" fill="{MUTED}">Of {pool} foods with at least {MIN_KCAL} kcal per 100 g, '
    f'these have the least fiber for their calories. Ranked by fiber per 100 kcal, lowest first.</text>',
]

hy = top_y - 44
out.append(f'<text x="{cal_x0}" y="{hy}" font-size="13" font-weight="600" fill="{CAL}">Calories (kcal per 100 g)</text>')
out.append(f'<text x="{fib_x0}" y="{hy}" font-size="13" font-weight="600" fill="{FIB}">Fiber (g per 100 g)</text>')
out.append(f'<text x="{per_x}" y="{hy}" font-size="13" font-weight="600" fill="{INK}" text-anchor="middle">Fiber per</text>')
out.append(f'<text x="{per_x}" y="{hy + 16}" font-size="13" font-weight="600" fill="{INK}" text-anchor="middle">100 kcal</text>')

ty = top_y - 10
for t in range(0, int(kmax) + 1, 200 if kmax > 400 else 100):
    out.append(f'<text x="{kx(t):.1f}" y="{ty}" font-size="11" fill="{MUTED}" text-anchor="middle">{t}</text>')
for t in range(0, int(fmax) + 1, 1 if fmax <= 5 else 2):
    out.append(f'<text x="{fx(t):.1f}" y="{ty}" font-size="11" fill="{MUTED}" text-anchor="middle">{t}</text>')

bottom_y = top_y + len(top) * row_h
for i, d in enumerate(top):
    y0 = top_y + i * row_h
    mid = y0 + row_h / 2
    tip = f'{d["name"]} ({d["group"]}): {d["kcal"]:g} kcal, {d["fiber"]:g} g fiber per 100 g'
    out.append(f'<g><title>{escape(tip)}</title>')
    if i % 2 == 0:
        out.append(f'<rect x="16" y="{y0}" width="{W - 32}" height="{row_h}" fill="{STRIPE}"/>')
    out.append(f'<text x="24" y="{mid + 4.5}" font-size="12" fill="{MUTED}">{i + 1}</text>')
    flag = " ✓" if d["fits"] else ""
    out.append(f'<text x="48" y="{mid + 4.5}" font-size="13" fill="{INK}">{escape(tidy(d["name"]))}{flag}</text>')
    bh = row_h - 14
    out.append(f'<rect x="{cal_x0}" y="{mid - bh / 2}" width="{kx(d["kcal"]) - cal_x0:.1f}" height="{bh}" rx="3" fill="{CAL}"/>')
    out.append(f'<text x="{kx(d["kcal"]) + 6:.1f}" y="{mid + 4.5}" font-size="12" fill="{INK}">{d["kcal"]:g}</text>')
    fw = max(fx(d["fiber"]) - fib_x0, 0)
    out.append(f'<rect x="{fib_x0}" y="{mid - bh / 2}" width="{fw:.1f}" height="{bh}" rx="3" fill="{FIB}"/>')
    out.append(f'<text x="{fib_x0 + fw + 6:.1f}" y="{mid + 4.5}" font-size="12" fill="{INK}">{g(d["fiber"])}</text>')
    out.append(f'<text x="{per_x}" y="{mid + 4.5}" font-size="12" fill="{INK}" text-anchor="middle">{d["per100"]:.2f} g</text>')
    out.append("</g>")

for x0 in (cal_x0, fib_x0):
    out.append(f'<line x1="{x0}" y1="{top_y}" x2="{x0}" y2="{bottom_y}" stroke="{MUTED}"/>')

out.append(f'<text x="24" y="{bottom_y + 30}" font-size="12" fill="{MUTED}">✓ = marked as fitting the pre-run rule in the file. '
           f'Foods missing a fiber or calorie value are left out.</text>')
out.append(f'<text x="24" y="{bottom_y + 50}" font-size="12" fill="{MUTED}">Source: USDA FoodData Central (SR Legacy). '
           f'Names shortened; point at a row in a browser for the full name.</text>')
out.append("</svg>")

OUT.write_text("\n".join(out), encoding="utf-8")
print(f"Wrote {OUT} (top {len(top)} of {pool} foods ≥ {MIN_KCAL} kcal)")
