// Optional cloud sync via Supabase.
// No-ops unless VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your env.
// Default app behaviour stays on localStorage; this only adds cross-device sync.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const LS_KEY = "dreamdrum:v1";

let client = null;
async function getClient() {
  if (!SUPA_URL || !SUPA_KEY) return null;
  if (client) return client;
  // @vite-ignore keeps the build working even if the package isn't installed yet.
  const { createClient } = await import(/* @vite-ignore */ "@supabase/supabase-js");
  client = createClient(SUPA_URL, SUPA_KEY);
  return client;
}

export function isConfigured() {
  return !!(SUPA_URL && SUPA_KEY);
}

// Email magic-link sign-in. The user clicks the link in their inbox.
export async function signInWithEmail(email) {
  const c = await getClient();
  if (!c) return { error: "Supabase not configured" };
  return c.auth.signInWithOtp({ email });
}

export async function getUser() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data?.user || null;
}

// Pull remote state into localStorage (call once after sign-in, before the app reads state).
export async function pull() {
  const c = await getClient();
  if (!c) return;
  const user = await getUser();
  if (!user) return;
  const { data } = await c.from("dreamdrum_state").select("state").eq("user_id", user.id).single();
  if (data?.state) localStorage.setItem(LS_KEY, JSON.stringify(data.state));
}

// Push localStorage state to the cloud (call after meaningful changes, debounced).
export async function push() {
  const c = await getClient();
  if (!c) return;
  const user = await getUser();
  if (!user) return;
  let state = {};
  try { state = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch {}
  await c.from("dreamdrum_state").upsert({
    user_id: user.id,
    state,
    updated_at: new Date().toISOString(),
  });
}
