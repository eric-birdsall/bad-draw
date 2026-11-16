import { BAD_DRAW as C } from "../shared/badDraw.js";
import { paperColors } from "./paperColors.js";

/** Paint and retain actual ink points. The backing store can be rebuilt at
 * any display size without re-sampling drift or changing the geometry.
 * `size` is the paper in game units; each round picks its own shape. */
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// Points carry their own width `w` so the ink can swell mid-stroke.
function dot(ctx, p) {
  if (p.w) ctx.lineWidth = p.w;
  ctx.beginPath();
  ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
}

function segment(ctx, points, end) {
  const a = points[end - 2],
    b = points[end - 1],
    c = points[end];
  const from = a ? midpoint(a, b) : b,
    to = midpoint(b, c);
  if (b.w) ctx.lineWidth = b.w;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.quadraticCurveTo(b.x, b.y, to.x, to.y);
  ctx.stroke();
}

function tail(ctx, points) {
  if (points.length < 2) return;
  const last = points.at(-1),
    from = midpoint(points.at(-2), last);
  if (last.w) ctx.lineWidth = last.w;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

/** Paint whole strokes; `open` is the one still being drawn (no tail yet). */
function paintStrokes(ctx, strokes, open) {
  for (const { points, width } of strokes) {
    ctx.lineWidth = width;
    dot(ctx, points[0]);
    for (let i = 1; i < points.length; i++) segment(ctx, points, i);
    if (points !== open) tail(ctx, points);
  }
}

/** Fit `canvas`'s backing store to its display size and draw in game units. */
function fitCanvas(canvas, ctx, size) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr),
    height = Math.round(rect.height * dpr);
  if (width && height && (canvas.width !== width || canvas.height !== height)) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(canvas.width / size.width, 0, 0, canvas.height / size.height, 0, 0);
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = ctx.fillStyle = paperColors().ink;
}

/** Rebuild the strokes on the paper after the first `count` logged events. */
function strokesAt(log, count) {
  const strokes = [];
  let open;
  for (const event of log.slice(0, count)) {
    if (event.type === "begin") {
      open = [];
      strokes.push({ points: open, width: event.width });
    } else if (event.type === "point") open?.push(event);
    else if (event.type === "end") open = undefined;
    else if (event.type === "undo") strokes.pop(), (open = undefined);
    else if (event.type === "clear") (strokes.length = 0), (open = undefined);
  }
  return strokes.filter((s) => s.points.length);
}

/** Play a round's log back on `canvas`, with pen-up pauses shortened and the
 * whole thing sped up so it lasts at most `longest` ms. Returns a stop function. */
export function replayDrawing(canvas, log, size, { longest = 9000, onDone } = {}) {
  const ctx = canvas.getContext("2d");
  // Map round time to replay time: pen-up gaps shrink to a beat.
  const marks = [];
  let round = 0,
    replay = 0,
    down = false;
  for (const event of log) {
    const gap = Math.max(0, event.t - round);
    replay += down ? gap : Math.min(gap, 250);
    round = event.t;
    marks.push(replay);
    if (event.type === "begin") down = true;
    else if (event.type !== "point") down = false;
  }
  const total = replay;
  const speed = Math.max(1.5, total / longest);
  let frame,
    start,
    index = 0;

  function draw(now) {
    start ??= now;
    const at = (now - start) * speed;
    while (index < log.length && marks[index] <= at) index++;
    fitCanvas(canvas, ctx, size);
    ctx.clearRect(0, 0, size.width, size.height);
    paintStrokes(ctx, strokesAt(log, index));
    if (at >= total) {
      frame = undefined;
      onDone?.();
    } else frame = requestAnimationFrame(draw);
  }
  frame = requestAnimationFrame(draw);
  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
}

export function createDrawingCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const strokes = [];
  // Everything the drawer did, timed from the round start, for the replay.
  const log = [];
  let stroke, previous, drift, startTime, widthAt;
  let strokeWidth = C.strokeWidth;
  let size = { width: C.width, height: C.height };

  function redraw() {
    ctx.clearRect(0, 0, size.width, size.height);
    paintStrokes(ctx, strokes, stroke);
    strokeWidth = ctx.lineWidth;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr),
      height = Math.round(rect.height * dpr);
    if (
      !width ||
      !height ||
      (canvas.width === width && canvas.height === height)
    )
      return;
    canvas.width = width;
    canvas.height = height;
    style();
    redraw();
  }

  function style() {
    ctx.setTransform(
      canvas.width / size.width,
      0,
      0,
      canvas.height / size.height,
      0,
      0,
    );
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle = paperColors().ink;
  }

  function point(x, y, at) {
    const t = Math.max(0, at - startTime);
    const offset = drift(t);
    const p = { x: x + offset.x, y: y + offset.y };
    if (widthAt) p.w = widthAt(t);
    stroke.push(p);
    log.push({ type: "point", t, ...p });
    if (stroke.length === 1) dot(ctx, stroke[0]);
    else segment(ctx, stroke, stroke.length - 1);
  }

  function advance(x, y, time) {
    if (!stroke) return;
    const at = Math.max(previous.at, time);
    const dx = x - previous.x,
      dy = y - previous.y,
      elapsed = at - previous.at;
    if (!dx && !dy && elapsed < C.sampleMs) return;
    const count = Math.min(
      400,
      Math.max(
        1,
        Math.ceil(elapsed / C.sampleMs),
        Math.ceil(Math.hypot(dx, dy) / C.sampleDistance),
      ),
    );
    for (let i = 1; i <= count; i++) {
      const f = i / count;
      point(previous.x + dx * f, previous.y + dy * f, at - elapsed * (1 - f));
    }
    previous = { x, y, at };
  }

  const elapsed = () => Math.max(0, performance.now() - startTime);

  function end() {
    if (stroke) {
      tail(ctx, stroke);
      log.push({ type: "end", t: Math.max(0, previous.at - startTime) });
    }
    stroke = previous = null;
  }

  style();
  return {
    resize,
    /** Repaint in the current theme's ink color. */
    restyle() {
      style();
      redraw();
    },
    advance,
    end,
    /** The round so far as timed events, for `replayDrawing`. */
    get log() {
      return log.slice();
    },
    get hasInk() {
      return strokes.length > 0;
    },
    reset(newDrift, now, newSize = size) {
      end();
      size = { ...newSize };
      style();
      strokes.length = 0;
      log.length = 0;
      drift = newDrift;
      startTime = now;
      redraw();
    },
    /** `width` is a number, or a function of ms into the round for ink that
     * changes width as it goes. */
    begin(x, y, at, width = C.strokeWidth) {
      end();
      widthAt = typeof width === "function" ? width : undefined;
      if (widthAt) width = widthAt(Math.max(0, at - startTime));
      stroke = [];
      ctx.lineWidth = strokeWidth = width;
      strokes.push({ points: stroke, width });
      log.push({ type: "begin", t: Math.max(0, at - startTime), width });
      previous = { x, y, at };
      point(x, y, at);
    },
    undo() {
      end();
      strokes.pop();
      log.push({ type: "undo", t: elapsed() });
      redraw();
    },
    clear() {
      end();
      strokes.length = 0;
      log.push({ type: "clear", t: elapsed() });
      redraw();
    },
  };
}
