# DreamDrum

A from-scratch drumming course built around the Roland TD-313. React + Vite, ready for Netlify.

## What's here
- `src/App.jsx` — the whole app (kit views, lessons, live drills, skill builders, progress)
- `src/main.jsx` — React entry point
- `index.html`, `vite.config.js` — Vite setup
- `netlify.toml` — Netlify build config

## Run locally
```bash
npm install
npm run dev      # opens a local dev server (use Chrome/Edge for Web MIDI)
```

## Build
```bash
npm run build    # outputs the static site to dist/
npm run preview  # preview the built site locally
```

## Deploy to Netlify — two ways

**A) Drag-and-drop (fastest, no build on your side)**
1. Run `npm run build` (or use the pre-built `dist/` you were given).
2. Go to https://app.netlify.com/drop and drop the `dist` folder in.
3. Done — Netlify gives you a live URL.

**B) Connect a Git repo (auto-deploys on every push)**
1. Push this folder to a GitHub repo.
2. In Netlify: "Add new site" → "Import an existing project" → pick the repo.
3. Build command `npm run build`, publish directory `dist` (already set in `netlify.toml`).
4. Deploy.

## Notes
- **Web MIDI** (live kit reading) works only over HTTPS in Chromium browsers (Chrome/Edge). Netlify serves HTTPS, so the deployed site is fine. The TD-313 connects over USB-C; tap "Connect" in the app.
- **Saving:** progress, skill log, kit layout, and songs save to the browser's localStorage automatically. "Reset all data" lives on the Progress screen.
- Audio/licensing for the song feature: Pixabay (default, no attribution) and CC-BY tracks with on-screen credit only.

## Cross-device sync (Supabase) — optional, off by default

The app runs fully on localStorage. To sync progress between your iPad and computer, enable Supabase:

1. Create a free project at https://supabase.com.
2. In the SQL editor, run `supabase-schema.sql` (included here).
3. Enable an auth provider (Email magic-link is simplest: Authentication → Providers → Email).
4. Install the client: `npm install @supabase/supabase-js`.
5. Add a `.env` file in the project root:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
   (Add the same two variables in Netlify → Site settings → Environment variables.)
6. Wire it in (`src/cloudSync.js` is ready): on app start call `cloudSync.pull()` after sign-in, and `cloudSync.push()` after changes. A minimal sign-in is `cloudSync.signInWithEmail(email)`.

Until those env vars exist, `cloudSync` no-ops and the app stays on localStorage — so the build never breaks.
