/**
 * Bildverarbeitung für fotografierte Seiten (läuft komplett im Browser):
 *   loadImage → detectCorners (Blattkanten) → warp (entzerren) → enhance (Kontrast) → canvasToJpeg
 *
 * Nutzt Canvas-APIs und ist daher nur im Browser lauffähig.
 */

const WORK_MAX = 2400; // maximale Kantenlänge des Arbeitsbildes
const OUT_MAX = 2000; // maximale Kantenlänge der PDF-Seite
const AI_MAX = 1568; // maximale Kantenlänge für die KI

export async function loadImage(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    bmp = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Bild konnte nicht gelesen werden"));
      };
      img.src = url;
    });
  }
  const w = bmp.width;
  const h = bmp.height;
  const s = Math.min(1, WORK_MAX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  return canvas;
}

export function rotateCanvas(src, clockwise = true) {
  const c = document.createElement("canvas");
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(((clockwise ? 90 : -90) * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function defaultCorners(w, h, inset = 0.04) {
  const dx = w * inset;
  const dy = h * inset;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

// Sucht das helle Blatt vor dunklerem Hintergrund und liefert die vier Ecken
// (oben links, oben rechts, unten rechts, unten links) in Koordinaten des Arbeitsbildes.
export function detectCorners(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const s = 320 / Math.max(W, H);
  const w = Math.max(8, Math.round(W * s));
  const h = Math.max(8, Math.round(H * s));
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.filter = "blur(2px)";
  sctx.drawImage(canvas, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;

  const gray = new Uint8Array(w * h);
  const hist = new Array(256).fill(0);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    gray[j] = g;
    hist[g]++;
  }
  const t = otsu(hist, w * h);
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < gray.length; j++) mask[j] = gray[j] > t ? 1 : 0;

  // größte zusammenhängende helle Fläche
  const label = new Int32Array(w * h).fill(-1);
  let best = { size: 0, id: -1 };
  const stack = new Int32Array(w * h);
  let id = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let size = 0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && mask[p - 1] && label[p - 1] === -1) (label[p - 1] = id), (stack[sp++] = p - 1);
      if (x < w - 1 && mask[p + 1] && label[p + 1] === -1) (label[p + 1] = id), (stack[sp++] = p + 1);
      if (y > 0 && mask[p - w] && label[p - w] === -1) (label[p - w] = id), (stack[sp++] = p - w);
      if (y < h - 1 && mask[p + w] && label[p + w] === -1) (label[p + w] = id), (stack[sp++] = p + w);
    }
    if (size > best.size) best = { size, id };
    id++;
  }

  const area = w * h;
  if (best.id < 0 || best.size < area * 0.15 || best.size > area * 0.985) {
    return { corners: defaultCorners(W, H), detected: false };
  }

  // Extrempunkte: min(x+y)=oben links, max(x-y)=oben rechts, max(x+y)=unten rechts, max(y-x)=unten links
  let tl, tr, br, bl;
  let mTL = Infinity, mTR = -Infinity, mBR = -Infinity, mBL = -Infinity;
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== best.id) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if (x + y < mTL) (mTL = x + y), (tl = { x, y });
    if (x - y > mTR) (mTR = x - y), (tr = { x, y });
    if (x + y > mBR) (mBR = x + y), (br = { x, y });
    if (y - x > mBL) (mBL = y - x), (bl = { x, y });
  }
  const corners = [tl, tr, br, bl].map((c) => ({
    x: Math.min(W, Math.max(0, (c.x + 0.5) / s)),
    y: Math.min(H, Math.max(0, (c.y + 0.5) / s)),
  }));
  if (quadArea(corners) < W * H * 0.12) return { corners: defaultCorners(W, H), detected: false };
  return { corners, detected: true };
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, max = 0, threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) (max = between), (threshold = i);
  }
  return threshold;
}

export function quadArea(c) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Homographie: bildet Zielrechteck (0,0)-(W,H) auf das Viereck im Quellbild ab.
export function homography(W, H, quad) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const { x: u, y: v } = quad[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const hm = solve(A, b);
  return [...hm, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// Entzerrt das Viereck zu einem geraden Rechteck.
export function warp(srcCanvas, corners) {
  const [tl, tr, br, bl] = corners;
  let outW = (dist(tl, tr) + dist(bl, br)) / 2;
  let outH = (dist(tl, bl) + dist(tr, br)) / 2;
  const s = Math.min(1, OUT_MAX / Math.max(outW, outH));
  outW = Math.max(16, Math.round(outW * s));
  outH = Math.max(16, Math.round(outH * s));

  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const src = srcCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d", { willReadFrequently: true });
  const img = octx.createImageData(outW, outH);
  const dst = img.data;
  const [a, b, c, d, e, f, g, h] = homography(outW, outH, corners);

  let k = 0;
  for (let y = 0; y < outH; y++) {
    const yy = y + 0.5;
    for (let x = 0; x < outW; x++, k += 4) {
      const xx = x + 0.5;
      const den = g * xx + h * yy + 1;
      let u = (a * xx + b * yy + c) / den - 0.5;
      let v = (d * xx + e * yy + f) / den - 0.5;
      if (u < 0) u = 0;
      if (v < 0) v = 0;
      if (u > sw - 1.001) u = sw - 1.001;
      if (v > sh - 1.001) v = sh - 1.001;
      const x0 = u | 0;
      const y0 = v | 0;
      const fx = u - x0;
      const fy = v - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = src[i00 + ch] + (src[i10 + ch] - src[i00 + ch]) * fx;
        const bot = src[i01 + ch] + (src[i11 + ch] - src[i01 + ch]) * fx;
        dst[k + ch] = top + (bot - top) * fy;
      }
      dst[k + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Kontrastverbesserung. mode: "doc" (Graustufen, kräftig), "color" (Farbe, mild), "none"
export function enhance(canvas, mode = "doc") {
  if (mode === "none") return canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = img.data;
  const n = p.length / 4;

  if (mode === "doc") {
    const gray = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
      gray[j] = g;
      hist[gray[j]]++;
    }
    const lo = percentile(hist, n, 0.02);
    const hi = Math.max(lo + 40, percentile(hist, n, 0.9));
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let t = (v - lo) / (hi - lo);
      t = Math.min(1, Math.max(0, t));
      lut[v] = Math.pow(t, 1.25) * 255; // Schrift etwas kräftiger
    }
    for (let i = 0, j = 0; j < n; i += 4, j++) {
      const v = lut[gray[j]];
      p[i] = p[i + 1] = p[i + 2] = v;
    }
  } else {
    const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) hist[(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0]++;
    const lo = percentile(hist, n, 0.01);
    const hi = Math.max(lo + 40, percentile(hist, n, 0.97));
    const f = 255 / (hi - lo);
    for (let i = 0; i < p.length; i += 4) {
      p[i] = (p[i] - lo) * f;
      p[i + 1] = (p[i + 1] - lo) * f;
      p[i + 2] = (p[i + 2] - lo) * f;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function percentile(hist, n, q) {
  const target = n * q;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

export function canvasToJpeg(canvas, quality = 0.78, maxEdge = null) {
  let c = canvas;
  if (maxEdge && Math.max(canvas.width, canvas.height) > maxEdge) {
    const s = maxEdge / Math.max(canvas.width, canvas.height);
    c = document.createElement("canvas");
    c.width = Math.round(canvas.width * s);
    c.height = Math.round(canvas.height * s);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }
  return new Promise((resolve, reject) => {
    c.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("JPEG-Erzeugung fehlgeschlagen"));
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height });
      },
      "image/jpeg",
      quality
    );
  });
}

export const AI_MAX_EDGE = AI_MAX;

// ---------- Seiten (für Jobs der Art "scan") ----------

/**
 * Erzeugt eine Seite aus einem geladenen Bild.
 * Werden keine Blattkanten erkannt, nimmt man bei Fotos von der Kamera einen kleinen Rand weg,
 * bei vorhandenen Bildern (Galerie, E-Mail-Anhang) das ganze Bild.
 */
export function makePage(src, { camera = false } = {}) {
  const r = detectCorners(src);
  const corners = r.detected ? r.corners : defaultCorners(src.width, src.height, camera ? 0.04 : 0);
  const page = { src, corners, mode: camera || r.detected ? "doc" : "color", detected: r.detected };
  renderPage(page);
  return page;
}

/** Berechnet das bearbeitete Seitenbild (page.out) und das Vorschaubild (page.thumb). */
export function renderPage(page) {
  const out = enhance(warp(page.src, page.corners), page.mode);
  page.out = out;
  const t = document.createElement("canvas");
  const s = 360 / Math.max(out.width, out.height);
  t.width = Math.round(out.width * s);
  t.height = Math.round(out.height * s);
  t.getContext("2d").drawImage(out, 0, 0, t.width, t.height);
  page.thumb = t.toDataURL("image/jpeg", 0.7);
  return page;
}
