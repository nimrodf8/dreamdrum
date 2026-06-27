import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   DREAMDRUM — Phase 1 MVP
   Built for the Roland TD-313. Complete-beginner course.
   - Kit setup & photo confirmation
   - Interactive kit explorer (live MIDI highlight)
   - Stage 0–3 lessons with progression gating
   - Accurate Web Audio metronome
   - Live MIDI monitor + session logging + skill read-out
   ------------------------------------------------------------
   Design direction: "Practice room after dark."
   Materials of the kit drive the palette — espresso shadow,
   bronze/brass cymbal accent, amber strike-glow on every hit.
   Persistence here is in-memory (prototype). On deploy we wire
   localStorage, then Supabase for cross-device sync.
   ============================================================ */

const T = {
  bg: "#15120E",
  bgRaise: "#1E1A14",
  bgCard: "#241F18",
  bgCardHi: "#2C2619",
  line: "#352E24",
  lineHi: "#4A4030",
  bone: "#EDE6D8",
  boneDim: "#A89F8E",
  steel: "#6F685C",
  brass: "#D6A24A",
  brassHi: "#EFC069",
  strike: "#F2A33C",
  good: "#7FB069",
  warn: "#E08A4B",
};

const FONT_DISPLAY = "'Archivo', system-ui, sans-serif";
const FONT_MONO = "'Space Mono', ui-monospace, monospace";

/* ---------- Kit definition (maps to the physical TD-313) ---------- */
const PADS = [
  {
    id: "crash",
    name: "Crash",
    model: "CY-12C-T",
    kind: "cymbal",
    role: "The accent. The splash you hear at the start of a section, or to punctuate a big moment. Grab its edge to choke it silent.",
    notes: [49, 55, 52, 57],
    x: 90, y: 64, rx: 46, ry: 13,
  },
  {
    id: "ride",
    name: "Ride",
    model: "CY-14R-T",
    kind: "cymbal",
    role: "The other timekeeper. A steady, pingy pulse — an alternative to the hi-hat. Three zones: bow, edge, and the bell in the middle. Sits high on its own stand.",
    notes: [51, 59, 53],
    x: 352, y: 78, rx: 52, ry: 15,
  },
  {
    id: "hihat",
    name: "Hi-Hat",
    model: "CY-5 + FD-9 pedal",
    kind: "cymbal",
    role: "Your main timekeeper. The cymbal sits on a stand, and its foot pedal — on the floor — opens and closes it. Closed is tight and crisp, open rings out. Most beats live here.",
    notes: [42, 46, 44, 26, 22],
    x: 104, y: 150, rx: 40, ry: 11,
  },
  {
    id: "tom1",
    name: "Tom 1 — High",
    model: "PD-8H",
    kind: "drum",
    role: "The highest-pitched tom, raised on the rack. Lives in fills, where you move across the drums in a descending tumble.",
    notes: [48, 50],
    x: 184, y: 120, r: 30,
  },
  {
    id: "tom2",
    name: "Tom 2 — Mid",
    model: "PD-8H",
    kind: "drum",
    role: "The middle tom, mounted beside Tom 1. The step between the high tom and the floor tom when you roll around the kit.",
    notes: [45, 47],
    x: 262, y: 120, r: 30,
  },
  {
    id: "tom3",
    name: "Tom 3 — Floor",
    model: "PD-10H",
    kind: "drum",
    role: "The lowest, deepest tom. Stands on its own legs to your right and lands the heavy notes at the bottom of a fill.",
    notes: [43, 58, 41],
    x: 356, y: 196, r: 34,
  },
  {
    id: "snare",
    name: "Snare",
    model: "PDX-12",
    kind: "drum",
    role: "Your main voice, raised on a snare stand right in front of you — sharp and central to nearly every beat, usually on counts 2 and 4. Its rim adds cross-stick and rim-shot sounds.",
    notes: [38, 40, 37],
    x: 150, y: 198, r: 37,
  },
  {
    id: "kick",
    name: "Kick",
    model: "KD-10",
    kind: "kick",
    role: "The heartbeat, played with your right foot. The beater drum sits on the floor in the centre, with its pedal running toward you — the deep pulse that anchors the whole groove.",
    notes: [36, 35],
    x: 224, y: 252, w: 54, h: 46,
  },
];

const NOTE_TO_PAD = (() => {
  const m = {};
  PADS.forEach((p) => p.notes.forEach((n) => (m[n] = p.id)));
  return m;
})();

/* ============================================================
   Hook: Web MIDI — detect the kit, parse note-on events
   ============================================================ */
function useMidi(onHit) {
  const [status, setStatus] = useState("idle"); // idle | unsupported | connecting | connected | denied | nodevice
  const [deviceName, setDeviceName] = useState(null);
  const onHitRef = useRef(onHit);
  onHitRef.current = onHit;

  const handleMessage = useCallback((e) => {
    const [raw, note, vel] = e.data;
    const type = raw & 0xf0;
    if (type === 0x90 && vel > 0) {
      onHitRef.current?.({ note, velocity: vel, t: performance.now() });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!navigator.requestMIDIAccess) {
      setStatus("unsupported");
      return;
    }
    setStatus("connecting");
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      const attach = () => {
        const inputs = Array.from(access.inputs.values());
        if (inputs.length === 0) {
          setStatus("nodevice");
          setDeviceName(null);
          return;
        }
        inputs.forEach((inp) => (inp.onmidimessage = handleMessage));
        const roland = inputs.find((i) => /td|roland|v-?drum/i.test(i.name || ""));
        setDeviceName((roland || inputs[0]).name || "MIDI device");
        setStatus("connected");
      };
      attach();
      access.onstatechange = attach;
    } catch {
      setStatus("denied");
    }
  }, [handleMessage]);

  return { status, deviceName, connect };
}

/* ============================================================
   Hook: Metronome — Web Audio, lookahead scheduling
   ============================================================ */
function useMetronome(bpm, beatsPerBar, opts = {}) {
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);
  const ctxRef = useRef(null);
  const nextNoteRef = useRef(0);
  const beatRef = useRef(0);
  const timerRef = useRef(null);
  const bpmRef = useRef(bpm);
  const bpbRef = useRef(beatsPerBar);
  const onBeatRef = useRef(opts.onBeat);
  const subRef = useRef(opts.subdivision || 1);
  bpmRef.current = bpm;
  bpbRef.current = beatsPerBar;
  onBeatRef.current = opts.onBeat;
  subRef.current = opts.subdivision || 1;

  const click = useCallback((time, accent, soft) => {
    const ctx = ctxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : soft ? 660 : 920;
    const peak = accent ? 0.5 : soft ? 0.12 : 0.32;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const spb = 60.0 / bpmRef.current;
    while (nextNoteRef.current < ctx.currentTime + 0.12) {
      const b = beatRef.current % bpbRef.current;
      const when = nextNoteRef.current;
      click(when, b === 0, false);
      const sub = subRef.current;
      if (sub > 1) for (let k = 1; k < sub; k++) click(when + (spb * k) / sub, false, true);
      const delay = Math.max(0, (when - ctx.currentTime) * 1000);
      setTimeout(() => setBeat(b), delay);
      const perfTime = performance.now() + (when - ctx.currentTime) * 1000;
      onBeatRef.current?.({ perfTime, index: beatRef.current, beatInBar: b, accent: b === 0 });
      nextNoteRef.current += spb;
      beatRef.current += 1;
    }
  }, [click]);

  const start = useCallback(() => {
    if (running) return;
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    beatRef.current = 0;
    nextNoteRef.current = ctxRef.current.currentTime + 0.1;
    timerRef.current = setInterval(scheduler, 25);
    setRunning(true);
  }, [running, scheduler]);

  const stop = useCallback(() => {
    clearInterval(timerRef.current);
    setRunning(false);
    setBeat(0);
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);
  return { running, beat, start, stop };
}

/* ============================================================
   Global styles (fonts, keyframes, base)
   ============================================================ */
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
      * { box-sizing: border-box; }
      ::selection { background: ${T.brass}; color: ${T.bg}; }
      @keyframes dc-strike {
        0% { opacity: .95; transform: scale(.9); }
        100% { opacity: 0; transform: scale(1.6); }
      }
      @keyframes dc-pulse {
        0%,100% { opacity: .35; } 50% { opacity: 1; }
      }
      @keyframes dc-rise {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .dc-rise { animation: dc-rise .5s ease both; }
      .dc-focus:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
      }
    `}</style>
  );
}

/* ============================================================
   Kit diagram (SVG, realistic top-down + live highlight + drag)
   ============================================================ */
const LABELS = {
  crash: "CRASH", ride: "RIDE", hihat: "HI-HAT",
  tom1: "TOM 1", tom2: "TOM 2", tom3: "FLOOR", snare: "SNARE", kick: "KICK",
};

const FLOOR_Y = 322;
const HUB = { x: 220, y: 256 };

/* Angled cymbal: a thin disc on a stand, viewed from front-above */
function AngledCymbal({ p, sel, hit }) {
  const ring = sel ? T.brassHi : hit ? T.strike : "#5A5038";
  return (
    <g>
      {/* underside thickness */}
      <ellipse cx={p.x} cy={p.y + 2.5} rx={p.rx} ry={p.ry} fill="#14110C" />
      {/* top face */}
      <ellipse cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="url(#cymMetal)"
        stroke={ring} strokeWidth={sel || hit ? 2.4 : 1.3} />
      {[0.78, 0.56, 0.34].map((f, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx * f} ry={p.ry * f}
          fill="none" stroke="#0E0C08" strokeWidth="0.6" opacity="0.5" />
      ))}
      <ellipse cx={p.x} cy={p.y - 0.5} rx={p.rx * 0.15} ry={p.ry * 0.32} fill="#6B5A33" />
      <ellipse cx={p.x - p.rx * 0.32} cy={p.y - p.ry * 0.3} rx={p.rx * 0.32} ry={p.ry * 0.34}
        fill="#7A6A40" opacity="0.22" />
    </g>
  );
}

/* Angled drum: a shallow cylinder (top head + shell wall) raised on a stand */
function AngledDrum({ p, sel, hit }) {
  const r = p.r;
  const rx = r, ry = r * 0.4, depth = r * 0.5;
  const rim = sel ? T.brassHi : hit ? T.strike : "#4C4636";
  const lugs = 8;
  return (
    <g>
      {/* shell side wall */}
      <path d={`M ${p.x - rx},${p.y} L ${p.x - rx},${p.y + depth}
        A ${rx},${ry} 0 0 0 ${p.x + rx},${p.y + depth} L ${p.x + rx},${p.y}
        A ${rx},${ry} 0 0 1 ${p.x - rx},${p.y} Z`} fill="url(#shell)" stroke="#1A1712" strokeWidth="0.8" />
      {/* tension lugs around the rim */}
      {Array.from({ length: lugs }).map((_, i) => {
        const a = (i / lugs) * Math.PI * 2;
        return <circle key={i} cx={p.x + Math.cos(a) * (rx - 2)} cy={p.y + Math.sin(a) * (ry - 1)}
          r="1.5" fill="#6A6150" />;
      })}
      {/* top head */}
      <ellipse cx={p.x} cy={p.y} rx={rx} ry={ry} fill="url(#meshHead)"
        stroke={rim} strokeWidth={sel || hit ? 3 : 2} />
      <ellipse cx={p.x} cy={p.y} rx={rx * 0.62} ry={ry * 0.62} fill="none" stroke="#0E0C08" strokeWidth="0.5" opacity="0.35" />
      <ellipse cx={p.x - rx * 0.3} cy={p.y - ry * 0.3} rx={rx * 0.3} ry={ry * 0.34} fill="#46423A" opacity="0.4" />
    </g>
  );
}

/* Angled kick: an upright beater drum sitting on the floor, pedal toward you */
function AngledKick({ p, sel, hit }) {
  const w = p.w, h = p.h;
  const ring = sel ? T.brassHi : hit ? T.strike : "#4C4636";
  return (
    <g>
      {/* floor shadow */}
      <ellipse cx={p.x} cy={p.y + h / 2 + 8} rx={w * 0.6} ry={9} fill="#000" opacity="0.3" />
      {/* pedal board toward the drummer */}
      <rect x={p.x - 9} y={p.y + h / 2 - 2} width="18" height={FLOOR_Y - (p.y + h / 2) + 8} rx="5"
        fill="#241F18" stroke="#3B342A" strokeWidth="1" />
      <rect x={p.x - 6} y={p.y + h / 2 + 4} width="12" height={FLOOR_Y - (p.y + h / 2) - 4} rx="3"
        fill="#6A6253" opacity="0.5" />
      {/* drum face */}
      <ellipse cx={p.x} cy={p.y} rx={w / 2} ry={h / 2} fill="url(#kickPad)"
        stroke={ring} strokeWidth={sel || hit ? 3 : 2} />
      <ellipse cx={p.x} cy={p.y} rx={w / 2 - 5} ry={h / 2 - 5} fill="none" stroke="#0E0C08" strokeWidth="0.7" opacity="0.5" />
      <circle cx={p.x} cy={p.y} r="3.5" fill="#3A342A" />
    </g>
  );
}

const PADMAP = Object.fromEntries(PADS.map((p) => [p.id, p]));

/* Top-down (straight overhead) geometry — physical plan positions */
const TOP = {
  crash: { kind: "cymbal", x: 108, y: 94, r: 42 },
  ride:  { kind: "cymbal", x: 340, y: 98, r: 48 },
  hihat: { kind: "cymbal", x: 92, y: 196, r: 36 },
  tom1:  { kind: "drum", x: 190, y: 142, r: 30 },
  tom2:  { kind: "drum", x: 270, y: 142, r: 30 },
  tom3:  { kind: "drum", x: 352, y: 216, r: 34 },
  snare: { kind: "drum", x: 164, y: 232, r: 37 },
  kick:  { kind: "kick", x: 228, y: 200, w: 48, h: 56 },
};

function TopCymbal({ p, sel, hit }) {
  const ring = sel ? T.brassHi : hit ? T.strike : "#5A5038";
  const r = p.r;
  return (
    <g>
      <circle cx={p.x} cy={p.y + r * 0.1} r={r} fill="#000" opacity="0.16" />
      <circle cx={p.x} cy={p.y} r={r} fill="url(#cymMetal)" stroke={ring} strokeWidth={sel || hit ? 2.4 : 1.3} />
      {[0.82, 0.64, 0.46, 0.28].map((f, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={r * f} fill="none" stroke="#0E0C08" strokeWidth="0.6" opacity="0.4" />
      ))}
      <circle cx={p.x} cy={p.y} r={r * 0.13} fill="#6B5A33" />
      <ellipse cx={p.x - r * 0.32} cy={p.y - r * 0.32} rx={r * 0.3} ry={r * 0.24} fill="#7A6A40" opacity="0.18" />
    </g>
  );
}

function TopDrum({ p, sel, hit }) {
  const r = p.r;
  const rim = sel ? T.brassHi : hit ? T.strike : "#4C4636";
  const lugs = 8;
  return (
    <g>
      <circle cx={p.x} cy={p.y + r * 0.08} r={r} fill="#000" opacity="0.16" />
      <circle cx={p.x} cy={p.y} r={r} fill="#2B2620" stroke={rim} strokeWidth={sel || hit ? 3 : 2} />
      {Array.from({ length: lugs }).map((_, i) => {
        const a = (i / lugs) * Math.PI * 2;
        return <circle key={i} cx={p.x + Math.cos(a) * (r - 2.5)} cy={p.y + Math.sin(a) * (r - 2.5)} r="1.6" fill="#615847" />;
      })}
      <circle cx={p.x} cy={p.y} r={r - 5} fill="url(#meshHead)" />
      <circle cx={p.x} cy={p.y} r={(r - 5) * 0.6} fill="none" stroke="#0E0C08" strokeWidth="0.5" opacity="0.3" />
      <line x1={p.x - (r - 6)} y1={p.y} x2={p.x + (r - 6)} y2={p.y} stroke="#0E0C08" strokeWidth="0.4" opacity="0.25" />
      <line x1={p.x} y1={p.y - (r - 6)} x2={p.x} y2={p.y + (r - 6)} stroke="#0E0C08" strokeWidth="0.4" opacity="0.25" />
      <ellipse cx={p.x - r * 0.28} cy={p.y - r * 0.3} rx={r * 0.3} ry={r * 0.22} fill="#46423A" opacity="0.4" />
    </g>
  );
}

function TopKick({ p, sel, hit }) {
  const w = p.w, h = p.h;
  const ring = sel ? T.brassHi : hit ? T.strike : "#4C4636";
  return (
    <g>
      {/* pedal board toward drummer */}
      <rect x={p.x - 9} y={p.y + h / 2 - 2} width="18" height="44" rx="5" fill="#241F18" stroke="#3B342A" strokeWidth="1" />
      <rect x={p.x - 6} y={p.y + h / 2 + 4} width="12" height="32" rx="3" fill="#6A6253" opacity="0.5" />
      {/* kick drum seen from above */}
      <rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={w * 0.42} fill="url(#kickPad)"
        stroke={ring} strokeWidth={sel || hit ? 3 : 2} />
      <rect x={p.x - w / 2 + 5} y={p.y - h / 2 + 6} width={w - 10} height={h - 12} rx={w * 0.3}
        fill="none" stroke="#0E0C08" strokeWidth="0.6" opacity="0.4" />
      <circle cx={p.x} cy={p.y + h / 2 - 11} r="4" fill="#3A342A" />
    </g>
  );
}

function KitDiagram({ selected, onSelect, hitPad, positions, onMove, adjust, view = "angled" }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const isTop = view === "top";
  const GEO = isTop ? TOP : PADMAP;

  const at = (id) => (positions && positions[id]) || { x: GEO[id].x, y: GEO[id].y };
  const surf = (id) => ({ ...PADMAP[id], ...GEO[id], ...at(id) });

  const toSvg = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 440, y: ((clientY - r.top) / r.height) * 360 };
  };

  const onPointerDown = (e, id) => {
    if (!adjust) { onSelect(id); return; }
    dragRef.current = id;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!adjust || !dragRef.current) return;
    const { x, y } = toSvg(e.clientX, e.clientY);
    onMove?.(dragRef.current, Math.round(x), Math.round(y));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const stand = { stroke: "#2C2720", strokeLinecap: "round", fill: "none" };
  const order = ["crash", "ride", "tom1", "tom2", "hihat", "tom3", "snare", "kick"];

  return (
    <svg ref={svgRef} viewBox="0 0 440 360"
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
      style={{ width: "100%", height: "auto", display: "block", touchAction: adjust ? "none" : "auto" }}>
      <defs>
        <radialGradient id="cymMetal" cx="42%" cy="30%">
          <stop offset="0%" stopColor="#544A33" /><stop offset="55%" stopColor="#3B3527" /><stop offset="100%" stopColor="#26221A" />
        </radialGradient>
        <radialGradient id="meshHead" cx="40%" cy="30%">
          <stop offset="0%" stopColor="#454037" /><stop offset="100%" stopColor="#23201A" />
        </radialGradient>
        <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A2620" /><stop offset="100%" stopColor="#16130E" />
        </linearGradient>
        <linearGradient id="kickPad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34301F" /><stop offset="100%" stopColor="#1B1812" />
        </linearGradient>
        <radialGradient id="floor" cx="50%" cy="28%">
          <stop offset="0%" stopColor="#1E1A14" /><stop offset="100%" stopColor="#15120E" />
        </radialGradient>
      </defs>

      {/* ====== BACKGROUND + STANDS ====== */}
      {!isTop ? (
        <>
          {/* floor */}
          <ellipse cx="220" cy="330" rx="208" ry="30" fill="url(#floor)" opacity="0.9" />
          <line x1="20" y1="322" x2="420" y2="322" stroke="#231F18" strokeWidth="1" opacity="0.55" />
          <text x="408" y="318" textAnchor="end" fill={T.steel} style={{ font: `400 7px ${FONT_MONO}`, letterSpacing: "0.1em" }}>FLOOR</text>

          <g style={{ pointerEvents: "none" }} opacity="0.92">
            {["crash", "ride", "tom1", "tom2"].map((id) => {
              const s = surf(id);
              return <line key={id} x1={HUB.x} y1={HUB.y} x2={s.x} y2={s.y + (s.r ? s.r * 0.5 : 0)} {...stand} strokeWidth="4" />;
            })}
            <line x1={HUB.x} y1={HUB.y} x2="186" y2={FLOOR_Y} {...stand} strokeWidth="4.5" />
            <line x1={HUB.x} y1={HUB.y} x2="258" y2={FLOOR_Y} {...stand} strokeWidth="4.5" />
            <rect x={HUB.x - 11} y={HUB.y - 6} width="22" height="13" rx="3" fill="#34301F" stroke="#1A1712" strokeWidth="1" />

            {(() => { const s = surf("tom3"); const by = s.y + s.r * 0.5; return (
              <g {...stand} strokeWidth="3">
                <line x1={s.x - 22} y1={by} x2={s.x - 20} y2={FLOOR_Y} />
                <line x1={s.x + 22} y1={by} x2={s.x + 24} y2={FLOOR_Y} />
                <line x1={s.x} y1={by + 2} x2={s.x + 2} y2={FLOOR_Y} />
              </g>); })()}

            {(() => { const s = surf("snare"); const by = s.y + s.r * 0.5; return (
              <g {...stand} strokeWidth="3">
                <line x1={s.x} y1={by} x2={s.x - 20} y2={FLOOR_Y} />
                <line x1={s.x} y1={by} x2={s.x + 20} y2={FLOOR_Y} />
                <line x1={s.x} y1={by} x2={s.x} y2={FLOOR_Y - 1} />
              </g>); })()}

            {(() => { const s = surf("hihat"); return (
              <g>
                <line x1={s.x} y1={s.y} x2={s.x} y2={FLOOR_Y - 8} {...stand} strokeWidth="4" />
                <line x1={s.x} y1={FLOOR_Y - 8} x2={s.x - 16} y2={FLOOR_Y} {...stand} strokeWidth="3" />
                <line x1={s.x} y1={FLOOR_Y - 8} x2={s.x + 16} y2={FLOOR_Y} {...stand} strokeWidth="3" />
                <rect x={s.x - 13} y={FLOOR_Y - 7} width="26" height="11" rx="3" fill="#241F18" stroke="#3B342A" strokeWidth="1" />
                <rect x={s.x - 10} y={FLOOR_Y - 5} width="20" height="7" rx="2" fill="#6A6253" opacity="0.5" />
              </g>); })()}

            <g>
              <ellipse cx="44" cy="312" rx="28" ry="8" fill="#000" opacity="0.25" />
              <rect x="20" y="280" width="48" height="34" rx="5" fill="#221E18" stroke="#3B342A" strokeWidth="1.2" />
              <rect x="26" y="286" width="20" height="14" rx="2" fill="#0C0A07" stroke="#3B342A" strokeWidth="0.6" />
              <rect x="28" y="288" width="16" height="10" rx="1" fill={T.brass} opacity="0.55" />
              <circle cx="58" cy="289" r="3.6" fill="#2E281F" stroke="#4A4232" strokeWidth="0.8" />
              {[296, 302, 308].map((y) => <rect key={y} x="53" y={y} width="11" height="2.6" rx="1.3" fill="#332E25" />)}
            </g>
          </g>
          <text x="220" y="352" textAnchor="middle" fill={T.steel} style={{ font: `400 9px ${FONT_MONO}` }}>▲ YOU</text>
        </>
      ) : (
        <>
          {/* overhead rug + floor pedals */}
          <ellipse cx="220" cy="196" rx="206" ry="158" fill="url(#floor)" opacity="0.85" />
          {(() => { const s = surf("hihat"); return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={s.x - 12} y={s.y + s.r + 9} width="24" height="11" rx="3" fill="#241F18" stroke="#3B342A" strokeWidth="1" />
              <rect x={s.x - 9} y={s.y + s.r + 11} width="18" height="7" rx="2" fill="#6A6253" opacity="0.5" />
            </g>); })()}
          <g style={{ pointerEvents: "none" }}>
            <rect x="20" y="300" width="46" height="30" rx="5" fill="#221E18" stroke="#3B342A" strokeWidth="1.2" />
            <rect x="26" y="306" width="18" height="11" rx="2" fill={T.brass} opacity="0.5" />
          </g>
          <text x="220" y="352" textAnchor="middle" fill={T.steel} style={{ font: `400 9px ${FONT_MONO}` }}>▲ YOU</text>
        </>
      )}

      {/* ====== PADS ====== */}
      {order.map((id) => {
        const p = surf(id);
        const sel = selected === id;
        const hit = hitPad === id;
        const baseR = p.r || p.rx || (p.w ? Math.max(p.w, p.h) / 2 : 30);
        const ringRx = baseR + 6;
        const ringRy = isTop ? baseR + 6 : ((p.ry || (p.r ? p.r * 0.4 : p.h / 2)) + 6);
        const labelY = isTop
          ? p.y + (p.r || p.h / 2) + 6
          : (p.kind === "kick" ? p.y - p.h / 2 - 15 : p.y + (p.ry ? p.ry + 7 : p.r * 0.5 + 11));
        return (
          <g key={id} className="dc-focus" tabIndex={0} role="button" aria-label={p.name}
            onPointerDown={(e) => onPointerDown(e, id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(id)}
            style={{ cursor: adjust ? "grab" : "pointer" }}>
            {hit && (
              <ellipse cx={p.x} cy={p.y} rx={ringRx} ry={ringRy} fill="none" stroke={T.strike} strokeWidth="3"
                style={{ animation: "dc-strike .45s ease-out", transformOrigin: `${p.x}px ${p.y}px`, pointerEvents: "none" }} />
            )}
            {p.kind === "cymbal" && (isTop ? <TopCymbal p={p} sel={sel} hit={hit} /> : <AngledCymbal p={p} sel={sel} hit={hit} />)}
            {p.kind === "drum" && (isTop ? <TopDrum p={p} sel={sel} hit={hit} /> : <AngledDrum p={p} sel={sel} hit={hit} />)}
            {p.kind === "kick" && (isTop ? <TopKick p={p} sel={sel} hit={hit} /> : <AngledKick p={p} sel={sel} hit={hit} />)}
            <g style={{ pointerEvents: "none" }}>
              <rect x={p.x - 24} y={labelY} width="48" height="13" rx="6.5"
                fill={sel ? T.brass : "#100E0A"} opacity={sel ? 1 : 0.72} />
              <text x={p.x} y={labelY + 9.3} textAnchor="middle"
                fill={sel ? T.bg : T.boneDim} style={{ font: `700 7.5px ${FONT_DISPLAY}`, letterSpacing: "0.06em" }}>
                {LABELS[id]}
              </text>
            </g>
          </g>
        );
      })}

      {adjust && (
        <text x="220" y="16" textAnchor="middle" fill={T.brass} style={{ font: `700 10px ${FONT_MONO}`, letterSpacing: "0.1em" }}>
          DRAG PADS TO MATCH YOUR SETUP
        </text>
      )}
    </svg>
  );
}

/* ============================================================
   Small UI atoms
   ============================================================ */
const Eyebrow = ({ children }) => (
  <div style={{ font: `700 11px ${FONT_MONO}`, letterSpacing: "0.18em", color: T.brass, textTransform: "uppercase" }}>
    {children}
  </div>
);

function ViewToggle({ view, setView }) {
  const opt = (id, label) => (
    <button key={id} onClick={() => setView(id)} className="dc-focus"
      style={{ font: `700 11px ${FONT_MONO}`, letterSpacing: "0.05em", padding: "5px 12px",
        borderRadius: 7, cursor: "pointer", border: "none",
        background: view === id ? T.brass : "transparent",
        color: view === id ? T.bg : T.boneDim }}>
      {label}
    </button>
  );
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 9,
      background: T.bgRaise, border: `1px solid ${T.line}` }}>
      {opt("top", "TOP")}
      {opt("angled", "ANGLED")}
    </div>
  );
}

function Btn({ children, onClick, variant = "solid", disabled, full }) {
  const base = {
    font: `700 14px ${FONT_DISPLAY}`, letterSpacing: "0.02em", padding: "11px 20px",
    borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
    width: full ? "100%" : "auto", transition: "transform .1s, background .15s", border: "1px solid",
  };
  const styles = variant === "solid"
    ? { ...base, background: T.brass, color: T.bg, borderColor: T.brass }
    : variant === "ghost"
    ? { ...base, background: "transparent", color: T.bone, borderColor: T.line }
    : { ...base, background: T.bgCard, color: T.bone, borderColor: T.lineHi };
  return (
    <button className="dc-focus" style={styles} disabled={disabled} onClick={onClick}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      {children}
    </button>
  );
}

const Card = ({ children, style }) => (
  <div style={{ background: T.bgCard, border: `1px solid ${T.line}`, borderRadius: 16, padding: 22, ...style }}>
    {children}
  </div>
);

/* ============================================================
   Connection chip
   ============================================================ */
function ConnChip({ status, deviceName, onConnect }) {
  const map = {
    connected: { c: T.good, t: deviceName || "Kit connected" },
    connecting: { c: T.warn, t: "Connecting…" },
    nodevice: { c: T.warn, t: "No kit found" },
    denied: { c: T.warn, t: "Access blocked" },
    unsupported: { c: T.steel, t: "MIDI not available here" },
    idle: { c: T.steel, t: "Kit not connected" },
  };
  const s = map[status] || map.idle;
  const clickable = status === "idle" || status === "nodevice" || status === "denied";
  return (
    <button className="dc-focus" onClick={clickable ? onConnect : undefined}
      style={{ display: "flex", alignItems: "center", gap: 8, background: T.bgRaise,
        border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 14px",
        cursor: clickable ? "pointer" : "default" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: s.c,
        animation: status === "connected" ? "dc-pulse 2s infinite" : "none" }} />
      <span style={{ font: `400 12px ${FONT_MONO}`, color: T.boneDim }}>{s.t}</span>
      {clickable && <span style={{ font: `700 12px ${FONT_MONO}`, color: T.brass }}>Connect</span>}
    </button>
  );
}

/* ============================================================
   VIEW: Setup / onboarding
   ============================================================ */
function SetupView({ confirmed, onConfirm, photo, setPhoto, layout, moveLayout, resetLayout }) {
  const fileRef = useRef(null);
  const [adjust, setAdjust] = useState(false);
  const [view, setView] = useState("angled");
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setPhoto(URL.createObjectURL(f));
  };
  return (
    <div className="dc-rise" style={{ maxWidth: 760, margin: "0 auto" }}>
      <Eyebrow>Step 1 · Before you play</Eyebrow>
      <h1 style={{ font: `800 30px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 6px", lineHeight: 1.1 }}>
        Let's make sure this matches your kit.
      </h1>
      <p style={{ font: `400 15px ${FONT_DISPLAY}`, color: T.boneDim, margin: "0 0 22px", lineHeight: 1.55 }}>
        This is the standard Roland TD-313 layout. Switch between the overhead and angled views, snap a
        photo once it's built, and drag anything that sits differently.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18 }} className="dc-grid">
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
            <ViewToggle view={view} setView={setView} />
            <div style={{ display: "flex", gap: 8 }}>
              {adjust && (
                <button onClick={() => resetLayout(view)} className="dc-focus"
                  style={{ font: `700 11px ${FONT_MONO}`, color: T.boneDim, background: "none",
                    border: `1px solid ${T.line}`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                  Reset
                </button>
              )}
              <button onClick={() => setAdjust((v) => !v)} className="dc-focus"
                style={{ font: `700 11px ${FONT_MONO}`, color: adjust ? T.bg : T.brass,
                  background: adjust ? T.brass : "none", border: `1px solid ${T.brass}`,
                  borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                {adjust ? "Done" : "Adjust"}
              </button>
            </div>
          </div>
          <KitDiagram selected={null} onSelect={() => {}} hitPad={null} view={view}
            positions={layout[view]} onMove={(id, x, y) => moveLayout(view, id, x, y)} adjust={adjust} />
        </Card>
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ font: `700 12px ${FONT_MONO}`, color: T.brass, marginBottom: 10, letterSpacing: "0.1em" }}>
            YOUR KIT
          </div>
          <div onClick={() => fileRef.current?.click()}
            style={{ flex: 1, minHeight: 180, border: `1.5px dashed ${T.lineHi}`, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              overflow: "hidden", background: T.bgRaise }}>
            {photo ? (
              <img src={photo} alt="Your kit" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ font: `400 30px ${FONT_DISPLAY}`, color: T.steel }}>＋</div>
                <div style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.boneDim, marginTop: 6 }}>
                  Tap to upload a photo<br />of your assembled kit
                </div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
          {photo && (
            <div style={{ marginTop: 10 }}>
              <Btn variant="ghost" onClick={() => setPhoto(null)}>Replace photo</Btn>
            </div>
          )}
        </Card>
      </div>
      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Btn onClick={onConfirm} disabled={confirmed}>
          {confirmed ? "✓ Layout confirmed" : "This matches my kit — start the course"}
        </Btn>
        {!photo && !confirmed && (
          <span style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.steel }}>
            You can confirm now and add the photo once it's built.
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   VIEW: Kit explorer
   ============================================================ */
function KitView({ hitPad, layout, moveLayout, resetLayout }) {
  const [sel, setSel] = useState("snare");
  const [adjust, setAdjust] = useState(false);
  const [view, setView] = useState("angled");
  const p = PADS.find((x) => x.id === sel);
  return (
    <div className="dc-rise">
      <Eyebrow>Stage 0 · Lesson 1</Eyebrow>
      <h1 style={{ font: `800 28px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 18px" }}>
        Meet your kit
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }} className="dc-grid">
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <ViewToggle view={view} setView={setView} />
            <div style={{ display: "flex", gap: 8 }}>
              {adjust && (
                <button onClick={() => resetLayout(view)} className="dc-focus"
                  style={{ font: `700 11px ${FONT_MONO}`, color: T.boneDim, background: "none",
                    border: `1px solid ${T.line}`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                  Reset
                </button>
              )}
              <button onClick={() => setAdjust((v) => !v)} className="dc-focus"
                style={{ font: `700 11px ${FONT_MONO}`, color: adjust ? T.bg : T.brass,
                  background: adjust ? T.brass : "none", border: `1px solid ${T.brass}`,
                  borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                {adjust ? "Done" : "Adjust layout"}
              </button>
            </div>
          </div>
          <KitDiagram selected={sel} onSelect={setSel} hitPad={hitPad} view={view}
            positions={layout[view]} onMove={(id, x, y) => moveLayout(view, id, x, y)} adjust={adjust} />
          <p style={{ font: `400 12px ${FONT_MONO}`, color: T.steel, textAlign: "center", margin: "6px 0 0" }}>
            {adjust ? "Drag any pad to match your real arrangement" : "Tap a pad to learn it · hit it on your kit to see it light up"}
          </p>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ font: `700 11px ${FONT_MONO}`, color: T.brass, letterSpacing: "0.15em" }}>
            {p.model}
          </div>
          <h2 style={{ font: `800 26px ${FONT_DISPLAY}`, color: T.bone, margin: "6px 0 12px" }}>{p.name}</h2>
          <p style={{ font: `400 15px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.6, flex: 1 }}>{p.role}</p>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.line}`,
            display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PADS.map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className="dc-focus"
                style={{ font: `600 12px ${FONT_DISPLAY}`, padding: "6px 11px", borderRadius: 8,
                  cursor: "pointer", border: `1px solid ${sel === x.id ? T.brass : T.line}`,
                  background: sel === x.id ? T.bgCardHi : "transparent",
                  color: sel === x.id ? T.brassHi : T.boneDim }}>
                {x.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   Lesson content (Stage 0 fully written; 1–3 scaffolded)
   ============================================================ */
const R = (n) => Array.from({ length: n }, (_, i) => i);

const STAGES = [
  {
    n: 0, title: "Orientation", sub: "No sticks yet — get the ground right.",
    lessons: [
      { id: "0.1", title: "Meet your kit", type: "explore",
        body: "Open the Kit tab and learn the name and job of every pad. Hit each one on your TD-313 and watch it light up." },
      { id: "0.2", title: "How to sit", type: "read",
        body: "Set your throne so your thighs sit around 90–110°, feet flat. Sit toward the front edge — not back in the seat — so your legs move freely. Back straight, shoulders relaxed and slightly back. Good posture isn't stiffness; it's a stable, easy base you can play from for an hour without aching." },
      { id: "0.3", title: "How to hold the sticks", type: "read",
        body: "Use matched grip: both hands hold the stick the same way. The fulcrum — your pivot — is the thumb and the side of the index finger, about a third of the way up from the butt. Hold it like a small bird: firm enough not to drop it, loose enough that it can breathe and bounce. If shock travels up to your elbow, you're squeezing too hard." },
      { id: "0.4", title: "Your first stroke", type: "read",
        body: "Let the stick fall to the snare and come back up on its own — the rebound does the work, not your arm. Wrist leads, arm stays relaxed and low. One clean, bouncing stroke. Then the other hand. This single relaxed motion is the seed of everything else." },
    ],
  },
  {
    n: 1, title: "First Sounds & Counting", sub: "Steady pulse, even strokes, the metronome.",
    lessons: [
      { id: "1.1", title: "Counting time", type: "read",
        body: "Music sits on a steady pulse, and your first job is to feel it and name it. Count \"1, 2, 3, 4\" out loud, evenly, in time with the click, then loop back to 1. Counting aloud isn't busywork — it ties your internal clock to what your hands are about to do, and it's the habit that separates drummers who rush from drummers who lock in. Start slow enough that every number lands exactly with a click. If you can't say it evenly, you can't play it evenly." },
      { id: "1.2", title: "Single strokes", type: "drill",
        body: "The single-stroke roll is the first thing your hands learn: one stroke per hand, alternating R L R L, perfectly even. Play one stroke on each click, relaxed, letting the stick rebound, and keep the spacing identical between every hit. The goal isn't speed — it's evenness: a stranger listening shouldn't be able to tell your right hand from your left. The usual mistake is the weaker hand hitting softer or slightly late, so slow down until both feel identical.",
        pattern: { subdiv: 1, sticking: "R L R L", lanes: [{ pad: "snare", steps: R(4) }] } },
      { id: "1.3", title: "Note values", type: "drill",
        body: "Counting tells you where beat 1 is; note values tell you how many notes fit between the beats. Quarter notes are one hit per beat (\"1, 2, 3, 4\"); eighth notes are two per beat (\"1 and 2 and\"); sixteenths are four per beat (\"1-e-and-a\"). This drill puts it in your hands: play steady eighth notes — two even hits per click — and say \"1 and 2 and\" out loud as you go. Feel the space between the beats fill in. Everything you'll ever play is some arrangement of these subdivisions.",
        pattern: { subdiv: 2, sticking: "two even hits per beat (8ths)", lanes: [{ pad: "snare", steps: R(8) }] } },
      { id: "1.4", title: "Play with the click", type: "drill",
        body: "This is the single most important habit in drumming: playing exactly with the metronome, not a hair early or late. Put one clean hit right on top of each click so the two sounds merge into one. Watch the timing meter — consistently early means you're rushing (the most common beginner habit); late means dragging. Don't fight the click; relax and let your hand fall into it. Locking to a click now is what makes you a drummer other musicians want to play with.",
        pattern: { subdiv: 1, sticking: "R L R L", lanes: [{ pad: "snare", steps: R(4) }] } },
    ],
  },
  {
    n: 2, title: "The First Real Beat", sub: "Hi-hat, snare on 2 & 4, kick on 1 & 3.",
    lessons: [
      { id: "2.1", title: "The basic rock beat", type: "drill",
        body: "This is the groove behind thousands of songs, and the first time it all comes together. The hi-hat keeps steady eighth notes (your right hand), the snare cracks on beats 2 and 4 (your left), and the kick thumps on 1 and 3 (your right foot). Start painfully slow and play it as a loop. The magic is the layering — three limbs doing three different jobs that lock into one feel. If it falls apart, drop to just hi-hat and kick, get that solid, then add the snare back.",
        pattern: { subdiv: 2, sticking: "hi-hat 8ths · snare 2&4 · kick 1&3",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "2.2", title: "Limb independence", type: "drill",
        body: "The rock beat only works when your limbs stop fighting each other. Independence means each hand and foot can do its own job without the others flinching. Play the same groove, but pay attention to keeping the hi-hat dead steady even as the kick and snare move underneath it. A common trap is the hi-hat hand stuttering whenever the kick lands — slow it right down so nothing has to rush, and let the steadiness become automatic.",
        pattern: { subdiv: 2, sticking: "hold the hi-hat steady",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "2.3", title: "Count it out loud", type: "read",
        body: "Saying the count while you play the groove is what cements the timing. Count \"1 and 2 and 3 and 4 and\" — the hi-hat plays every syllable, the kick lands on \"1\" and \"3\", the snare on \"2\" and \"4\". Speaking it forces you to know exactly where each voice belongs instead of playing on autopilot. It feels awkward at first, like patting your head and rubbing your stomach, but it's the fastest route to a groove that doesn't drift." },
      { id: "2.4", title: "Slow it, lock it", type: "drill",
        body: "Speed is a trap this early — a clean slow groove beats a sloppy fast one every time. Take the rock beat down to a tempo where every note is effortless and lands exactly with the click, and hold it there until it's boringly easy. Only then nudge the tempo up. This is how real drummers build beats that feel solid: control first, speed as a by-product. Resist the urge to push before it's genuinely clean.",
        pattern: { subdiv: 2, sticking: "slow & locked",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
    ],
  },
  {
    n: 3, title: "Around the Kit", sub: "Stop drilling the snare \u2014 play the whole kit: toms, cymbals, movement.",
    lessons: [
      { id: "3.1", title: "Walk around the kit", type: "drill",
        body: "Time to actually play the drums. This one's a guided tour: one hit on each drum, left to right \u2014 snare, high tom, mid tom, then floor tom \u2014 with a kick on beat 1 to anchor it. Reach naturally; the high and mid toms are up in front of you, the floor tom sits down to your right. Keep the four hits even and let your eyes learn where each drum lives. This is how you stop staring at the snare and start using the whole kit.",
        pattern: { subdiv: 1, sticking: "snare \u2192 high \u2192 mid \u2192 floor",
          lanes: [{ pad: "snare", steps: [0] }, { pad: "tom1", steps: [1] }, { pad: "tom2", steps: [2] }, { pad: "tom3", steps: [3] }, { pad: "kick", steps: [0] }] } },
      { id: "3.2", title: "Your first tom groove", type: "drill",
        body: "Now a real groove that lives on the toms. It's the rock beat, but instead of the snare on 2 and 4, you answer on the floor tom \u2014 that deep, round boom down to your right. The hi-hat keeps eighth notes on top, kick on 1 and 3. Suddenly the same beat sounds tribal and big. Feel how moving one voice to a different drum completely changes the mood.",
        pattern: { subdiv: 2, sticking: "floor tom on 2 & 4",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "tom3", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "3.3", title: "Snare and tom together", type: "drill",
        body: "Here you mix surfaces inside one groove: the snare cracks on beat 2, and the floor tom answers on beat 4. Same hi-hat and kick foundation, but now your left hand jumps between the snare in front of you and the floor tom to your right. That movement \u2014 knowing where to land without looking \u2014 is the core skill of playing around the kit. Take it slow and let the reach become automatic.",
        pattern: { subdiv: 2, sticking: "snare on 2 \u00b7 floor tom on 4",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2] }, { pad: "tom3", steps: [6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "3.4", title: "Add a crash", type: "drill",
        body: "The crash is your exclamation mark. Play the basic rock beat, but on beat 1 of the bar, instead of the hi-hat, reach up and strike the crash \u2014 let it ring \u2014 with the kick underneath it. That crash-on-the-one is how drummers mark the start of a section, and it's the most satisfying hit on the kit. Land it right on the beat, together with the kick, and let it wash.",
        pattern: { subdiv: 2, sticking: "crash + kick on the 1",
          lanes: [{ pad: "crash", steps: [0] }, { pad: "hihat", steps: [1, 2, 3, 4, 5, 6, 7] }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
    ],
  },
  {
    n: 4, title: "Core Rudiments", sub: "The alphabet: singles, doubles, paradiddles, flams.",
    lessons: [
      { id: "4.1", title: "Single stroke roll", type: "drill",
        body: "Now we drill the rudiments — the alphabet every groove and fill is spelled with. The single-stroke roll is alternating R L R L played as a steady stream of eighth notes. Keep it even in both time and volume, relaxed, letting each stick rebound — it's the Stage 1 motion, now flowing continuously. Evenness is everything: close your eyes and you shouldn't be able to hear which hand is which.",
        pattern: { subdiv: 2, sticking: "R L R L R L R L", lanes: [{ pad: "snare", steps: R(8) }] } },
      { id: "4.2", title: "Double stroke roll", type: "drill",
        body: "Two strokes per hand — R R L L — played evenly. The trick is the second stroke of each pair: it must sound exactly as strong as the first, which means a controlled bounce rather than two separate arm motions. Play it slowly as eighth notes and listen hard for any \"limp\" on the second note. The double-stroke roll is what unlocks fast, smooth rolls later, so build it clean and patient now.",
        pattern: { subdiv: 2, sticking: "R R L L R R L L", lanes: [{ pad: "snare", steps: R(8) }] } },
      { id: "4.3", title: "Single paradiddle", type: "drill",
        body: "R L R R · L R L L — a paradiddle mixes singles and doubles into one pattern, played as sixteenth notes. It's the gateway rudiment: it teaches your hands to switch between sticking patterns smoothly, which is exactly what grooves and fills demand. Say the sticking out loud as you play, and start slow enough to nail the \"R R\" and \"L L\" doubles cleanly — rushing them is the usual stumble.",
        pattern: { subdiv: 4, sticking: "R L R R · L R L L", lanes: [{ pad: "snare", steps: R(16) }] } },
      { id: "4.4", title: "The flam", type: "drill",
        body: "A flam is two strokes played almost together — a quiet grace note a hair before the main note — making one fat, thick sound. One hand sits low and taps just before the other strikes full. Played here on the snare on each beat, focus on a consistent, tight gap between the two hits: too wide and it sounds like a mistake, too tight and it disappears.",
        pattern: { subdiv: 1, sticking: "flam · accent", lanes: [{ pad: "snare", steps: R(4) }] } },
    ],
  },
  {
    n: 5, title: "Grooves & Variations", sub: "Make the beat your own — move the kick, switch to the ride.",
    lessons: [
      { id: "5.1", title: "Eighth-note variations", type: "drill",
        body: "Once the basic rock beat is solid, you make it your own by moving the kick. Keep the hi-hat steady and the snare on 2 and 4, but add a kick on the \"and\" of 2 — that little syncopation is what gives a groove its bounce. Small kick changes completely change the feel of a beat, and this is your first taste of that. Keep the hands rock-steady while the foot does something new underneath.",
        pattern: { subdiv: 2, sticking: "extra kick on the & of 2",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 3, 4] }] } },
      { id: "5.2", title: "Hi-hat on the ride", type: "drill",
        body: "The same groove, but move your right hand from the hi-hat to the ride cymbal. The ride has a longer, washier sound that opens a beat up — it's what drummers switch to for choruses and louder sections. Everything else stays identical: snare on 2 and 4, kick on 1 and 3. Moving between hi-hat and ride without the groove faltering is a key piece of playing real songs.",
        pattern: { subdiv: 2, sticking: "ride 8ths · snare 2&4 · kick 1&3",
          lanes: [{ pad: "ride", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "5.3", title: "Open hi-hat accents", type: "read",
        body: "The hi-hat isn't only \"closed.\" Lift the FD-9 pedal slightly and the cymbals ring open with a sizzling \"tss\"; press it down and the sound chokes back to a tight tick. Drummers use a quick open-then-closed on the \"and\" of a beat to add lift and accent to a groove. Practise opening on one specific eighth note and snapping it shut on the next beat. It's a foot-and-hand coordination skill more than a timing one, so take it slow." },
      { id: "5.4", title: "Dynamics", type: "read",
        body: "A drummer who only plays at one volume sounds like a machine. Dynamics — playing louder and softer on purpose — are what make a groove breathe: verses sit back, choruses lift, accents punch. On your mesh pads and cymbals this is all in how fast the stick is moving when it strikes, since your kit senses velocity. Practise a groove softly, then swell louder over four bars and back down. Control over volume is as important as control over time." },
    ],
  },
  {
    n: 6, title: "Fills", sub: "Leave the groove, move around the kit, land on the crash.",
    lessons: [
      { id: "6.1", title: "What a fill is", type: "read",
        body: "A fill is a short break from the groove — usually a bar or less — that signals a change, like the end of a verse or the lead-in to a chorus. Think of the steady groove as walking and the fill as a little flourish before you turn a corner. Most fills move around the toms and snare, then land on a crash on the next \"1\". Two rules matter: stay in time, and come back to the groove cleanly. We'll build to that step by step." },
      { id: "6.2", title: "Simple tom fills", type: "drill",
        body: "Your first fill: a smooth run down the drums in sixteenth notes — snare, then high tom, then mid tom, then floor tom, four notes each, descending in pitch like a tumble down a staircase. Keep them even and in time; the goal is a controlled descent, not a scramble. This single shape is the basis of countless fills you'll hear in real songs.",
        pattern: { subdiv: 4, sticking: "snare → toms, descending",
          lanes: [{ pad: "snare", steps: [0, 1, 2, 3] }, { pad: "tom1", steps: [4, 5, 6, 7] }, { pad: "tom2", steps: [8, 9, 10, 11] }, { pad: "tom3", steps: [12, 13, 14, 15] }] } },
      { id: "6.3", title: "Fills in time", type: "drill",
        body: "The hard part of a fill isn't the fill — it's leaving the groove and returning without dropping a beat. Here you play two beats of groove, then a two-beat tom fill, looped, so you rehearse the hand-off in both directions. Count out loud the whole way through. If the fill makes you rush, or the groove stumbles when you come back, slow the tempo until the transition is seamless.",
        pattern: { subdiv: 4, sticking: "2 beats groove → 2 beats fill",
          lanes: [
            { pad: "hihat", steps: [0, 2, 4, 6] }, { pad: "kick", steps: [0] }, { pad: "snare", steps: [4, 8, 9] },
            { pad: "tom1", steps: [10, 11] }, { pad: "tom2", steps: [12, 13] }, { pad: "tom3", steps: [14, 15] }] } },
      { id: "6.4", title: "Crash to land", type: "drill",
        body: "The crash cymbal is how you \"land\" — you hit it on the first beat after a fill, usually together with the kick, to mark the start of the new section. Here you'll play the groove but strike a crash on beat 1 of each bar, landing it with the kick. That crash-on-1 is the punctuation mark of drumming, and getting it to land exactly on the beat with the kick underneath is the skill.",
        pattern: { subdiv: 2, sticking: "crash + kick on the 1",
          lanes: [{ pad: "crash", steps: [0] }, { pad: "hihat", steps: [1, 2, 3, 4, 5, 6, 7] }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
    ],
  },
  {
    n: 7, title: "Playing to Music", sub: "From the click to real songs.",
    lessons: [
      { id: "7.1", title: "Playing along to tracks", type: "read", link: { view: "songs", label: "Open Songs" },
        body: "Up to now you've played with a click. The next leap is playing with music — a backing track or song. The skill is the same lock you built against the metronome, now against a band. DreamDrum's song library (arriving with the play-along feature) will stream cleared backing tracks to groove over, but the principle starts now: find the pulse, lock your groove to it, and don't let the music pull you off your time." },
      { id: "7.2", title: "Finding the beat", type: "read", link: { view: "songs", label: "Open Songs" },
        body: "Before you can play to a song, you have to find \"1\". Listen for the kick and snare: the kick usually marks the strong beats (1 and 3), the snare answers on the backbeat (2 and 4). Nod to the pulse and count \"1 2 3 4\" until the start of each bar feels obvious. Once you can reliably find the downbeat, dropping your own groove in on top becomes natural. This listening skill matters as much as any hand technique." },
      { id: "7.3", title: "Your first full song", type: "read",
        body: "Playing a song start to finish is a different challenge from looping a groove: there are sections, dynamics, and fills that signal the changes. Pick something slow and simple, learn its main groove, and play it all the way through — verse, chorus, and the fills between. Mistakes are fine; keeping time and not stopping is the win. This is the moment drumming stops being exercises and becomes music." },
      { id: "7.4", title: "The song library", type: "read",
        body: "DreamDrum's song library (Phase 2) will hold beginner-friendly, fully-cleared backing tracks, sorted by difficulty and tempo, so there's always something at your level. You'll be able to slow a track down, loop a tricky section, and play along while the app reads your timing against it. For now this is the roadmap — and the grooves you've built are exactly what these songs will ask of you." },
    ],
  },
  {
    n: 8, title: "Refinement & Skill-Building", sub: "Tighten your time, build speed, read a chart, try new styles.",
    lessons: [
      { id: "8.1", title: "Speed & endurance", type: "read", link: { view: "practice", label: "Open Speed Builder" },
        body: "Raw speed and stamina are built away from songs — on a practice pad or the snare, with focused repetition. The Speed Builder in your Practice tab is made for exactly this: it ramps the tempo each time you keep a rudiment clean, so you push your limit without getting sloppy. Endurance comes from playing a steady roll longer than feels comfortable while staying relaxed. Little and often beats occasional marathons." },
      { id: "8.2", title: "Timing accuracy", type: "drill",
        body: "Refinement is about tightening what you already know. Here you'll play a steady stream of eighth notes and chase the tightest timing you can — the meter should barely leave the centre. At this stage the standard is higher: aim to stay within a hair of the click, not just close to it. Great time is the single most valued thing in a drummer, more than speed or flashy fills.",
        pattern: { subdiv: 2, sticking: "lock every note to the click", lanes: [{ pad: "snare", steps: R(8) }] } },
      { id: "8.3", title: "Reading notation", type: "drill",
        body: "Drum music sits on a five-line staff, with a position for each drum instead of a pitch: snare in the middle, bass drum at the bottom, hi-hat up top with an \"x\" notehead. The pattern below is exactly how a basic rock beat looks on a chart — hi-hat \"x\"s on every eighth, snare on 2 and 4, kick beneath on 1 and 3. Read the grid like a chart and play what you see, top row to bottom. Turning written symbols into sound is the skill that unlocks learning songs from paper.",
        pattern: { subdiv: 2, sticking: "read the chart · play what you see",
          lanes: [{ pad: "hihat", steps: R(8) }, { pad: "snare", steps: [2, 6] }, { pad: "kick", steps: [0, 4] }] } },
      { id: "8.4", title: "Style sampler — funk", type: "drill",
        body: "Different styles live in where the notes sit. Funk leans on sixteenth-note hi-hats and a syncopated, busy kick that locks tightly with the snare backbeat. Here's a taste: sixteenths on the hi-hat, snare on 2 and 4, and a kick that pushes onto the off-beats. It'll feel different from straight rock — more nervous energy. Playing across styles is what turns a drummer who knows beats into one who has feel.",
        pattern: { subdiv: 4, sticking: "16th hats · syncopated kick",
          lanes: [{ pad: "hihat", steps: R(16) }, { pad: "snare", steps: [4, 12] }, { pad: "kick", steps: [0, 3, 6, 10] }] } },
    ],
  },
];

/* ============================================================
   VIEW: Lessons (list + detail + gating)
   ============================================================ */
function PatternGrid({ pattern }) {
  const spb = pattern.subdiv * 4;
  const padOf = pattern.lanes.map((l) => l.pad);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "4px 0 14px" }}>
      {pattern.lanes.map((lane) => (
        <div key={lane.pad} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 52, font: `700 9px ${FONT_MONO}`, color: T.boneDim, letterSpacing: "0.05em", textAlign: "right" }}>
            {LABELS[lane.pad]}
          </span>
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {R(spb).map((s) => {
              const on = lane.steps.includes(s);
              const beatStart = s % pattern.subdiv === 0;
              return (
                <div key={s} style={{ flex: 1, height: 18, borderRadius: 3,
                  background: on ? T.brass : T.bgRaise,
                  borderLeft: beatStart ? `2px solid ${T.lineHi}` : `1px solid ${T.line}` }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrillRunner({ drill, stageNum, subscribeHits, midiStatus, onConnect, onComplete }) {
  const pattern = drill.pattern || { subdiv: 1, lanes: [{ pad: "snare", steps: R(4) }] };
  const singleVoice = pattern.lanes.length === 1;
  const defaultBpm = pattern.subdiv >= 4 ? 70 : 80;
  const [bpm, setBpm] = useState(defaultBpm);
  const [phase, setPhase] = useState("idle"); // idle | countin | recording | results
  const [bar, setBar] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [result, setResult] = useState(null);

  const COUNTIN = 4, REC_BEATS = 16;
  const beatCountRef = useRef(0);
  const expRef = useRef([]); // {pad, t}
  const matchedRef = useRef([]); // signed errors
  const matchTimesRef = useRef([]);
  const coveredRef = useRef(new Set());
  const demoRef = useRef(false);
  const finishedRef = useRef(false);
  const phaseRef = useRef("idle");
  const bpmRef = useRef(bpm);
  phaseRef.current = phase;
  bpmRef.current = bpm;

  const thr =
    stageNum >= 8 ? { t: 34, e: 80 } :
    stageNum === 4 ? { t: 40, e: 78 } :
    stageNum >= 5 ? { t: 48, e: 76 } :
    stageNum === 3 ? { t: 52, e: 74 } :
    stageNum === 2 ? { t: 55, e: 74 } :
    { t: 50, e: 75 };

  const recordHit = useCallback((h) => {
    if (phaseRef.current !== "recording") return;
    const pad = NOTE_TO_PAD[h.note];
    if (!pad) return;
    const exp = expRef.current;
    let best = Infinity, bi = -1;
    for (let i = 0; i < exp.length; i++) {
      if (exp[i].pad !== pad) continue;
      const d = h.t - exp[i].t;
      if (Math.abs(d) < Math.abs(best)) { best = d; bi = i; }
    }
    if (bi === -1) return;
    const tol = Math.max(90, (60000 / bpmRef.current / pattern.subdiv) * 0.5);
    if (Math.abs(best) <= tol) {
      matchedRef.current.push(best);
      matchTimesRef.current.push(h.t);
      coveredRef.current.add(bi);
      setLastError(Math.round(best));
    }
  }, [pattern.subdiv]);

  useEffect(() => { if (!subscribeHits) return; return subscribeHits(recordHit); }, [subscribeHits, recordHit]);

  const finish = useCallback(() => {
    const errs = matchedRef.current;
    const times = [...matchTimesRef.current].sort((a, b) => a - b);
    const total = expRef.current.length;
    const idealSub = 60000 / bpmRef.current / pattern.subdiv;
    let timing = 999, evenness = 0;
    const density = total ? Math.round((coveredRef.current.size / total) * 100) : 0;
    if (errs.length >= 3) {
      timing = Math.round(errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length);
      if (singleVoice) {
        const iois = [];
        for (let i = 1; i < times.length; i++) iois.push(times[i] - times[i - 1]);
        const mean = iois.reduce((a, b) => a + b, 0) / (iois.length || 1) || idealSub;
        const sd = Math.sqrt(iois.reduce((a, b) => a + (b - mean) ** 2, 0) / (iois.length || 1));
        evenness = Math.max(0, Math.min(100, Math.round(100 - (sd / idealSub) * 100)));
      }
    }
    // per-voice density
    const voices = pattern.lanes.map((lane) => {
      let exp = 0, cov = 0;
      expRef.current.forEach((e, i) => { if (e.pad === lane.pad) { exp++; if (coveredRef.current.has(i)) cov++; } });
      return { pad: lane.pad, pct: exp ? Math.round((cov / exp) * 100) : 0 };
    });
    const tScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, timing - 20) * 2)));
    const secondary = singleVoice ? evenness : density;
    const readiness = errs.length < 3 ? 0 : Math.round(tScore * 0.45 + density * 0.3 + secondary * 0.25);
    const minVoice = Math.min(...voices.map((v) => v.pct));
    const pass = errs.length >= 3 && timing <= thr.t && density >= 78 && (singleVoice ? evenness >= thr.e : minVoice >= 60);
    setResult({ timing, evenness, density, voices, readiness, pass, hits: errs.length, singleVoice });
    setPhase("results");
  }, [pattern, singleVoice, thr.t, thr.e]);

  const onBeat = useCallback(({ perfTime }) => {
    const n = beatCountRef.current;
    beatCountRef.current += 1;
    if (n < COUNTIN) { setPhase("countin"); return; }
    setPhase("recording");
    const recBeat = n - COUNTIN;
    setBar(Math.floor(recBeat / 4) + 1);
    const interval = 60000 / bpmRef.current;
    const sd = pattern.subdiv;
    const beatInBar = recBeat % 4;
    for (let k = 0; k < sd; k++) {
      const stepIndex = beatInBar * sd + k;
      const t = perfTime + (k * interval) / sd;
      pattern.lanes.forEach((lane) => {
        if (!lane.steps.includes(stepIndex)) return;
        expRef.current.push({ pad: lane.pad, t });
        if (demoRef.current) {
          const jitter = (Math.random() - 0.5) * 40 + (Math.random() < 0.1 ? (Math.random() - 0.5) * 80 : 0);
          const note = (PADMAP[lane.pad].notes || [38])[0];
          setTimeout(() => recordHit({ note, velocity: 92, t: performance.now() }), Math.max(0, t + jitter - performance.now()));
        }
      });
    }
    if (recBeat + 1 >= REC_BEATS && !finishedRef.current) {
      finishedRef.current = true;
      setTimeout(finish, 300);
    }
  }, [pattern, recordHit, finish]);

  const metro = useMetronome(bpm, 4, { onBeat, subdivision: pattern.subdiv });
  const metroRef = useRef(null);
  metroRef.current = metro;

  useEffect(() => { if (phase === "results" || phase === "idle") metro.stop(); /* eslint-disable-next-line */ }, [phase]);

  const start = (demo) => {
    beatCountRef.current = 0;
    expRef.current = [];
    matchedRef.current = [];
    matchTimesRef.current = [];
    coveredRef.current = new Set();
    finishedRef.current = false;
    demoRef.current = !!demo;
    setResult(null); setLastError(null); setBar(0);
    setPhase("countin");
    metro.start();
  };
  const cancel = () => { metro.stop(); finishedRef.current = true; setPhase("idle"); setLastError(null); };

  const connected = midiStatus === "connected";
  const running = phase === "countin" || phase === "recording";

  const tip = result && !result.pass && (
    result.hits < 3 ? "I didn't catch enough hits — play the pattern through the four bars."
      : result.timing > thr.t ? "Your timing drifts off the click. Drop the tempo and lock onto the beat."
      : result.density < 78 ? "You're missing notes in the pattern — slow down so every note lands."
      : result.singleVoice && result.evenness < thr.e ? "Your spacing is uneven — aim for an identical gap between hits."
      : "Almost — run it once more and keep it relaxed.");

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>Live drill</Eyebrow>
        {!connected && phase === "idle" && (
          <span style={{ font: `400 12px ${FONT_MONO}`, color: T.steel }}>
            Kit not connected — use Demo, or <button onClick={onConnect} className="dc-focus"
              style={{ font: `700 12px ${FONT_MONO}`, color: T.brass, background: "none", border: "none", cursor: "pointer", padding: 0 }}>connect →</button>
          </span>
        )}
      </div>

      {phase === "idle" && (
        <>
          <p style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.5, margin: "8px 0 6px" }}>
            One bar count-in, then four bars scored. {singleVoice
              ? "Both hands hit the same pad, so it scores your timing and spacing, not which hand."
              : "Scored across each voice — hi-hat, snare and kick land in their own places."}
          </p>
          {pattern.sticking && (
            <div style={{ font: `700 12px ${FONT_MONO}`, color: T.steel, margin: "6px 0 2px" }}>
              PATTERN&nbsp;&nbsp;<span style={{ color: T.bone }}>{pattern.sticking}</span>
            </div>
          )}
          <PatternGrid pattern={pattern} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ font: `700 28px ${FONT_MONO}`, color: T.bone }}>{bpm}<span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}> BPM</span></span>
            <input type="range" min="50" max="140" value={bpm} onChange={(e) => setBpm(+e.target.value)} style={{ flex: 1, minWidth: 140, accentColor: T.brass }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Btn onClick={() => start(false)}>▶ Start drill</Btn>
            <Btn variant="line" onClick={() => start(true)}>Demo: play it for me</Btn>
          </div>
        </>
      )}

      {running && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ font: `700 13px ${FONT_MONO}`, color: phase === "countin" ? T.warn : T.strike, letterSpacing: "0.1em" }}>
              {phase === "countin" ? "COUNT IN…" : `RECORDING · BAR ${bar}/4`}
            </span>
            <button onClick={cancel} className="dc-focus"
              style={{ font: `700 12px ${FONT_MONO}`, color: T.boneDim, background: "none", border: `1px solid ${T.line}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>Stop</button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            {[0, 1, 2, 3].map((b) => (
              <span key={b} style={{ width: 16, height: 16, borderRadius: 999,
                background: metro.beat === b ? (b === 0 ? T.brassHi : T.strike) : T.line,
                boxShadow: metro.beat === b ? `0 0 12px ${T.strike}` : "none", transition: "background .04s" }} />
            ))}
          </div>
          <TimingMeter lastError={lastError} />
        </div>
      )}

      {phase === "results" && result && (
        <div className="dc-rise" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
            <Stat label="Timing" value={`±${result.timing}ms`} ok={result.timing <= thr.t} />
            {result.singleVoice
              ? <Stat label="Evenness" value={`${result.evenness}%`} ok={result.evenness >= thr.e} />
              : <Stat label="Notes hit" value={`${result.density}%`} ok={result.density >= 78} />}
            <Stat label="Readiness" value={`${result.readiness}%`} ok={result.pass} />
          </div>
          {!result.singleVoice && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {result.voices.map((v) => (
                <span key={v.pad} style={{ font: `700 11px ${FONT_MONO}`, padding: "5px 10px", borderRadius: 7,
                  border: `1px solid ${v.pct >= 70 ? T.good : T.line}`, color: v.pct >= 70 ? T.good : T.boneDim }}>
                  {LABELS[v.pad]} {v.pct}%
                </span>
              ))}
            </div>
          )}
          {result.pass ? (
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(127,176,105,0.12)", border: `1px solid ${T.good}`, marginBottom: 14 }}>
              <span style={{ font: `700 14px ${FONT_DISPLAY}`, color: T.good }}>Solid — you're ready to move on.</span>
            </div>
          ) : (
            <div style={{ padding: 12, borderRadius: 10, background: T.bgRaise, border: `1px solid ${T.line}`, marginBottom: 14 }}>
              <span style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.boneDim }}>{tip}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn variant="line" onClick={() => start(demoRef.current)}>Try again</Btn>
            {result.pass ? (
              <Btn onClick={onComplete}>Complete & advance →</Btn>
            ) : result.readiness >= 80 && result.density >= 78 ? (
              <Btn variant="ghost" onClick={onComplete}>Advance anyway (not yet recommended)</Btn>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}

function LessonsView({ progress, setProgress, go, skills, subscribeHits, midiStatus, onConnect }) {
  const [open, setOpen] = useState(null); // {stage, lesson}
  const [unlockAll, setUnlockAll] = useState(false);

  const lessonDone = (id) => progress.done.includes(id);
  const stageComplete = (st) => st.lessons.every((l) => lessonDone(l.id));
  const stageUnlocked = (i) => unlockAll || i === 0 || stageComplete(STAGES[i - 1]);

  const markDone = (id) => {
    if (!progress.done.includes(id))
      setProgress({ ...progress, done: [...progress.done, id] });
  };

  if (open) {
    const st = STAGES[open.stage];
    const l = st.lessons[open.lesson];
    const done = lessonDone(l.id);
    return (
      <div className="dc-rise" style={{ maxWidth: 720, margin: "0 auto" }}>
        <button onClick={() => setOpen(null)} className="dc-focus"
          style={{ font: `600 13px ${FONT_DISPLAY}`, color: T.boneDim, background: "none",
            border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>
          ← All lessons
        </button>
        <Eyebrow>Stage {st.n} · Lesson {l.id}</Eyebrow>
        <h1 style={{ font: `800 30px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 16px" }}>{l.title}</h1>
        <Card>
          <p style={{ font: `400 17px ${FONT_DISPLAY}`, color: T.bone, lineHeight: 1.65, margin: 0 }}>{l.body}</p>
        </Card>

        {l.type === "explore" && (
          <div style={{ marginTop: 16 }}>
            <Btn variant="line" onClick={() => go("kit")}>Open the kit explorer →</Btn>
          </div>
        )}
        {l.link && (
          <div style={{ marginTop: 16 }}>
            <Btn variant="line" onClick={() => go(l.link.view)}>{l.link.label} →</Btn>
          </div>
        )}
        {l.type === "drill" && (
          <DrillRunner drill={l} stageNum={st.n} subscribeHits={subscribeHits}
            midiStatus={midiStatus} onConnect={onConnect}
            onComplete={() => { markDone(l.id); setOpen(null); }} />
        )}

        {l.type !== "drill" && (
          <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center" }}>
            <Btn onClick={() => { markDone(l.id); setOpen(null); }} disabled={done}>
              {done ? "✓ Completed" : "Mark complete"}
            </Btn>
          </div>
        )}
        {l.type === "drill" && done && (
          <div style={{ marginTop: 14, font: `700 13px ${FONT_MONO}`, color: T.good }}>✓ Completed</div>
        )}
      </div>
    );
  }

  return (
    <div className="dc-rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>The course</Eyebrow>
          <h1 style={{ font: `800 28px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 6px" }}>
            Zero to your first songs
          </h1>
          <p style={{ font: `400 15px ${FONT_DISPLAY}`, color: T.boneDim, margin: "0 0 8px" }}>
            Stages unlock as you go. The kit tells the app when you're really ready.
          </p>
        </div>
        <button onClick={() => setUnlockAll((v) => !v)} className="dc-focus"
          style={{ font: `700 11px ${FONT_MONO}`, padding: "7px 11px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
            border: `1px solid ${unlockAll ? T.brass : T.line}`,
            background: unlockAll ? T.brass : "transparent", color: unlockAll ? T.bg : T.boneDim }}>
          {unlockAll ? "🔓 All unlocked" : "🔒 Unlock all (testing)"}
        </button>
      </div>
      <div style={{ height: 16 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {STAGES.map((st, i) => {
          const unlocked = stageUnlocked(i);
          const complete = stageComplete(st);
          const doneCount = st.lessons.filter((l) => lessonDone(l.id)).length;
          return (
            <Card key={st.n} style={{ opacity: unlocked ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <span style={{ font: `800 34px ${FONT_DISPLAY}`, color: complete ? T.good : T.brass, lineHeight: 1 }}>
                  {String(st.n).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h2 style={{ font: `700 19px ${FONT_DISPLAY}`, color: T.bone, margin: 0 }}>{st.title}</h2>
                  <p style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.boneDim, margin: "2px 0 0" }}>{st.sub}</p>
                </div>
                <span style={{ font: `700 12px ${FONT_MONO}`,
                  color: complete ? T.good : unlocked ? T.boneDim : T.steel }}>
                  {!unlocked ? "🔒 Locked" : `${doneCount}/${st.lessons.length}`}
                </span>
              </div>
              {unlocked && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  {st.lessons.map((l, li) => {
                    const d = lessonDone(l.id);
                    return (
                      <button key={l.id} onClick={() => setOpen({ stage: i, lesson: li })} className="dc-focus"
                        style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                          background: T.bgRaise, border: `1px solid ${T.line}`, borderRadius: 10,
                          padding: "11px 14px", cursor: "pointer" }}>
                        <span style={{ width: 18, height: 18, borderRadius: 999, flexShrink: 0,
                          border: `1.5px solid ${d ? T.good : T.lineHi}`, background: d ? T.good : "transparent",
                          color: T.bg, font: `700 11px ${FONT_DISPLAY}`, display: "flex",
                          alignItems: "center", justifyContent: "center" }}>{d ? "✓" : ""}</span>
                        <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>{l.id}</span>
                        <span style={{ font: `600 14px ${FONT_DISPLAY}`, color: T.bone, flex: 1 }}>{l.title}</span>
                        {(() => {
                          const meta = l.type === "drill"
                            ? { label: "PLAY", c: T.bg, bg: T.brass, bd: T.brass }
                            : l.type === "explore"
                            ? { label: "EXPLORE", c: T.brassHi, bg: "transparent", bd: T.brass }
                            : { label: "READ", c: T.steel, bg: "transparent", bd: T.line };
                          return (
                            <span style={{ font: `700 9px ${FONT_MONO}`, letterSpacing: "0.1em", flexShrink: 0,
                              padding: "3px 8px", borderRadius: 6, color: meta.c, background: meta.bg, border: `1px solid ${meta.bd}` }}>
                              {meta.label}
                            </span>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, ok }) {
  return (
    <div>
      <div style={{ font: `400 10px ${FONT_MONO}`, color: T.steel, letterSpacing: "0.1em" }}>{label.toUpperCase()}</div>
      <div style={{ font: `700 22px ${FONT_MONO}`, color: ok ? T.good : T.bone }}>{value}</div>
    </div>
  );
}

/* ============================================================
   VIEW: Practice (metronome + live monitor + assessment)
   ============================================================ */
const RUDIMENTS = {
  singles: { label: "Single strokes", sticking: "R L R L", subdiv: 2 },
  doubles: { label: "Double strokes", sticking: "R R L L", subdiv: 2 },
  paradiddle: { label: "Paradiddles", sticking: "R L R R · L R L L", subdiv: 4 },
};

function TimingMeter({ lastError }) {
  const pos = lastError == null ? 0 : Math.max(-1, Math.min(1, lastError / 120));
  const color = lastError == null ? T.steel : Math.abs(lastError) < 25 ? T.good : Math.abs(lastError) < 60 ? T.warn : "#C7553F";
  return (
    <>
      <div style={{ position: "relative", height: 36, background: T.bgRaise, borderRadius: 10, border: `1px solid ${T.line}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: T.lineHi }} />
        <div style={{ position: "absolute", left: "8%", top: 5, font: `400 9px ${FONT_MONO}`, color: T.steel }}>EARLY</div>
        <div style={{ position: "absolute", right: "8%", top: 5, font: `400 9px ${FONT_MONO}`, color: T.steel }}>LATE</div>
        <div style={{ position: "absolute", top: 7, bottom: 7, width: 6, borderRadius: 3, background: color,
          left: `calc(${50 + pos * 42}% - 3px)`, transition: "left .08s, background .08s", boxShadow: `0 0 10px ${color}` }} />
      </div>
      <div style={{ textAlign: "center", font: `700 12px ${FONT_MONO}`, color, marginTop: 6 }}>
        {lastError == null ? "—" : `${lastError > 0 ? "+" : ""}${lastError} ms`}
      </div>
    </>
  );
}

function RhythmTrainer({ mode, subscribeHits, midiStatus, onConnect, logSkill }) {
  const [rud, setRud] = useState("singles");
  const [subdiv, setSubdiv] = useState(2);
  const [bpm, setBpm] = useState(mode === "speed" ? 70 : 80);
  const [phase, setPhase] = useState("idle"); // idle|countin|running|ramp|results
  const [bar, setBar] = useState(0);
  const [level, setLevel] = useState(0);
  const [lastError, setLastError] = useState(null);
  const [result, setResult] = useState(null);

  const COUNTIN = 4;
  const runBeats = mode === "speed" ? 8 : 16;

  const beatCountRef = useRef(0);
  const lastBeatRef = useRef(null);
  const expRef = useRef([]);
  const errRef = useRef([]);
  const timesRef = useRef([]);
  const coveredRef = useRef(new Set());
  const bestBpmRef = useRef(0);
  const demoRef = useRef(false);
  const finishedRef = useRef(false);
  const phaseRef = useRef("idle");
  const bpmRef = useRef(bpm);
  const subdivRef = useRef(subdiv);
  phaseRef.current = phase;
  bpmRef.current = bpm;
  subdivRef.current = subdiv;

  const pickRud = (k) => { setRud(k); setSubdiv(RUDIMENTS[k].subdiv); };
  const resetWindow = () => { expRef.current = []; errRef.current = []; timesRef.current = []; coveredRef.current = new Set(); };

  const evalWindow = () => {
    const errs = errRef.current;
    const times = [...timesRef.current].sort((a, b) => a - b);
    const idealSub = 60000 / bpmRef.current / subdivRef.current;
    let timing = 999, evenness = 0, density = 0;
    if (errs.length >= 3) {
      timing = Math.round(errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length);
      const iois = [];
      for (let i = 1; i < times.length; i++) iois.push(times[i] - times[i - 1]);
      const mean = iois.reduce((a, b) => a + b, 0) / (iois.length || 1) || idealSub;
      const sd = Math.sqrt(iois.reduce((a, b) => a + (b - mean) ** 2, 0) / (iois.length || 1));
      evenness = Math.max(0, Math.min(100, Math.round(100 - (sd / idealSub) * 100)));
      density = Math.min(1, coveredRef.current.size / Math.max(1, expRef.current.length));
    }
    return { timing, evenness, density: Math.round(density * 100), hits: errs.length };
  };

  const recordHit = useCallback((h) => {
    if (phaseRef.current !== "running") return;
    const exp = expRef.current;
    if (!exp.length) return;
    let best = Infinity, bi = -1;
    for (let i = 0; i < exp.length; i++) { const d = h.t - exp[i]; if (Math.abs(d) < Math.abs(best)) { best = d; bi = i; } }
    const tol = Math.max(80, (60000 / bpmRef.current / subdivRef.current) * 0.5);
    if (Math.abs(best) <= tol) {
      errRef.current.push(best); timesRef.current.push(h.t); coveredRef.current.add(bi);
      setLastError(Math.round(best));
    }
  }, []);

  useEffect(() => { if (!subscribeHits) return; return subscribeHits(recordHit); }, [subscribeHits, recordHit]);

  const metroRef = useRef(null);

  const beginRun = (demo, startBpm) => {
    if (!mountedRef.current) return;
    beatCountRef.current = 0;
    lastBeatRef.current = null;
    finishedRef.current = false;
    demoRef.current = !!demo;
    resetWindow();
    setLastError(null);
    if (startBpm) setBpm(startBpm);
    setBar(0);
    setPhase("countin");
    metroRef.current?.start();
  };

  const finishRun = () => {
    metroRef.current?.stop();
    if (!mountedRef.current) return;
    const r = evalWindow();
    if (mode === "isolate") {
      const ok = r.hits >= 4 && r.timing <= 55 && r.evenness >= 72 && r.density >= 75;
      setResult({ type: "isolate", ...r, bpm: bpmRef.current, ok });
      setPhase("results");
      logSkill?.({ kind: "Rudiment", detail: `${RUDIMENTS[rud].label} · ${bpmRef.current} BPM · ±${r.timing}ms · ${r.evenness}% even` });
    } else {
      const clean = r.hits >= 4 && r.timing <= 60 && r.evenness >= 66 && r.density >= 65;
      if (clean && bpmRef.current < 220) {
        bestBpmRef.current = bpmRef.current;
        const next = bpmRef.current + 4;
        setLevel((l) => l + 1);
        setPhase("ramp");
        setTimeout(() => beginRun(demoRef.current, next), 750);
      } else {
        const reached = bestBpmRef.current || bpmRef.current;
        setResult({ type: "speed", maxBpm: reached, rud });
        setPhase("results");
        logSkill?.({ kind: "Speed", detail: `${RUDIMENTS[rud].label} · reached ${reached} BPM` });
      }
    }
  };

  const onBeat = useCallback(({ perfTime }) => {
    const n = beatCountRef.current;
    beatCountRef.current += 1;
    if (n < COUNTIN) { setPhase("countin"); lastBeatRef.current = perfTime; return; }
    setPhase("running");
    if (lastBeatRef.current != null) {
      const interval = perfTime - lastBeatRef.current;
      const sd = subdivRef.current;
      for (let k = 0; k < sd; k++) expRef.current.push(lastBeatRef.current + (k * interval) / sd);
      if (demoRef.current) {
        for (let k = 0; k < sd; k++) {
          const jitter = (Math.random() - 0.5) * 36 + (Math.random() < 0.1 ? (Math.random() - 0.5) * 70 : 0);
          const t = lastBeatRef.current + (k * interval) / sd + jitter;
          setTimeout(() => recordHit({ note: 38, velocity: 90, t: performance.now() }), Math.max(0, t - performance.now()));
        }
      }
    }
    lastBeatRef.current = perfTime;
    const recBeat = n - COUNTIN;
    setBar(Math.floor(recBeat / 4) + 1);
    if (recBeat + 1 >= runBeats && !finishedRef.current) {
      finishedRef.current = true;
      setTimeout(finishRun, 260);
    }
  }, [recordHit]);

  const metro = useMetronome(bpm, 4, { onBeat, subdivision: subdiv });
  metroRef.current = metro;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; metroRef.current?.stop(); }, []);

  useEffect(() => { if (phase === "results" || phase === "idle") metro.stop(); /* eslint-disable-next-line */ }, [phase]);

  const cancel = () => { metro.stop(); finishedRef.current = true; setPhase("idle"); setLastError(null); };
  const connected = midiStatus === "connected";
  const running = phase === "countin" || phase === "running" || phase === "ramp";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>{mode === "speed" ? "Speed Builder" : "Rudiment Isolator"}</Eyebrow>
        {!connected && phase === "idle" && (
          <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>
            no kit — use Demo or <button onClick={onConnect} className="dc-focus" style={{ font: `700 11px ${FONT_MONO}`, color: T.brass, background: "none", border: "none", cursor: "pointer", padding: 0 }}>connect →</button>
          </span>
        )}
      </div>
      <p style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.5, margin: "8px 0 14px" }}>
        {mode === "speed"
          ? "Hold the rudiment cleanly for two bars and the tempo climbs +4 BPM. Keep going until it falls apart — your top clean tempo is the score."
          : "Drill one rudiment on the snare for four bars. Scored on timing, evenness, and how many notes you actually land."}
      </p>

      {phase === "idle" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {Object.entries(RUDIMENTS).map(([k, v]) => (
              <button key={k} onClick={() => pickRud(k)} className="dc-focus"
                style={{ font: `700 12px ${FONT_DISPLAY}`, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  background: rud === k ? T.bgCardHi : "transparent", color: rud === k ? T.brassHi : T.boneDim,
                  border: `1px solid ${rud === k ? T.brass : T.line}` }}>{v.label}</button>
            ))}
          </div>
          <div style={{ font: `700 13px ${FONT_MONO}`, color: T.steel, marginBottom: 14 }}>
            STICKING&nbsp;&nbsp;<span style={{ color: T.bone }}>{RUDIMENTS[rud].sticking}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ font: `700 26px ${FONT_MONO}`, color: T.bone }}>{bpm}<span style={{ font: `400 10px ${FONT_MONO}`, color: T.steel }}> BPM{mode === "speed" ? " start" : ""}</span></span>
            <input type="range" min="50" max={mode === "speed" ? 130 : 160} value={bpm} onChange={(e) => setBpm(+e.target.value)} style={{ flex: 1, minWidth: 130, accentColor: T.brass }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <Btn onClick={() => beginRun(false, bpm)}>▶ Start</Btn>
            <Btn variant="line" onClick={() => beginRun(true, bpm)}>Demo</Btn>
          </div>
        </>
      )}

      {running && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ font: `700 13px ${FONT_MONO}`, color: phase === "countin" ? T.warn : phase === "ramp" ? T.good : T.strike, letterSpacing: "0.08em" }}>
              {phase === "countin" ? "COUNT IN…" : phase === "ramp" ? `LEVEL UP → ${bpm} BPM` : `${bpm} BPM · BAR ${bar}/${runBeats / 4}`}
            </span>
            <button onClick={cancel} className="dc-focus" style={{ font: `700 12px ${FONT_MONO}`, color: T.boneDim, background: "none", border: `1px solid ${T.line}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>Stop</button>
          </div>
          {mode === "speed" && (
            <div style={{ font: `700 40px ${FONT_MONO}`, color: T.brass, textAlign: "center", margin: "4px 0 10px" }}>
              {bpm}<span style={{ font: `400 12px ${FONT_MONO}`, color: T.steel }}> BPM · LVL {level + 1}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 14 }}>
            {[0, 1, 2, 3].map((b) => (
              <span key={b} style={{ width: 14, height: 14, borderRadius: 999, background: metro.beat === b ? (b === 0 ? T.brassHi : T.strike) : T.line, boxShadow: metro.beat === b ? `0 0 12px ${T.strike}` : "none", transition: "background .04s" }} />
            ))}
          </div>
          <TimingMeter lastError={lastError} />
        </div>
      )}

      {phase === "results" && result && (
        <div className="dc-rise">
          {result.type === "speed" ? (
            <>
              <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
                <div style={{ font: `400 11px ${FONT_MONO}`, color: T.steel, letterSpacing: "0.15em" }}>TOP CLEAN TEMPO</div>
                <div style={{ font: `800 56px ${FONT_MONO}`, color: T.brass, lineHeight: 1.1 }}>{result.maxBpm}</div>
                <div style={{ font: `400 12px ${FONT_MONO}`, color: T.boneDim }}>BPM · {RUDIMENTS[result.rud].label}</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
                <Stat label="Timing" value={`±${result.timing}ms`} ok={result.timing <= 55} />
                <Stat label="Evenness" value={`${result.evenness}%`} ok={result.evenness >= 72} />
                <Stat label="Notes hit" value={`${result.density}%`} ok={result.density >= 75} />
              </div>
              <div style={{ padding: 12, borderRadius: 10, marginBottom: 14,
                background: result.ok ? "rgba(127,176,105,0.12)" : T.bgRaise, border: `1px solid ${result.ok ? T.good : T.line}` }}>
                <span style={{ font: `${result.ok ? 700 : 400} 14px ${FONT_DISPLAY}`, color: result.ok ? T.good : T.boneDim }}>
                  {result.ok ? "Clean and even — nicely done." : "Keep it relaxed and even — let the stick rebound do the work."}
                </span>
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => beginRun(false, mode === "speed" ? bpm : bpmRef.current)}>Go again</Btn>
            <Btn variant="ghost" onClick={() => setPhase("idle")}>Change settings</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function PadAccuracyTrainer({ subscribeHits, midiStatus, onConnect, logSkill }) {
  const POOL = ["snare", "kick", "tom1", "tom2", "tom3", "hihat", "crash", "ride"];
  const [len, setLen] = useState(8);
  const [phase, setPhase] = useState("idle"); // idle | running | results
  const [seq, setSeq] = useState([]);
  const [target, setTarget] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [flash, setFlash] = useState(null); // 'hit' | 'miss'
  const [result, setResult] = useState(null);

  const phaseRef = useRef("idle");
  const seqRef = useRef([]);
  const targetRef = useRef(0);
  const startRef = useRef(0);
  const wrongRef = useRef(0);
  const demoRef = useRef(false);
  phaseRef.current = phase;

  const recordHit = useCallback((h) => {
    if (phaseRef.current !== "running") return;
    const padId = NOTE_TO_PAD[h.note];
    if (!padId) return;
    const want = seqRef.current[targetRef.current];
    if (padId === want) {
      const nx = targetRef.current + 1;
      targetRef.current = nx;
      setTarget(nx);
      setFlash("hit"); setTimeout(() => setFlash(null), 120);
      if (nx >= seqRef.current.length) {
        const elapsed = (performance.now() - startRef.current) / 1000;
        const correct = seqRef.current.length;
        const acc = Math.round((correct / (correct + wrongRef.current)) * 100);
        setResult({ acc, time: elapsed.toFixed(1), wrong: wrongRef.current, len: correct });
        setPhase("results");
        logSkill?.({ kind: "Pad accuracy", detail: `${correct} pads · ${acc}% · ${elapsed.toFixed(1)}s` });
      }
    } else {
      wrongRef.current += 1; setWrong(wrongRef.current);
      setFlash("miss"); setTimeout(() => setFlash(null), 160);
    }
  }, [logSkill]);

  useEffect(() => { if (!subscribeHits) return; return subscribeHits(recordHit); }, [subscribeHits, recordHit]);
  useEffect(() => () => { phaseRef.current = "idle"; }, []);

  const begin = (demo) => {
    const s = Array.from({ length: len }, () => POOL[Math.floor(Math.random() * POOL.length)]);
    seqRef.current = s; setSeq(s);
    targetRef.current = 0; setTarget(0);
    wrongRef.current = 0; setWrong(0);
    startRef.current = performance.now();
    demoRef.current = !!demo;
    setResult(null); setPhase("running");
    if (demo) {
      let i = 0;
      const fire = () => {
        if (i >= s.length || phaseRef.current !== "running") return;
        const note = (PADMAP[s[i]].notes || [38])[0];
        recordHit({ note, velocity: 90, t: performance.now() });
        i += 1;
        setTimeout(fire, 360 + Math.random() * 200);
      };
      setTimeout(fire, 500);
    }
  };
  const cancel = () => { setPhase("idle"); };
  const connected = midiStatus === "connected";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Eyebrow>Pad Accuracy</Eyebrow>
        {!connected && phase === "idle" && (
          <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>
            no kit — use Demo or <button onClick={onConnect} className="dc-focus" style={{ font: `700 11px ${FONT_MONO}`, color: T.brass, background: "none", border: "none", cursor: "pointer", padding: 0 }}>connect →</button>
          </span>
        )}
      </div>
      <p style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.5, margin: "8px 0 14px" }}>
        The app calls a sequence of pads — hit them in order as fast as you can. Builds muscle memory for finding each
        drum without looking. Scored on accuracy and total time.
      </p>

      {phase === "idle" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>LENGTH</span>
            {[8, 12, 16].map((v) => (
              <button key={v} onClick={() => setLen(v)} className="dc-focus"
                style={{ font: `700 12px ${FONT_MONO}`, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  background: len === v ? T.bgCardHi : "transparent", color: len === v ? T.brassHi : T.boneDim,
                  border: `1px solid ${len === v ? T.brass : T.line}` }}>{v}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => begin(false)}>▶ Start</Btn>
            <Btn variant="line" onClick={() => begin(true)}>Demo</Btn>
          </div>
        </>
      )}

      {phase === "running" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ font: `700 13px ${FONT_MONO}`, color: flash === "miss" ? "#C7553F" : flash === "hit" ? T.good : T.boneDim }}>
              {target}/{seq.length} · {wrong} wrong
            </span>
            <button onClick={cancel} className="dc-focus" style={{ font: `700 12px ${FONT_MONO}`, color: T.boneDim, background: "none", border: `1px solid ${T.line}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer" }}>Stop</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
            {seq.map((id, i) => {
              const isNow = i === target;
              const done = i < target;
              return (
                <span key={i} style={{ font: `700 12px ${FONT_DISPLAY}`, padding: "8px 12px", borderRadius: 9,
                  background: isNow ? (flash === "miss" ? "#C7553F" : T.brass) : done ? "rgba(127,176,105,0.18)" : T.bgRaise,
                  color: isNow ? T.bg : done ? T.good : T.boneDim,
                  border: `1px solid ${isNow ? T.brass : done ? T.good : T.line}`,
                  transform: isNow ? "scale(1.08)" : "none", transition: "transform .1s" }}>
                  {LABELS[id]}
                </span>
              );
            })}
          </div>
          <div style={{ textAlign: "center", font: `400 12px ${FONT_MONO}`, color: T.steel, marginTop: 16 }}>
            hit the highlighted pad next
          </div>
        </div>
      )}

      {phase === "results" && result && (
        <div className="dc-rise">
          <div style={{ display: "flex", gap: 24, justifyContent: "center", margin: "6px 0 16px" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ font: `800 44px ${FONT_MONO}`, color: result.acc >= 90 ? T.good : T.brass, lineHeight: 1 }}>{result.acc}%</div>
              <div style={{ font: `400 10px ${FONT_MONO}`, color: T.steel, letterSpacing: "0.1em" }}>ACCURACY</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ font: `800 44px ${FONT_MONO}`, color: T.bone, lineHeight: 1 }}>{result.time}s</div>
              <div style={{ font: `400 10px ${FONT_MONO}`, color: T.steel, letterSpacing: "0.1em" }}>TIME</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={() => begin(demoRef.current)}>Go again</Btn>
            <Btn variant="ghost" onClick={() => setPhase("idle")}>Change settings</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

function PracticeView({ midiStatus, onConnect, recentHits, hits, skills, simulate, subscribeHits, logSkill }) {
  const [bpm, setBpm] = useState(80);
  const [tool, setTool] = useState("metro");
  const { running, beat, start, stop } = useMetronome(bpm, 4);
  useEffect(() => { if (tool !== "metro") stop(); }, [tool, stop]);

  const TOOLS = [
    ["metro", "Metronome"],
    ["speed", "Speed Builder"],
    ["rudiments", "Rudiments"],
    ["pads", "Pad Accuracy"],
  ];

  return (
    <div className="dc-rise">
      <Eyebrow>Practice room</Eyebrow>
      <h1 style={{ font: `800 28px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 16px" }}>
        Practice & skill builders
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TOOLS.map(([id, label]) => (
          <button key={id} onClick={() => setTool(id)} className="dc-focus"
            style={{ font: `700 13px ${FONT_DISPLAY}`, padding: "8px 14px", borderRadius: 9, cursor: "pointer",
              border: `1px solid ${tool === id ? T.brass : T.line}`,
              background: tool === id ? T.brass : "transparent", color: tool === id ? T.bg : T.boneDim }}>
            {label}
          </button>
        ))}
      </div>

      {tool === "speed" && <RhythmTrainer mode="speed" subscribeHits={subscribeHits} midiStatus={midiStatus} onConnect={onConnect} logSkill={logSkill} />}
      {tool === "rudiments" && <RhythmTrainer mode="isolate" subscribeHits={subscribeHits} midiStatus={midiStatus} onConnect={onConnect} logSkill={logSkill} />}
      {tool === "pads" && <PadAccuracyTrainer subscribeHits={subscribeHits} midiStatus={midiStatus} onConnect={onConnect} logSkill={logSkill} />}

      {tool === "metro" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }} className="dc-grid">
        {/* Metronome */}
        <Card>
          <Eyebrow>Metronome</Eyebrow>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "18px 0" }}>
            {[0, 1, 2, 3].map((b) => (
              <span key={b} style={{ width: 16, height: 16, borderRadius: 999,
                background: running && beat === b ? (b === 0 ? T.brassHi : T.strike) : T.line,
                transition: "background .05s", boxShadow: running && beat === b ? `0 0 14px ${T.strike}` : "none" }} />
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ font: `700 64px ${FONT_MONO}`, color: T.bone, lineHeight: 1 }}>{bpm}</div>
            <div style={{ font: `400 11px ${FONT_MONO}`, color: T.steel, letterSpacing: "0.2em" }}>BPM</div>
          </div>
          <input type="range" min="40" max="200" value={bpm} onChange={(e) => setBpm(+e.target.value)}
            style={{ width: "100%", margin: "16px 0", accentColor: T.brass }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {[60, 80, 100, 120].map((v) => (
              <button key={v} onClick={() => setBpm(v)} className="dc-focus"
                style={{ font: `700 12px ${FONT_MONO}`, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  background: bpm === v ? T.bgCardHi : "transparent", color: bpm === v ? T.brassHi : T.boneDim,
                  border: `1px solid ${bpm === v ? T.brass : T.line}` }}>{v}</button>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Btn full onClick={running ? stop : start}>{running ? "■ Stop" : "▶ Start click"}</Btn>
          </div>
        </Card>

        {/* Live monitor */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Eyebrow>Live from your kit</Eyebrow>
            {midiStatus !== "connected" && (
              <button onClick={onConnect} className="dc-focus"
                style={{ font: `700 12px ${FONT_MONO}`, color: T.brass, background: "none", border: "none", cursor: "pointer" }}>
                Connect →
              </button>
            )}
          </div>

          {midiStatus === "connected" ? (
            <>
              <div style={{ display: "flex", gap: 16, margin: "16px 0" }}>
                <Stat label="Hits logged" value={hits.length} ok={false} />
                <Stat label="Timing" value={skills.timing != null ? `±${skills.timing}ms` : "—"}
                  ok={skills.timing != null && skills.timing <= 40} />
                <Stat label="Evenness" value={skills.evenness != null ? `${skills.evenness}%` : "—"}
                  ok={skills.evenness != null && skills.evenness >= 80} />
              </div>
              <div style={{ height: 120, background: T.bgRaise, borderRadius: 10, border: `1px solid ${T.line}`,
                padding: 10, overflow: "hidden", display: "flex", flexDirection: "column-reverse", gap: 4 }}>
                {recentHits.length === 0 && (
                  <div style={{ font: `400 13px ${FONT_DISPLAY}`, color: T.steel, textAlign: "center", margin: "auto" }}>
                    Play a pad — every hit shows here in real time.
                  </div>
                )}
                {recentHits.slice(-6).map((h, i) => {
                  const pad = PADS.find((p) => p.id === NOTE_TO_PAD[h.note]);
                  return (
                    <div key={h.t + "" + i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ font: `700 13px ${FONT_DISPLAY}`, color: T.strike, flex: 1 }}>
                        {pad ? pad.name : `Note ${h.note}`}
                      </span>
                      <span style={{ font: `400 11px ${FONT_MONO}`, color: T.boneDim }}>vel {h.velocity}</span>
                      <span style={{ width: Math.max(6, (h.velocity / 127) * 70), height: 8,
                        borderRadius: 4, background: T.brass }} />
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "26px 10px" }}>
              <p style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.55, margin: "0 0 16px" }}>
                Plug the TD-313 into this device with USB-C. The app reads the kit's MIDI directly — it knows
                exactly which pad you hit, how hard, and when. No microphone, no guessing.
              </p>
              <Btn variant="line" onClick={simulate}>Try a simulated hit</Btn>
              {midiStatus === "unsupported" && (
                <p style={{ font: `400 12px ${FONT_MONO}`, color: T.steel, marginTop: 14 }}>
                  This preview can't open MIDI. It'll work once deployed and opened in Chrome/Edge.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
      )}
    </div>
  );
}

/* ============================================================
   VIEW: Progress
   ============================================================ */
function SongsView({ subscribeHits, midiStatus, onConnect }) {
  const [tracks, setTracks] = useState(() => loadStore().tracks || []);
  const [defaults, setDefaults] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [rate, setRate] = useState(1);
  const [recent, setRecent] = useState([]);
  const [f, setF] = useState({ title: "", artist: "", url: "", license: "pixabay", bpm: "", difficulty: "Beginner" });
  const audioRef = useRef(null);

  useEffect(() => { saveStore({ tracks }); }, [tracks]);
  useEffect(() => { if (!subscribeHits) return; return subscribeHits((h) => setRecent((r) => [...r.slice(-7), h])); }, [subscribeHits]);
  // self-hosted starter library shipped in /public/tracks/tracks.json (graceful if absent)
  useEffect(() => {
    let alive = true;
    fetch("tracks/tracks.json").then((r) => r.ok ? r.json() : []).then((d) => {
      if (alive && Array.isArray(d)) setDefaults(d.map((t, i) => ({ ...t, id: "starter-" + i, starter: true })));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const lib = [
    ...defaults.map((d) => ({
      ...d, url: "tracks/" + d.file,
      source: d.license === "ccby" ? "CC-BY" : "Pixabay",
      attribution: d.license === "ccby" ? `"${d.title}" by ${d.artist || "Unknown"} (CC BY)` : null,
    })),
    ...tracks,
  ];
  const active = lib.find((t) => t.id === activeId);

  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
    a.playbackRate = rate;
  }, [rate, activeId]);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const addTrack = () => {
    if (!f.title.trim() || !f.url.trim()) return;
    const credit = f.license === "ccby";
    const t = {
      id: "t" + Date.now(), title: f.title.trim(), artist: f.artist.trim(), url: f.url.trim(),
      source: credit ? "CC-BY" : "Pixabay",
      license: credit ? "CC BY — credit required" : "Pixabay — no attribution",
      attribution: credit ? `"${f.title.trim()}" by ${f.artist.trim() || "Unknown"} (CC BY)` : null,
      bpm: f.bpm, difficulty: f.difficulty,
    };
    setTracks((prev) => [t, ...prev]);
    setAdding(false);
    setF({ title: "", artist: "", url: "", license: "pixabay", bpm: "", difficulty: "Beginner" });
  };
  const removeTrack = (id) => { setTracks((prev) => prev.filter((t) => t.id !== id)); if (activeId === id) { setActiveId(null); setPlaying(false); } };
  const selectTrack = (id) => { setActiveId(id); setPlaying(false); setTimeout(() => { const a = audioRef.current; if (a) { a.play().then(() => setPlaying(true)).catch(() => {}); } }, 60); };

  const inp = { font: `400 14px ${FONT_DISPLAY}`, padding: "9px 11px", borderRadius: 8, background: T.bgRaise, border: `1px solid ${T.line}`, color: T.bone, width: "100%" };

  return (
    <div className="dc-rise">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Play along</Eyebrow>
          <h1 style={{ font: `800 28px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 0" }}>Songs</h1>
        </div>
        <Btn variant="line" onClick={() => setAdding((v) => !v)}>{adding ? "Close" : "+ Add track"}</Btn>
      </div>
      <p style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.55, margin: "10px 0 18px" }}>
        Play a backing track and groove over it — find the pulse, lock in, and watch your hits land live. Slow a track
        down (pitch stays intact) to learn a tricky part.
      </p>

      {adding && (
        <Card style={{ marginBottom: 18 }}>
          <Eyebrow>Add a track</Eyebrow>
          <p style={{ font: `400 12px ${FONT_DISPLAY}`, color: T.steel, margin: "8px 0 12px", lineHeight: 1.5 }}>
            Paste a direct audio URL from a cleared source. Only two licenses are allowed in the app: Pixabay
            (no attribution) or CC-BY (a credit line will show under the track).
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={inp} placeholder="Track title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <input style={inp} placeholder="Artist (required for CC-BY)" value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} />
            <input style={inp} placeholder="Direct audio URL (.mp3 / .ogg)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select style={{ ...inp, width: "auto" }} value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })}>
                <option value="pixabay">Pixabay (no attribution)</option>
                <option value="ccby">CC-BY (credit required)</option>
              </select>
              <input style={{ ...inp, width: 90 }} placeholder="BPM" value={f.bpm} onChange={(e) => setF({ ...f, bpm: e.target.value })} />
              <select style={{ ...inp, width: "auto" }} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>
                <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
              </select>
            </div>
            <div><Btn onClick={addTrack}>Add to library</Btn></div>
          </div>
        </Card>
      )}

      {active && (
        <Card style={{ marginBottom: 18 }}>
          <audio ref={audioRef} src={active.url} loop={loop} onEnded={() => setPlaying(false)} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button onClick={togglePlay} className="dc-focus" style={{ width: 52, height: 52, borderRadius: 999, cursor: "pointer",
              border: "none", background: T.brass, color: T.bg, font: `700 20px ${FONT_DISPLAY}` }}>{playing ? "❚❚" : "▶"}</button>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ font: `800 18px ${FONT_DISPLAY}`, color: T.bone }}>{active.title}</div>
              <div style={{ font: `400 12px ${FONT_MONO}`, color: T.boneDim }}>{active.artist || "—"} · {active.bpm ? `${active.bpm} BPM · ` : ""}{active.difficulty}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 4px", flexWrap: "wrap" }}>
            <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>SPEED {Math.round(rate * 100)}%</span>
            <input type="range" min="50" max="100" value={Math.round(rate * 100)} onChange={(e) => setRate(+e.target.value / 100)} style={{ flex: 1, minWidth: 120, accentColor: T.brass }} />
            <button onClick={() => setLoop((v) => !v)} className="dc-focus" style={{ font: `700 11px ${FONT_MONO}`, padding: "5px 11px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${loop ? T.brass : T.line}`, background: loop ? T.bgCardHi : "transparent", color: loop ? T.brassHi : T.boneDim }}>LOOP {loop ? "ON" : "OFF"}</button>
          </div>
          {/* live hits */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, minHeight: 22 }}>
            <span style={{ font: `400 10px ${FONT_MONO}`, color: T.steel, marginRight: 4 }}>YOUR HITS</span>
            {midiStatus === "connected" ? (
              recent.length === 0 ? <span style={{ font: `400 12px ${FONT_DISPLAY}`, color: T.steel }}>play along…</span>
                : recent.slice(-7).map((h, i) => (
                  <span key={h.t + "" + i} style={{ font: `700 9px ${FONT_DISPLAY}`, padding: "3px 7px", borderRadius: 6, background: T.bgRaise, border: `1px solid ${T.line}`, color: T.strike }}>
                    {LABELS[NOTE_TO_PAD[h.note]] || "?"}
                  </span>
                ))
            ) : (
              <button onClick={onConnect} className="dc-focus" style={{ font: `700 11px ${FONT_MONO}`, color: T.brass, background: "none", border: "none", cursor: "pointer", padding: 0 }}>connect kit to see hits →</button>
            )}
          </div>
          {active.attribution && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.line}`, font: `400 11px ${FONT_MONO}`, color: T.boneDim }}>
              ♪ {active.attribution}
            </div>
          )}
        </Card>
      )}

      {lib.length === 0 ? (
        <Card>
          <p style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.boneDim, lineHeight: 1.6, margin: 0 }}>
            No tracks yet. Tap <strong style={{ color: T.bone }}>+ Add track</strong> and paste a direct audio URL from
            a cleared source — grab one from <strong style={{ color: T.bone }}>pixabay.com/music</strong> (no attribution
            needed). The grooves you've drilled are exactly what these tracks will ask of you.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lib.map((t) => (
            <Card key={t.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => selectTrack(t.id)} className="dc-focus" style={{ width: 38, height: 38, borderRadius: 999, flexShrink: 0, cursor: "pointer",
                  border: `1px solid ${activeId === t.id ? T.brass : T.line}`, background: activeId === t.id ? T.brass : "transparent", color: activeId === t.id ? T.bg : T.bone, font: `700 14px ${FONT_DISPLAY}` }}>▶</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `700 15px ${FONT_DISPLAY}`, color: T.bone }}>{t.title}</div>
                  <div style={{ font: `400 11px ${FONT_MONO}`, color: T.boneDim }}>
                    {t.artist || "—"} · {t.difficulty}{t.bpm ? ` · ${t.bpm} BPM` : ""}{t.fits ? ` · ${t.fits}` : ""}
                  </div>
                </div>
                {t.starter && t.pixabayUrl && (
                  <a href={t.pixabayUrl} target="_blank" rel="noreferrer" className="dc-focus"
                    style={{ font: `700 10px ${FONT_MONO}`, color: T.brass, textDecoration: "none", whiteSpace: "nowrap" }}>get ↗</a>
                )}
                <span style={{ font: `700 9px ${FONT_MONO}`, color: t.attribution ? T.warn : T.good, letterSpacing: "0.05em" }}>{t.source.toUpperCase()}</span>
                {!t.starter && (
                  <button onClick={() => removeTrack(t.id)} className="dc-focus" style={{ font: `400 16px ${FONT_DISPLAY}`, color: T.steel, background: "none", border: "none", cursor: "pointer" }}>×</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p style={{ font: `400 11px ${FONT_MONO}`, color: T.steel, marginTop: 16, lineHeight: 1.5 }}>
        Allowed sources only: Pixabay (no attribution) and CC-BY (credit shown). Tracks save to this device.
      </p>
    </div>
  );
}

function ProgressView({ progress, hits, sessions, skillLog = [], onReset }) {
  const totalLessons = STAGES.reduce((a, s) => a + s.lessons.length, 0);
  const pct = Math.round((progress.done.length / totalLessons) * 100);
  const fmtTime = (t) => { const d = new Date(t); return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
  const kindColor = (k) => k === "Speed" ? T.brass : k === "Pad accuracy" ? T.strike : T.good;
  return (
    <div className="dc-rise">
      <Eyebrow>Your progress</Eyebrow>
      <h1 style={{ font: `800 28px ${FONT_DISPLAY}`, color: T.bone, margin: "10px 0 18px" }}>The log</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }} className="dc-grid">
        <Card><Stat label="Course complete" value={`${pct}%`} ok={pct === 100} /></Card>
        <Card><Stat label="Lessons done" value={`${progress.done.length}/${totalLessons}`} /></Card>
        <Card><Stat label="Skill runs" value={skillLog.length} /></Card>
      </div>

      <Card style={{ marginBottom: 18 }}>
        <Eyebrow>Skill builder log</Eyebrow>
        <div style={{ marginTop: 12 }}>
          {skillLog.length === 0 ? (
            <p style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.steel, margin: 0 }}>
              No runs yet. Every Speed Builder, Rudiment, and Pad Accuracy attempt lands here — so you can watch your
              top tempo climb and your accuracy tighten over the weeks.
            </p>
          ) : (
            skillLog.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
                <span style={{ font: `700 10px ${FONT_MONO}`, color: kindColor(s.kind), letterSpacing: "0.06em", minWidth: 90 }}>{s.kind.toUpperCase()}</span>
                <span style={{ font: `600 13px ${FONT_DISPLAY}`, color: T.bone, flex: 1 }}>{s.detail}</span>
                <span style={{ font: `400 11px ${FONT_MONO}`, color: T.steel }}>{fmtTime(s.at)}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <Eyebrow>Session history</Eyebrow>
        <div style={{ marginTop: 12 }}>
          {sessions.length === 0 ? (
            <p style={{ font: `400 14px ${FONT_DISPLAY}`, color: T.steel, margin: 0 }}>
              No sessions yet. Once you start hitting pads, each practice run is logged here.
            </p>
          ) : (
            sessions.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0",
                borderBottom: `1px solid ${T.line}` }}>
                <span style={{ font: `600 14px ${FONT_DISPLAY}`, color: T.bone }}>{s.label}</span>
                <span style={{ font: `400 12px ${FONT_MONO}`, color: T.boneDim }}>{s.detail}</span>
              </div>
            ))
          )}
        </div>
      </Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <p style={{ font: `400 12px ${FONT_MONO}`, color: T.steel, lineHeight: 1.5, margin: 0, flex: 1, minWidth: 200 }}>
          Progress, skill log, kit layout, and songs now save to this device. Cross-device sync (Supabase) is the next step.
        </p>
        {onReset && (
          <button onClick={() => { if (window.confirm("Reset all saved progress and data on this device?")) onReset(); }}
            className="dc-focus" style={{ font: `700 11px ${FONT_MONO}`, color: T.boneDim, background: "none",
              border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 11px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Reset all data
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ROOT
   ============================================================ */
const LS_KEY = "dreamdrum:v1";
const loadStore = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const saveStore = (patch) => { try { localStorage.setItem(LS_KEY, JSON.stringify({ ...loadStore(), ...patch })); } catch {} };

export default function App({ userEmail, userName, onSignOut } = {}) {
  const persisted = loadStore();
  const displayName = userName || (userEmail ? userEmail.split("@")[0] : "");
  const defaultLayout = () => {
    const angled = {}, top = {};
    PADS.forEach((p) => (angled[p.id] = { x: p.x, y: p.y }));
    Object.entries(TOP).forEach(([id, g]) => (top[id] = { x: g.x, y: g.y }));
    return { angled, top };
  };

  const [view, setView] = useState(persisted.confirmed ? "lessons" : "setup");
  const [confirmed, setConfirmed] = useState(!!persisted.confirmed);
  const [photo, setPhoto] = useState(null);
  const [progress, setProgress] = useState(persisted.progress || { done: [] });
  const [layout, setLayout] = useState(persisted.layout || defaultLayout());

  const moveLayout = useCallback((vw, id, x, y) => {
    const cx = Math.max(40, Math.min(412, x));
    const cy = Math.max(40, Math.min(308, y));
    setLayout((prev) => ({ ...prev, [vw]: { ...prev[vw], [id]: { x: cx, y: cy } } }));
  }, []);
  const resetLayout = useCallback((vw) => setLayout((prev) => ({ ...prev, [vw]: defaultLayout()[vw] })), []);

  useEffect(() => { saveStore({ confirmed }); }, [confirmed]);
  useEffect(() => { saveStore({ progress }); }, [progress]);
  useEffect(() => { saveStore({ layout }); }, [layout]);

  const [hits, setHits] = useState([]);
  const [recentHits, setRecentHits] = useState([]);
  const [hitPad, setHitPad] = useState(null);
  const [skills, setSkills] = useState({ timing: null, evenness: null });
  const hitClearRef = useRef(null);
  const hitListeners = useRef(new Set());
  const subscribeHits = useCallback((fn) => {
    hitListeners.current.add(fn);
    return () => hitListeners.current.delete(fn);
  }, []);
  const [skillLog, setSkillLog] = useState(persisted.skillLog || []);
  const logSkill = useCallback((entry) => {
    setSkillLog((prev) => {
      const next = [{ ...entry, at: Date.now() }, ...prev].slice(0, 50);
      saveStore({ skillLog: next });
      return next;
    });
  }, []);

  const registerHit = useCallback((h) => {
    hitListeners.current.forEach((fn) => fn(h));
    setHits((prev) => [...prev, h]);
    setRecentHits((prev) => [...prev.slice(-30), h]);
    const padId = NOTE_TO_PAD[h.note];
    if (padId) {
      setHitPad(padId);
      clearTimeout(hitClearRef.current);
      hitClearRef.current = setTimeout(() => setHitPad(null), 220);
    }
    // light-weight skill read-out from inter-onset intervals
    setRecentHits((prev) => {
      const arr = [...prev];
      if (arr.length >= 4) {
        const iois = [];
        for (let i = 1; i < arr.length; i++) iois.push(arr[i].t - arr[i - 1].t);
        const mean = iois.reduce((a, b) => a + b, 0) / iois.length;
        const variance = iois.reduce((a, b) => a + (b - mean) ** 2, 0) / iois.length;
        const sd = Math.sqrt(variance);
        const evenness = Math.max(0, Math.min(100, Math.round(100 - (sd / mean) * 100)));
        const timing = Math.round(Math.min(120, sd));
        setSkills({ timing, evenness });
      }
      return prev;
    });
  }, []);

  const { status, deviceName, connect } = useMidi(registerHit);

  const simulate = useCallback(() => {
    const order = [38, 42, 38, 42, 36, 38];
    let i = 0;
    const fire = () => {
      registerHit({ note: order[i % order.length], velocity: 70 + ((i * 13) % 50), t: performance.now() });
      i++;
      if (i < 6) setTimeout(fire, 230);
    };
    fire();
  }, [registerHit]);

  const sessions = hits.length
    ? [{ label: "Current session", detail: `${hits.length} hits · ${skills.evenness ?? "—"}% even` }]
    : [];

  const NAV = [
    { id: "setup", label: "Setup" },
    { id: "kit", label: "Kit" },
    { id: "lessons", label: "Lessons" },
    { id: "practice", label: "Practice" },
    { id: "songs", label: "Songs" },
    { id: "progress", label: "Progress" },
  ];

  const resetData = () => {
    try { localStorage.removeItem(LS_KEY); } catch {}
    setConfirmed(false); setProgress({ done: [] }); setLayout(defaultLayout());
    setSkillLog([]); setView("setup");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.bone, fontFamily: FONT_DISPLAY }}>
      <GlobalStyles />
      <style>{`
        @media (max-width: 720px) {
          .dc-grid { grid-template-columns: 1fr !important; }
          .dc-topnav { display: none !important; }
          .dc-botnav { display: flex !important; }
          .dc-main { padding-bottom: 84px !important; }
        }
        .dc-botnav { display: none; }
      `}</style>

      {/* Top bar */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(21,18,14,0.92)",
        backdropFilter: "blur(10px)", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "13px 22px",
          display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${T.brass}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              font: `800 14px ${FONT_DISPLAY}`, color: T.brass }}>◎</span>
            <span style={{ font: `800 17px ${FONT_DISPLAY}`, letterSpacing: "0.04em", color: T.bone }}>
              DREAM<span style={{ color: T.brass }}>DRUM</span>
            </span>
          </div>
          <nav className="dc-topnav" style={{ display: "flex", gap: 4, flex: 1 }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setView(n.id)} className="dc-focus"
                style={{ font: `600 13px ${FONT_DISPLAY}`, padding: "8px 14px", borderRadius: 8,
                  cursor: "pointer", border: "none", background: view === n.id ? T.bgCard : "transparent",
                  color: view === n.id ? T.brassHi : T.boneDim }}>
                {n.label}
              </button>
            ))}
          </nav>
          <ConnChip status={status} deviceName={deviceName} onConnect={connect} />
          {onSignOut && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {displayName && (
                <span style={{ font: `700 11px ${FONT_MONO}`, color: T.boneDim, maxWidth: 140,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={userEmail || ""}>
                  {displayName}
                </span>
              )}
              <button onClick={onSignOut} className="dc-focus" title="Sign out"
                style={{ font: `700 11px ${FONT_MONO}`, color: T.boneDim, background: "none",
                  border: `1px solid ${T.line}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="dc-main" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 22px 60px" }}>
        {view === "setup" && (
          <SetupView confirmed={confirmed} onConfirm={() => { setConfirmed(true); setView("lessons"); }}
            photo={photo} setPhoto={setPhoto}
            layout={layout} moveLayout={moveLayout} resetLayout={resetLayout} />
        )}
        {view === "kit" && (
          <KitView hitPad={hitPad} layout={layout} moveLayout={moveLayout} resetLayout={resetLayout} />
        )}
        {view === "lessons" && (
          <LessonsView progress={progress} setProgress={setProgress} go={setView} skills={skills}
            subscribeHits={subscribeHits} midiStatus={status} onConnect={connect} />
        )}
        {view === "practice" && (
          <PracticeView midiStatus={status} onConnect={connect} recentHits={recentHits}
            hits={hits} skills={skills} simulate={simulate}
            subscribeHits={subscribeHits} logSkill={logSkill} />
        )}
        {view === "songs" && (
          <SongsView subscribeHits={subscribeHits} midiStatus={status} onConnect={connect} />
        )}
        {view === "progress" && <ProgressView progress={progress} hits={hits} sessions={sessions} skillLog={skillLog} onReset={resetData} />}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="dc-botnav" style={{ position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(21,18,14,0.96)", backdropFilter: "blur(10px)", borderTop: `1px solid ${T.line}`,
        padding: "8px 6px", justifyContent: "space-around", zIndex: 10 }}>
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ font: `600 11px ${FONT_DISPLAY}`, padding: "6px 8px", borderRadius: 8, cursor: "pointer",
              border: "none", background: "transparent", color: view === n.id ? T.brassHi : T.steel,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999,
              background: view === n.id ? T.brass : "transparent" }} />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
