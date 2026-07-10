// Per-user cloud sync for the grown-up course, via Supabase.
// Reuses the shared client (src/supabaseClient.js). No-ops when
// Supabase isn't configured, so the app still runs on localStorage.
//
// Model: the remote row (dreamdrum_state, keyed by user_id) is the
// source of truth for an account. On sign-in we pull it into
// localStorage; on every change we debounce-push localStorage back.
// A "last synced user" marker keeps two accounts on the SAME browser
// from bleeding progress into each other.

import { supabase } from "./supabaseClient.js";

const LS_KEY = "dreamdrum:v1";
const USER_KEY = "dreamdrum:lastUser";

const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const writeLocal = (s) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s || {})); } catch {} };
const getLastUser = () => { try { return localStorage.getItem(USER_KEY); } catch { return null; } };
const setLastUser = (id) => { try { localStorage.setItem(USER_KEY, id); } catch {} };

export { isConfigured } from "./supabaseClient.js";

async function currentUser(passed) {
  if (passed) return passed;
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

// Call once right after sign-in, before the app reads its state.
// `user` may be passed in (from the auth session) to skip a round-trip.
export async function pullForUser(user) {
  if (!supabase) return;
  const u = await currentUser(user);
  if (!u) return;

  let remote = null;
  try {
    const { data, error } = await supabase
      .from("dreamdrum_state").select("state").eq("user_id", u.id).maybeSingle();
    if (error) return; // network/RLS issue — keep local untouched rather than wipe it
    remote = data?.state || null;
  } catch { return; }

  const lastUser = getLastUser();
  if (remote && Object.keys(remote).length) {
    // This account has saved progress — it wins.
    writeLocal(remote);
  } else {
    // No remote yet for this account.
    if (lastUser && lastUser !== u.id) {
      // A different account used this browser last — start this one clean
      // so we don't seed their remote with someone else's local progress.
      writeLocal({});
    }
    // else: first sync for this user — keep whatever local they have and seed it up.
    await push(u);
  }
  setLastUser(u.id);
}

export async function push(user) {
  if (!supabase) return;
  const u = await currentUser(user);
  if (!u) return;
  const state = readLocal();
  try {
    await supabase.from("dreamdrum_state").upsert({
      user_id: u.id,
      state,
      updated_at: new Date().toISOString(),
    });
  } catch { /* offline — the next change will retry */ }
}

let pushTimer = null;
export function schedulePush() {
  if (!supabase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push(); }, 1200);
}
