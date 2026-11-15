import {
  BAD_DRAW as C,
  DRAW_PHASE as PHASE,
  createDrift,
  roundResult,
} from "../shared/badDraw.js";
import { createWordPicker } from "../shared/badDrawWords.js";
import { createDrawingCanvas } from "./badDrawCanvas.js";
import { drawCover } from "./cover.js";
import "./badDraw.css";

// Normal is the shared default. Easy is a gentle sway with room for mistakes;
// Hard wanders far and fast, hiccups often, and gives less time and fewer fixes.
const PRESETS = {
  easy: {
    amplitude: 12,
    frequency: 1.2,
    lean: 0.25,
    ramp: 1.3,
    hiccups: 2,
    hiccupSize: 25,
    duration: 120_000,
    undo: 4,
    clear: 2,
    note: "Gentle sway, 2 hiccups, 2 minutes, 4 undos",
  },
  normal: {
    note: "Steady wobble, 5 hiccups, 90 seconds, 2 undos",
  },
  hard: {
    amplitude: 40,
    frequency: 2.6,
    lean: 0.5,
    ramp: 2,
    hiccups: 9,
    hiccupSize: 70,
    duration: 60_000,
    undo: 1,
    clear: 1,
    note: "Big lurches, 9 hiccups, 60 seconds, 1 undo",
  },
};
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
    key: "lean",
    label: "Slow lean",
    min: 0,
    max: 1,
    step: 0.05,
    unit: "",
  },
  {
    key: "ramp",
    label: "Drunker by the end",
    min: 1,
    max: 3,
    step: 0.05,
    unit: "×",
  },
  {
    key: "hiccups",
    label: "Hiccups per round",
    min: 0,
    max: 20,
    step: 1,
    unit: "",
    format: (value) => (value ? `${value}` : "off"),
  },
  {
    key: "hiccupSize",
    label: "Hiccup size",
    min: 0,
    max: 150,
    step: 1,
    unit: " px",
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
let pointerId, revealId, intended;
let drift, roundStart, lastHiccup;
const sheet = play.querySelector(".bad-draw-sheet");
const hic = play.querySelector(".bad-draw-hic");
const meter = play.querySelector(".drunk-meter");
const DRUNK_WORDS = [
  [0.9, "Wasted"],
  [0.7, "Drunk"],
  [0.45, "Buzzed"],
  [0.2, "Tipsy"],
  [0, "Sober"],
];

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

const controls = DEV_SLIDERS.map(({ key, unit, format }) => {
  const input = root.querySelector(`#tune-${key}`);
  const output = input.previousElementSibling;
  function update() {
    tuning[key] = input.valueAsNumber;
    output.value = format
      ? format(tuning[key])
      : (key === "duration" ? tuning[key] / 1000 : tuning[key]) + unit;
  }
  listen(input, "input", update);
  return (defaults) => {
    input.value = defaults[key];
    update();
  };
});

function resetTuning() {
  const { note, ...defaults } = { ...C, ...PRESETS[difficulty.value] };
  Object.assign(tuning, defaults);
  controls.forEach((reset) => reset(defaults));
  get("difficulty-note").textContent = note;
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
  root.classList.remove("playing");
  intro.hidden = false;
  get("setup").hidden = get("next").hidden = false;
  get("peek").hidden = get("leave").hidden = true;
  get("heading").textContent = "Ready to draw?";
  get("description").textContent = RULES;
  get("next").textContent = "Continue";
}

function showWord() {
  const visible = phase === PHASE.REVEAL && revealId !== undefined;
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
  get("next").textContent = "Start drawing";
}

function go() {
  if (phase === PHASE.READY) {
    unlockAudio();
    reveal();
  } else if (phase === PHASE.REVEAL && !get("next").disabled) {
    phase = PHASE.PLAYING;
    hideWord();
    const now = performance.now();
    roundDuration = tuning.duration;
    deadline = now + roundDuration;
    lastSecond = undefined;
    undoLeft = tuning.undo;
    clearLeft = tuning.clear;
    intended = center();
    intro.hidden = true;
    play.hidden = false;
    root.classList.add("playing");
    ink.resize();
    drift = createDrift(
      Math.floor(Math.random() * 0x100000000),
      tuning,
      roundDuration,
    );
    roundStart = now;
    lastHiccup = undefined;
    hic.classList.remove("pop");
    sheet.classList.remove("jolt");
    meter.classList.remove("jolt");
    updateMeter(now);
    ink.reset(drift, now);
    cursor.hidden = true;
    updateTools();
    updateClock(now);
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
  root.classList.remove("playing");
  snapshot.src = canvas.toDataURL();
  sound(result.success ? 540 : 230, 0.18);
  if (result.success) sound(760, 0.2, 0.11);
  get("answer").textContent = word;
  get("outcome").textContent = result.success ? "They got it!" : "Time’s up!";
  get("score").textContent = result.score;
  get("remaining").textContent = `${(result.remaining / 1000).toFixed(1)}s`;
  resultCard.hidden = false;
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
  pointerId = undefined;
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
  // Let the aim leave the paper by as far as the ink can drift back onto it.
  const reach = tuning.amplitude * Math.max(1, tuning.ramp);
  return {
    x: clamp(
      ((event.clientX - rect.left) * C.width) / rect.width,
      -reach,
      C.width + reach,
    ),
    y: clamp(
      ((event.clientY - rect.top) * C.height) / rect.height,
      -reach,
      C.height + reach,
    ),
  };
}

listen(canvas, "pointerdown", (event) => {
  if (phase !== PHASE.PLAYING || pointerId !== undefined) return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  event.preventDefault();
  const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
  moveCursor(x, y);
  pointerId = event.pointerId;
  canvas.setPointerCapture(pointerId);
  ink.begin(x, y, now, tuning.strokeWidth);
  updateTools();
});

listen(canvas, "pointermove", (event) => {
  if (phase !== PHASE.PLAYING || event.pointerId !== pointerId) return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  const rect = canvas.getBoundingClientRect();
  for (const sample of event.getCoalescedEvents?.() || []) {
    const p = pointerPoint(sample, rect);
    ink.advance(p.x, p.y, Math.min(now, sample.timeStamp || now));
  }
  const { x, y } = pointerPoint(event, rect);
  moveCursor(x, y);
  ink.advance(x, y, now);
});

listen(canvas, "pointerup", (event) => {
  if (event.pointerId !== pointerId) return;
  const now = performance.now();
  if (now >= deadline) return finish(false, now);
  const { x, y } = pointerPoint(event, canvas.getBoundingClientRect());
  ink.advance(x, y, now);
  stopDrawing();
  cursor.hidden = true;
});
for (const name of ["pointercancel", "lostpointercapture"]) {
  listen(canvas, name, (event) => {
    if (event.pointerId !== pointerId) return;
    stopDrawing();
    cursor.hidden = true;
  });
}

listen(get("peek"), "pointerdown", (event) => {
  if (phase !== PHASE.REVEAL || revealId !== undefined) return;
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
// A long press on the peek button must not open a callout or select text.
listen(get("peek"), "contextmenu", (event) => event.preventDefault());

function suspendInput() {
  stopDrawing();
  hideWord();
  cursor.hidden = true;
}
listen(window, "blur", suspendInput);
listen(document, "visibilitychange", () => {
  if (document.hidden) suspendInput();
});

/** Pop a "hic!" beside the pen, on the side the ink is jolted toward. */
function showHiccup({ angle }) {
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  const x = clamp(intended.x + dx * 60, C.width * 0.06, C.width * 0.94);
  const y = clamp(intended.y + dy * 60, C.height * 0.1, C.height * 0.9);
  hic.style.left = `${(100 * x) / C.width}%`;
  hic.style.top = `${(100 * y) / C.height}%`;
  hic.style.setProperty("--tilt", `${Math.round(dx * 14)}deg`);
  sheet.style.setProperty("--jx", `${(dx * 6).toFixed(1)}px`);
  sheet.style.setProperty("--jy", `${(dy * 6).toFixed(1)}px`);
  meter.style.setProperty("--wobble", `${dx < 0 ? -7 : 7}deg`);
  // Restart the animations even if the last one hasn't finished.
  for (const el of [hic, sheet, meter]) el.classList.remove("pop", "jolt");
  void hic.offsetWidth;
  hic.classList.add("pop");
  sheet.classList.add("jolt");
  meter.classList.add("jolt");
}

/** Drain the mug as the round goes on: the more you've drunk, the drunker. */
function updateMeter(now) {
  const drunk = clamp((now - roundStart) / roundDuration, 0, 1);
  meter.style.setProperty("--level", (1 - drunk).toFixed(4));
  const word = DRUNK_WORDS.find(([from]) => drunk >= from)[1];
  if (get("drunk").textContent !== word) {
    get("drunk").textContent = word;
    meter.setAttribute("aria-label", `Drunk meter: ${word}`);
  }
}

function tick(now) {
  if (phase === PHASE.PLAYING && now >= deadline) finish(false, now);
  if (phase === PHASE.PLAYING) {
    updateClock(now);
    updateMeter(now);
    const hiccup = drift.hiccup(now - roundStart);
    if (hiccup && hiccup.id !== lastHiccup) {
      lastHiccup = hiccup.id;
      showHiccup(hiccup);
    }
  }
  // Keep sampling the drift while the finger rests in place.
  if (pointerId !== undefined) ink.advance(intended.x, intended.y, now);
  requestAnimationFrame(tick);
}

get("next").onclick = go;
get("leave").onclick = get("exit").onclick = get("again").onclick = ready;
get("correct").onclick = () => finish(true);
get("undo").onclick = () => tool("undo");
get("clear").onclick = () => tool("clear");
resize.observe(canvas);
drawCover(get("preview"));
ready();
requestAnimationFrame(tick);
