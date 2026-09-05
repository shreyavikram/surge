#!/usr/bin/env python3
"""Extract the ERR-139 unconditional demand elasticity matrix and budget shares.

Source: Okrent & Alston (2012), ERS ERR-139, Appendix table A.10 (unconditional Marshallian
elasticities with bootstrapped standard errors, printed in page blocks with a header naming the
price columns; the last block of each row page carries the expenditure elasticity as its final
column) and Table 1 (budget shares, 1998-2010).
Output: data/demand-system.json consumed by @surge/config.
"""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
TXT = (HERE / "err139.txt").read_text()
OUT = HERE.parent / "data" / "demand-system.json"

# (id, label, group, aliases as printed in ERR-139 text)
ITEMS = [
    ("flour", "Flour and flour mixes", "cereals", ["Flour, prep. mixes", "Flour and flour mixes", "Flour, flour mixes"]),
    ("breakfast_cereals", "Breakfast cereals", "cereals", ["Breakfast cereals"]),
    ("rice_pasta", "Rice and pasta", "cereals", ["Rice and pasta", "Rice, pasta"]),
    ("nonwhite_bread", "Nonwhite bread", "cereals", ["Nonwhite bread", "Non-white bread"]),
    ("white_bread", "White bread", "cereals", ["White bread"]),
    ("biscuits_rolls", "Biscuits, rolls, muffins", "cereals", ["Biscuits, rolls, muff.", "Biscuits, rolls, muffins"]),
    ("cakes_cookies", "Cakes and cookies", "cereals", ["Cakes and cookies", "Cakes, cookies"]),
    ("other_bakery", "Other bakery products", "cereals", ["Other bakery products", "Other bakery"]),
    ("beef", "Beef", "meat_eggs", ["Beef"]),
    ("pork", "Pork", "meat_eggs", ["Pork"]),
    ("other_red_meat", "Other red meat", "meat_eggs", ["Other red meat"]),
    ("poultry", "Poultry", "meat_eggs", ["Poultry"]),
    ("fish", "Fish", "meat_eggs", ["Fish"]),
    ("eggs", "Eggs", "meat_eggs", ["Eggs"]),
    ("cheese", "Cheese", "dairy", ["Cheese"]),
    ("ice_cream", "Ice cream and frozen desserts", "dairy", ["Ice cream and frozen desserts", "Ice cream and froz. dessert", "Frozen dairy desserts"]),
    ("milk", "Milk", "dairy", ["Milk"]),
    ("other_dairy", "Other dairy", "dairy", ["Other dairy"]),
    ("apples", "Apples", "fv", ["Apples"]),
    ("bananas", "Bananas", "fv", ["Bananas"]),
    ("citrus", "Citrus", "fv", ["Citrus"]),
    ("other_fresh_fruit", "Other fresh fruit", "fv", ["Other fresh fruits", "Other fresh fruit"]),
    ("potatoes", "Potatoes", "fv", ["Potatoes"]),
    ("lettuce", "Lettuce", "fv", ["Lettuce"]),
    ("tomatoes", "Tomatoes", "fv", ["Tomatoes"]),
    ("other_fresh_vegetables", "Other fresh vegetables", "fv", ["Other fresh vegetables", "Other fresh vegetable"]),
    ("processed_fv", "Processed fruits and vegetables", "fv", ["Processed fruits and vegetables", "Proc. fruits and vegetables", "Proc. fruits, vegetables"]),
    ("coffee_tea", "Coffee and tea", "nab", ["Coffee and tea", "Coffee, tea"]),
    ("carbonated", "Carbonated beverages", "nab", ["Carbonated beverages", "Carb. beverages", "Carbonated drinks"]),
    ("noncarbonated", "Noncarbonated beverages", "nab", ["Non-carbonated beverages", "Noncarbonated beverages", "Noncarb. beverages", "Nonfrozen noncarb. drinks"]),
    ("frozen_beverages", "Frozen beverages", "nab", ["Frozen beverages", "Frozen noncarb. drinks"]),
    ("sugar_sweets", "Sugar and sweets", "other_fah", ["Sugar and sweets", "Sugar, sweets"]),
    ("fats_oils", "Fats and oils", "other_fah", ["Fats and oils", "Fats, oils"]),
    ("soups", "Soups", "other_fah", ["Soups"]),
    ("frozen_foods", "Frozen foods", "other_fah", ["Frozen foods", "Frozen meals and snacks", "Frozen meals"]),
    ("snacks", "Snacks", "other_fah", ["Snacks"]),
    ("condiments", "Condiments, sauces, seasonings", "other_fah", ["Condiments, sauces, seas.", "Condiments, sauces, season.", "Condiments, sauces, seasonings"]),
    ("misc_fah", "Miscellaneous food at home", "other_fah", ["Misc. FAH", "Miscellaneous FAH"]),
    ("alcohol", "Alcohol", "fafh", ["Alcoholic beverages", "Alcoholic beverage", "Alcohol"]),
    ("limited_service", "Limited-service restaurants", "fafh", ["Limited-service FAFH", "Limited service", "Limited-service", "Limited FAFH"]),
    ("full_service", "Full-service restaurants", "fafh", ["Full-service FAFH", "Full service", "Full-service"]),
    ("other_fafh", "Other food away from home", "fafh", ["Other FAFH"]),
    ("nonfood", "Nonfood", "nonfood", ["Nonfood"]),
]
IDS = [i[0] for i in ITEMS]
GROUP = {i[0]: i[2] for i in ITEMS}

def norm(s):
    s = s.lower().replace("-\n", "").replace("- ", "").replace("-", "")
    s = re.sub(r"[.,()]", "", s)
    return re.sub(r"\s+", " ", s).strip()

ALIAS = {}
for id_, _, _, aliases in ITEMS:
    for a in aliases:
        ALIAS[norm(a)] = id_
# longest aliases first so "other fresh fruits" wins over "other fresh fruit"
ALIAS_SORTED = sorted(ALIAS.items(), key=lambda kv: -len(kv[0]))

NUM_LINE = re.compile(r"^\s*-?\d+\.\d+(\s+-?\d+\.\d+)*\s*$")
SE_LINE = re.compile(r"^\s*\(\d+\.\d+\)(\s+\(\d+\.\d+\))*\s*$")
NOISE = ("See notes", "ERR-139", "Economic Research Service", "Estimated unconditional elasticities")

def match_row_label(frags):
    for k in range(min(3, len(frags)), 0, -1):
        cand = norm(" ".join(frags[-k:]))
        if cand in ALIAS:
            return ALIAS[cand]
    return None

def header_columns(header_text):
    """Canonical ids of the price columns named in a block header, in canonical order, plus EXP flag."""
    h = " " + norm(header_text) + " "
    has_exp = "with respect to expenditure" in h
    cols = []
    for id_, _, _, aliases in ITEMS:
        found = False
        for a in aliases:
            na = norm(a)
            if re.search(r"(?<![a-z])" + re.escape(na) + r"(?![a-z])", h):
                found = True
                break
        if found:
            cols.append(id_)
    return cols, has_exp

def parse_a10(text):
    first = text.index("Appendix table A.10", text.index("contains the 43"))
    end = text.index("Notes: Authors’ calculations using first-stage elasticities", first)
    body = text[first:end]
    blocks = body.split("Appendix table A.10")[1:]
    n = len(IDS)
    est = [[None] * n for _ in range(n)]
    se = [[None] * n for _ in range(n)]
    exp = {}
    exp_se = {}
    for bi, block in enumerate(blocks):
        lines = [l.rstrip() for l in block.split("\n")]
        rows = []
        pending = []
        header = None
        i = 0
        while i < len(lines):
            l = lines[i]
            if NUM_LINE.match(l) and i + 1 < len(lines) and SE_LINE.match(lines[i + 1]):
                rid = match_row_label(pending)
                if rid is None:
                    raise SystemExit(f"block {bi}: unrecognized row label {pending[-3:]!r} before line: {l!r}")
                if header is None:
                    # header = everything before the row label fragment(s)
                    k = 1
                    while k < min(3, len(pending)) and norm(" ".join(pending[-k:])) not in ALIAS:
                        k += 1
                    header = " ".join(pending[:-k])
                vals = [float(x) for x in l.split()]
                ses = [float(x.strip("()")) for x in lines[i + 1].split()]
                if len(vals) != len(ses):
                    raise SystemExit(f"block {bi}: estimate/SE length mismatch for {rid}: {l!r}")
                rows.append((rid, vals, ses))
                pending = []
                i += 2
                continue
            s_ = l.strip()
            if s_ and not any(s_.startswith(x) for x in NOISE) and not re.fullmatch(r"\d+", s_):
                pending.append(s_)
            i += 1
        if not rows:
            continue
        cols, has_exp = header_columns(header or "")
        width = len(cols) + (1 if has_exp else 0)
        for rid, vals, ses in rows:
            if len(vals) != width:
                raise SystemExit(f"block {bi}: row {rid} has {len(vals)} values but header names {len(cols)} columns (+exp={has_exp}); header={header!r}")
            ri = IDS.index(rid)
            for cj_id, v, s_ in zip(cols, vals, ses):
                cj = IDS.index(cj_id)
                if est[ri][cj] is not None and abs(est[ri][cj] - v) > 1e-9:
                    raise SystemExit(f"block {bi}: cell ({rid},{cj_id}) assigned twice with different values: {est[ri][cj]} vs {v}")
                est[ri][cj] = v
                se[ri][cj] = s_
            if has_exp:
                exp[rid] = vals[-1]
                exp_se[rid] = ses[-1]
    missing = [(IDS[i], IDS[j]) for i in range(n) for j in range(n) if est[i][j] is None]
    return est, se, exp, exp_se, missing

def parse_table1(text):
    start = text.index("Table 1 \nSummary statistics and trends for budget shares and prices")
    end = text.index("The budget shares for all foods exhibit", start)
    seg = text[start:end]
    group_names = {
        "cereals/bakery": "cereals", "dairy": "dairy", "meat and eggs": "meat_eggs", "fruits and vegetables": "fv",
        "nonalcoholic beverages": "nab", "nonalcoholic bev": "nab", "other fah": "other_fah", "fafh and alcohol": "fafh",
        "fafh/alcohol": "fafh", "food away from home and alcohol": "fafh", "nonfood": "nonfood",
    }
    groups, items = {}, {}
    prefix = ""
    for raw in seg.split("\n"):
        line = raw.strip()
        m = re.match(r"^(.*?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)", line)
        if not m:
            # a wrapped label line (no numbers): carry it into the next line's label
            prefix = (prefix + " " + line).strip() if line and not re.search(r"\d", line) else ""
            continue
        label = norm((prefix + " " + m.group(1)).strip())
        prefix = ""
        share = float(m.group(2))
        if label in group_names:
            g = group_names[label]
            groups[g] = share / 100.0
            if g == "nonfood":
                items["nonfood"] = 1.0
        elif label in ALIAS:
            items[ALIAS[label]] = share / 100.0
        else:
            tail = norm(m.group(1))
            if tail in ALIAS:
                items[ALIAS[tail]] = share / 100.0
    return groups, items

def main():
    est, se, exp, exp_se, missing = parse_a10(TXT)
    # ERR-139 prints no "frozen foods" price column on the first row page (cereals..fish rows); those 13 cells are unreported.
    unreported = [(a, b) for a, b in missing]
    for a, b in unreported:
        est[IDS.index(a)][IDS.index(b)] = 0.0
        se[IDS.index(a)][IDS.index(b)] = None
    groups, items = parse_table1(TXT)
    need = ("cereals", "dairy", "meat_eggs", "fv", "nab", "other_fah", "fafh", "nonfood")
    missing_groups = [g for g in need if g not in groups]
    if missing_groups:
        raise SystemExit(f"Table 1 group shares missing: {missing_groups}; found {groups}")
    out_items = []
    for id_, label, g, _ in ITEMS:
        if id_ not in items:
            raise SystemExit(f"Table 1 within-group share missing for {id_}")
        share = groups["nonfood"] if id_ == "nonfood" else groups[g] * items[id_]
        if id_ not in exp:
            raise SystemExit(f"expenditure elasticity missing for {id_}")
        out_items.append({"id": id_, "label": label, "group": g, "budgetShare": round(share, 6),
                          "expenditureElasticity": exp[id_], "expenditureSE": exp_se[id_]})
    out_items.append({"id": "infant_formula", "label": "Infant formula", "group": "other_fah", "budgetShare": 0.0005, "expenditureElasticity": 0.05,
                      "note": "No ERS estimate; own-price -0.3 assumed, cross terms zero. Labeled modeled in the UI."})
    n = len(out_items)
    M = [[0.0] * n for _ in range(n)]
    S = [[0.0] * n for _ in range(n)]
    for i in range(n - 1):
        for j in range(n - 1):
            M[i][j] = est[i][j]
            S[i][j] = se[i][j] if se[i][j] is not None else 0.0
    M[n - 1][n - 1] = -0.3
    S[n - 1][n - 1] = 0.2
    doc = {
        "source": "Okrent & Alston (2012), ERS ERR-139, Appendix table A.10 (unconditional Marshallian elasticities, bootstrapped SEs; expenditure elasticities from the same table) and Table 1 (budget shares 1998-2010). Infant formula appended (assumed).",
        "unreportedCells": [{"row": a, "col": b} for a, b in unreported],
        "groupShares": groups,
        "items": out_items, "marshallian": M, "standardErrors": S,
    }
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT} with {n} items; {len(unreported)} unreported cells set to 0")
    for i, id_ in enumerate(IDS):
        print(f"{id_:26s} own {est[i][i]:6.2f} exp {exp[id_]:5.2f} share {out_items[i]['budgetShare']:.5f}")

if __name__ == "__main__":
    main()
