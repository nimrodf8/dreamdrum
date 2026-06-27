import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Null when env vars aren't set (e.g. local dev) — the app then runs without the gate.
export const supabase = url && key ? createClient(url, key) : null;
export const isConfigured = () => !!supabase;
