#!/usr/bin/env python3
"""
Pulls the Switchdeck Compatibility Google Sheet (published CSV export) and
rewrites data.json at the repo root with the current rows.

Run manually:   python3 sync/sync.py
Run on a timer: see .github/workflows/sync.yml

Uses only the Python standard library on purpose -- no pip install step
needed in CI, and one less thing to break.
"""
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SHEET_ID = "1UrLwRaIZGAL6J7l9QK_DO4MB45KzIUKIfKZIOE4hid4"
GID = "1002118274"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"
SOURCE_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit?gid={GID}"

# sheet column header -> our field name
FIELD_MAP = {
    "Game": "game",
    "Switch Model": "model",
    "OC Profile": "oc",
    "RAM OC": "ram",
    "Rating": "rating",
    "FPS": "fps",
    "Compatibility Tool": "tool",
    "Launch Options": "launch",
    "Extra Information": "info",
    "Submitted by": "by",
}

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data.json"


def fetch_csv(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SwitchdeckSync/1.0)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    # Google's CSV export is UTF-8, sometimes with a BOM
    return raw.decode("utf-8-sig")


def parse_rows(csv_text: str):
    reader = csv.DictReader(io.StringIO(csv_text))
    games = []
    for row in reader:
        clean = {field: (row.get(header) or "").strip() for header, field in FIELD_MAP.items()}
        if not clean.get("game"):
            continue  # skip blank / spacer rows
        games.append(clean)
    return games


def main():
    try:
        csv_text = fetch_csv(CSV_URL)
    except urllib.error.URLError as exc:
        print(f"ERROR: could not fetch sheet CSV: {exc}", file=sys.stderr)
        sys.exit(1)

    games = parse_rows(csv_text)

    if not games:
        # Never overwrite good data with an empty result (e.g. sheet
        # temporarily unreachable or its structure changed).
        print("ERROR: parsed zero games from the sheet, refusing to write data.json", file=sys.stderr)
        sys.exit(1)

    payload = {
        "games": games,
        "count": len(games),
        "synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": SOURCE_URL,
    }

    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Synced {len(games)} games at {payload['synced_at']} -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
