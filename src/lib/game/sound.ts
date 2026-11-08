/**
 * Synthesized sound: short cues for feedback (a build, a coin, a refusal, a
 * fanfare) and a very quiet mountain bed underneath (wind, a distant lift).
 *
 * Generated with WebAudio rather than loaded from files, so there is nothing
 * to download and nothing to license. Off until the first user gesture (the
 * browser would refuse anyway), and remembered per device. Effects and the
 * ambient bed are switched separately.
 */
const KEY = "ski-alpina-sound";
const AMBIENT_KEY = "ski-alpina-ambient";

let ctx: AudioContext | null = null;
let fxBus: AudioNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function readOn(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function writeOn(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

export function soundEnabled(): boolean {
  return readOn(KEY);
}

export function setSoundEnabled(on: boolean): void {
  writeOn(KEY, on);
}

export function ambientEnabled(): boolean {
  return readOn(AMBIENT_KEY);
}

export function setAmbientEnabled(on: boolean): void {
  writeOn(AMBIENT_KEY, on);
  if (on) startAmbient();
  else stopAmbient();
}

/** The one AudioContext, whatever is switched on. */
function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended" && document.visibilityState !== "hidden") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** The context for effects, or null while effects are off. */
function audio(): AudioContext | null {
  return soundEnabled() ? context() : null;
}

/** Effects go through a gentle compressor so a fanfare over a build never clips. */
function bus(a: AudioContext): AudioNode {
  if (!fxBus) {
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(a.destination);
    fxBus = comp;
  }
  return fxBus;
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(a.sampleRate * 2);
    noiseBuf = a.createBuffer(1, len, a.sampleRate);
    const data = noiseBuf.getChannelData(0);
    // Pinkish: a running average softens white noise toward wind and snow.
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.86 + (Math.random() * 2 - 1) * 0.14;
      data[i] = last * 3.2;
    }
  }
  return noiseBuf;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** Frequency the tone glides to over its length. */
  to?: number;
  attack?: number;
  /** Lowpass cutoff, for softer square and saw waves. */
  lowpass?: number;
}

function tone(freq: number, start: number, length: number, o: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = o.type ?? "sine";
  const t0 = a.currentTime + start;
  osc.frequency.setValueAtTime(freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + length);
  const peak = o.gain ?? 0.08;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peak, t0 + (o.attack ?? 0.012));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  let out: AudioNode = env;
  if (o.lowpass) {
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lowpass;
    env.connect(lp);
    out = lp;
  }
  osc.connect(env);
  out.connect(bus(a));
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

/** A burst of filtered noise: snow crunching, a puff of air. */
function hiss(start: number, length: number, cutoff: number, gain: number) {
  const a = audio();
  if (!a) return;
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  const env = a.createGain();
  const t0 = a.currentTime + start;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  src.connect(lp).connect(env).connect(bus(a));
  src.start(t0, Math.random());
  src.stop(t0 + length + 0.02);
}

export type Cue = "build" | "coin" | "error" | "round" | "levelup" | "medal" | "fanfare" | "click";

export function play(cue: Cue): void {
  switch (cue) {
    case "click":
      tone(880, 0, 0.06, { type: "triangle", gain: 0.04 });
      break;
    case "build":
      // A heavy, soft «thunk»: a falling low thud, the crunch of snow under
      // it, and a small bright confirmation on top.
      tone(150, 0, 0.22, { to: 52, gain: 0.26, attack: 0.004 });
      hiss(0, 0.12, 900, 0.09);
      tone(587.33, 0.05, 0.14, { type: "triangle", gain: 0.03 });
      tone(880, 0.1, 0.18, { type: "triangle", gain: 0.022 });
      break;
    case "coin":
      // «Ching»: two high partials, one bell overtone, a quick sparkle.
      tone(1567.98, 0, 0.35, { gain: 0.045, attack: 0.003 });
      tone(2093, 0.055, 0.5, { gain: 0.04, attack: 0.003 });
      tone(2093 * 2.76, 0.055, 0.18, { gain: 0.008, attack: 0.002 });
      break;
    case "error":
      // «Bonk»: low and round, a dull knock rather than a buzzer.
      tone(196, 0, 0.16, { to: 120, gain: 0.14, attack: 0.004 });
      tone(98, 0, 0.2, { type: "triangle", gain: 0.06, lowpass: 400 });
      break;
    case "round":
      tone(392, 0, 0.35, { gain: 0.06 });
      tone(493.88, 0.04, 0.35, { gain: 0.05 });
      tone(587.33, 0.08, 0.45, { gain: 0.05 });
      break;
    case "levelup":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(f, i * 0.09, 0.3, { type: "triangle", gain: 0.07 }),
      );
      break;
    case "medal":
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, i * 0.11, 0.45, { gain: 0.07 }));
      break;
    case "fanfare": {
      // A short brass-like arpeggio up to the octave, then the chord held
      // and a sprinkle on top: festive, over in under two seconds.
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((f, i) =>
        tone(f, i * 0.1, 0.24, { type: "sawtooth", gain: 0.05, lowpass: 2400, attack: 0.02 }),
      );
      [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
        tone(f, 0.42, 1.1, { type: "sawtooth", gain: 0.03, lowpass: 1800, attack: 0.03 }),
      );
      tone(261.63, 0.42, 1.2, { type: "triangle", gain: 0.06 });
      [2093, 2637, 3136].forEach((f, i) =>
        tone(f, 0.5 + i * 0.07, 0.4, { gain: 0.012, attack: 0.003 }),
      );
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// The mountain bed: wind and a distant lift, very low, looping.
// ---------------------------------------------------------------------------

interface Bed {
  master: GainNode;
  hum: GainNode;
  stop: () => void;
}

let bed: Bed | null = null;
let armed = false;
let gestured = false;
/** Lifts in the resort; the hum is there only once one runs. */
let liftCount = 0;

const BED_GAIN = 0.55;
const HUM_GAIN = 0.0045;

function humLevel(): number {
  return liftCount > 0 ? HUM_GAIN * Math.min(1, 0.5 + liftCount * 0.12) : 0;
}

function buildBed(a: AudioContext): Bed {
  const master = a.createGain();
  master.gain.value = 0;
  master.connect(a.destination);

  // Wind: noise through a wandering band-pass, its loudness breathing slowly.
  const wind = a.createBufferSource();
  wind.buffer = noise(a);
  wind.loop = true;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 420;
  band.Q.value = 0.8;
  const windGain = a.createGain();
  windGain.gain.value = 0.022;
  wind.connect(band).connect(windGain).connect(master);
  const gust = a.createOscillator();
  gust.frequency.value = 0.07;
  const gustDepth = a.createGain();
  gustDepth.gain.value = 0.011;
  gust.connect(gustDepth).connect(windGain.gain);
  const sweep = a.createOscillator();
  sweep.frequency.value = 0.043;
  const sweepDepth = a.createGain();
  sweepDepth.gain.value = 220;
  sweep.connect(sweepDepth).connect(band.frequency);

  // A lift far off: a low electric hum with the slow rhythm of a cable.
  const hum = a.createGain();
  hum.gain.value = humLevel();
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 160;
  const motor = a.createOscillator();
  motor.type = "sawtooth";
  motor.frequency.value = 50;
  const motor2 = a.createOscillator();
  motor2.frequency.value = 100.6;
  const motor2Gain = a.createGain();
  motor2Gain.gain.value = 0.5;
  motor.connect(lp);
  motor2.connect(motor2Gain).connect(lp);
  const trem = a.createGain();
  trem.gain.value = 1;
  lp.connect(trem).connect(hum).connect(master);
  const rhythm = a.createOscillator();
  rhythm.frequency.value = 0.35;
  const rhythmDepth = a.createGain();
  rhythmDepth.gain.value = 0.25;
  rhythm.connect(rhythmDepth).connect(trem.gain);

  const sources = [wind, gust, sweep, motor, motor2, rhythm];
  for (const s of sources) s.start();
  master.gain.linearRampToValueAtTime(BED_GAIN, a.currentTime + 3);
  return {
    master,
    hum,
    stop: () => {
      const t = a.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.6);
      for (const s of sources) s.stop(t + 0.7);
      window.setTimeout(() => master.disconnect(), 800);
    },
  };
}

/** Start the bed, if switched on and a gesture has unlocked audio. */
export function startAmbient(): void {
  if (bed || !gestured || !ambientEnabled()) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const a = context();
  if (!a) return;
  bed = buildBed(a);
}

export function stopAmbient(): void {
  bed?.stop();
  bed = null;
}

/** How many lifts run, for the hum. */
export function setAmbientLifts(n: number): void {
  liftCount = n;
  if (bed && ctx) bed.hum.gain.linearRampToValueAtTime(humLevel(), ctx.currentTime + 1.5);
}

function onGesture() {
  gestured = true;
  startAmbient();
}

function onVisibility() {
  if (!ctx) return;
  if (document.visibilityState === "hidden") void ctx.suspend();
  else if (bed || soundEnabled()) void ctx.resume();
}

/**
 * Let the bed start at the first tap, and pause everything while the page is
 * hidden. Returns the undo, for the component that armed it.
 */
export function armAudio(): () => void {
  if (typeof window === "undefined" || armed) return () => {};
  armed = true;
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    armed = false;
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    document.removeEventListener("visibilitychange", onVisibility);
    stopAmbient();
  };
}
