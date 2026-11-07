/**
 * Small synthesized sounds for feedback: a build, a round played, a level-up.
 *
 * Generated with WebAudio rather than loaded from files, so there is nothing
 * to download and nothing to license. Off until the first user gesture (the
 * browser would refuse anyway), and remembered per device.
 */
const KEY = "ski-alpina-sound";

let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !soundEnabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, length: number, type: OscillatorType = "sine", gain = 0.08) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = a.currentTime + start;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(env).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

export type Cue = "build" | "error" | "round" | "levelup" | "medal" | "click";

export function play(cue: Cue): void {
  switch (cue) {
    case "click":
      tone(880, 0, 0.06, "triangle", 0.04);
      break;
    case "build":
      tone(523.25, 0, 0.12, "triangle");
      tone(783.99, 0.07, 0.16, "triangle");
      break;
    case "error":
      tone(220, 0, 0.14, "square", 0.035);
      tone(185, 0.09, 0.18, "square", 0.035);
      break;
    case "round":
      tone(392, 0, 0.35, "sine", 0.06);
      tone(493.88, 0.04, 0.35, "sine", 0.05);
      tone(587.33, 0.08, 0.45, "sine", 0.05);
      break;
    case "levelup":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.3, "triangle", 0.07));
      break;
    case "medal":
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, i * 0.11, 0.45, "sine", 0.07));
      break;
  }
}
