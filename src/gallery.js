import { paperColors } from "./paperColors.js";

// Every finished round's drawing, kept for the night. Entries survive a reload
// in sessionStorage when they fit, and live in memory either way.
const STORE = "drunk-drawing-gallery";
const MAX = 60;
const CAPTION = 110;
// Drawings come in any shape (the paper fills the screen). Store them with
// the longer side at most this long, and make cards at least this wide so
// the caption fits.
const LONGEST = 960;
const MIN_CARD_WIDTH = 720;
const cardSize = (image) => ({
  width: Math.max(image.width, MIN_CARD_WIDTH),
  height: image.height + CAPTION,
});

const tryStorage = (fn) => {
  try {
    return fn(window.sessionStorage);
  } catch {
    return undefined;
  }
};

function paper(ctx, x, y, width, height, colors) {
  ctx.fillStyle = colors.paper;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colors.dot;
  for (let dy = 8; dy < height; dy += 17)
    for (let dx = 8; dx < width; dx += 17) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
}

function fitText(ctx, text, maxWidth, size, family) {
  do ctx.font = `bold ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && (size -= 2) > 16);
}

/** The drawing recolored to `ink`, whatever theme it was drawn in. */
function tint(image, ink) {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: image.width,
    height: image.height,
  });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The drawing on paper with the word and the result underneath, in the
 * current theme's colors. */
function drawCard(ctx, image, { word, success, score }) {
  const colors = paperColors();
  const card = cardSize(image);
  paper(ctx, 0, 0, card.width, card.height, colors);
  ctx.drawImage(tint(image, colors.ink), (card.width - image.width) / 2, 0);
  ctx.fillStyle = colors.rule;
  ctx.fillRect(0, image.height, card.width, 2);
  ctx.textBaseline = "middle";
  const mid = image.height + CAPTION / 2 + 2;
  const result = success ? `${score} pts` : "Time’s up";
  ctx.font = "bold 46px Georgia, serif";
  const resultWidth = ctx.measureText(result).width;
  ctx.fillStyle = colors.ink;
  fitText(ctx, word, card.width - resultWidth - 110, 58, "Georgia, serif");
  ctx.textAlign = "left";
  ctx.fillText(word, 36, mid);
  ctx.font = "bold 46px Georgia, serif";
  ctx.fillStyle = success ? colors.ink : colors.pencil;
  ctx.textAlign = "right";
  ctx.fillText(result, card.width - 36, mid);
}

const toBlob = (canvas) =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

function canShareFiles() {
  try {
    return !!navigator.canShare?.({
      files: [new File([""], "x.png", { type: "image/png" })],
    });
  } catch {
    return false;
  }
}

/** Share sheet where the device has one, otherwise a download. */
async function shareOrSave(blob, name, title) {
  const file = new File([blob], name, { type: "image/png" });
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: name,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function createGallery(dialog, { onChange = () => {} } = {}) {
  const find = (key) => dialog.querySelector(`[data-gallery-${key}]`);
  const grid = find("grid");
  const gridView = find("list");
  const viewer = find("viewer");
  const big = find("big");
  const clearButton = find("clear");
  const shareAll = find("share-all");
  const shareOne = find("share");
  const verb = canShareFiles() ? "Share" : "Save";
  shareOne.textContent = verb;
  shareAll.textContent = `${verb} all`;

  // Each entry: { drawing (data URL), word, success, score, card (Blob), url }
  const entries = (tryStorage((s) => JSON.parse(s.getItem(STORE))) || [])
    .filter((entry) => entry?.drawing && entry.word)
    .slice(-MAX);
  let current, sheet, building, clearTimer;

  function persist() {
    const saved = entries.map(({ drawing, word, success, score }) => ({
      drawing,
      word,
      success,
      score,
    }));
    // Drop the oldest drawings from storage until the rest fit.
    while (
      saved.length &&
      !tryStorage((s) => (s.setItem(STORE, JSON.stringify(saved)), true))
    )
      saved.shift();
    if (!saved.length) tryStorage((s) => s.removeItem(STORE));
  }

  async function makeCard(entry, image) {
    const canvas = Object.assign(
      document.createElement("canvas"),
      cardSize(image),
    );
    drawCard(canvas.getContext("2d"), image, entry);
    entry.card = await toBlob(canvas);
    entry.url = URL.createObjectURL(entry.card);
  }

  /** One image with every drawing of the night, for sharing in one go. */
  async function makeSheet() {
    const ready = entries.filter((entry) => entry.card);
    const columns = Math.min(3, ready.length);
    const tile = { width: 400, height: 360 };
    const gap = 28;
    const header = 120;
    const rows = Math.ceil(ready.length / columns);
    const canvas = Object.assign(document.createElement("canvas"), {
      width: columns * tile.width + (columns + 1) * gap,
      height: header + rows * (tile.height + gap) + gap,
    });
    const ctx = canvas.getContext("2d");
    const colors = paperColors();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.title;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    fitText(ctx, "Drunk Drawing", canvas.width - 2 * gap, 54, "Georgia, serif");
    ctx.fillText("Drunk Drawing", canvas.width / 2, header / 2 - 8);
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillStyle = colors.muted;
    ctx.fillText(summary(), canvas.width / 2, header - 22);
    const images = await Promise.all(ready.map((e) => loadImage(e.url)));
    images.forEach((image, i) => {
      const x = gap + (i % columns) * (tile.width + gap);
      const y = header + Math.floor(i / columns) * (tile.height + gap);
      // Fit each card in its tile, whatever its shape.
      const scale = Math.min(
        tile.width / image.width,
        tile.height / image.height,
      );
      const w = image.width * scale,
        h = image.height * scale;
      const left = x + (tile.width - w) / 2,
        top = y + (tile.height - h) / 2;
      ctx.fillStyle = colors.shadow;
      ctx.fillRect(left + 3, top + 4, w, h);
      ctx.drawImage(image, left, top, w, h);
    });
    return toBlob(canvas);
  }

  function summary() {
    const guessed = entries.filter((e) => e.success);
    const points = guessed.reduce((sum, e) => sum + e.score, 0);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return `${plural(entries.length, "drawing")} · ${guessed.length} guessed · ${plural(points, "point")}`;
  }

  function render() {
    find("summary").textContent = entries.length
      ? summary()
      : "Finish a round and its drawing lands here.";
    grid.replaceChildren(
      ...entries
        .map((entry, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "gallery-tile";
          button.setAttribute(
            "aria-label",
            `${entry.word}, ${entry.success ? `${entry.score} points` : "time ran out"}`,
          );
          button.style.setProperty("--tilt", `${index % 2 ? 1.2 : -1.2}deg`);
          if (entry.url) {
            const img = document.createElement("img");
            img.src = entry.url;
            img.alt = "";
            button.append(img);
          }
          button.onclick = () => show(entry);
          return button;
        })
        .reverse(),
    );
    clearButton.hidden = shareAll.hidden = !entries.length;
    sheet = undefined;
    shareAll.disabled = true;
    if (dialog.open && entries.length) {
      const pending = (building = makeSheet());
      pending
        .then((blob) => {
          // Ignore a sheet that a newer render has replaced.
          if (building !== pending) return;
          sheet = blob;
          shareAll.disabled = !blob;
        })
        .catch(() => {});
    }
  }

  function show(entry) {
    current = entry;
    big.src = entry.url;
    big.alt = `Drawing of ${entry.word}`;
    gridView.hidden = true;
    viewer.hidden = false;
    shareOne.focus();
  }

  function back() {
    current = undefined;
    viewer.hidden = true;
    gridView.hidden = false;
  }

  function resetClear() {
    clearTimeout(clearTimer);
    clearTimer = undefined;
    clearButton.textContent = "Clear all";
    clearButton.classList.remove("armed");
  }

  // Two taps to clear, so a stray tap can't wipe the night.
  clearButton.onclick = () => {
    if (!clearTimer) {
      clearButton.textContent = "Tap again to clear";
      clearButton.classList.add("armed");
      clearTimer = setTimeout(resetClear, 3000);
      return;
    }
    resetClear();
    for (const entry of entries.splice(0)) URL.revokeObjectURL(entry.url);
    persist();
    render();
    onChange(0);
  };
  shareAll.onclick = () =>
    sheet && shareOrSave(sheet, "drunk-drawing-gallery.png", "Drunk Drawing");
  shareOne.onclick = () =>
    current?.card &&
    shareOrSave(
      current.card,
      `drunk-drawing-${slug(current.word) || "drawing"}.png`,
      `Drunk Drawing: ${current.word}`,
    );
  find("back").onclick = back;
  find("close").onclick = () => dialog.close();
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    back();
    resetClear();
  });

  /** Rebuild every card from its drawing, in the current theme. */
  async function rebuild() {
    await Promise.all(
      entries.map((entry) =>
        loadImage(entry.drawing)
          .then((image) => {
            if (entry.url) URL.revokeObjectURL(entry.url);
            return makeCard(entry, image);
          })
          .catch(() => {}),
      ),
    );
    if (dialog.open) render();
  }

  // Rebuild the cards for drawings kept from before a reload.
  Promise.all(
    entries.map((entry) =>
      loadImage(entry.drawing)
        .then((image) => makeCard(entry, image))
        .catch(() => {}),
    ),
  ).then(() => {
    for (let i = entries.length - 1; i >= 0; i--)
      if (!entries[i].card) entries.splice(i, 1);
    if (dialog.open) render();
    onChange(entries.length);
  });

  return {
    get size() {
      return entries.length;
    },
    restyle: rebuild,
    /** Keep the drawing on `canvas` with how the round went. */
    async add(canvas, { word, success, score }) {
      const scale = LONGEST / Math.max(canvas.width, canvas.height);
      const small = Object.assign(document.createElement("canvas"), {
        width: Math.round(canvas.width * scale),
        height: Math.round(canvas.height * scale),
      });
      small
        .getContext("2d")
        .drawImage(canvas, 0, 0, small.width, small.height);
      const entry = { drawing: small.toDataURL(), word, success, score };
      entries.push(entry);
      while (entries.length > MAX) URL.revokeObjectURL(entries.shift().url);
      onChange(entries.length);
      await makeCard(entry, small);
      persist();
      if (dialog.open) render();
    },
    open() {
      back();
      dialog.showModal();
      render();
    },
  };
}
