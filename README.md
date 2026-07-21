# SwitchDeck // Compat

A ProtonDB-style compatibility tracker that auto-syncs from the community
[Switchdeck Compatibility](https://docs.google.com/spreadsheets/d/1UrLwRaIZGAL6J7l9QK_DO4MB45KzIUKIfKZIOE4hid4/edit?gid=1002118274)
Google Sheet.

- `index.html` — the site. Fetches `data.json` on load; falls back to a
  bundled snapshot if that fetch fails.
- `data.json` — the current dataset. Rewritten automatically by the sync job.
- `sync/sync.py` — pulls the sheet's published CSV export and rebuilds
  `data.json`. Stdlib-only, no dependencies.
- `.github/workflows/sync.yml` — runs `sync.py` every 4 hours (and on
  demand) and commits the result.

## Deploy it (5 minutes)

1. **Create a new GitHub repo** and push everything in this folder to it
   (keep the file layout as-is — `data.json` at the root, `sync/`, and
   `.github/workflows/` all matter).

   ```bash
   git init
   git add .
   git commit -m "init: switchdeck compat site"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**: repo Settings → Pages → Build and deployment →
   Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
   Your site will be live at `https://<you>.github.io/<repo>/` within a
   minute or two.

3. **Enable Actions write access**: repo Settings → Actions → General →
   Workflow permissions → select "Read and write permissions" → Save.
   (Without this, the sync job can fetch new data but can't commit it back.)

4. **Run the sync once by hand** to confirm it works: Actions tab →
   "Sync Switchdeck data" → Run workflow. Check the run log — it should end
   with something like `Synced 209 games at ...`. `data.json` in your repo
   should update a few seconds later.

That's it — from then on it re-syncs every 4 hours on its own, and you can
always trigger it manually from the Actions tab.

## Customizing

- **Sync frequency**: edit the `cron:` line in
  `.github/workflows/sync.yml`. It's currently `17 */4 * * *` (every 4
  hours, offset to avoid the top-of-hour crowd). Cron is UTC.
- **Different sheet/tab**: change `SHEET_ID` and `GID` at the top of
  `sync/sync.py`. `GID` is the number after `gid=` in the sheet's URL.
- **Column mapping**: if the sheet's column headers ever change name,
  update `FIELD_MAP` in `sync/sync.py` to match.
- **New rating tiers**: the site already has styling for `Perfect`,
  `Playable`, `Unplayable`, and `Borked` — nothing to change if the sheet
  starts using the latter two, filter chips are generated from whatever
  ratings are present in the data.

## Local testing

The sandbox this was built in can't reach `docs.google.com`, so `sync.py`
is untested end-to-end here — but it's plain stdlib `csv`/`urllib`/`json`
against a public CSV export URL, which is about as low-risk as scripts get.
To test it yourself:

```bash
python3 sync/sync.py
python3 -m http.server 8000   # then open http://localhost:8000
```

If the sheet is view-only-by-link (as it currently is), the CSV export
works without any authentication.

## Why not fetch the sheet directly from the browser?

Google Sheets' CSV export doesn't send CORS headers, so client-side
`fetch()` straight from `docs.google.com` would get blocked by the browser
on most setups. Pulling it server-side (in the Action) and republishing a
same-origin `data.json` sidesteps that entirely, and means the site itself
stays a static file with zero API keys or backend to maintain.
