import React, { useState, useEffect } from "react";
import App from "./App.jsx";
import KidsApp from "./KidsApp.jsx";

/* ============================================================
   Router — two experiences over one shared drum engine.
   #kids  → Space Cadets (ages 6–9)
   else   → the grown-up DreamDrum course
   A tiny hash router keeps them as separate routes without
   pulling in a routing library.
   ============================================================ */
const isKids = () => (window.location.hash || "").toLowerCase().includes("kids");

export default function Root(appProps = {}) {
  const [kids, setKids] = useState(isKids());

  useEffect(() => {
    const onHash = () => setKids(isKids());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goKids = () => { window.location.hash = "kids"; };
  const goGrownUp = () => { window.location.hash = ""; };

  if (kids) return <KidsApp onExit={goGrownUp} />;
  return <App {...appProps} onKidsMode={goKids} />;
}
