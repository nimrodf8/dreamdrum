import React, { useState, useEffect } from "react";
import AuthGate from "./AuthGate.jsx";
import KidsGate from "./KidsGate.jsx";
import KidsApp from "./KidsApp.jsx";

/* ============================================================
   Router — two experiences over one shared drum engine, each
   behind its OWN gate:
     #kids  → passcode gate → Space Cadets (ages 6–9)
     else   → Supabase account gate → grown-up DreamDrum course
   The split happens before the gates so the kids area can use a
   simple passcode instead of a real account login.
   ============================================================ */
const isKids = () => (window.location.hash || "").toLowerCase().includes("kids");

export default function Root() {
  const [kids, setKids] = useState(isKids());

  useEffect(() => {
    const onHash = () => setKids(isKids());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goKids = () => { window.location.hash = "kids"; };
  const goGrownUp = () => { window.location.hash = ""; };

  if (kids) {
    return (
      <KidsGate onExit={goGrownUp}>
        <KidsApp onExit={goGrownUp} />
      </KidsGate>
    );
  }
  return <AuthGate onKidsMode={goKids} />;
}
