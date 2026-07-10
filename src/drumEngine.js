import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   DREAMDRUM — shared drum engine
   The kit model, Web MIDI hook, Web Audio metronome, and a
   sample-free drum synth. Shared by the grown-up course (App)
   and the kids' Space Cadets experience (KidsApp) so the
   TD-313 connection and sound live in exactly one place.
   ============================================================ */

/* ---------- Kit definition (maps to the physical TD-313) ---------- */
export const PADS = [
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

export const NOTE_TO_PAD = (() => {
  const m = {};
  PADS.forEach((p) => p.notes.forEach((n) => (m[n] = p.id)));
  return m;
})();

export const PADMAP = Object.fromEntries(PADS.map((p) => [p.id, p]));

/* ============================================================
   Hook: Web MIDI — detect the kit, parse note-on events
   ============================================================ */
export function useMidi(onHit) {
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
export function useMetronome(bpm, beatsPerBar, opts = {}) {
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
   Drum synth — simple Web Audio drum sounds (no samples needed)
   ============================================================ */
let _drumCtx = null;
let _drumNoise = null;
export function drumCtx() {
  if (!_drumCtx) _drumCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_drumCtx.state === "suspended") _drumCtx.resume();
  return _drumCtx;
}
export function drumNoise(ctx) {
  if (_drumNoise) return _drumNoise;
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _drumNoise = buf;
  return buf;
}
export function playDrum(padId, when, vel = 104) {
  const ctx = drumCtx();
  const t = when == null ? ctx.currentTime : when;
  const g = Math.max(0.2, Math.min(1, vel / 110));
  const env = (node, peak, dur) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak * g, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(gain).connect(ctx.destination);
  };
  const noise = (peak, dur, hpFreq) => {
    const n = ctx.createBufferSource(); n.buffer = drumNoise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = hpFreq;
    n.connect(hp); env(hp, peak, dur); n.start(t); n.stop(t + dur + 0.02);
  };
  const tone = (type, f0, f1, peak, dur) => {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    env(o, peak, dur); o.start(t); o.stop(t + dur + 0.02);
  };
  switch (padId) {
    case "kick": tone("sine", 150, 48, 1.0, 0.2); break;
    case "snare": noise(0.5, 0.18, 1400); tone("triangle", 180, 180, 0.28, 0.12); break;
    case "hihat": noise(0.32, 0.05, 7000); break;
    case "tom1": tone("sine", 240, 150, 0.8, 0.28); break;
    case "tom2": tone("sine", 180, 110, 0.8, 0.3); break;
    case "tom3": tone("sine", 120, 72, 0.85, 0.34); break;
    case "crash": noise(0.4, 0.8, 5000); break;
    case "ride": noise(0.22, 0.4, 6500); tone("square", 520, 520, 0.07, 0.3); break;
    default: noise(0.4, 0.15, 2000);
  }
}
