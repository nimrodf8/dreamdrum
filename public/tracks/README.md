# Starter track library

The app loads this folder's `tracks.json` as the default song library. Each entry expects a
matching MP3 in this folder (the `file` field). The audio is NOT bundled — download each one
from its Pixabay page (the "get ↗" link in the app) and drop it in here with the exact filename.

## Activate a track
1. In the Songs tab, tap **get ↗** on the track (or open its `pixabayUrl`).
2. Find it by title/artist on Pixabay, click **Download** (free, no account for most tracks).
3. Save the MP3 in this folder using the exact `file` name (e.g. `bass-drum-95.mp3`).
4. Rebuild/redeploy — it now plays.

## The seven starters, by category
- **Drumless (you play over):** Heart Cry Moment (Drumless) — Preshkeyzmusic
- **Has drums, lock in:** Electric Bass and Drum Performance (95 BPM) — JuliusH
- **Simple first song:** Let's rock with me (100 BPM) — Fresh_Morning
- **Has drums, copy the groove:** Pop Rock Dry Room Beats (115 BPM) — RomanSpiridonov · full of mind (120 BPM) — Fresh_Morning
- **Funk (later):** Funky Jam — Alban_Gogh · Funk Rock (135 BPM) — ceton

## Notes
- All are **Pixabay** (no attribution). Found by metadata, not vetted by ear — audition and swap freely.
- More drumless options: https://pixabay.com/music/search/drumless/  (Pixabay's drumless catalog is small.)
- To add a **CC-BY** track instead: set `"license": "ccby"` and fill `artist` — the app shows a credit line automatically. Confirm on the page it's CC-BY, not CC-BY-NC.
