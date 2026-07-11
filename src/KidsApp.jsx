import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PADS, NOTE_TO_PAD, PADMAP, useMidi, useMetronome, drumCtx, playDrum,
} from "./drumEngine.js";
import { AssemblyArt } from "./assemblyArt.jsx";

/* ============================================================
   DREAMDRUM · SPACE CADETS
   A cosmic drumming adventure for ages 6–9.
   Same real features as the grown-up course — meet your kit,
   classes (missions), practice games, jam-along, progress —
   but rebuilt for little space pilots: big buttons, tiny words,
   a friendly guide (Cosmo), read-aloud, stars, badges & confetti.
   Talks to the real Roland TD-313 over Web MIDI, exactly like
   the grown-up app (shared code in ./drumEngine.js). Kids with
   no kit can tap the big on-screen drums instead.
   ============================================================ */

const C = {
  space: "#0B1026",
  space2: "#180C3C",
  card: "#1E2154",
  cardHi: "#2A2E70",
  line: "#3A3F86",
  ink: "#FFFFFF",
  dim: "#BFC6F0",
  cyan: "#3AE3F2",
  purple: "#A97BFF",
  pink: "#FF5FA2",
  yellow: "#FFD84D",
  green: "#57E38B",
  orange: "#FF9F45",
  gold: "#FFC93C",
  red: "#FF6B6B",
};
const FONT = "'Fredoka', system-ui, -apple-system, sans-serif";

const R = (n) => Array.from({ length: n }, (_, i) => i);
const lanesFrom = (obj) => Object.entries(obj).map(([pad, steps]) => ({ pad, steps }));

/* ---------- read-aloud (Web Speech, no dependency) ---------- */
function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96; u.pitch = 1.18; u.volume = 1;
    synth.speak(u);
  } catch { /* speech not available — silent */ }
}
function stopSpeak() { try { window.speechSynthesis?.cancel(); } catch {} }

/* ---------- storage ---------- */
const LS = "dreamdrum:kids:v1";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const save = (patch) => { try { localStorage.setItem(LS, JSON.stringify({ ...load(), ...patch })); } catch {} };

/* ---------- kid-friendly drum names ---------- */
const KID_DRUMS = [
  { id: "snare", emoji: "🥁", nick: "Snappy Snare", color: C.cyan, say: "This is the Snare. It goes CRACK! It sits right in front of you and it's your main drum." },
  { id: "kick", emoji: "🦵", nick: "Boom Kick", color: C.pink, say: "This is the Kick. It makes the big BOOM. You play it with your foot on the pedal!" },
  { id: "hihat", emoji: "🎩", nick: "Tss-Tss Hat", color: C.yellow, say: "This is the Hi-Hat. It goes tss tss tss and keeps the beat ticking along." },
  { id: "tom1", emoji: "🥁", nick: "High Tom", color: C.purple, say: "This is the High Tom. It goes boom, high and bouncy!" },
  { id: "tom2", emoji: "🥁", nick: "Middle Tom", color: C.green, say: "This is the Middle Tom. It goes boom, a little bit lower." },
  { id: "tom3", emoji: "🥁", nick: "Floor Tom", color: C.orange, say: "This is the Floor Tom. It's the deepest boom, way down low by your leg." },
  { id: "crash", emoji: "💥", nick: "Crash Splash", color: C.gold, say: "This is the Crash. Hit it for a big SPLASH sound, like a firework!" },
  { id: "ride", emoji: "🚀", nick: "Ping Ride", color: C.cyan, say: "This is the Ride cymbal. It goes ping ping ping, smooth and shiny." },
];
const KID_LABEL = Object.fromEntries(KID_DRUMS.map((d) => [d.id, d.nick]));
const KID_COLOR = Object.fromEntries(KID_DRUMS.map((d) => [d.id, d.color]));
const KID_EMOJI = Object.fromEntries(KID_DRUMS.map((d) => [d.id, d.emoji]));

/* ============================================================
   MISSIONS — planets (stages) full of little missions (lessons)
   Patterns use the same pad ids and step-grid as the grown-up
   course, so scoring against the real TD-313 works identically.
   ============================================================ */
const ROCK = { hihat: R(8), snare: [2, 6], kick: [0, 4] };

const PLANETS = [
  {
    id: "p1", name: "Blast-Off Base", emoji: "🚀", color: C.cyan,
    blurb: "Meet your space drums and get ready to fly!",
    missions: [
      { id: "m1-1", kind: "kit", title: "Meet Your Drums", emoji: "🥁",
        say: "Let's meet your drums! Tap each one to hear it and learn its name." },
      { id: "m1-2", kind: "learn", title: "Sit Like a Pilot", emoji: "🧑‍🚀",
        say: "Sit up nice and tall, like you're flying a rocket! Feet flat on the floor. Relax your shoulders." },
      { id: "m1-3", kind: "learn", title: "Hold Your Sticks", emoji: "🥢",
        say: "Hold your sticks like you're holding two ice cream cones. Not too tight — let them bounce!" },
      { id: "m1-4", kind: "play", title: "Your First Hit", emoji: "✨",
        say: "Hit the Snare on every beep. One, two, three, four! Nice and steady.",
        lanes: lanesFrom({ snare: R(4) }), subdiv: 1, bpm: 68, bars: 2 },
    ],
  },
  {
    id: "p2", name: "Counting Comet", emoji: "⭐", color: C.yellow,
    blurb: "Learn to count the beat with the stars.",
    missions: [
      { id: "m2-1", kind: "learn", title: "Count 1-2-3-4", emoji: "🔢",
        say: "Music has a beat, like a heartbeat. Count out loud with me: one, two, three, four! Over and over." },
      { id: "m2-2", kind: "play", title: "Steady Stars", emoji: "⭐",
        say: "Hit the Snare once on every beep. Keep it steady like a twinkling star.",
        lanes: lanesFrom({ snare: R(4) }), subdiv: 1, bpm: 72, bars: 2 },
      { id: "m2-3", kind: "play", title: "Twinkle Twice", emoji: "✨",
        say: "Now hit twice as fast! Two hits for every beep. Say: one-and, two-and!",
        lanes: lanesFrom({ snare: R(8) }), subdiv: 2, bpm: 66, bars: 2 },
    ],
  },
  {
    id: "p3", name: "Boom-Tss Planet", emoji: "🪐", color: C.purple,
    blurb: "Play your very first real beat!",
    missions: [
      { id: "m3-1", kind: "learn", title: "The Boom-Tss Beat", emoji: "🥁",
        say: "The most famous beat! The hat goes tss tss, the snare goes crack, and the kick goes boom. Together they make a groove!" },
      { id: "m3-2", kind: "play", title: "Play the Beat", emoji: "🎵",
        say: "Here we go! Hat keeps ticking, kick on one and three, snare on two and four. Take it slow!",
        lanes: lanesFrom(ROCK), subdiv: 2, bpm: 60, bars: 2 },
      { id: "m3-3", kind: "echo", title: "Copy Cosmo", emoji: "🔁",
        say: "Listen to Cosmo play, then copy it back! Ready? Press Listen.",
        phrases: [
          { label: "Four snare hits", lanes: lanesFrom({ snare: [0, 2, 4, 6] }) },
          { label: "Boom and crack", lanes: lanesFrom({ kick: [0, 4], snare: [2, 6] }) },
          { label: "Around the drums", lanes: lanesFrom({ snare: [0], tom1: [2], tom2: [4], tom3: [6] }) },
        ], subdiv: 2, bpm: 76 },
    ],
  },
  {
    id: "p4", name: "Moon Toms", emoji: "🌙", color: C.orange,
    blurb: "Boom around the toms and CRASH!",
    missions: [
      { id: "m4-1", kind: "learn", title: "Meet the Toms", emoji: "🥁",
        say: "The toms are the boomy drums. High tom, middle tom, and the big floor tom. Rolling across them sounds like tumbling down the stairs!" },
      { id: "m4-2", kind: "play", title: "Tom Tumble", emoji: "🌊",
        say: "Roll down the toms! Snare, high tom, middle tom, floor tom. Boom boom boom boom!",
        lanes: lanesFrom({ snare: [0, 1], tom1: [2, 3], tom2: [4, 5], tom3: [6, 7] }), subdiv: 2, bpm: 70, bars: 2 },
      { id: "m4-3", kind: "play", title: "Big Crash!", emoji: "💥",
        say: "Play the beat, and SMASH the crash on beat one. That's how a rockstar starts a song!",
        lanes: lanesFrom({ crash: [0], hihat: [1, 2, 3, 4, 5, 6, 7], snare: [2, 6], kick: [0, 4] }), subdiv: 2, bpm: 66, bars: 2 },
    ],
  },
  {
    id: "p5", name: "Rockstar Galaxy", emoji: "🌟", color: C.pink,
    blurb: "Play a whole song and become a rockstar!",
    missions: [
      { id: "m5-1", kind: "song", title: "Play a Whole Song", emoji: "🎸",
        say: "Time for a real little song! Beat, beat, a tumble fill, then a big crash to finish. You've got this!",
        barsList: [
          lanesFrom(ROCK), lanesFrom(ROCK),
          lanesFrom({ snare: [0, 1], tom1: [2, 3], tom2: [4, 5], tom3: [6, 7] }),
          lanesFrom({ crash: [0], hihat: [1, 2, 3, 4, 5, 6, 7], snare: [2, 6], kick: [0, 4] }),
        ], subdiv: 2, bpm: 72 },
      { id: "m5-2", kind: "jam", title: "Jam Along", emoji: "🎧",
        say: "Play along with a space groove! Just have fun and feel the beat." },
      { id: "m5-3", kind: "learn", title: "You're a Rockstar!", emoji: "🏆",
        say: "You did it, space cadet! You learned to drum. Give yourself a huge high five. To the stars and beyond!" },
    ],
  },
];
const ALL_MISSIONS = PLANETS.flatMap((p) => p.missions);
const TOTAL_MISSIONS = ALL_MISSIONS.length;

/* ---------- badges ---------- */
const BADGES = [
  { id: "first-drum", emoji: "🥁", name: "First Boom", desc: "You met your drums!" },
  { id: "first-star", emoji: "⭐", name: "Star Catcher", desc: "You earned your first star!" },
  { id: "ten-stars", emoji: "🌟", name: "Star Pilot", desc: "You collected 10 stars!" },
  { id: "beat", emoji: "🎵", name: "Beat Maker", desc: "You played the boom-tss beat!" },
  { id: "planet", emoji: "🪐", name: "Planet Hopper", desc: "You finished a whole planet!" },
  { id: "crash", emoji: "💥", name: "Big Splash", desc: "You smashed a crash cymbal!" },
  { id: "song", emoji: "🎸", name: "Song Star", desc: "You played a whole song!" },
  { id: "rockstar", emoji: "🏆", name: "Space Rockstar", desc: "You finished the whole adventure!" },
];
const BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/* ============================================================
   Global styles + starfield background
   ============================================================ */
function CosmicStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      ::selection { background: ${C.pink}; color: #fff; }
      @keyframes k-float { 0%,100%{ transform: translateY(0) } 50%{ transform: translateY(-10px) } }
      @keyframes k-bob { 0%,100%{ transform: translateY(0) rotate(-2deg) } 50%{ transform: translateY(-6px) rotate(2deg) } }
      @keyframes k-twinkle { 0%,100%{ opacity:.25 } 50%{ opacity:1 } }
      @keyframes k-pop { 0%{ transform: scale(.6); opacity:0 } 60%{ transform: scale(1.12) } 100%{ transform: scale(1); opacity:1 } }
      @keyframes k-rise { from{ opacity:0; transform: translateY(14px) } to{ opacity:1; transform: translateY(0) } }
      @keyframes k-spin { to { transform: rotate(360deg) } }
      @keyframes k-pulse { 0%,100%{ transform: scale(1) } 50%{ transform: scale(1.06) } }
      @keyframes k-confetti { 0%{ transform: translateY(0) rotate(0); opacity:1 } 100%{ transform: translateY(-380px) rotate(540deg); opacity:0 } }
      @keyframes k-ring { 0%{ transform: scale(.5); opacity:.9 } 100%{ transform: scale(2.2); opacity:0 } }
      .k-rise { animation: k-rise .45s ease both; }
      .k-press { transition: transform .08s ease; }
      .k-press:active { transform: scale(.94); }
      button:focus-visible { outline: 3px solid ${C.yellow}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
      }
    `}</style>
  );
}

const STARS = R(46).map((i) => ({
  left: (i * 97) % 100,
  top: (i * 61) % 100,
  size: (i % 3) + 2,
  delay: (i % 7) * 0.4,
}));
function Starfield() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {STARS.map((s, i) => (
        <span key={i} style={{
          position: "absolute", left: `${s.left}%`, top: `${s.top}%`,
          width: s.size, height: s.size, borderRadius: 999, background: "#fff",
          boxShadow: "0 0 6px #fff", opacity: 0.4,
          animation: `k-twinkle ${2 + (i % 4)}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

/* ============================================================
   Cosmo — the friendly space guide (SVG mascot)
   ============================================================ */
function Cosmo({ size = 96, mood = "happy" }) {
  const cheer = mood === "cheer";
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: "block", animation: "k-bob 3s ease-in-out infinite", overflow: "visible" }}>
      {/* antenna */}
      <line x1="60" y1="28" x2="60" y2="12" stroke={C.purple} strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="9" r="6" fill={C.yellow} style={{ animation: "k-twinkle 1.6s ease-in-out infinite" }} />
      {/* helmet glow */}
      <circle cx="60" cy="66" r="40" fill={C.cyan} opacity="0.16" />
      {/* body / suit */}
      <ellipse cx="60" cy="98" rx="30" ry="18" fill={C.purple} />
      <rect x="34" y="78" width="52" height="28" rx="16" fill={C.purple} />
      {/* alien face */}
      <circle cx="60" cy="64" r="30" fill={C.green} />
      {/* cheeks */}
      <circle cx="44" cy="72" r="6" fill={C.pink} opacity="0.55" />
      <circle cx="76" cy="72" r="6" fill={C.pink} opacity="0.55" />
      {/* eyes */}
      <circle cx="50" cy="60" r="8.5" fill="#0B1026" />
      <circle cx="70" cy="60" r="8.5" fill="#0B1026" />
      <circle cx="52.5" cy="57" r="3" fill="#fff" />
      <circle cx="72.5" cy="57" r="3" fill="#fff" />
      {/* mouth */}
      {cheer
        ? <path d="M48 74 Q60 88 72 74 Q60 82 48 74 Z" fill="#0B1026" />
        : <path d="M50 74 Q60 84 70 74" stroke="#0B1026" strokeWidth="3.5" fill="none" strokeLinecap="round" />}
      {/* glass helmet */}
      <circle cx="60" cy="64" r="38" fill="none" stroke="#CFE9FF" strokeWidth="3" opacity="0.65" />
      <path d="M40 46 Q52 36 66 40" stroke="#fff" strokeWidth="4" fill="none" opacity="0.5" strokeLinecap="round" />
      {/* drumsticks */}
      <line x1="24" y1="96" x2="40" y2="82" stroke="#E7C08a" strokeWidth="4" strokeLinecap="round" />
      <line x1="96" y1="96" x2="80" y2="82" stroke="#E7C08a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/* Cosmo with a speech bubble + read-aloud button */
function CosmoSays({ text, mood, soundOn, size = 96 }) {
  useEffect(() => { if (soundOn && text) speak(text); return () => stopSpeak(); /* eslint-disable-next-line */ }, [text]);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flexShrink: 0 }}><Cosmo size={size} mood={mood} /></div>
      <div style={{ position: "relative", background: C.card, border: `3px solid ${C.line}`, borderRadius: 20,
        padding: "14px 16px", flex: 1, minWidth: 0 }}>
        <p style={{ font: `500 18px/1.45 ${FONT}`, color: C.ink, margin: 0 }}>{text}</p>
        <button onClick={() => speak(text)} aria-label="Read out loud" className="k-press"
          style={{ marginTop: 8, font: `600 14px ${FONT}`, color: C.space, background: C.yellow,
            border: "none", borderRadius: 999, padding: "6px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          🔊 Read to me
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Confetti burst
   ============================================================ */
const CONFETTI_EMOJI = ["⭐", "🌟", "✨", "🚀", "🪐", "💫", "🎉", "🌈"];
function Confetti({ fireKey }) {
  if (!fireKey) return null;
  const bits = R(28).map((i) => ({
    e: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
    left: (i * 37 + (fireKey % 13) * 7) % 100,
    delay: (i % 6) * 0.08,
    dur: 1.1 + (i % 5) * 0.22,
    size: 18 + (i % 4) * 8,
  }));
  return (
    <div key={fireKey} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
      {bits.map((b, i) => (
        <span key={i} style={{ position: "absolute", left: `${b.left}%`, bottom: "34%", fontSize: b.size,
          animation: `k-confetti ${b.dur}s ease-out ${b.delay}s forwards` }}>{b.e}</span>
      ))}
    </div>
  );
}

/* ============================================================
   UI atoms
   ============================================================ */
function BigBtn({ children, onClick, color = C.pink, disabled, full }) {
  return (
    <button onClick={onClick} disabled={disabled} className="k-press"
      style={{ font: `600 20px ${FONT}`, color: "#fff", background: disabled ? C.line : color,
        border: "none", borderRadius: 18, padding: "14px 26px", cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 6px 0 rgba(0,0,0,0.28)`, width: full ? "100%" : "auto",
        opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}
function GhostBtn({ children, onClick, color = C.cyan }) {
  return (
    <button onClick={onClick} className="k-press"
      style={{ font: `600 17px ${FONT}`, color, background: "transparent", border: `3px solid ${color}`,
        borderRadius: 16, padding: "10px 20px", cursor: "pointer" }}>
      {children}
    </button>
  );
}
function KidCard({ children, style, color = C.line }) {
  return (
    <div style={{ background: C.card, border: `3px solid ${color}`, borderRadius: 24, padding: 20, ...style }}>
      {children}
    </div>
  );
}
// Friendly setup hint for grown-ups helping with an iPad
function IpadTip() {
  return (
    <p style={{ font: `500 13px/1.5 ${FONT}`, color: C.dim, margin: "10px auto 0", maxWidth: 340 }}>
      📱 On an iPad? Plug the drums in, open this in <strong style={{ color: C.ink }}>Safari</strong>, tap Connect,
      then tap <strong style={{ color: C.ink }}>Allow</strong>. (Needs iPad software 16.4 or newer.)
    </p>
  );
}
function StarRow({ n, size = 34 }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ fontSize: size, filter: i < n ? "none" : "grayscale(1) opacity(0.3)",
          animation: i < n ? `k-pop .4s ease ${i * 0.12}s both` : "none" }}>⭐</span>
      ))}
    </div>
  );
}

/* ============================================================
   Big tappable drum pad (used everywhere kids play)
   ============================================================ */
function DrumPad({ id, lit, onTap, size = "auto", small }) {
  const color = KID_COLOR[id] || C.cyan;
  return (
    <button onClick={() => onTap?.(id)} className="k-press" aria-label={KID_LABEL[id]}
      style={{ position: "relative", width: size, aspectRatio: "1 / 1", borderRadius: "50%",
        border: `4px solid ${color}`, cursor: "pointer",
        background: lit ? color : `radial-gradient(circle at 40% 30%, ${C.cardHi}, ${C.card})`,
        boxShadow: lit ? `0 0 26px ${color}` : `0 5px 0 rgba(0,0,0,0.3)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: small ? 1 : 3, transition: "background .08s, box-shadow .08s", padding: 4 }}>
      {lit && <span style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `4px solid ${color}`,
        animation: "k-ring .5s ease-out", pointerEvents: "none" }} />}
      <span style={{ fontSize: small ? 22 : 30 }}>{KID_EMOJI[id]}</span>
      <span style={{ font: `600 ${small ? 10 : 12}px ${FONT}`, color: lit ? C.space : C.ink,
        textAlign: "center", lineHeight: 1.05 }}>{KID_LABEL[id]}</span>
    </button>
  );
}

/* ============================================================
   SCREEN: Meet Your Drums (kit explorer)
   ============================================================ */
function DrumsScreen({ hitPad, tap, soundOn, midiStatus, onConnect }) {
  const [sel, setSel] = useState("snare");
  const selDrum = KID_DRUMS.find((d) => d.id === sel);
  const onPad = (id) => { setSel(id); tap(id); if (soundOn) speak(KID_DRUMS.find((d) => d.id === id).say); };
  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🥁 Meet Your Drums</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
        Tap a drum to hear it! Hit it on your real kit and watch it light up.
      </p>
      <CosmoSays text={selDrum.say} soundOn={soundOn} mood="happy" size={84} />
      <div style={{ height: 18 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }} className="k-drumgrid">
        {KID_DRUMS.map((d) => (
          <DrumPad key={d.id} id={d.id} lit={hitPad === d.id || sel === d.id} onTap={onPad} small />
        ))}
      </div>
      <div style={{ marginTop: 16, textAlign: "center" }}>
        {midiStatus === "connected"
          ? <span style={{ font: `600 15px ${FONT}`, color: C.green }}>🎧 Your kit is connected — go on, hit a drum!</span>
          : <><GhostBtn onClick={onConnect} color={C.cyan}>🔌 Connect my drum kit</GhostBtn><IpadTip /></>}
      </div>
    </div>
  );
}

/* ============================================================
   Pattern preview (little glowing grid)
   ============================================================ */
function MiniGrid({ lanes, subdiv }) {
  const spb = subdiv * 4;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "8px 0 4px" }}>
      {lanes.map((lane) => (
        <div key={lane.pad} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{KID_EMOJI[lane.pad]}</span>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {R(spb).map((s) => {
              const on = lane.steps.includes(s);
              return <div key={s} style={{ flex: 1, height: 16, borderRadius: 5,
                background: on ? KID_COLOR[lane.pad] : C.cardHi,
                border: s % subdiv === 0 ? `2px solid ${C.line}` : "none" }} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   KidDrill — the friendly scored player.
   Reuses the shared metronome + live MIDI (or on-screen taps).
   Kids can't "fail" — they earn 1–3 stars and always move on.
   ============================================================ */
function KidDrill({ barsList, subdiv, bpm, tap, subscribeHits, midiStatus, onConnect, onWin, soundOn, winLabel = "Next →" }) {
  const [phase, setPhase] = useState("idle"); // idle | countin | play | results
  const [bar, setBar] = useState(0);
  const [live, setLive] = useState(null); // last-hit pad for glow
  const [result, setResult] = useState(null);
  const [count, setCount] = useState(0);

  const COUNTIN = 4;
  const totalBeats = barsList.length * 4;
  const beatCountRef = useRef(0);
  const expRef = useRef([]);
  const coveredRef = useRef(new Set());
  const demoRef = useRef(false);
  const finishedRef = useRef(false);
  const phaseRef = useRef("idle"); phaseRef.current = phase;
  const bpmRef = useRef(bpm); bpmRef.current = bpm;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; metroRef.current?.stop(); stopSpeak(); }, []);

  const padsUsed = Array.from(new Set(barsList.flatMap((b) => b.map((l) => l.pad))));

  const recordHit = useCallback((h) => {
    if (phaseRef.current !== "play") return;
    const pad = NOTE_TO_PAD[h.note]; if (!pad) return;
    setLive(pad); setTimeout(() => mountedRef.current && setLive(null), 140);
    const exp = expRef.current;
    let best = Infinity, bi = -1;
    for (let i = 0; i < exp.length; i++) {
      if (exp[i].pad !== pad) continue;
      const d = h.t - exp[i].t;
      if (Math.abs(d) < Math.abs(best)) { best = d; bi = i; }
    }
    if (bi === -1) return;
    const tol = Math.max(150, (60000 / bpmRef.current / subdiv) * 0.9); // generous for kids
    if (Math.abs(best) <= tol) coveredRef.current.add(bi);
  }, [subdiv]);

  useEffect(() => { if (!subscribeHits) return; return subscribeHits(recordHit); }, [subscribeHits, recordHit]);

  const finish = useCallback(() => {
    metroRef.current?.stop();
    if (!mountedRef.current) return;
    const total = expRef.current.length || 1;
    const hit = coveredRef.current.size;
    const density = Math.round((hit / total) * 100);
    const stars = hit === 0 ? 0 : density >= 60 ? 3 : density >= 30 ? 2 : 1;
    setResult({ stars, density, hit });
    setPhase("results");
    if (soundOn) {
      const line = stars >= 3 ? "Wow! Three stars! You're a superstar!"
        : stars === 2 ? "Great job! Two stars!"
        : stars === 1 ? "Nice try! You got a star!"
        : "Let's try again — press Show Me to hear it first!";
      setTimeout(() => speak(line), 250);
    }
  }, [soundOn]);

  const onBeat = useCallback(({ perfTime }) => {
    const n = beatCountRef.current; beatCountRef.current += 1;
    if (n < COUNTIN) { setPhase("countin"); setCount(COUNTIN - n); return; }
    setPhase("play");
    const recBeat = n - COUNTIN;
    const barIndex = Math.floor(recBeat / 4);
    if (barIndex >= barsList.length) return;
    setBar(barIndex + 1);
    const lanes = barsList[barIndex];
    const interval = 60000 / bpmRef.current;
    const beatInBar = recBeat % 4;
    for (let k = 0; k < subdiv; k++) {
      const step = beatInBar * subdiv + k;
      const t = perfTime + (k * interval) / subdiv;
      lanes.forEach((lane) => {
        if (!lane.steps.includes(step)) return;
        expRef.current.push({ pad: lane.pad, t });
        if (demoRef.current) {
          const delaySec = Math.max(0, (t - performance.now()) / 1000);
          playDrum(lane.pad, drumCtx().currentTime + delaySec, 100);
          setTimeout(() => recordHit({ note: (PADMAP[lane.pad].notes || [38])[0], velocity: 96, t: performance.now() }),
            Math.max(0, t - performance.now()));
        }
      });
    }
    if (recBeat + 1 >= totalBeats && !finishedRef.current) { finishedRef.current = true; setTimeout(finish, 320); }
  }, [barsList, subdiv, recordHit, finish, totalBeats]);

  const metro = useMetronome(bpm, 4, { onBeat, subdivision: subdiv });
  const metroRef = useRef(null); metroRef.current = metro;
  useEffect(() => { if (phase === "results" || phase === "idle") metro.stop(); /* eslint-disable-next-line */ }, [phase]);

  const begin = (demo) => {
    stopSpeak();
    beatCountRef.current = 0; expRef.current = []; coveredRef.current = new Set();
    finishedRef.current = false; demoRef.current = !!demo;
    setResult(null); setBar(0); setLive(null); setPhase("countin"); setCount(COUNTIN);
    metro.start();
  };
  const stop = () => { metro.stop(); finishedRef.current = true; setPhase("idle"); };

  // on-screen tap during play → feeds real scoring + sound
  const onTapPad = (id) => { tap(id); };

  const running = phase === "countin" || phase === "play";
  const connected = midiStatus === "connected";

  return (
    <KidCard color={C.line}>
      {phase === "idle" && (
        <>
          <MiniGrid lanes={barsList[0]} subdiv={subdiv} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <BigBtn onClick={() => begin(false)} color={C.green}>▶ Let's Play!</BigBtn>
            <GhostBtn onClick={() => begin(true)} color={C.yellow}>👀 Show Me</GhostBtn>
          </div>
          {!connected && (
            <p style={{ font: `500 14px ${FONT}`, color: C.dim, margin: "12px 0 0" }}>
              No kit? Tap the big drums below when you play — or press{" "}
              <button onClick={onConnect} style={{ font: `600 14px ${FONT}`, color: C.cyan, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Connect →</button>
            </p>
          )}
        </>
      )}

      {running && (
        <div style={{ textAlign: "center" }}>
          {phase === "countin" ? (
            <div style={{ font: `700 72px ${FONT}`, color: C.yellow, animation: "k-pop .3s ease" }}>
              {count > 0 ? count : "GO!"}
            </div>
          ) : (
            <div style={{ font: `700 22px ${FONT}`, color: C.pink, marginBottom: 8 }}>
              🎵 Bar {bar} of {barsList.length}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, margin: "6px 0 14px" }}>
            {[0, 1, 2, 3].map((b) => (
              <span key={b} style={{ width: 20, height: 20, borderRadius: 999,
                background: metro.beat === b ? C.yellow : C.cardHi,
                boxShadow: metro.beat === b ? `0 0 14px ${C.yellow}` : "none" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: 380, margin: "0 auto" }}>
            {padsUsed.map((id) => (
              <div key={id} style={{ width: 78 }}>
                <DrumPad id={id} lit={live === id} onTap={onTapPad} small />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <GhostBtn onClick={stop} color={C.dim}>⏹ Stop</GhostBtn>
          </div>
        </div>
      )}

      {phase === "results" && result && (
        <div className="k-rise" style={{ textAlign: "center" }}>
          <StarRow n={result.stars} />
          <p style={{ font: `600 22px ${FONT}`, color: C.ink, margin: "12px 0 4px" }}>
            {result.stars >= 3 ? "AMAZING! 🎉" : result.stars === 2 ? "Great job! 🌟" : result.stars === 1 ? "Nice try! ⭐" : "Let's try again!"}
          </p>
          <p style={{ font: `500 16px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
            {result.stars === 0 ? "Press Show Me to hear how it goes, then play along." : "You played it! Want to try for more stars?"}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <GhostBtn onClick={() => begin(false)} color={C.yellow}>🔁 Play Again</GhostBtn>
            {result.stars >= 1
              ? <BigBtn onClick={() => onWin(result.stars)} color={C.green}>{winLabel}</BigBtn>
              : <GhostBtn onClick={() => begin(true)} color={C.cyan}>👀 Show Me</GhostBtn>}
          </div>
        </div>
      )}
    </KidCard>
  );
}

/* ============================================================
   Echo game — Cosmo plays a phrase, you copy it
   ============================================================ */
function EchoGame({ mission, tap, subscribeHits, midiStatus, onConnect, onWin, soundOn }) {
  const [idx, setIdx] = useState(0);
  const [listened, setListened] = useState(false);
  const [listening, setListening] = useState(false);
  const phrase = mission.phrases[idx];

  const playPhrase = () => {
    stopSpeak();
    setListening(true);
    const ctx = drumCtx();
    const start = ctx.currentTime + 0.15;
    const spb = 60 / mission.bpm;
    phrase.lanes.forEach((lane) => lane.steps.forEach((step) => {
      const beatInBar = Math.floor(step / mission.subdiv);
      const k = step % mission.subdiv;
      playDrum(lane.pad, start + beatInBar * spb + (k * spb) / mission.subdiv, 104);
    }));
    const ms = (4 * spb + 0.3) * 1000;
    setTimeout(() => { setListening(false); setListened(true); }, ms);
  };

  const nextPhrase = () => {
    if (idx + 1 < mission.phrases.length) { setIdx(idx + 1); setListened(false); }
    else onWin(3);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {mission.phrases.map((_, i) => (
          <span key={i} style={{ width: 14, height: 14, borderRadius: 999,
            background: i < idx ? C.green : i === idx ? C.yellow : C.cardHi }} />
        ))}
      </div>
      <KidCard color={C.line} style={{ marginBottom: 14 }}>
        <p style={{ font: `600 18px ${FONT}`, color: C.ink, margin: "0 0 6px", textAlign: "center" }}>
          Phrase {idx + 1}: {phrase.label}
        </p>
        <MiniGrid lanes={phrase.lanes} subdiv={mission.subdiv} />
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <BigBtn onClick={playPhrase} color={C.purple}>{listening ? "🎵 Listening…" : listened ? "🔁 Listen Again" : "▶ Listen to Cosmo"}</BigBtn>
        </div>
      </KidCard>
      {listened && (
        <div className="k-rise">
          <p style={{ font: `600 18px ${FONT}`, color: C.yellow, textAlign: "center", margin: "0 0 10px" }}>
            👏 Your turn — copy it back!
          </p>
          <KidDrill key={idx} barsList={[phrase.lanes]} subdiv={mission.subdiv} bpm={mission.bpm}
            tap={tap} subscribeHits={subscribeHits} midiStatus={midiStatus} onConnect={onConnect}
            onWin={nextPhrase} soundOn={soundOn}
            winLabel={idx + 1 < mission.phrases.length ? "Next phrase →" : "Finish 🎉"} />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Jam — play along with a looping space groove
   ============================================================ */
const JAMS = [
  { id: "rocket", name: "Rocket Rock", emoji: "🚀", color: C.pink, bpm: 84, subdiv: 2, lanes: lanesFrom(ROCK) },
  { id: "moon", name: "Moon Bounce", emoji: "🌙", color: C.cyan, bpm: 76, subdiv: 2, lanes: lanesFrom({ hihat: R(8), snare: [4], kick: [0, 3, 6] }) },
  { id: "disco", name: "Star Disco", emoji: "🕺", color: C.gold, bpm: 96, subdiv: 2, lanes: lanesFrom({ hihat: R(8), snare: [2, 6], kick: R(4) }) },
];
function JamScreen({ tap, hitPad, midiStatus, onConnect, soundOn }) {
  const [jamId, setJamId] = useState("rocket");
  const jam = JAMS.find((j) => j.id === jamId);
  const [rate, setRate] = useState(1);
  const jamRef = useRef(jam); jamRef.current = jam;
  const rateRef = useRef(rate); rateRef.current = rate;

  const onBeat = useCallback(({ perfTime, beatInBar }) => {
    const j = jamRef.current;
    const interval = (60000 / (j.bpm * rateRef.current));
    for (let k = 0; k < j.subdiv; k++) {
      const step = beatInBar * j.subdiv + k;
      const t = perfTime + (k * interval) / j.subdiv;
      j.lanes.forEach((lane) => {
        if (!lane.steps.includes(step)) return;
        playDrum(lane.pad, drumCtx().currentTime + Math.max(0, (t - performance.now()) / 1000), 96);
      });
    }
  }, []);

  const metro = useMetronome(Math.round(jam.bpm * rate), 4, { onBeat, subdivision: 1 });
  useEffect(() => () => metro.stop(), []); // eslint-disable-line
  const playing = metro.running;
  const toggle = () => { if (playing) metro.stop(); else metro.start(); };

  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🎧 Jam Along</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
        Press play and drum along with the space groove. Just have fun!
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {JAMS.map((j) => (
          <button key={j.id} onClick={() => { if (playing) metro.stop(); setJamId(j.id); }} className="k-press"
            style={{ font: `600 16px ${FONT}`, color: jamId === j.id ? C.space : C.ink,
              background: jamId === j.id ? j.color : C.card, border: `3px solid ${j.color}`,
              borderRadius: 16, padding: "10px 16px", cursor: "pointer" }}>
            {j.emoji} {j.name}
          </button>
        ))}
      </div>
      <KidCard color={jam.color} style={{ textAlign: "center" }}>
        <div style={{ fontSize: 54, animation: playing ? "k-pulse .5s ease-in-out infinite" : "none" }}>{jam.emoji}</div>
        <div style={{ marginTop: 8 }}>
          <BigBtn onClick={toggle} color={jam.color}>{playing ? "⏹ Stop" : "▶ Play Groove"}</BigBtn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", margin: "18px 0 4px", flexWrap: "wrap" }}>
          <span style={{ font: `600 15px ${FONT}`, color: C.dim }}>🐢 Slow</span>
          <input type="range" min="60" max="120" value={Math.round(rate * 100)}
            onChange={(e) => setRate(+e.target.value / 100)} style={{ width: 180, accentColor: jam.color }} />
          <span style={{ font: `600 15px ${FONT}`, color: C.dim }}>Fast 🚀</span>
        </div>
      </KidCard>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: 460, margin: "18px auto 0" }}>
        {["kick", "snare", "hihat", "tom1", "tom3", "crash"].map((id) => (
          <div key={id} style={{ width: 84 }}>
            <DrumPad id={id} lit={hitPad === id} onTap={tap} small />
          </div>
        ))}
      </div>
      {midiStatus !== "connected" && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <GhostBtn onClick={onConnect} color={C.cyan}>🔌 Connect my drum kit</GhostBtn>
          <IpadTip />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Name That Drum — practice game (accuracy)
   ============================================================ */
function NameThatDrum({ tap, subscribeHits, soundOn, onScore }) {
  const POOL = ["snare", "kick", "hihat", "tom1", "tom3", "crash"];
  const [phase, setPhase] = useState("idle"); // idle | play | done
  const [target, setTarget] = useState(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [flash, setFlash] = useState(null);
  const TOTAL = 6;
  const targetRef = useRef(null); targetRef.current = target;
  const phaseRef = useRef("idle"); phaseRef.current = phase;
  const roundRef = useRef(0); roundRef.current = round;

  const nextRound = useCallback((r) => {
    if (r >= TOTAL) { setPhase("done"); if (soundOn) speak("You did it! Great listening!"); return; }
    const pick = POOL[Math.floor(Math.random() * POOL.length)];
    setTarget(pick); setRound(r);
    if (soundOn) setTimeout(() => speak(`Hit the ${KID_LABEL[pick]}!`), 150);
  }, [soundOn]);

  const handle = useCallback((padId) => {
    if (phaseRef.current !== "play") return;
    if (padId === targetRef.current) {
      setFlash("good"); setTimeout(() => setFlash(null), 300);
      setScore((s) => s + 1);
      const nr = roundRef.current + 1;
      setTimeout(() => nextRound(nr), 350);
    } else {
      setFlash("bad"); setTimeout(() => setFlash(null), 300);
    }
  }, [nextRound]);

  const recordHit = useCallback((h) => { const p = NOTE_TO_PAD[h.note]; if (p) handle(p); }, [handle]);
  useEffect(() => { if (!subscribeHits) return; return subscribeHits(recordHit); }, [subscribeHits, recordHit]);

  const start = () => { setScore(0); setPhase("play"); nextRound(0); };
  const onTap = (id) => { tap(id); handle(id); };

  return (
    <KidCard color={C.purple}>
      <h2 style={{ font: `700 22px ${FONT}`, color: C.ink, margin: "0 0 6px" }}>🎯 Name That Drum</h2>
      <p style={{ font: `500 15px ${FONT}`, color: C.dim, margin: "0 0 12px" }}>
        Cosmo calls a drum — you hit it! Listen carefully.
      </p>
      {phase === "idle" && <BigBtn onClick={start} color={C.purple}>▶ Start Game</BigBtn>}
      {phase === "play" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ font: `600 16px ${FONT}`, color: C.dim, marginBottom: 6 }}>Round {round + 1} of {TOTAL} · ⭐ {score}</div>
          <div style={{ font: `700 26px ${FONT}`, color: flash === "good" ? C.green : flash === "bad" ? C.red : C.yellow,
            marginBottom: 14, minHeight: 34 }}>
            {flash === "good" ? "Yes! 🎉" : flash === "bad" ? "Try again!" : `Hit the ${KID_LABEL[target]}!`}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", maxWidth: 380, margin: "0 auto" }}>
            {POOL.map((id) => (
              <div key={id} style={{ width: 78 }}><DrumPad id={id} lit={false} onTap={onTap} small /></div>
            ))}
          </div>
        </div>
      )}
      {phase === "done" && (
        <div className="k-rise" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>🏅</div>
          <p style={{ font: `700 24px ${FONT}`, color: C.ink, margin: "8px 0" }}>You got {score} of {TOTAL}!</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <BigBtn onClick={start} color={C.green}>🔁 Play Again</BigBtn>
            <GhostBtn onClick={() => onScore?.(score)} color={C.cyan}>Done</GhostBtn>
          </div>
        </div>
      )}
    </KidCard>
  );
}

/* ============================================================
   SCREEN: Play Room (practice games)
   ============================================================ */
function PlayRoom({ tap, subscribeHits, midiStatus, onConnect, soundOn, awardStar }) {
  const [game, setGame] = useState("beat");
  const [bpm, setBpm] = useState(80);
  const metro = useMetronome(bpm, 4);
  useEffect(() => () => metro.stop(), []); // eslint-disable-line
  useEffect(() => { if (game !== "beat") metro.stop(); }, [game]); // eslint-disable-line

  const tempoWord = bpm < 70 ? "🐢 Slow" : bpm < 100 ? "🚶 Just right" : bpm < 140 ? "🏃 Fast" : "🚀 Zoom!";

  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🎮 Play Room</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
        Fun games to practice. Pick one!
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {[["beat", "⏱ Space Beat"], ["name", "🎯 Name That Drum"], ["free", "🥁 Free Play"]].map(([id, label]) => (
          <button key={id} onClick={() => setGame(id)} className="k-press"
            style={{ font: `600 16px ${FONT}`, color: game === id ? C.space : C.ink,
              background: game === id ? C.cyan : C.card, border: `3px solid ${C.cyan}`,
              borderRadius: 16, padding: "10px 16px", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {game === "beat" && (
        <KidCard color={C.cyan} style={{ textAlign: "center" }}>
          <h2 style={{ font: `700 22px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>⏱ Space Beat</h2>
          <p style={{ font: `500 15px ${FONT}`, color: C.dim, margin: "0 0 14px" }}>The beep keeps time. Play along and stay with it!</p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "6px 0 14px" }}>
            {[0, 1, 2, 3].map((b) => (
              <span key={b} style={{ width: 22, height: 22, borderRadius: 999,
                background: metro.running && metro.beat === b ? C.yellow : C.cardHi,
                boxShadow: metro.running && metro.beat === b ? `0 0 16px ${C.yellow}` : "none" }} />
            ))}
          </div>
          <div style={{ font: `700 52px ${FONT}`, color: C.cyan, lineHeight: 1 }}>{bpm}</div>
          <div style={{ font: `600 16px ${FONT}`, color: C.dim, margin: "2px 0 12px" }}>{tempoWord}</div>
          <input type="range" min="50" max="160" value={bpm} onChange={(e) => setBpm(+e.target.value)}
            style={{ width: "80%", accentColor: C.cyan }} />
          <div style={{ marginTop: 16 }}>
            <BigBtn onClick={() => (metro.running ? metro.stop() : metro.start())} color={C.cyan}>
              {metro.running ? "⏹ Stop" : "▶ Start Beat"}
            </BigBtn>
          </div>
        </KidCard>
      )}

      {game === "name" && (
        <NameThatDrum tap={tap} subscribeHits={subscribeHits} soundOn={soundOn}
          onScore={(s) => { if (s > 0) awardStar(); }} />
      )}

      {game === "free" && (
        <KidCard color={C.green}>
          <h2 style={{ font: `700 22px ${FONT}`, color: C.ink, margin: "0 0 6px" }}>🥁 Free Play</h2>
          <p style={{ font: `500 15px ${FONT}`, color: C.dim, margin: "0 0 14px" }}>
            Bash away! Tap the drums or play your real kit. No rules — just make noise!
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }} className="k-drumgrid">
            {KID_DRUMS.map((d) => <DrumPad key={d.id} id={d.id} lit={false} onTap={tap} small />)}
          </div>
        </KidCard>
      )}

      {midiStatus !== "connected" && game !== "free" && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <GhostBtn onClick={onConnect} color={C.cyan}>🔌 Connect my drum kit</GhostBtn>
          <IpadTip />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SCREEN: Missions (galaxy map)
   ============================================================ */
function MissionsScreen({ done, openMission, goDrums }) {
  const isDone = (id) => done.includes(id);
  const planetDone = (p) => p.missions.every((m) => isDone(m.id));
  const unlocked = (i) => i === 0 || PLANETS[i - 1].missions.every((m) => isDone(m.id));

  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🪐 Space Missions</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 18px" }}>
        Fly to each planet and finish the missions to unlock the next one!
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PLANETS.map((p, i) => {
          const open = unlocked(i);
          const complete = planetDone(p);
          const doneCount = p.missions.filter((m) => isDone(m.id)).length;
          return (
            <KidCard key={p.id} color={p.color} style={{ opacity: open ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 46, animation: open && !complete ? "k-float 3s ease-in-out infinite" : "none" }}>
                  {complete ? "✅" : open ? p.emoji : "🔒"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ font: `700 22px ${FONT}`, color: C.ink, margin: 0 }}>{p.name}</h2>
                  <p style={{ font: `500 14px ${FONT}`, color: C.dim, margin: "2px 0 0" }}>{p.blurb}</p>
                </div>
                <span style={{ font: `700 15px ${FONT}`, color: complete ? C.green : C.dim, whiteSpace: "nowrap" }}>
                  {open ? `${doneCount}/${p.missions.length} ⭐` : "Locked"}
                </span>
              </div>
              {open && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {p.missions.map((m) => {
                    const d = isDone(m.id);
                    return (
                      <button key={m.id} onClick={() => (m.kind === "kit" ? goDrums() : openMission(m))} className="k-press"
                        style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                          background: C.cardHi, border: `2px solid ${d ? C.green : C.line}`, borderRadius: 14,
                          padding: "12px 14px", cursor: "pointer" }}>
                        <span style={{ fontSize: 26 }}>{m.emoji}</span>
                        <span style={{ font: `600 17px ${FONT}`, color: C.ink, flex: 1 }}>{m.title}</span>
                        <span style={{ fontSize: 22 }}>{d ? "⭐" : "▶️"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </KidCard>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Mission detail (opens a single mission)
   ============================================================ */
function MissionDetail({ mission, planet, onBack, onComplete, tap, subscribeHits, midiStatus, onConnect, soundOn, goJam }) {
  const barsList = mission.kind === "song" ? mission.barsList
    : mission.lanes ? Array.from({ length: mission.bars || 2 }, () => mission.lanes) : null;

  return (
    <div className="k-rise">
      <button onClick={onBack} className="k-press"
        style={{ font: `600 16px ${FONT}`, color: C.cyan, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 14 }}>
        ← Back to missions
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 34 }}>{mission.emoji}</span>
        <h1 style={{ font: `700 28px ${FONT}`, color: C.ink, margin: 0 }}>{mission.title}</h1>
      </div>
      <p style={{ font: `500 14px ${FONT}`, color: planet.color, margin: "0 0 16px" }}>{planet.emoji} {planet.name}</p>

      <CosmoSays text={mission.say} soundOn={soundOn} mood={mission.kind === "learn" ? "cheer" : "happy"} size={84} />
      <div style={{ height: 18 }} />

      {mission.kind === "learn" && (
        <BigBtn onClick={() => onComplete(1)} color={C.green} full>✅ Got it! (+1 ⭐)</BigBtn>
      )}

      {(mission.kind === "play" || mission.kind === "song") && barsList && (
        <KidDrill barsList={barsList} subdiv={mission.subdiv} bpm={mission.bpm}
          tap={tap} subscribeHits={subscribeHits} midiStatus={midiStatus} onConnect={onConnect}
          onWin={(stars) => onComplete(stars)} soundOn={soundOn} winLabel="⭐ Collect stars!" />
      )}

      {mission.kind === "echo" && (
        <EchoGame mission={mission} tap={tap} subscribeHits={subscribeHits} midiStatus={midiStatus}
          onConnect={onConnect} onWin={(stars) => onComplete(stars)} soundOn={soundOn} />
      )}

      {mission.kind === "jam" && (
        <div style={{ textAlign: "center" }}>
          <BigBtn onClick={goJam} color={C.pink}>🎧 Open Jam Room</BigBtn>
          <div style={{ marginTop: 12 }}>
            <GhostBtn onClick={() => onComplete(2)} color={C.green}>✅ I jammed! (+2 ⭐)</GhostBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SCREEN: Home (Mission Control)
   ============================================================ */
function HomeScreen({ stars, done, badges, go, soundOn }) {
  const pct = Math.round((done.length / TOTAL_MISSIONS) * 100);
  const next = ALL_MISSIONS.find((m) => !done.includes(m.id));
  const greeting = done.length === 0
    ? "Hi space cadet! I'm Cosmo. Ready to learn the drums? Let's blast off! 🚀"
    : done.length >= TOTAL_MISSIONS
      ? "WOW! You finished the whole adventure! You're a real Space Rockstar! 🏆"
      : `You're doing great! You have ${stars} stars. Let's do the next mission!`;
  return (
    <div className="k-rise">
      <CosmoSays text={greeting} soundOn={soundOn} mood="cheer" size={110} />
      <div style={{ height: 20 }} />
      <KidCard color={C.yellow} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ font: `700 34px ${FONT}`, color: C.yellow }}>⭐ {stars}</div>
            <div style={{ font: `600 13px ${FONT}`, color: C.dim }}>STARS</div>
          </div>
          <div>
            <div style={{ font: `700 34px ${FONT}`, color: C.green }}>🏆 {badges.length}</div>
            <div style={{ font: `600 13px ${FONT}`, color: C.dim }}>BADGES</div>
          </div>
          <div>
            <div style={{ font: `700 34px ${FONT}`, color: C.cyan }}>{pct}%</div>
            <div style={{ font: `600 13px ${FONT}`, color: C.dim }}>DONE</div>
          </div>
        </div>
        <div style={{ height: 16, background: C.cardHi, borderRadius: 999, marginTop: 14, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999,
            background: `linear-gradient(90deg, ${C.cyan}, ${C.pink})`, transition: "width .4s" }} />
        </div>
      </KidCard>

      {next && (
        <KidCard color={C.pink} style={{ marginBottom: 16, textAlign: "center" }}>
          <div style={{ font: `600 14px ${FONT}`, color: C.dim }}>NEXT MISSION</div>
          <div style={{ font: `700 24px ${FONT}`, color: C.ink, margin: "4px 0 12px" }}>{next.emoji} {next.title}</div>
          <BigBtn onClick={() => go("missions")} color={C.pink}>🚀 Let's Go!</BigBtn>
        </KidCard>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }} className="k-drumgrid">
        {[["drums", "🥁", "My Drums", C.cyan], ["play", "🎮", "Play Games", C.purple],
          ["jam", "🎧", "Jam Along", C.orange], ["build", "🛠️", "Build Drums", C.green],
          ["badges", "🏆", "My Badges", C.gold]].map(([id, e, t, col]) => (
          <button key={id} onClick={() => go(id)} className="k-press"
            style={{ background: C.card, border: `3px solid ${col}`, borderRadius: 20, padding: "18px 10px",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 38 }}>{e}</span>
            <span style={{ font: `600 16px ${FONT}`, color: C.ink }}>{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN: Badges
   ============================================================ */
function BadgesScreen({ stars, badges, onReset }) {
  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🏆 My Space Badges</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
        You have <strong style={{ color: C.yellow }}>⭐ {stars} stars</strong> and{" "}
        <strong style={{ color: C.green }}>{badges.length} badges</strong>! Keep going to collect them all.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }} className="k-drumgrid">
        {BADGES.map((b) => {
          const got = badges.includes(b.id);
          return (
            <div key={b.id} style={{ background: C.card, border: `3px solid ${got ? C.gold : C.line}`,
              borderRadius: 20, padding: 16, textAlign: "center", opacity: got ? 1 : 0.5,
              animation: got ? "k-pop .4s ease" : "none" }}>
              <div style={{ fontSize: 44, filter: got ? "none" : "grayscale(1)" }}>{got ? b.emoji : "🔒"}</div>
              <div style={{ font: `700 16px ${FONT}`, color: C.ink, marginTop: 6 }}>{b.name}</div>
              <div style={{ font: `500 13px ${FONT}`, color: C.dim, marginTop: 2 }}>{b.desc}</div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", marginTop: 22 }}>
        <button onClick={() => { if (window.confirm("Start the whole adventure over? Your stars and badges will reset.")) onReset(); }}
          style={{ font: `600 14px ${FONT}`, color: C.dim, background: "none", border: `2px solid ${C.line}`,
            borderRadius: 14, padding: "8px 16px", cursor: "pointer" }}>
          🔄 Start over
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN: Build Your Drums (kid-friendly assembly)
   Reuses the shared AssemblyArt diagrams with simple words + voice.
   ============================================================ */
const BUILD_STEPS = [
  { n: 1, s: 2, t: "Build the metal frame", say: "First, build the metal stand. It's like a skeleton that holds all your drums up!" },
  { n: 2, s: 4, t: "Put the drums on", say: "Now clip on the drums — the snare in front of you, the toms up on top, and the big boomy kick down on the floor." },
  { n: 3, s: 5, t: "Add the shiny cymbals", say: "Add the crash and the ride cymbals, and the hi-hat with its foot pedal." },
  { n: 4, s: 7, t: "Plug in the cables", say: "Plug each cable into the matching name on the brain box. Snare goes to SNARE, kick goes to KICK!" },
  { n: 5, s: 6, t: "Sit down and play!", say: "All done! Sit on your stool, grab your sticks, and get ready to rock and roll!" },
];

function BuildScreen({ soundOn }) {
  const box = { borderRadius: 16, overflow: "hidden", border: `2px solid ${C.line}`,
    background: "radial-gradient(circle at 50% 30%, #1a1440, #0B1026)", padding: "6px 4px", marginTop: 10 };
  return (
    <div className="k-rise">
      <h1 style={{ font: `700 30px ${FONT}`, color: C.ink, margin: "0 0 4px" }}>🛠️ Build Your Drums</h1>
      <p style={{ font: `500 17px ${FONT}`, color: C.dim, margin: "0 0 16px" }}>
        Watch your drum kit come together, step by step!
      </p>
      <CosmoSays text="Let's build your space drum kit! It has lots of screws, so grab a grown-up to help. Ready? Here we go!" soundOn={soundOn} mood="cheer" size={84} />
      <div style={{ height: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {BUILD_STEPS.map((st) => (
          <KidCard key={st.n} color={C.cyan}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 12, background: C.cyan,
                color: C.space, font: `700 18px ${FONT}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{st.n}</span>
              <h2 style={{ font: `700 20px ${FONT}`, color: C.ink, margin: 0, flex: 1 }}>{st.t}</h2>
              <button onClick={() => speak(st.say)} aria-label="Read out loud" className="k-press"
                style={{ font: `600 14px ${FONT}`, background: C.yellow, color: C.space, border: "none",
                  borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>🔊</button>
            </div>
            <div style={box}><AssemblyArt step={st.s} /></div>
            <p style={{ font: `500 16px ${FONT}`, color: C.dim, margin: "10px 0 0", lineHeight: 1.45 }}>{st.say}</p>
          </KidCard>
        ))}
      </div>
      <KidCard color={C.yellow} style={{ marginTop: 16 }}>
        <p style={{ font: `500 16px ${FONT}`, color: C.ink, margin: 0, lineHeight: 1.5 }}>
          👩‍🔧 <strong>Grown-up tip:</strong> keep the screws a little loose until everything is in place, then tighten them all at the end.
        </p>
      </KidCard>
    </div>
  );
}

/* ============================================================
   ROOT — Space Cadets
   ============================================================ */
const NAV = [
  { id: "home", emoji: "🚀", label: "Home" },
  { id: "drums", emoji: "🥁", label: "Drums" },
  { id: "missions", emoji: "🪐", label: "Missions" },
  { id: "play", emoji: "🎮", label: "Play" },
  { id: "jam", emoji: "🎧", label: "Jam" },
  { id: "badges", emoji: "🏆", label: "Badges" },
];

export default function KidsApp({ onExit } = {}) {
  const persisted = load();
  const [view, setView] = useState("home");
  const [openMission, setOpenMission] = useState(null); // {mission, planet}
  const [done, setDone] = useState(persisted.done || []);
  const [stars, setStars] = useState(persisted.stars || 0);
  const [badges, setBadges] = useState(persisted.badges || []);
  const [soundOn, setSoundOn] = useState(persisted.soundOn !== false);
  const [confetti, setConfetti] = useState(0);

  useEffect(() => { save({ done, stars, badges, soundOn }); }, [done, stars, badges, soundOn]);
  useEffect(() => () => stopSpeak(), []);
  useEffect(() => { stopSpeak(); }, [view]);

  /* ---- live MIDI (own listener set, mirrors the grown-up app) ---- */
  const [hitPad, setHitPad] = useState(null);
  const hitClearRef = useRef(null);
  const listeners = useRef(new Set());
  const subscribeHits = useCallback((fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); }, []);
  const registerHit = useCallback((h) => {
    listeners.current.forEach((fn) => fn(h));
    const pad = NOTE_TO_PAD[h.note];
    if (pad) { setHitPad(pad); clearTimeout(hitClearRef.current); hitClearRef.current = setTimeout(() => setHitPad(null), 200); }
  }, []);
  const { status, connect } = useMidi(registerHit);
  // on-screen tap: play the sound AND feed the same pipeline as the real kit
  const tap = useCallback((padId) => {
    playDrum(padId);
    registerHit({ note: (PADMAP[padId].notes || [38])[0], velocity: 100, t: performance.now() });
  }, [registerHit]);

  const fireConfetti = () => setConfetti((c) => c + 1);
  const grantBadge = useCallback((id) => {
    setBadges((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  // award badges based on new totals
  const checkBadges = useCallback((newDone, newStars) => {
    const add = new Set(badges);
    if (newStars >= 1) add.add("first-star");
    if (newStars >= 10) add.add("ten-stars");
    if (newDone.includes("m1-1")) add.add("first-drum");
    if (newDone.includes("m3-2")) add.add("beat");
    if (newDone.includes("m4-3")) add.add("crash");
    if (newDone.includes("m5-1")) add.add("song");
    PLANETS.forEach((p) => { if (p.missions.every((m) => newDone.includes(m.id))) add.add("planet"); });
    if (ALL_MISSIONS.every((m) => newDone.includes(m.id))) add.add("rockstar");
    setBadges(Array.from(add));
  }, [badges]);

  const completeMission = (missionId, gainedStars) => {
    const alreadyDone = done.includes(missionId);
    const newDone = alreadyDone ? done : [...done, missionId];
    const newStars = stars + (gainedStars || 0);
    setDone(newDone);
    setStars(newStars);
    checkBadges(newDone, newStars);
    fireConfetti();
    setOpenMission(null);
    setView("missions");
  };

  const awardStar = () => { const ns = stars + 1; setStars(ns); checkBadges(done, ns); fireConfetti(); };

  // "First Boom" badge the moment they visit Drums
  useEffect(() => { if (view === "drums") grantBadge("first-drum"); }, [view, grantBadge]);

  const go = (v) => { setOpenMission(null); setView(v); };

  return (
    <div style={{ minHeight: "100vh", position: "relative",
      background: `radial-gradient(circle at 20% 0%, ${C.space2}, ${C.space} 60%)`,
      color: C.ink, fontFamily: FONT, overflowX: "hidden" }}>
      <CosmicStyles />
      <Starfield />
      <Confetti fireKey={confetti} />
      <style>{`
        @media (max-width: 640px) { .k-drumgrid { grid-template-columns: repeat(2, 1fr) !important; } }
      `}</style>

      {/* Top bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 20,
        background: "rgba(11,16,38,0.85)", backdropFilter: "blur(8px)", borderBottom: `2px solid ${C.line}` }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <span onClick={() => go("home")} style={{ font: `700 20px ${FONT}`, cursor: "pointer", letterSpacing: "0.02em" }}>
            <span style={{ color: C.cyan }}>SPACE</span> <span style={{ color: C.pink }}>CADETS</span> 🚀
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ font: `700 16px ${FONT}`, color: C.yellow }}>⭐ {stars}</span>
          <button onClick={() => { setSoundOn((v) => { if (v) stopSpeak(); return !v; }); }} aria-label="Toggle read-aloud"
            className="k-press" title={soundOn ? "Voice on" : "Voice off"}
            style={{ font: `600 18px ${FONT}`, background: soundOn ? C.green : C.card,
              border: `2px solid ${C.line}`, borderRadius: 12, padding: "6px 10px", cursor: "pointer" }}>
            {soundOn ? "🔊" : "🔇"}
          </button>
          {onExit && (
            <button onClick={onExit} className="k-press" title="Grown-up course"
              style={{ font: `600 13px ${FONT}`, color: C.dim, background: C.card,
                border: `2px solid ${C.line}`, borderRadius: 12, padding: "6px 10px", cursor: "pointer" }}>
              Grown-ups
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "22px 18px 110px", position: "relative", zIndex: 1 }}>
        {openMission ? (
          <MissionDetail mission={openMission.mission} planet={openMission.planet}
            onBack={() => setOpenMission(null)}
            onComplete={(s) => completeMission(openMission.mission.id, s)}
            tap={tap} subscribeHits={subscribeHits} midiStatus={status} onConnect={connect}
            soundOn={soundOn} goJam={() => go("jam")} />
        ) : (
          <>
            {view === "home" && <HomeScreen stars={stars} done={done} badges={badges} go={go} soundOn={soundOn} />}
            {view === "drums" && <DrumsScreen hitPad={hitPad} tap={tap} soundOn={soundOn} midiStatus={status} onConnect={connect} />}
            {view === "missions" && (
              <MissionsScreen done={done} goDrums={() => go("drums")}
                openMission={(m) => setOpenMission({ mission: m, planet: PLANETS.find((p) => p.missions.includes(m)) })} />
            )}
            {view === "play" && <PlayRoom tap={tap} subscribeHits={subscribeHits} midiStatus={status}
              onConnect={connect} soundOn={soundOn} awardStar={awardStar} />}
            {view === "jam" && <JamScreen tap={tap} hitPad={hitPad} midiStatus={status} onConnect={connect} soundOn={soundOn} />}
            {view === "build" && <BuildScreen soundOn={soundOn} />}
            {view === "badges" && <BadgesScreen stars={stars} badges={badges}
              onReset={() => { setDone([]); setStars(0); setBadges([]); setView("home"); }} />}
          </>
        )}
      </main>

      {/* Bottom rocket nav */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: "rgba(11,16,38,0.96)", backdropFilter: "blur(10px)", borderTop: `2px solid ${C.line}`,
        display: "flex", justifyContent: "space-around", padding: "8px 4px" }}>
        {NAV.map((n) => {
          const active = !openMission && view === n.id;
          return (
            <button key={n.id} onClick={() => go(n.id)} className="k-press"
              style={{ background: "none", border: "none", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 6px",
                color: active ? C.yellow : C.dim }}>
              <span style={{ fontSize: 24, filter: active ? "none" : "grayscale(0.4) opacity(0.8)" }}>{n.emoji}</span>
              <span style={{ font: `600 10px ${FONT}` }}>{n.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
