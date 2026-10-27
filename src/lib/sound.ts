let ctx: AudioContext | null = null;
let enabled = (() => { try { return localStorage.getItem('hdi.sound') !== '0'; } catch { return true; } })();
export const soundOn = () => enabled;
export function setSound(v: boolean) { enabled = v; try { localStorage.setItem('hdi.sound', v ? '1' : '0'); } catch { /* ignore */ } }
export function beep(f = 660, d = 0.08, type: OscillatorType = 'square', vol = 0.05) {
  if (!enabled) return;
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol; o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.02);
  } catch { /* audio unavailable */ }
}
