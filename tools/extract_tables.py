"""
Turn the saved .json files (one per participant) into two analysis tables.

    python3 tools/extract_tables.py path/to/data_folder

Writes, into that folder:
    participants.csv  one row per participant (H1, H2, checks, control time)
    persons.csv       one row per person named or reported (H3; mixed-effects models)
    items_close.csv   one row per SPACE press in the close-people question (all timings)

Only the Python standard library is used.
"""
import csv
import json
import sys
from pathlib import Path


def write_csv(path, rows):
    if not rows:
        print(f"  (no rows for {path.name})")
        return
    keys = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    print(f"  wrote {path} ({len(rows)} rows)")


def main(folder):
    folder = Path(folder)
    participants, persons, items = [], [], []
    for fp in sorted(folder.glob("*.json")):
        try:
            trials = json.loads(fp.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            print(f"  skipped {fp.name}: not valid JSON")
            continue
        if not isinstance(trials, list):
            continue
        summ = next((t for t in trials if t.get("trial_role") == "summary"), None)
        if summ is None:
            print(f"  skipped {fp.name}: no summary row (incomplete session?)")
            continue
        s = dict(summ["summary"])
        s["file"] = fp.name
        s["debug"] = summ.get("debug")
        participants.append(s)
        persons.extend(summ["persons"])
        main_ng = next((t for t in trials if t.get("trial_role") == "ng_main"), None)
        if main_ng:
            for it in main_ng["items"]:
                items.append({"pid": s["pid"], "group": s["group"], "recency": s["recency"],
                              "reminder": s["reminder"], **it})
    write_csv(folder / "participants.csv", participants)
    write_csv(folder / "persons.csv", persons)
    write_csv(folder / "items_close.csv", items)
    if any(p.get("debug") for p in participants):
        print("  NOTE: some files were run with ?debug=1; drop them before analysis.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
