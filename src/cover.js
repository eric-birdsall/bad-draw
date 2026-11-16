import { paperColors } from "./paperColors.js";

/* The main menu shows the same kite twice: once drawn sober, once drunk.
 * Both come from one set of strokes; the drunk one runs them through a
 * seeded wobble so it looks bad but still reads as a kite, and never
 * changes between visits. */

const TOP = [150, 34];
const LEFT = [74, 132];
const RIGHT = [226, 132];
const BOTTOM = [150, 258];

// Each stroke is a list of points, drawn as one pen line.
const FRAME = [
  [TOP, LEFT],
  [LEFT, BOTTOM],
  [BOTTOM, RIGHT],
  [RIGHT, TOP],
];
const SPARS = [
  [TOP, BOTTOM],
  [LEFT, RIGHT],
];
const TAIL = [BOTTOM, [126, 284], [138, 306], [168, 322], [150, 348]];
const BOWS = [
  [132, 296],
  [158, 330],
];

export function drawCover(pair) {
  const colors = paperColors();
  drawKite(pair.querySelector("[data-kite=sober]"), colors, false);
  drawKite(pair.querySelector("[data-kite=drunk]"), colors, true);
}

function drawKite(canvas, { ink, pencil }, drunk) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  const rand = seeded(drunk ? 41 : 7);

  const stroke = (color, points, width = 5) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  };

  if (!drunk) {
    for (const s of FRAME) stroke(ink, s);
    for (const s of SPARS) stroke(ink, s, 3.5);
    stroke(ink, smooth(TAIL), 3.5);
    for (const [x, y] of BOWS) bow(ctx, pencil, x, y, 0.35, 1);
    label(ctx, pencil, "sober", 196, 318, -0.06, null);
    return;
  }

  // Lean the whole kite over, squash one side, then wobble every line.
  const tilt = (x, y) => {
    const a = 0.2;
    const cx = 150;
    const cy = 150;
    const dx = (x - cx) * (x < cx ? 1.12 : 0.9);
    const dy = y - cy;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a) + 8, cy + dx * Math.sin(a) + dy * Math.cos(a) - 6];
  };
  const wobbly = (points, amount, overshoot) => {
    let line = points.map(([x, y]) => tilt(x, y));
    // Corners miss each other: the ends wander and overshoot.
    line = line.map(([x, y]) => [x + (rand() - 0.5) * amount * 2.6, y + (rand() - 0.5) * amount * 2.6]);
    if (overshoot) {
      const [a, b] = [line[0], line[line.length - 1]];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      line[0] = [a[0] - dx * overshoot * rand(), a[1] - dy * overshoot * rand()];
      line[line.length - 1] = [b[0] + dx * overshoot, b[1] + dy * overshoot];
    }
    return shake(densify(line, 6), amount, rand);
  };

  for (const s of FRAME) stroke(ink, wobbly(s, 5, 0.14));
  stroke(ink, wobbly(SPARS[0], 4, 0.08), 3.5);

  // A hiccup: the cross spar takes a sudden jag out and back.
  const spar = wobbly(SPARS[1], 4, 0.1);
  const mid = Math.floor(spar.length * 0.6);
  spar[mid] = [spar[mid][0] + 6, spar[mid][1] - 22];
  spar[mid + 1] = [spar[mid + 1][0] + 2, spar[mid + 1][1] + 10];
  stroke(ink, spar, 3.5);

  // The tail loops back on itself before carrying on down.
  const tail = smooth([BOTTOM, [118, 280], [96, 300], [112, 326], [140, 304], [130, 280], [114, 312], [150, 336], [176, 350]]);
  stroke(ink, shake(tail.map(([x, y]) => tilt(x, y)), 3, rand), 3.5);
  bow(ctx, pencil, ...tilt(96, 312), 1.1, 1.5);
  bow(ctx, pencil, ...tilt(170, 348), -0.6, 0.7);

  label(ctx, pencil, "drunk", 186, 300, 0.22, rand);
}

// A little bow tied on the tail: two loops, one sometimes bigger than the other.
function bow(ctx, color, x, y, angle, lopsided) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-16 * lopsided, -12 * lopsided, -14 * lopsided, 6 * lopsided);
  ctx.closePath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(16, -12, 14, 6);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// Hand-written caption. Drunk letters bob and lean on their own.
function label(ctx, color, text, x, y, angle, rand) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.font = "italic 26px Georgia, serif";
  if (!rand) {
    ctx.fillText(text, 0, 0);
  } else {
    let dx = 0;
    for (const ch of text) {
      ctx.save();
      ctx.translate(dx, (rand() - 0.5) * 12);
      ctx.rotate((rand() - 0.5) * 0.6);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      dx += ctx.measureText(ch).width + rand() * 3;
    }
  }
  ctx.restore();
}

// Catmull-Rom through the points, so the sober tail curves smoothly.
function smooth(points, steps = 10) {
  const out = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function densify(points, spacing) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / spacing));
    for (let s = 1; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n]);
  }
  return out;
}

// Slow sway plus a little tremble, like the in-game ink.
function shake(points, amount, rand) {
  const phase = rand() * 6;
  const freq = 0.12 + rand() * 0.1;
  return points.map(([x, y], i) => [
    x + Math.sin(i * freq + phase) * amount + (rand() - 0.5) * amount * 0.5,
    y + Math.cos(i * freq * 1.3 + phase) * amount + (rand() - 0.5) * amount * 0.5,
  ]);
}

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
