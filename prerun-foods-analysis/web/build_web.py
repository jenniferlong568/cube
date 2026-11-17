"""Build the Pre-Run Fuel Check web app (web/index.html) from the USDA CSV.

Injects the foods data into web/template.html. Standard library only.

Run:  python3 web/build_web.py [path/to/prerun_foods_usda.csv]
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "prerun_foods_usda.csv"

# Everyday foods labelled on the chart: (start of the USDA name, short label). Same list as make_fiber_chart.py.
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
    return round(float(v), 2) if v not in ("", None) else None


foods = []
with open(SRC, newline="") as f:
    for r in csv.DictReader(f):
        kcal, fiber = num(r["calories_kcal"]), num(r["fiber_g"])
        if kcal is None or fiber is None:
            continue
        foods.append({
            "name": r["food"], "group": r["group"], "fdc": r["fdc_id"], "kcal": kcal, "fiber": fiber,
            "carbs": num(r["carbs_g"]), "protein": num(r["protein_g"]), "fat": num(r["fat_g"]), "sugar": num(r["sugar_g"]),
            "pc": num(r["pct_cal_carbs"]), "pp": num(r["pct_cal_protein"]), "pf": num(r["pct_cal_fat"]),
            "f100": num(r["fiber_per_100kcal"]), "csvFits": r["fits_prerun_rule"] == "yes",
        })

labels = []
for prefix, label in MAIN_FOODS:
    m = next((d for d in foods if d["name"].lower().startswith(prefix.lower())), None)
    if m:
        labels.append([m["fdc"], label])
    else:
        print(f"  note: no food starting with {prefix!r}; skipped label")

# The page recomputes the pre-run rule; make sure it still agrees with the CSV's own flag.
bad = [d["name"] for d in foods
       if (d["pc"] >= 60 and d["pf"] <= 20 and d["pp"] <= 30 and d["f100"] <= 3) != d["csvFits"]]
if bad:
    print(f"  warning: pre-run rule disagrees with CSV for {len(bad)} foods, e.g. {bad[:3]}")
for d in foods:
    del d["csvFits"]

safe = lambda o: json.dumps(o, separators=(",", ":")).replace("</", "<\\/")
html = (HERE / "template.html").read_text(encoding="utf-8")
html = html.replace("__FOODS__", safe(foods)).replace("__LABELS__", safe(labels))
(HERE / "index.html").write_text(html, encoding="utf-8")
print(f"Wrote web/index.html ({len(foods)} foods, {len(labels)} labelled, {len(html) // 1024} KB)")
