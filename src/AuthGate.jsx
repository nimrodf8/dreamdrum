import React, { useState, useEffect } from "react";
import App from "./App.jsx";
import { supabase, isConfigured } from "./supabaseClient.js";

const BG = "#15120E";
const CARD = "#1E1A15";
const LINE = "#332C22";
const BONE = "#EDE6D8";
const DIM = "#A89F8E";
const STEEL = "#6E6557";
const BRASS = "#C9A35E";
const BRASS_HI = "#E6C485";
const FD = "Archivo, system-ui, sans-serif";
const FM = "'Space Mono', ui-monospace, monospace";

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("password"); // password | link
  const [status, setStatus] = useState("idle"); // idle | working | sent | error
  const [msg, setMsg] = useState("");

  const signInPassword = async () => {
    const e = email.trim();
    if (!e || !e.includes("@")) { setStatus("error"); setMsg("Enter a valid email address."); return; }
    if (!password) { setStatus("error"); setMsg("Enter your password."); return; }
    setStatus("working"); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: e, password });
    if (error) { setStatus("error"); setMsg(error.message); }
    // on success, the auth listener swaps to the app automatically
  };

  const sendLink = async () => {
    const e = email.trim();
    if (!e || !e.includes("@")) { setStatus("error"); setMsg("Enter a valid email address."); return; }
    setStatus("working"); setMsg("");
    const { error } = await supabase.auth.signInWithOtp({ email: e, options: { emailRedirectTo: window.location.origin } });
    if (error) { setStatus("error"); setMsg(error.message); }
    else { setStatus("sent"); setMsg(e); }
  };

  const field = (extra) => ({
    width: "100%", boxSizing: "border-box", font: `400 15px ${FD}`, padding: "12px 14px",
    borderRadius: 10, background: BG, border: `1px solid ${status === "error" ? "#C7553F" : LINE}`, color: BONE, marginBottom: 12, ...extra,
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, color: BONE, fontFamily: FD,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 26 }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, border: `2px solid ${BRASS}`,
            display: "flex", alignItems: "center", justifyContent: "center", font: `800 16px ${FD}`, color: BRASS }}>◎</span>
          <span style={{ font: `800 20px ${FD}`, letterSpacing: "0.04em" }}>DREAM<span style={{ color: BRASS }}>DRUM</span></span>
        </div>

        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: 26 }}>
          {status === "sent" ? (
            <>
              <h1 style={{ font: `800 22px ${FD}`, margin: "0 0 10px" }}>Check your email</h1>
              <p style={{ font: `400 14px ${FD}`, color: DIM, lineHeight: 1.6, margin: 0 }}>
                We sent a sign-in link to <strong style={{ color: BONE }}>{msg}</strong>. Open it on this device
                to come back signed in. You can close this tab.
              </p>
              <button onClick={() => { setStatus("idle"); setMode("password"); }} className="dc-focus"
                style={{ marginTop: 18, font: `700 12px ${FM}`, color: BRASS, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                ← back to sign in
              </button>
            </>
          ) : mode === "password" ? (
            <>
              <h1 style={{ font: `800 22px ${FD}`, margin: "0 0 6px" }}>Sign in</h1>
              <p style={{ font: `400 13px ${FD}`, color: DIM, lineHeight: 1.55, margin: "0 0 18px" }}>
                Enter your email and password.
              </p>
              <input type="email" value={email} placeholder="you@email.com" autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} style={field()} />
              <input type="password" value={password} placeholder="Password" autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") signInPassword(); }} style={field()} />
              <button onClick={signInPassword} disabled={status === "working"} className="dc-focus"
                style={{ width: "100%", font: `700 14px ${FD}`, padding: "12px", borderRadius: 10, cursor: "pointer",
                  border: "none", background: BRASS, color: BG, opacity: status === "working" ? 0.6 : 1 }}>
                {status === "working" ? "Signing in…" : "Sign in"}
              </button>
              {status === "error" && <p style={{ font: `400 12px ${FM}`, color: "#C7553F", margin: "10px 0 0" }}>{msg}</p>}
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button onClick={() => { setMode("link"); setStatus("idle"); setMsg(""); }} className="dc-focus"
                  style={{ font: `700 12px ${FM}`, color: STEEL, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  email me a sign-in link instead
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ font: `800 22px ${FD}`, margin: "0 0 6px" }}>Sign-in link</h1>
              <p style={{ font: `400 13px ${FD}`, color: DIM, lineHeight: 1.55, margin: "0 0 18px" }}>
                We'll email you a one-tap link — no password needed.
              </p>
              <input type="email" value={email} placeholder="you@email.com" autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendLink(); }} style={field()} />
              <button onClick={sendLink} disabled={status === "working"} className="dc-focus"
                style={{ width: "100%", font: `700 14px ${FD}`, padding: "12px", borderRadius: 10, cursor: "pointer",
                  border: "none", background: BRASS, color: BG, opacity: status === "working" ? 0.6 : 1 }}>
                {status === "working" ? "Sending…" : "Send me a sign-in link"}
              </button>
              {status === "error" && <p style={{ font: `400 12px ${FM}`, color: "#C7553F", margin: "10px 0 0" }}>{msg}</p>}
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button onClick={() => { setMode("password"); setStatus("idle"); setMsg(""); }} className="dc-focus"
                  style={{ font: `700 12px ${FM}`, color: STEEL, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  ← use email & password
                </button>
              </div>
            </>
          )}
        </div>
        <p style={{ font: `400 11px ${FM}`, color: STEEL, textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
          Your progress syncs to your account across devices.
        </p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: "100vh", background: BG, color: STEEL, fontFamily: FM,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ font: `400 13px ${FM}` }}>Loading…</span>
    </div>
  );
}

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = checking

  useEffect(() => {
    if (!isConfigured()) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // If auth isn't configured (no env vars), run the app open — protects only once keys are set.
  if (!isConfigured()) return <App />;
  if (session === undefined) return <Loading />;
  if (!session) return <SignIn />;

  return <App
    userEmail={session.user?.email}
    userName={session.user?.user_metadata?.full_name || session.user?.user_metadata?.name}
    onSignOut={() => supabase.auth.signOut()} />;
}
