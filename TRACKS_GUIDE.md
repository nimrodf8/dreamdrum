# DreamDrum — Sourcing backing tracks

The rule (locked): ship only **Pixabay** (no attribution) or **CC-BY** (with on-screen credit). No Bensound-free, no wikiloops, in the app.

## The honest situation
Pixabay is the right cleared source, but it's a general stock library, not a drummer's play-along site — so tracks need **auditioning by ear**. I can't listen, so the list below is a *starting shortlist found by metadata*, not a vetted final pick. Audition, keep what grooves, swap the rest.

## What to look for (matched to the course)
- **Stage 2 (rock beat):** steady 4/4, ~80–100 BPM, clear backbeat. Search Pixabay "rock drums", "drum beat".
- **Stage 4 (grooves):** rock/pop with ride sections, ~100–120 BPM.
- **Stage 6 (first song / play-along):** **drumless** tracks so you supply the groove — search Pixabay "drumless". Slow & simple first.
- **Stage 7 (funk):** search Pixabay "funk groove" / "funk drums", ~95–110 BPM.

Two flavours are useful: **with-drums** tracks (listen → imitate) and **drumless** tracks (you play the drums). The app handles both.

## Shortlist to audition (all Pixabay, no attribution)
These are pre-loaded as the "starter library" in the app (Songs tab) with a **get ↗** link to each Pixabay page. Download the keepers into `public/tracks/` with the filename shown.

| Track | Artist | ~BPM | Use | File to save |
|---|---|---|---|---|
| Pop Rock Dry Room Beats (Full Track) | RomanSpiridonov | 115 | Stage 4, imitate | `pop-rock-115.mp3` |
| Heart Cry Moment (Drumless) | Preshkeyzmusic | — | Stage 6, play-along | `heart-cry-drumless.mp3` |
| Drive And Motion (Sport Rock) | Alex_Kizenkov | — | Stage 2–4 rock | `drive-and-motion.mp3` |

Good Pixabay search pages to dig further:
- https://pixabay.com/music/search/drumless/
- https://pixabay.com/sound-effects/search/drum%20track/
- https://pixabay.com/music/search/bass%20and%20drums/

## How to get them into the app (two ways)
**A) Self-hosted (best for the public app):** download the MP3 → drop it in `public/tracks/` with the exact filename above → rebuild/redeploy. It plays automatically.

**B) Quick test:** in the app's Songs tab tap **+ Add track**, paste a direct audio URL, pick the license. Saved to your device only.

## Auditioning checklist
- Steady tempo, obvious "1", clear backbeat.
- Not too busy — space for you to play.
- Length 1–3 min (loop handles the rest).
- Confirm the license on the page (Pixabay content license, or CC-BY — never CC-BY-NC).

## A note on the best beginner material
The cleanest beginner play-alongs (e.g. a bare rock beat at 60/80/100/120 BPM) are easy to find on personal blogs and YouTube, but most aren't license-cleared for a public app. Use those for your own practice if you like — just don't ship them. For shipped content, stick to the rule above.
