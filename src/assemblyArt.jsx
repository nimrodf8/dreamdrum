import React from "react";

/* ============================================================
   Assembly illustrations — shared by the grown-up guide and the
   kids' "Build Your Drums" screen. Stage-by-stage SVG diagrams
   drawn in the realistic kit style. Two ways to drive it:
     • step  (1–9)  — the nine guide steps (parts, wiring, test…)
     • level (1–10) — a fine-grained build, one piece at a time,
                      for the "at a glance" overview strip.
   Colours are self-contained so it drops into either theme.
   ============================================================ */
const A = { brass: "#D6A24A", strike: "#F2A33C", steel: "#8A8170" };
const MONO = "'Space Mono', ui-monospace, monospace";

export function AssemblyArt({ step, level }) {
  const FLOOR = 176;
  const L = level != null;

  // per-piece visibility, from either the fine `level` or the guide `step`
  const inStep = (a, b) => (step >= a && step <= b) || step === 8;
  const legs = L ? level >= 1 : inStep(2, 6);
  const top = L ? level >= 2 : inStep(2, 6);
  const mod = L ? level >= 3 : inStep(3, 6);
  const kick = L ? level >= 4 : inStep(4, 6);
  const snare = L ? level >= 5 : inStep(4, 6);
  const toms = L ? level >= 6 : inStep(4, 6);
  const hihat = L ? level >= 7 : inStep(5, 6);
  const crash = L ? level >= 8 : inStep(5, 6);
  const ride = L ? level >= 9 : inStep(5, 6);
  const seat = L ? level >= 10 : step === 6 || step === 8;
  const kickGlow = !L && step === 8;

  const Pipe = ({ x1, y1, x2, y2, w = 6 }) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2A2620" strokeWidth={w} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5A5142" strokeWidth={Math.max(1, w * 0.28)} strokeLinecap="round" opacity="0.6" />
    </g>
  );
  const Clamp = ({ x, y }) => <rect x={x - 5} y={y - 4} width="10" height="8" rx="2" fill={A.brass} stroke="#1A1712" strokeWidth="0.8" />;
  const Drum = ({ x, y, r = 20, glow }) => {
    const ry = r * 0.4, depth = r * 0.55, rim = glow ? A.strike : "#4C4636";
    return (
      <g>
        <path d={`M ${x - r},${y} L ${x - r},${y + depth} A ${r},${ry} 0 0 0 ${x + r},${y + depth} L ${x + r},${y} A ${r},${ry} 0 0 1 ${x - r},${y} Z`} fill="url(#aShell)" stroke="#1A1712" strokeWidth="0.8" />
        <ellipse cx={x} cy={y} rx={r} ry={ry} fill="url(#aMesh)" stroke={rim} strokeWidth={glow ? 2.6 : 1.8} />
        {glow && <ellipse cx={x} cy={y} rx={r + 4} ry={ry + 4} fill="none" stroke={A.strike} strokeWidth="2" opacity="0.7" />}
      </g>
    );
  };
  const Cymbal = ({ x, y, r = 22, drop = 30 }) => (
    <g>
      <Pipe x1={x} y1={y + 2} x2={x} y2={y + drop} w={3} />
      <ellipse cx={x} cy={y + 2} rx={r} ry={r * 0.26} fill="#12100B" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.26} fill="url(#aCym)" stroke="#5A5038" strokeWidth="1.2" />
      <ellipse cx={x} cy={y} rx={r * 0.15} ry={r * 0.13} fill="#6B5A33" />
    </g>
  );
  const Kick = ({ x, y, glow }) => (
    <g>
      <ellipse cx={x} cy={y + 20} rx="28" ry="5" fill="#000" opacity="0.3" />
      <circle cx={x} cy={y} r="20" fill="url(#aKick)" stroke={glow ? A.strike : "#4C4636"} strokeWidth={glow ? 2.6 : 2} />
      <circle cx={x} cy={y} r="14" fill="none" stroke="#0E0C08" strokeWidth="0.7" opacity="0.5" />
      <rect x={x - 6} y={y + 16} width="12" height="16" rx="3" fill="#241F18" stroke="#3B342A" strokeWidth="1" />
    </g>
  );
  const Module = ({ x, y, big }) => {
    const w = big ? 96 : 46, h = big ? 60 : 30;
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx="5" fill="#221E18" stroke="#3B342A" strokeWidth="1.2" />
        <rect x={x + w * 0.11} y={y + h * 0.16} width={w * 0.42} height={h * 0.4} rx="2" fill="#0C0A07" stroke="#3B342A" strokeWidth="0.6" />
        <rect x={x + w * 0.14} y={y + h * 0.22} width={w * 0.36} height={h * 0.28} rx="1" fill={A.brass} opacity="0.55" />
        <circle cx={x + w * 0.74} cy={y + h * 0.3} r={big ? 6 : 3.4} fill="#2E281F" stroke="#4A4232" strokeWidth="0.8" />
      </g>
    );
  };
  const Label = (x, y, t) => <text x={x} y={y} textAnchor="middle" fill={A.steel} style={{ font: `400 7px ${MONO}`, letterSpacing: "0.06em" }}>{t}</text>;

  return (
    <svg viewBox="0 0 320 200" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <radialGradient id="aCym" cx="42%" cy="32%"><stop offset="0%" stopColor="#544A33" /><stop offset="60%" stopColor="#3B3527" /><stop offset="100%" stopColor="#26221A" /></radialGradient>
        <radialGradient id="aMesh" cx="42%" cy="30%"><stop offset="0%" stopColor="#454037" /><stop offset="100%" stopColor="#23201A" /></radialGradient>
        <linearGradient id="aShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2A2620" /><stop offset="100%" stopColor="#16130E" /></linearGradient>
        <linearGradient id="aKick" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34301F" /><stop offset="100%" stopColor="#1B1812" /></linearGradient>
      </defs>
      <line x1="12" y1={FLOOR} x2="308" y2={FLOOR} stroke="#231F18" strokeWidth="1" opacity="0.6" />

      {/* ---------- Step 1: parts laid out ---------- */}
      {step === 1 && !L && (
        <g>
          <g transform="translate(58,70)"><Drum x={0} y={0} r={20} /></g>
          <g transform="translate(150,60)"><Cymbal x={0} y={0} r={22} drop={0} /></g>
          <g transform="translate(240,70)"><Kick x={0} y={0} /></g>
          <Pipe x1={40} y1={130} x2={110} y2={130} w={6} />
          <Module x={190} y={116} />
          <g transform="translate(150,132)">
            <rect x="-2" y="-14" width="4" height="20" rx="1.5" fill="#6A6253" />
            <rect x="-8" y="-16" width="16" height="6" rx="2" fill="#6A6253" />
          </g>
          {Label(58, 100, "PADS")}{Label(150, 96, "CYMBALS")}{Label(240, 100, "KICK")}
          {Label(75, 142, "RACK PIPES")}{Label(213, 158, "MODULE")}{Label(150, 146, "KEY")}
        </g>
      )}

      {/* ---------- Rack legs / uprights ---------- */}
      {legs && (
        <g>
          <ellipse cx="58" cy={FLOOR} rx="14" ry="4" fill="#000" opacity="0.25" />
          <ellipse cx="262" cy={FLOOR} rx="14" ry="4" fill="#000" opacity="0.25" />
          <Pipe x1={58} y1={FLOOR} x2={78} y2={112} />
          <Pipe x1={262} y1={FLOOR} x2={242} y2={108} />
          <Pipe x1={78} y1={112} x2={78} y2={54} />
          <Pipe x1={242} y1={108} x2={242} y2={50} />
          <Pipe x1={78} y1={96} x2={242} y2={92} w={5} />
        </g>
      )}
      {/* ---------- Top bar + clamps ---------- */}
      {top && (
        <g>
          <Pipe x1={70} y1={56} x2={250} y2={50} />
          <Clamp x={116} y={55} /><Clamp x={172} y={53} /><Clamp x={242} y={92} />
        </g>
      )}
      {mod && (
        <g><Pipe x1={40} y1={118} x2={62} y2={110} w={4} /><Module x={20} y={112} /></g>
      )}
      {kick && <Kick x={150} y={162} glow={kickGlow} />}
      {snare && (
        <g>
          <Pipe x1={150} y1={150} x2={136} y2={FLOOR} w={3} /><Pipe x1={150} y1={150} x2={164} y2={FLOOR} w={3} /><Pipe x1={150} y1={150} x2={150} y2={FLOOR} w={3} />
          <Drum x={150} y={138} r={24} />
        </g>
      )}
      {toms && (
        <g>
          <Pipe x1={116} y1={55} x2={116} y2={74} w={3} /><Drum x={116} y={78} r={19} />
          <Pipe x1={172} y1={53} x2={172} y2={74} w={3} /><Drum x={172} y={78} r={19} />
          <Pipe x1={242} y1={92} x2={236} y2={112} w={3} /><Drum x={236} y={116} r={22} />
        </g>
      )}
      {hihat && (
        <g>
          <Cymbal x={64} y={100} r={18} drop={FLOOR - 100 - 8} />
          <rect x={54} y={FLOOR - 6} width="22" height="8" rx="2" fill="#241F18" stroke="#3B342A" strokeWidth="1" />
        </g>
      )}
      {crash && (<g><Pipe x1={96} y1={52} x2={78} y2={54} w={3} /><Cymbal x={96} y={46} r={24} drop={30} /></g>)}
      {ride && (<g><Pipe x1={224} y1={50} x2={242} y2={50} w={3} /><Cymbal x={224} y={44} r={26} drop={30} /></g>)}
      {seat && (
        <g>
          <ellipse cx="292" cy={FLOOR} rx="16" ry="4" fill="#000" opacity="0.25" />
          <Pipe x1={292} y1={FLOOR} x2={284} y2={146} w={4} /><Pipe x1={292} y1={FLOOR} x2={300} y2={146} w={4} />
          <ellipse cx="292" cy="142" rx="18" ry="6" fill="#2A2620" stroke="#3B342A" strokeWidth="1" />
          {Label(150, 194, "▲ YOU")}
        </g>
      )}

      {/* ---------- Step 7: wire to the module ---------- */}
      {step === 7 && !L && (
        <g>
          <Module x={26} y={58} big />
          {["SNARE", "TOM1", "TOM2", "TOM3", "HH", "CR", "RD", "KICK"].map((lbl, i) => {
            const jx = 40 + i * 11, jy = 122;
            const px = 150 + (i % 4) * 38, py = i < 4 ? 70 : 150;
            return (
              <g key={lbl}>
                <circle cx={jx} cy={jy} r="3" fill="#0C0A07" stroke="#4A4232" strokeWidth="0.7" />
                <path d={`M ${jx},${jy + 3} C ${jx},${jy + 40} ${px},${py - 40} ${px},${py}`} fill="none" stroke={A.brass} strokeWidth="1.4" opacity="0.55" />
                <circle cx={px} cy={py} r="3.5" fill="none" stroke={A.brass} strokeWidth="1.4" />
                {Label(px, py + 13, lbl)}
              </g>
            );
          })}
          {Label(160, 22, "MATCH EACH CABLE TO ITS LABELLED INPUT")}
        </g>
      )}

      {/* ---------- Step 9: clamp + drum key ---------- */}
      {step === 9 && !L && (
        <g>
          <Pipe x1={70} y1={110} x2={250} y2={110} w={12} />
          <rect x={150} y={92} width="34" height="36" rx="4" fill="#2A2620" stroke={A.brass} strokeWidth="2" />
          <rect x={156} y={98} width="22" height="10" rx="2" fill={A.brass} />
          <g transform="translate(167,150)">
            <rect x="-3" y="-34" width="6" height="30" rx="2" fill="#7A705C" />
            <rect x="-11" y="-40" width="22" height="9" rx="2.5" fill="#7A705C" />
            <path d="M 26 -18 A 26 26 0 0 1 14 6" fill="none" stroke={A.strike} strokeWidth="2.4" markerEnd="url(#arw)" />
          </g>
          <defs><marker id="arw" markerWidth="7" markerHeight="7" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={A.strike} /></marker></defs>
          {Label(167, 76, "TIGHTEN FIRMLY")}
        </g>
      )}
    </svg>
  );
}
