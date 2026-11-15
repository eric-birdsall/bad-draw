export const BAD_DRAW = Object.freeze({
  duration: 90_000,
  width: 960,
  height: 600,
  amplitude: 24,
  frequency: 1.8,
  // Share of the wander that comes from a slow lean (about a quarter the speed).
  lean: 0.35,
  // Distance and speed multiplier reached by the end of the round.
  ramp: 1.6,
  // Hiccups per round (0 turns them off), their reach and length. The round is
  // split into this many equal stretches, with one hiccup at a random moment
  // in each.
  hiccups: 5,
  hiccupSize: 45,
  hiccupMs: 320,
  strokeWidth: 5,
  ink: "#233c36",
  undo: 2,
  clear: 1,
  sampleMs: 1000 / 120,
  sampleDistance: 5,
  urgentSeconds: 10,
});

export const DRAW_PHASE = Object.freeze({
  READY: "ready",
  REVEAL: "reveal",
  PLAYING: "playing",
  RESULTS: "results",
});

/** How drunk the drawer is `ms` into a round: 1 at the start, `ramp` at the end. */
export function drunkenness(ms, duration, ramp) {
  return 1 + (ramp - 1) * Math.min(1, Math.max(0, ms / duration));
}

/** Seeded smooth value noise, sampled at continuous time, with independent
 * fields on each axis. A second octave keeps the wander from feeling regular,
 * and a slow lean makes the hand sway one way for a while. Distance and speed
 * grow over the round, and occasional hiccups jolt the ink out and back.
 * `config` is read on every call so live tuning applies at once. */
export function createDrift(seed, config = BAD_DRAW, duration = config.duration) {
  const lattice = (i, salt) => {
    let n = Math.imul(i ^ seed, 0x9e3779b1) ^ salt;
    n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
    n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
    return ((n ^ (n >>> 15)) >>> 0) / 0x7fffffff - 1;
  };
  const noise = (t, salt) => {
    const i = Math.floor(t);
    const u = t - i;
    const eased = u * u * u * (u * (u * 6 - 15) + 10);
    const a = lattice(i, salt);
    return a + (lattice(i + 1, salt) - a) * eased;
  };
  const axis = (t, salt) => {
    const wobble =
      noise(t, salt) * 0.78 + noise(t * 2.37, salt ^ 0x75bc0b) * 0.22;
    const lean = Math.min(1, Math.max(0, config.lean));
    return wobble * (1 - lean) + noise(t * 0.23, salt ^ 0x2c1b3c) * lean;
  };
  // Integrated so the speed-up never jumps the noise phase.
  const phase = (seconds) => {
    const end = duration / 1000;
    const k = config.ramp - 1;
    const early = Math.min(seconds, end);
    const late = seconds - early;
    return (
      config.frequency *
      (early + (k * early * early) / (2 * end) + (1 + k) * late)
    );
  };
  /** The hiccup in progress, if any: `id` is unique per hiccup in a round,
   * `angle` is the jolt direction and `x`/`y` its current offset. */
  const hiccup = (timeMs) => {
    if (!(config.hiccups > 0) || !config.hiccupSize) return null;
    const gap = duration / config.hiccups;
    const window = Math.floor(timeMs / gap);
    const start = (window + 0.15 + 0.35 * (lattice(window, 0x5d1c07) + 1)) * gap;
    const progress = (timeMs - start) / config.hiccupMs;
    if (progress <= 0 || progress >= 1) return null;
    // Snaps out quickly, then eases back.
    const reach = config.hiccupSize * Math.sin(Math.PI * Math.sqrt(progress));
    const angle = Math.PI * lattice(window, 0x1b873f);
    return {
      id: `${gap}:${window}`,
      angle,
      x: Math.cos(angle) * reach,
      y: Math.sin(angle) * reach,
    };
  };
  const drift = (timeMs) => {
    const t = phase(timeMs / 1000);
    const x = axis(t, 0x463e4a);
    const y = axis(t, 0x413ff7);
    const amplitude =
      config.amplitude * drunkenness(timeMs, duration, config.ramp);
    const scale = amplitude / Math.max(1, Math.hypot(x, y));
    const jolt = hiccup(timeMs) || { x: 0, y: 0 };
    return { x: x * scale + jolt.x, y: y * scale + jolt.y };
  };
  drift.hiccup = hiccup;
  return drift;
}

/** Shared by Correct and the frame timer so the deadline always wins ties. */
export function roundResult(
  correct,
  deadline,
  now,
  duration = BAD_DRAW.duration,
) {
  const remaining = Math.max(0, Math.min(duration, deadline - now));
  const success = correct && remaining > 0;
  return {
    success,
    remaining,
    score: success ? Math.round((100 * remaining) / duration) : 0,
  };
}
