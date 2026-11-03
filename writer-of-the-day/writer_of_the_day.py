#!/usr/bin/env python3
"""Writer of the Day.

Picks a random author from the Library of Congress Classic Books collection
(https://read.gov/books/), gathers facts from Wikidata/Wikipedia, and shows a
macOS popup once per day at a random time.

Run frequently from cron (e.g. every 15 minutes). On the first run of each day
a random target time is chosen; the first run at or after that time delivers
the notification. If the computer was off/asleep at the target time, the next
run after it wakes catches up. State is saved so at most one notification is
shown per day.

Usage:
  writer_of_the_day.py          # normal cron mode
  writer_of_the_day.py --now    # ignore schedule, deliver now (doesn't touch today's state)
"""

import fcntl
import functools
import html
import json
import random
import re
import subprocess
import sys
import textwrap
import time
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENTRIES_DIR = BASE_DIR / "entries"
STATE_FILE = BASE_DIR / "state.json"
AUTHORS_CACHE = BASE_DIR / "authors_cache.json"
LOCK_FILE = BASE_DIR / ".lock"
LOG_FILE = BASE_DIR / "log.txt"

# Window for the random daily time (24h clock).
WINDOW_START_HOUR = 9
WINDOW_END_HOUR = 21

LOC_INDEX = "https://read.gov/books/"
CACHE_MAX_AGE_DAYS = 30
USER_AGENT = "WriterOfTheDay/1.0 (personal daily learning script)"


def log(msg):
    with open(LOG_FILE, "a") as f:
        f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")


class NetworkError(RuntimeError):
    pass


def fetch(url, params=None):
    # curl rather than urllib: Python's urllib stalls ~30s per request on
    # networks with broken IPv6, while curl falls back to IPv4 immediately.
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        time.sleep(0.5)  # be polite to the APIs
        result = subprocess.run(
            ["/usr/bin/curl", "-sSfL", "--max-time", "30", "-A", USER_AGENT, url],
            capture_output=True,
        )
        if result.returncode == 0:
            return result.stdout.decode("utf-8", errors="replace")
        err = result.stderr.decode().strip()
        if "429" not in err and "503" not in err:
            break
        time.sleep(5 * (attempt + 1))  # rate limited; back off and retry
    raise NetworkError(f"curl failed for {url}: {err}")


def fetch_json(url, params=None):
    return json.loads(fetch(url, params))


def load_json(path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Library of Congress author list
# ---------------------------------------------------------------------------

def scrape_loc_authors():
    """Return {author_heading: [book titles]} from read.gov/books detail pages."""
    index = fetch(LOC_INDEX)
    pages = sorted(set(re.findall(r'href="([\w\-]+\.html)"', index)))
    authors = {}
    for page in pages:
        try:
            body = fetch(urllib.parse.urljoin(LOC_INDEX, page))
        except Exception as e:
            log(f"skip {page}: {e}")
            continue
        m = re.search(r"Author:(?:&nbsp;|\s)*</strong>(.*?)</li>", body, re.S)
        if not m:
            continue
        heading = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).replace("\xa0", " ").strip()
        title_m = re.search(r"<title>(.*?)</title>", body, re.S)
        title = ""
        if title_m:
            title = html.unescape(title_m.group(1)).split(" - ")[0].strip().strip("“”\"")
        if heading:
            authors.setdefault(heading, []).append(title)
        time.sleep(0.2)
    return authors


def get_loc_authors():
    cache = load_json(AUTHORS_CACHE, {})
    fresh = cache.get("fetched") and (
        date.today() - date.fromisoformat(cache["fetched"])
    ).days < CACHE_MAX_AGE_DAYS
    if not fresh or not cache.get("authors"):
        try:
            authors = scrape_loc_authors()
            if authors:
                cache = {"fetched": date.today().isoformat(), "authors": authors}
                save_json(AUTHORS_CACHE, cache)
        except Exception as e:
            log(f"LoC scrape failed: {e}")
            if not cache.get("authors"):
                raise
    return cache["authors"]


def is_plausible_heading(heading):
    """Filter out LoC 'Author' values that clearly aren't people."""
    h = heading.lower()
    return not (
        ":" in h
        or "not specified" in h
        or re.search(r"\b(co\.|company|sons|publishing|press)\b", h)
    )


def heading_to_name(heading):
    """'Melville, Herman, 1819-1891' -> 'Herman Melville'."""
    h = re.sub(r",\s*ed\.?$", "", heading.split(";")[0].strip())
    h = re.sub(r",?\s*(b\.|d\.|ca\.)?\s*\d{3,4}\??-?(\d{3,4})?\??\.?", "", h)
    h = re.sub(r"\(.*?\)", "", h).strip(" ,.;")
    parts = [p.strip() for p in h.split(",") if p.strip()]
    if len(parts) >= 2:
        return f"{parts[1]} {parts[0]}"
    return h


# ---------------------------------------------------------------------------
# Wikidata / Wikipedia lookup
# ---------------------------------------------------------------------------

WD_API = "https://www.wikidata.org/w/api.php"
WP_API = "https://en.wikipedia.org/w/api.php"


def wd_claim_values(entity, prop):
    out = []
    for c in entity.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if v is not None:
            out.append(v)
    return out


def wd_labels(ids):
    if not ids:
        return {}
    data = fetch_json(WD_API, {
        "action": "wbgetentities", "ids": "|".join(ids[:50]),
        "props": "labels", "languages": "en", "format": "json",
    })
    return {
        k: v.get("labels", {}).get("en", {}).get("value")
        for k, v in data.get("entities", {}).items()
    }


def format_wd_time(v):
    """Wikidata time value -> readable string (handles BCE and low precision)."""
    t = v["time"]
    precision = v.get("precision", 11)
    bce = t.startswith("-")
    m = re.match(r"[+-](\d+)-(\d\d)-(\d\d)", t)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    suffix = " BCE" if bce else ""
    if precision >= 11 and mo and d:
        return f"{datetime(2000, mo, d):%B} {d}, {y}{suffix}"
    if precision == 10 and mo:
        return f"{datetime(2000, mo, 1):%B} {y}{suffix}"
    if precision == 9:
        return f"{y}{suffix}"
    if precision == 8:
        return f"{y}s{suffix}"
    if precision == 7:
        c = (y - 1) // 100 + 1
        return f"{c}th century{suffix}"
    return f"{y}{suffix}"


def year_of(v):
    m = re.match(r"([+-])(\d+)", v["time"])
    y = int(m.group(2))
    return f"{y} BCE" if m.group(1) == "-" else str(y)


def top_works(qid, limit=6):
    """Works authored by qid, most widely covered (by Wikipedia sitelinks) first."""
    query = f"""
    SELECT ?work ?workLabel ?links WHERE {{
      ?work wdt:P50 wd:{qid}; wikibase:sitelinks ?links.
      FILTER NOT EXISTS {{ ?work wdt:P31 wd:Q3331189 }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }} ORDER BY DESC(?links) LIMIT {limit}"""
    try:
        data = fetch_json("https://query.wikidata.org/sparql", {"query": query, "format": "json"})
    except Exception as e:
        log(f"SPARQL failed for {qid}: {e}")
        return []
    labels = [b["workLabel"]["value"] for b in data["results"]["bindings"]]
    return [t for t in labels if not re.fullmatch(r"Q\d+", t)]


def norm_title(t):
    return re.sub(r"^the|[^a-z0-9]", "", t.lower())


def find_person(name):
    """Search Wikipedia for the name and return (title, wikidata entity) for a human."""
    results = fetch_json(WP_API, {
        "action": "query", "list": "search", "srsearch": f"{name} writer",
        "srlimit": 5, "format": "json",
    })["query"]["search"]
    titles = [name] + [r["title"] for r in results]
    for title in titles:
        pages = fetch_json(WP_API, {
            "action": "query", "titles": title, "prop": "pageprops",
            "ppprop": "wikibase_item", "redirects": 1, "format": "json",
        })["query"]["pages"]
        page = next(iter(pages.values()))
        qid = page.get("pageprops", {}).get("wikibase_item")
        if not qid:
            continue
        ent = fetch_json(WD_API, {
            "action": "wbgetentities", "ids": qid, "props": "claims", "format": "json",
        })["entities"][qid]
        is_human = any(v.get("id") == "Q5" for v in wd_claim_values(ent, "P31"))
        if is_human:
            return page["title"], ent
    return None, None


def strip_tags(fragment):
    text = html.unescape(re.sub(r"<[^>]+>", "", fragment))
    text = re.sub(r"\[\d+\]", "", text)
    # Tidy punctuation left behind by removed pronunciations: "( ; born", "( , )".
    text = re.sub(r"\(\s*[;,]\s*", "(", text)
    text = re.sub(r"\s*\(\s*[;,]?\s*\)", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def wp_intro(title):
    """Return (plain-text lead paragraphs, italicized titles in the lead)."""
    pages = fetch_json(WP_API, {
        "action": "query", "titles": title, "prop": "extracts", "exintro": 1,
        "redirects": 1, "format": "json",
    })["query"]["pages"]
    lead = next(iter(pages.values())).get("extract", "")
    # Drop pronunciation guides: IPA spans, respellings, and the language labels before them.
    lead = re.sub(r'<span lang="[^"]*fonipa">.*?\]</span>', "", lead, flags=re.S)
    lead = re.sub(r'<i title="[^"]*pronunciation[^"]*">.*?</i>', "", lead, flags=re.S)
    lead = re.sub(r"<span>[A-Z][a-z]+:</span>\s*", "", lead)
    paragraphs = [strip_tags(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", lead, re.S)]
    # Works named in the lead are usually the author's most famous ones.
    italics = [strip_tags(i) for i in re.findall(r"<i>(.*?)</i>", lead, re.S)]
    titles = [t for t in italics if len(t) > 2 and t[0].isupper()]
    return [p for p in paragraphs if p], titles


@functools.lru_cache(maxsize=None)
def wp_section_list(title):
    try:
        return fetch_json(WP_API, {
            "action": "parse", "page": title, "prop": "sections",
            "redirects": 1, "format": "json",
        })["parse"]["sections"]
    except Exception as e:
        log(f"section list failed for {title}: {e}")
        return []


def wp_section(title, keywords):
    """Plain text of the first section whose heading contains a keyword."""
    for s in wp_section_list(title):
        if any(k in s["line"].lower() for k in keywords):
            try:
                raw = fetch_json(WP_API, {
                    "action": "parse", "page": title, "section": s["index"],
                    "prop": "text", "redirects": 1, "format": "json",
                })["parse"]["text"]["*"]
            except Exception as e:
                log(f"section fetch failed for {title}: {e}")
                return ""
            raw = re.sub(r"<(style|table|sup|h\d)[^>]*>.*?</\1>", "", raw, flags=re.S)
            paras = re.findall(r"<p>(.*?)</p>", raw, re.S)
            text = "\n\n".join(strip_tags(p) for p in paras).strip()
            if text:
                return text
    return ""


SENTENCE_END = re.compile(
    r"(?<!\bSt\.)(?<!\bMr\.)(?<!\bMrs\.)(?<!\bDr\.)(?<!\bJr\.)(?<!\bSr\.)(?<!\b[A-Z]\.)"
    r"(?<=[.!?])\s+(?=[A-Z\"“])"
)

SIGNIFICANCE = re.compile(
    r"influen|legacy|regarded|considered|one of the|greatest|important|pioneer|"
    r"first|revival|celebrated|widely|acclaim|classic|canon|enduring|inspired|"
    r"adapted|translated|landmark|shaped|popular|best[- ]known|father of|mother of",
    re.I,
)


def split_sentences(text):
    return [s.strip() for s in SENTENCE_END.split(text) if s.strip()]


def build_profile(heading, loc_titles):
    name = heading_to_name(heading)
    title, ent = find_person(name)
    if not ent:
        return None

    births = wd_claim_values(ent, "P569")
    deaths = wd_claim_values(ent, "P570")
    birth_place_ids = [v["id"] for v in wd_claim_values(ent, "P19")]
    death_place_ids = [v["id"] for v in wd_claim_values(ent, "P20")]
    work_ids = [v["id"] for v in wd_claim_values(ent, "P800")]
    occupation_ids = [v["id"] for v in wd_claim_values(ent, "P106")]
    labels = wd_labels(birth_place_ids[:1] + death_place_ids[:1] + work_ids + occupation_ids[:4])

    born = format_wd_time(births[0]) if births else None
    died = format_wd_time(deaths[0]) if deaths else None
    lifespan = f"{year_of(births[0]) if births else '?'}–{year_of(deaths[0]) if deaths else ''}"

    paragraphs, lead_titles = wp_intro(title)

    # Notable works: titles named in the article's lead (usually the most
    # famous), Wikidata's "notable work" list, the author's most widely
    # covered works, then the titles in the LoC collection.
    works = []
    for t in lead_titles + [labels.get(w) for w in work_ids] + top_works(ent["id"]) + loc_titles:
        if t and norm_title(t) not in {norm_title(w) for w in works}:
            works.append(t)

    intro_sentences = split_sentences(" ".join(paragraphs))
    legacy_sentences = split_sentences(
        wp_section(title, ["legacy", "influence", "reception", "impact", "reputation"])
    )
    life_sentences = split_sentences(
        wp_section(title, ["early life", "biography", "life", "childhood", "background"])
    )

    # "Why they matter": significance-flavored sentences from the intro and
    # the legacy section, in reading order.
    pool = intro_sentences[1:] + legacy_sentences
    important = [s for s in pool if SIGNIFICANCE.search(s)][:5]
    if len(important) < 3:
        important += [s for s in legacy_sentences if s not in important][: 3 - len(important)]
    importance = " ".join(important) or "See the full article linked below."

    # Life facts: the intro's remaining sentences, topped up from the
    # early-life/biography section.
    facts = [s for s in intro_sentences if s not in important][:4]
    facts += [s for s in life_sentences if s not in important and s not in facts][: 6 - len(facts)]

    return {
        "name": title,
        "loc_heading": heading,
        "lifespan": lifespan,
        "born": born,
        "born_place": labels.get(birth_place_ids[0]) if birth_place_ids else None,
        "died": died,
        "died_place": labels.get(death_place_ids[0]) if death_place_ids else None,
        "occupations": [labels[o] for o in occupation_ids[:4] if labels.get(o)],
        "facts": facts,
        "works": works[:3],
        "importance": importance,
        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
    }


def pick_writer(history):
    authors = get_loc_authors()
    seen = set(history)
    plausible = [a for a in authors if is_plausible_heading(a)]
    candidates = [a for a in plausible if a not in seen]
    if not candidates:  # shown everyone; start over
        history.clear()
        candidates = plausible
    random.shuffle(candidates)
    for heading in candidates:
        try:
            profile = build_profile(heading, authors[heading])
        except NetworkError:
            raise  # offline or rate limited: give up this run, retry on the next
        except Exception as e:
            log(f"lookup failed for {heading!r}: {e}")
            continue
        if profile:
            return profile
        history.append(heading)  # not a person (e.g. a publisher); don't retry
    raise RuntimeError("No usable writer found")


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_entry(p):
    ENTRIES_DIR.mkdir(exist_ok=True)
    slug = re.sub(r"[^\w]+", "-", p["name"]).strip("-")
    path = ENTRIES_DIR / f"{date.today().isoformat()}-{slug}.txt"
    wrap = lambda s, indent="": textwrap.fill(s, 78, initial_indent=indent, subsequent_indent=" " * len(indent))

    lines = [p["name"].upper(), p["lifespan"], "=" * 78, ""]
    born = p["born"] or "Unknown"
    if p["born_place"]:
        born += f", {p['born_place']}"
    lines.append(f"Born:  {born}")
    if p["died"]:
        died = p["died"] + (f", {p['died_place']}" if p["died_place"] else "")
        lines.append(f"Died:  {died}")
    if p["occupations"]:
        lines.append(f"Known as: {', '.join(p['occupations'])}")
    lines += ["", "ABOUT THEIR LIFE", "-" * 16]
    lines += [wrap(f, "• ") for f in p["facts"]]
    lines += ["", "PROMINENT WORKS", "-" * 15]
    lines += [f"{i}. {w}" for i, w in enumerate(p["works"], 1)] or ["(none listed)"]
    lines += ["", "WHY THEY MATTER", "-" * 15, wrap(p["importance"]), ""]
    lines += [
        "-" * 78,
        f"Library of Congress record: {p['loc_heading']}",
        "Collection: https://read.gov/books/",
        f"Read more: {p['url']}",
    ]
    path.write_text("\n".join(lines) + "\n")
    return path


def notify(p, entry_path):
    def esc(s):
        return s.replace("\\", "\\\\").replace('"', '\\"')

    script = f'''
    set r to display dialog "{esc(p['name'])}" & return & "{esc(p['lifespan'])}" ¬
        with title "Writer of the Day" buttons {{"Dismiss", "Open Facts"}} ¬
        default button "Open Facts" cancel button "Dismiss"
    if button returned of r is "Open Facts" then
        do shell script "open -t " & quoted form of "{esc(str(entry_path))}"
    end if
    '''
    subprocess.run(["osascript", "-e", script], capture_output=True)


def deliver(state, record_day):
    profile = pick_writer(state.setdefault("history", []))
    entry = write_entry(profile)
    state["history"].append(profile["loc_heading"])
    if record_day:
        state["notified_on"] = date.today().isoformat()
    # Save before showing the popup so overlapping runs can't double-notify.
    save_json(STATE_FILE, state)
    log(f"delivered {profile['name']} -> {entry.name}")
    notify(profile, entry)


def main():
    force = "--now" in sys.argv
    lock = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return  # another run is in progress (e.g. popup still open)

    state = load_json(STATE_FILE, {})
    today = date.today().isoformat()

    if force:
        deliver(state, record_day=False)
        return

    if state.get("notified_on") == today:
        return

    if state.get("target_date") != today:
        start = datetime.combine(date.today(), datetime.min.time()) + timedelta(hours=WINDOW_START_HOUR)
        offset = random.randint(0, (WINDOW_END_HOUR - WINDOW_START_HOUR) * 3600)
        state["target_date"] = today
        state["target_time"] = (start + timedelta(seconds=offset)).strftime("%H:%M")
        save_json(STATE_FILE, state)
        log(f"today's target time: {state['target_time']}")

    if datetime.now().strftime("%H:%M") < state["target_time"]:
        return

    try:
        deliver(state, record_day=True)
    except Exception as e:
        log(f"delivery failed, will retry next run: {e}")


if __name__ == "__main__":
    main()
