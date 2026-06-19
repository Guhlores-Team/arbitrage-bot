// Tiny dependency-free WebAudio SFX (no Tone.js). Degrades silently if the
// browser blocks audio; respects a persisted mute toggle.
let ctx: AudioContext | null = null;
let muted = localStorage.getItem("lq_mute") === "1";

export function isMuted(): boolean { return muted; }
export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem("lq_mute", muted ? "1" : "0");
  return muted;
}

function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", when = 0): void {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch { /* audio blocked — ignore */ }
}

export const sfxLoot = () => { tone(660, 0.1, "triangle"); tone(880, 0.12, "triangle", 0.07); tone(1175, 0.16, "triangle", 0.15); };
export const sfxAdvance = () => tone(440, 0.08, "square");
export const sfxLevel = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", i * 0.1));
