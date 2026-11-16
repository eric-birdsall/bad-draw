export const BAD_DRAW = Object.freeze({
  duration: 30_000,
  width: 960,
  height: 600,
  amplitude: 30,
  frequency: 2.3,
  // Share of the wander that comes from a slow lean (about a quarter the speed).
  lean: 0.45,
  // Distance and speed multiplier reached by the end of the round.
  ramp: 1.75,
  // About one hiccup per this many ms (0 turns them off), their reach and
  // length. A round gets duration / hiccupEvery hiccups, rounded; it is split
  // into that many equal stretches, with one hiccup at a random moment in each.
  hiccupEvery: 8000,
  hiccupSize: 52,
  hiccupMs: 320,
  strokeWidth: 5,
  // Ink width swells to this multiple at its thickest and thins to one over
  // its square root between (1 keeps it steady), this many times a round.
  inkSwell: 2.2,
  inkSwells: 3,
  undo: 1,
  clear: 1,
  sampleMs: 1000 / 120,
  sampleDistance: 5,
  urgentSeconds: 8,
});

export const DRAW_PHASE = Object.freeze({
  READY: "ready",
  REVEAL: "reveal",
  PLAYING: "playing",
  RESULTS: "results",
});

/** Hiccups in a round of `duration` ms: one per `every` ms, rounded, at least one. */
export function hiccupCount(duration, every) {
  return every > 0 ? Math.max(1, Math.round(duration / every)) : 0;
}

/** How drunk the drawer is `ms` into a round: 1 at the start, `ramp` at the end. */
export function drunkenness(ms, duration, ramp) {
  return 1 + (ramp - 1) * Math.min(1, Math.max(0, ms / duration));
}

/** Ink width over a round: it swells and thins `inkSwells` times at seeded,
 * slightly uneven moments and sizes. Thickest is `strokeWidth * inkSwell`,
 * thinnest `strokeWidth / sqrt(inkSwell)`. Returns a function of ms. */
export function createInkWidth(seed, config = BAD_DRAW, duration = config.duration) {
  let state = (seed ^ 0x5bd1e995) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 0x100000000;
  };
  // Alternate thin and thick knots; each moves up to 30% of a step either way.
  const count = 2 * Math.max(1, Math.round(config.inkSwells));
  const step = duration / count;
  const knots = Array.from({ length: count + 2 }, (_, i) => ({
    t: i * step + (i ? (random() - 0.5) * 0.6 * step : 0),
    v: i % 2 ? 0.65 + 0.35 * random() : 0.25 * random(),
  }));
  return (ms) => {
    const t = Math.min(duration, Math.max(0, ms));
    let i = 0;
    while (knots[i + 1].t < t) i++;
    const a = knots[i],
      b = knots[i + 1];
    const u = (t - a.t) / (b.t - a.t);
    const v = a.v + (b.v - a.v) * u * u * (3 - 2 * u);
    return config.strokeWidth * config.inkSwell ** (1.5 * v - 0.5);
  };
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
    const count = hiccupCount(duration, config.hiccupEvery);
    if (!count || !config.hiccupSize) return null;
    const gap = duration / count;
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
