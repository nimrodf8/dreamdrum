import React, { useState } from "react";

/* ============================================================
   KidsGate — a friendly passcode screen for Space Cadets.
   A grown-up enters the secret code once on the device; after
   that the kid goes straight in (unlock is remembered locally).
   Set the code with VITE_KIDS_PASSCODE (falls back to a default).
   Note: this is a client-side gate — good for keeping the kids
   area to your family/students, not a security boundary.
   ============================================================ */
const CODE = String(import.meta.env.VITE_KIDS_PASSCODE || "blastoff").trim().toLowerCase();
const KEY = "dreamdrum:kids:unlocked";
const FONT = "'Fredoka', system-ui, -apple-system, sans-serif";
const remembered = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

export default function KidsGate({ children, onExit }) {
  const [ok, setOk] = useState(remembered);
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);

  if (ok) return children;

  const submit = () => {
    if (val.trim().toLowerCase() === CODE) {
      try { localStorage.setItem(KEY, "1"); } catch {}
      setOk(true);
    } else {
      setErr(true); setVal("");
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden",
      background: "radial-gradient(circle at 30% 0%, #180C3C, #0B1026 60%)",
      color: "#fff", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap');
        @keyframes kg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes kg-tw{0%,100%{opacity:.25}50%{opacity:1}}
        input:focus{outline:3px solid #FFD84D;outline-offset:2px}`}</style>
      {[...Array(30)].map((_, i) => (
        <span key={i} style={{ position: "absolute", left: `${(i * 97) % 100}%`, top: `${(i * 53) % 100}%`,
          width: (i % 3) + 2, height: (i % 3) + 2, borderRadius: 999, background: "#fff", opacity: 0.4,
          boxShadow: "0 0 6px #fff", animation: `kg-tw ${2 + (i % 4)}s ease-in-out ${(i % 6) * 0.3}s infinite` }} />
      ))}
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 72, animation: "kg-bob 3s ease-in-out infinite" }}>🚀</div>
        <h1 style={{ font: `700 30px ${FONT}`, margin: "6px 0 4px" }}>
          <span style={{ color: "#3AE3F2" }}>SPACE</span> <span style={{ color: "#FF5FA2" }}>CADETS</span>
        </h1>
        <p style={{ font: `500 17px ${FONT}`, color: "#BFC6F0", margin: "0 0 22px" }}>
          Ask a grown-up for the secret space code! 🌟
        </p>
        <div style={{ background: "#1E2154", border: `3px solid ${err ? "#FF6B6B" : "#3A3F86"}`,
          borderRadius: 24, padding: 22 }}>
          <input value={val} type="password" autoFocus placeholder="Secret code"
            onChange={(e) => { setVal(e.target.value); setErr(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            style={{ width: "100%", boxSizing: "border-box", font: `600 20px ${FONT}`, textAlign: "center",
              padding: "14px 16px", borderRadius: 16, border: `3px solid #3A3F86`, background: "#0B1026",
              color: "#fff", marginBottom: 14 }} />
          <button onClick={submit}
            style={{ width: "100%", font: `600 20px ${FONT}`, color: "#fff", background: "#57E38B",
              border: "none", borderRadius: 18, padding: "14px", cursor: "pointer", boxShadow: "0 6px 0 rgba(0,0,0,0.28)" }}>
            🚀 Blast off!
          </button>
          {err && <p style={{ font: `600 15px ${FONT}`, color: "#FF6B6B", margin: "12px 0 0" }}>
            Oops! That's not the code. Try again! 🛸
          </p>}
        </div>
        {onExit && (
          <button onClick={onExit}
            style={{ font: `600 14px ${FONT}`, color: "#BFC6F0", background: "none", border: "none",
              cursor: "pointer", marginTop: 18 }}>
            I'm a grown-up → go to the main app
          </button>
        )}
      </div>
    </div>
  );
}
