export function drawCover(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 5;

  function line(color, points) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.quadraticCurveTo(...point);
    ctx.stroke();
  }

  const ink = "#263a35";
  const pencil = "#a74436";

  // A crooked kite and its tail, drawn as a sample of marks on the pad.
  line(ink, [
    [247, 42],
    [280, 64, 341, 114],
    [308, 127, 202, 205],
    [181, 172, 157, 117],
    [205, 85, 247, 42],
  ]);
  line(ink, [
    [247, 42],
    [250, 132, 202, 205],
  ]);
  line(ink, [
    [157, 117],
    [248, 101, 341, 114],
  ]);
  line(ink, [
    [202, 205],
    [199, 237, 232, 241],
    [283, 244, 263, 270],
    [247, 293, 204, 275],
    [172, 263, 160, 302],
  ]);
  line(pencil, [
    [230, 240],
    [211, 224, 214, 213],
    [230, 224, 230, 240],
    [254, 224, 251, 231],
    [250, 243, 230, 240],
  ]);
  line(pencil, [
    [250, 281],
    [269, 280, 277, 288],
    [264, 294, 250, 281],
    [244, 301, 235, 308],
    [231, 297, 250, 281],
  ]);
  line(pencil, [
    [348, 60],
    [354, 56, 365, 48],
  ]);
  line(pencil, [
    [366, 77],
    [380, 75, 393, 73],
  ]);
  line(pencil, [
    [324, 52],
    [324, 40, 326, 32],
  ]);
  line(ink, [
    [84, 165],
    [98, 160, 114, 164],
  ]);
  line(ink, [
    [69, 182],
    [97, 177, 106, 179],
  ]);
  ctx.save();
  ctx.translate(327, 249);
  ctx.rotate(-0.14);
  ctx.fillStyle = pencil;
  ctx.font = "italic 23px Georgia, serif";
  ctx.fillText("a kite?", 0, 0);
  ctx.restore();
}
