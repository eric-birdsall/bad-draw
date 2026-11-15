import {
  BAD_DRAW as C,
  DRAW_PHASE as PHASE,
  createDrift,
  drawStick,
  roundResult,
} from "../shared/badDraw.js";
import { createWordPicker } from "../shared/badDrawWords.js";
import { createDrawingCanvas } from "./badDrawCanvas.js";
import { drawCover } from "./cover.js";
import "./badDraw.css";

const PAD = { A: 0, B: 1, X: 2, Y: 3, RT: 7, MENU: 9 };
// Presets share the existing defaults until difficulty values are decided.
const PRESETS = { easy: {}, normal: {}, hard: {} };
const RULES =
  "Pick a drawer. Sketch the secret word while everyone else guesses aloud. No talking or writing letters.";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const center = () => ({ x: C.width / 2, y: C.height / 2 });

// Temporary controls. All slider values use the same units as the game.
const DEV_SLIDERS = [
  {
    key: "amplitude",
    label: "Drift distance",
    min: 0,
    max: 150,
    step: 1,
    unit: " px",
  },
  {
    key: "frequency",
    label: "Drift speed",
    min: 0,
    max: 8,
    step: 0.1,
    unit: "",
  },
  {
    key: "cursorSpeed",
    label: "Stick speed",
    min: 100,
    max: 1500,
    step: 10,
    unit: " px/s",
  },
  {
    key: "deadZone",
    label: "Stick dead zone",
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "",
  },
  {
    key: "strokeWidth",
    label: "Ink width",
    min: 1,
    max: 30,
    step: 1,
    unit: " px",
  },
  {
    key: "duration",
    label: "Round length",
    min: 10000,
    max: 180000,
    step: 5000,
    unit: " s",
  },
];

const root = document.querySelector(".bad-draw");
const tuning = { ...C };
const pickWord = createWordPicker();

const get = (key) => root.querySelector(`[data-${key}]`);
const intro = root.querySelector(".bad-draw-intro");
const play = root.querySelector(".bad-draw-play");
const canvas = play.querySelector("canvas");
const cursor = play.querySelector(".bad-draw-cursor");
const ink = createDrawingCanvas(canvas);
const listen = (target, name, handler) =>
  target.addEventListener(name, handler);
const resize = new ResizeObserver(() => ink.resize());
let phase, word, deadline, roundDuration, undoLeft, clearLeft, lastSecond;
let owner,
  pointerId,
  revealId,
  revealKey = false,
  revealPad = false;
let intended, previousFrame, padIndex, previousPad;

const resultCard = root.querySelector(".result-card");
const snapshot = resultCard.querySelector("img");
const difficulty = get("difficulty");
const devControls = root.querySelector(".bad-draw-dev-controls");
devControls.innerHTML = DEV_SLIDERS.map(
  ({ key, label, min, max, step }) => `
  <div class="bad-draw-dev-row">
    <label for="tune-${key}">${label}</label>
    <output for="tune-${key}"></output>
    <input type="range" id="tune-${key}" min="${min}" max="${max}" step="${step}">
    ${key === "strokeWidth" ? "<small>Applies to the next stroke</small>" : ""}
    ${key === "duration" ? "<small>Applies to the next round</small>" : ""}
  </div>
`,
).join("");

const controls = DEV_SLIDERS.map(({ key, unit }) => {
  const input = root.querySelector(`#tune-${key}`);
  const output = input.previousElementSibling;
  function update() {
    tuning[key] = input.valueAsNumber;
    output.value =
      (key === "duration" ? tuning[key] / 1000 : tuning[key]) + unit;
  }
  listen(input, "input", update);
  return (defaults) => {
    input.value = defaults[key];
    update();
  };
});

function resetTuning() {
  const defaults = { ...C, ...PRESETS[difficulty.value] };
  controls.forEach((reset) => reset(defaults));
}

listen(difficulty, "change", resetTuning);
listen(get("dev-reset"), "click", resetTuning);
resetTuning();

let audio;
function unlockAudio() {
  if (!window.AudioContext) return;
  audio ||= new AudioContext();
  audio.resume().catch(() => {});
}

function sound(frequency, duration = 0.12, delay = 0) {
  if (audio?.state !== "running") return;
  const now = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.027, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function ready() {
  phase = PHASE.READY;
  stopDrawing();
  hideWord();
  snapshot.removeAttribute("src");
  resultCard.hidden = play.hidden = true;
  intro.hidden = false;
  get("setup").hidden = get("next").hidden = false;
  get("peek").hidden = get("leave").hidden = true;
  get("heading").textContent = "Ready to draw?";
  get("description").textContent = RULES;
  get("next").firstChild.nodeValue = "Continue ";
  get("next").focus({ preventScroll: true });
}

function showWord() {
  const visible =
    phase === PHASE.REVEAL &&
    (revealId !== undefined || revealKey || revealPad);
  const secret = get("word");
  if (secret.hidden === visible) {
    secret.textContent = visible ? word : "";
    secret.hidden = !visible;
  }
  get("next").disabled = visible;
}

function hideWord() {
  const id = revealId;
  revealId = undefined;
  if (id !== undefined && get("peek").hasPointerCapture(id))
    get("peek").releasePointerCapture(id);
  revealKey = revealPad = false;
  showWord();
}

function reveal() {
  word = pickWord();
  phase = PHASE.REVEAL;
  get("setup").hidden = true;
  get("leave").hidden = false;
  get("heading").textContent = "Guessers, look away!";
  get("description").textContent =
    "Drawer, hold to peek. Let go before you start the clock.";
  get("peek").hidden = false;
  get("next").firstChild.nodeValue = "Start drawing ";
}

function go() {
  if (phase === PHASE.READY) {
    unlockAudio();
    reveal();
  } else if (
    phase === PHASE.REVEAL &&
    !get("next").disabled &&
    !previousPad?.rt
  ) {
    // The controller's first sample in play is a baseline, not a press.
    phase = PHASE.PLAYING;
    previousPad = undefined;
    hideWord();
    const now = performance.now();
    previousFrame = now;
    roundDuration = tuning.duration;
    deadline = now + roundDuration;
    lastSecond = undefined;
    undoLeft = C.undo;
    clearLeft = C.clear;
    intended = center();
    intro.hidden = true;
    play.hidden = false;
    ink.resize();
    ink.reset(
      createDrift(Math.floor(Math.random() * 0x100000000), tuning),
      now,
    );
    cursor.hidden = true;
    updateTools();
    updateClock(now);
    get("correct").focus({ preventScroll: true });
    sound(380);
    sound(560, 0.16, 0.08);
  }
}

function finish(correct, now = performance.now()) {
  if (phase !== PHASE.PLAYING) return;
  const result = roundResult(correct, deadline, now, roundDuration);
  phase = PHASE.RESULTS;
  stopDrawing();
  play.hidden = true;
  snapshot.src = canvas.toDataURL();
  sound(result.success ? 540 : 230, 0.18);
  if (result.success) sound(760, 0.2, 0.11);
  get("answer").textContent = word;
  get("outcome").textContent = result.success ? "They got it!" : "Time’s up!";
  get("score").textContent = result.score;
  get("remaining").textContent = `${(result.remaining / 1000).toFixed(1)}s`;
  resultCard.hidden = false;
  get("again").focus({ preventScroll: true });
}

function updateClock(now) {
  const second = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (second === lastSecond) return;
  lastSecond = second;
  get("time").textContent =
    `${Math.floor(second / 60)}:${String(second % 60).padStart(2, "0")}`;
  get("time").parentElement.classList.toggle(
    "urgent",
    second <= C.urgentSeconds,
  );
  if (second > 0 && second <= C.urgentSeconds) sound(310, 0.07);
}

function updateTools() {
  for (const [action, left] of [
    ["undo", undoLeft],
    ["clear", clearLeft],
  ]) {
    get(action).querySelector("span").textContent = left;
    get(action).disabled = !left || !ink.hasInk;
  }
}

function stopDrawing() {
  const id = pointerId;
  pointerId = owner = undefined;
  if (id !== undefined && canvas.hasPointerCapture(id))
    canvas.releasePointerCapture(id);
  ink.end();
}

function tool(action) {
  if (phase !== PHASE.PLAYING) return;
  if (performance.now() >= deadline) return finish(false);
  if (!ink.hasInk || (action === "undo" ? !undoLeft : !clearLeft)) return;
  stopDrawing();
  if (action === "undo") undoLeft--;
  else clearLeft--;
  ink[action]();
  updateTools();
  sound(action === "undo" ? 360 : 280, 0.08);
}

function moveCursor(x, y) {
  intended = { x, y };
  cursor.hidden = false;
  cursor.style.left = `${(100 * x) / C.width}%`;
  cursor.style.top = `${(100 * y) / C.height}%`;
}

function pointerPoint(event, rect) {
  return {
    x: clamp(
      ((event.clientX - rect.left) * C.width) / rect.width,
      -tuning.amplitude,
      C.width + tuning.amplitude,
    ),
    y: clamp(
      ((event.clientY - rect.top) * C.height) / rect.height,
      -tuning.amplitude,
      C.height + tuning.amplitude,
    ),
  };
}

listen(canvas, "pointerdown", (event) => {
  if (phase !== PHASE.PLAYING || owner || event.button !== 0) return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  event.preventDefault();
  const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
  moveCursor(x, y);
  owner = "pointer";
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  ink.begin(x, y, now, tuning.strokeWidth);
  updateTools();
});

listen(canvas, "pointermove", (event) => {
  if (
    phase !== PHASE.PLAYING ||
    owner === "pad" ||
    (owner === "pointer" && event.pointerId !== pointerId)
  )
    return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  const rect = canvas.getBoundingClientRect();
  if (owner === "pointer") {
    for (const sample of event.getCoalescedEvents?.() || []) {
      const p = pointerPoint(sample, rect);
      ink.advance(p.x, p.y, Math.min(now, sample.timeStamp || now));
    }
  }
  const { x, y } = pointerPoint(event, rect);
  moveCursor(x, y);
  if (owner === "pointer") ink.advance(x, y, now);
});

listen(canvas, "pointerup", (event) => {
  if (event.pointerId !== pointerId) return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
  ink.advance(x, y, now);
  stopDrawing();
  if (event.pointerType !== "mouse" || !canvas.matches(":hover"))
    cursor.hidden = true;
});
for (const name of ["pointercancel", "lostpointercapture"]) {
  listen(canvas, name, (event) => {
    if (event.pointerId !== pointerId) return;
    stopDrawing();
    cursor.hidden = true;
  });
}

listen(canvas, "pointerleave", () => {
  if (owner !== "pad") cursor.hidden = true;
});

listen(get("peek"), "pointerdown", (event) => {
  if (phase !== PHASE.REVEAL || revealId !== undefined || event.button !== 0)
    return;
  event.preventDefault();
  revealId = event.pointerId;
  get("peek").setPointerCapture(revealId);
  showWord();
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
  listen(get("peek"), name, (event) => {
    if (event.pointerId !== revealId) return;
    revealId = undefined;
    showWord();
  });
}
listen(window, "keydown", (event) => {
  if (phase !== PHASE.REVEAL || event.code !== "Space") return;
  event.preventDefault();
  if (event.repeat) return;
  revealKey = true;
  showWord();
});
listen(window, "keyup", (event) => {
  if (phase !== PHASE.REVEAL || event.code !== "Space") return;
  event.preventDefault();
  revealKey = false;
  showWord();
  if (!get("next").disabled) get("next").focus({ preventScroll: true });
});

function suspendInput() {
  stopDrawing();
  hideWord();
  cursor.hidden = true;
  previousPad = undefined;
}
listen(window, "blur", suspendInput);
listen(document, "visibilitychange", () => {
  if (document.hidden) suspendInput();
});

function readPad(now, dt) {
  const pads = navigator.getGamepads?.() || [];
  const pad = pads[padIndex]?.connected
    ? pads[padIndex]
    : Array.from(pads).find(
        (candidate) => candidate?.connected && candidate.mapping === "standard",
      );
  if (pad?.index !== padIndex || !pad) {
    padIndex = pad?.index;
    previousPad = undefined;
    if (owner === "pad") {
      stopDrawing();
      cursor.hidden = true;
    }
    if (revealPad) {
      revealPad = false;
      showWord();
    }
  }
  if (!pad) return;
  const held = (i) =>
    Boolean(pad.buttons[i]?.pressed || pad.buttons[i]?.value > 0.5);
  const buttons = {
    rt: held(PAD.RT),
    a: held(PAD.A),
    b: held(PAD.B),
    x: held(PAD.X),
    y: held(PAD.Y),
    menu: held(PAD.MENU),
  };
  const was = previousPad;
  previousPad = buttons;
  if (!was) return;
  const pressed = (key) => buttons[key] && !was[key];

  if (phase === PHASE.READY) {
    if (pressed("a")) go();
    return;
  }
  if (phase === PHASE.RESULTS) {
    if (pressed("a") || pressed("b")) ready();
    return;
  }
  if (phase === PHASE.REVEAL) {
    if (pressed("b")) return ready();
    // If A and the reveal release land in the same frame, require a new A.
    const wasRevealed = get("next").disabled || was.rt;
    if (pressed("rt")) revealPad = true;
    if (!buttons.rt) revealPad = false;
    showWord();
    if (pressed("a") && !wasRevealed) go();
    return;
  }

  if (pressed("menu")) return ready();
  if (pressed("a")) return finish(true, now);
  if (pressed("y")) return tool("clear");
  if (pressed("x")) return tool("undo");
  if (owner === "pointer") return;
  if (!buttons.rt && owner === "pad") stopDrawing();
  const stick = drawStick(pad.axes[0] || 0, pad.axes[1] || 0, tuning.deadZone);
  if (stick.x || stick.y || pressed("rt")) {
    moveCursor(
      clamp(intended.x + stick.x * dt * tuning.cursorSpeed, 0, C.width),
      clamp(intended.y + stick.y * dt * tuning.cursorSpeed, 0, C.height),
    );
  }
  if (pressed("rt")) {
    owner = "pad";
    ink.begin(intended.x, intended.y, now, tuning.strokeWidth);
    updateTools();
  }
}

function tick(now) {
  if (phase === PHASE.PLAYING && now >= deadline) finish(false, now);
  if (phase === PHASE.PLAYING) updateClock(now);
  if (document.hasFocus() && !document.hidden) {
    readPad(now, clamp(now - previousFrame, 0, C.maxSampleGap) / 1000);
  }
  if (owner) ink.advance(intended.x, intended.y, now);
  previousFrame = now;
  requestAnimationFrame(tick);
}

get("next").onclick = go;
get("leave").onclick = get("exit").onclick = get("again").onclick = ready;
get("correct").onclick = () => finish(true);
get("undo").onclick = () => tool("undo");
get("clear").onclick = () => tool("clear");
listen(window, "keydown", (event) => {
  if (event.key === "Escape" && phase !== PHASE.READY) ready();
});
resize.observe(canvas);
drawCover(get("preview"));
ready();
requestAnimationFrame(tick);
