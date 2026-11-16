import assert from "node:assert/strict";
import test from "node:test";
import {
  BAD_DRAW,
  createDrift,
  drunkenness,
  createInkWidth,
  roundResult,
} from "../shared/badDraw.js";
import { BAD_DRAW_WORDS, DIFFICULTIES, createWordPicker, wordsAt } from "../shared/badDrawWords.js";

const SOBER = { ...BAD_DRAW, ramp: 1, hiccupEvery: 0 };
const length = ({ x, y }) => Math.hypot(x, y);

test("drift changes smoothly, varies by seed and stays within the logical ink offset", () => {
  const drift = createDrift(41, SOBER);
  const points = Array.from({ length: 1201 }, (_, i) =>
    drift(i * BAD_DRAW.sampleMs),
  );
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(
    points.every(({ x, y }) => Math.hypot(x, y) <= BAD_DRAW.amplitude + 1e-9),
  );
  assert.ok(
    points.slice(1).every((point, i) => distance(point, points[i]) < 4),
  );
  assert.ok(points.some((point) => distance(point, points[0]) > BAD_DRAW.amplitude * 0.8),
  );
  assert.deepEqual(drift(1250), createDrift(41, SOBER)(1250));
  assert.notDeepEqual(drift(1250), createDrift(17, SOBER)(1250));
  assert.notDeepEqual(drift(1250), drift(4250));
});

test("the drawer gets drunker: drift reaches further late in the round, smoothly", () => {
  const config = { ...SOBER, ramp: 2 };
  const { duration, sampleMs } = config;
  const samples = (drift, from, to) =>
    Array.from({ length: Math.round((to - from) / sampleMs) }, (_, i) =>
      length(drift(from + i * sampleMs)),
    );
  const mean = (values) => values.reduce((a, b) => a + b) / values.length;
  let early = 0,
    late = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const drift = createDrift(seed * 7919, config);
    early += mean(samples(drift, 0, duration * 0.15));
    late += mean(samples(drift, duration * 0.85, duration));
    const all = Array.from({ length: duration / sampleMs }, (_, i) =>
      drift(i * sampleMs),
    );
    assert.ok(all.every((p) => length(p) <= 2 * config.amplitude + 1e-9));
    // Speeding up integrates the phase, so even the drunkest stretch is smooth.
    assert.ok(
      all
        .slice(1)
        .every(
          (p, i) => Math.hypot(p.x - all[i].x, p.y - all[i].y) < 8,
        ),
    );
  }
  assert.ok(late > early * 1.5);
  assert.ok(
    Math.abs(drunkenness(duration / 2, duration, 2) - 1.5) < 1e-9 &&
      drunkenness(-5, duration, 2) === 1 &&
      drunkenness(duration * 3, duration, 2) === 2,
  );
});

test("hiccups jolt the ink briefly, then the drift carries on as before", () => {
  // 15 hiccups in a 60 s round: one in each 4 s stretch.
  const config = { ...SOBER, hiccupEvery: 4000, duration: 60_000 };
  const sober = createDrift(5, SOBER),
    hic = createDrift(5, config);
  const jolts = Array.from({ length: 60_000 / BAD_DRAW.sampleMs }, (_, i) => {
    const t = i * BAD_DRAW.sampleMs;
    const a = sober(t),
      b = hic(t);
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  const active = jolts.filter((d) => d > 1e-9).length * BAD_DRAW.sampleMs;
  // One hiccup per 4 s window, each lasting about hiccupMs.
  assert.ok(Math.abs(active - 15 * config.hiccupMs) < 15 * 2 * BAD_DRAW.sampleMs);
  assert.ok(Math.max(...jolts) > config.hiccupSize * 0.95);
  assert.ok(Math.max(...jolts) <= config.hiccupSize + 1e-9);
  assert.deepEqual(createDrift(5, { ...config, hiccupEvery: 0 })(1234), sober(1234));
  // The page is told about each hiccup once, by id, while it is happening.
  const ids = new Set();
  for (let t = 0; t < 60_000; t += BAD_DRAW.sampleMs) {
    const h = hic.hiccup(t);
    if (h) ids.add(h.id);
    assert.equal(Boolean(h), jolts[Math.round(t / BAD_DRAW.sampleMs)] > 1e-9);
  }
  assert.equal(ids.size, 15);
  assert.equal(sober.hiccup(1234), null);
  // The default round gets exactly its hiccups, all before the clock runs out.
  for (let seed = 1; seed <= 20; seed++) {
    const drift = createDrift(seed);
    const seen = new Set();
    for (let t = 0; t < BAD_DRAW.duration; t += BAD_DRAW.sampleMs) {
      const h = drift.hiccup(t);
      if (h) seen.add(h.id);
    }
    assert.equal(seen.size, 4); // 30 s / 8 s, rounded
  }
});

test("the deadline beats a simultaneous Correct; the score uses remaining time", () => {
  const end = BAD_DRAW.duration;
  assert.deepEqual(roundResult(true, end, 0), {
    success: true,
    remaining: end,
    score: 100,
  });
  assert.equal(roundResult(true, end, end / 4).score, 75);
  assert.equal(roundResult(true, end, end / 2).score, 50);
  assert.equal(roundResult(true, end, end - 1).success, true);
  assert.deepEqual(roundResult(true, end, end), {
    success: false,
    remaining: 0,
    score: 0,
  });
  assert.equal(roundResult(true, end, end + 1).score, 0);
});

test("the session word bank is deterministic with host randomness and exhausts before repeating", () => {
  const prompts = wordsAt();
  const bank = new Set(prompts);
  assert.ok(bank.size >= 1000);
  assert.equal(bank.size, prompts.length);
  const make = () => createWordPicker({ random: () => 0.42 });
  const first = make(),
    second = make();
  let previous;
  const count = bank.size;
  for (let i = 0; i < count + 1; i++) {
    const drawer = i % 2;
    const word = first(drawer);
    assert.equal(word, second(drawer));
    assert.notEqual(word, previous);
    if (i < count) assert.ok(bank.delete(word));
    previous = word;
  }
  assert.equal(bank.size, 0);
  assert.equal(createWordPicker({ words: [] })("solo"), "kite");
  const only = createWordPicker({ words: ["owl"] });
  assert.equal(only(1), only(1));
});

test("after exhaustion a drawer gets a word they haven't seen when one is available", () => {
  const pick = createWordPicker({
    words: ["kite", "owl", "frog"],
    random: () => 0,
  });
  assert.equal(pick("a"), "kite");
  assert.equal(pick("b"), "owl");
  assert.equal(pick("b"), "frog");
  assert.equal(pick("a"), "owl");
});

test("every category tags its words easy, medium, or hard", () => {
  for (const category of Object.values(BAD_DRAW_WORDS)) {
    assert.deepEqual(Object.keys(category), [...DIFFICULTIES]);
  }
  for (const difficulty of DIFFICULTIES) {
    assert.ok(wordsAt([difficulty]).length > 0);
  }
});

test("ink swells and thins a few times a round, smoothly and by seed", () => {
  const config = { ...BAD_DRAW, strokeWidth: 5, inkSwell: 2.2, inkSwells: 3 };
  const { duration, sampleMs } = config;
  const width = createInkWidth(7, config);
  const widths = Array.from({ length: Math.ceil(duration / sampleMs) + 1 }, (_, i) =>
    width(i * sampleMs),
  );
  const thick = 5 * 2.2,
    thin = 5 / Math.sqrt(2.2);
  assert.ok(widths.every((w) => w >= thin - 1e-9 && w <= thick + 1e-9));
  assert.ok(widths.slice(1).every((w, i) => Math.abs(w - widths[i]) < 0.2));
  // Count swells: crossings up through the middle width.
  const mid = (thick + thin) / 2;
  const swells = widths.slice(1).filter((w, i) => widths[i] < mid && w >= mid).length;
  assert.equal(swells, 3);
  assert.equal(width(4000), createInkWidth(7, config)(4000));
  assert.notEqual(width(4000), createInkWidth(8, config)(4000));
  const steady = createInkWidth(7, { ...config, inkSwell: 1 });
  assert.ok(widths.every((_, i) => steady(i * sampleMs) === 5));
});
