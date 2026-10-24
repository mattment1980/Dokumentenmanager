/**
 * Bildschirm "crop": eine Seite zuschneiden (Ecken ziehen), drehen, Bildmodus wählen, löschen.
 * Arbeitet auf einer Kopie und übernimmt erst mit "Übernehmen".
 */
import { S } from "../core/state.js";
import { registerScreen, back } from "../core/router.js";
import { app, $, $$, topbar, toast, busy, unbusy } from "../core/ui.js";
import { I } from "../core/icons.js";
import { detectCorners, defaultCorners, rotateCanvas, renderPage } from "../documents/scan.js";
import { invalidate } from "../documents/job.js";

const screen = {
  render() {
    const job = S.job;
    const page = job?.pages?.[S.cropIndex];
    if (!page) return back();
    const work = { corners: page.corners.map((c) => ({ ...c })), mode: page.mode, src: page.src };
    this.work = work;
    app.innerHTML = `${topbar(`Seite ${S.cropIndex + 1}`, { sub: "Ecken mit dem Finger verschieben" })}
      <div class="cropwrap" id="wrap"><canvas id="cv"></canvas><svg class="overlay" id="ov"></svg></div>
      <div class="tools">
        <button class="btn small" id="rot">${I.rotate} Drehen</button>
        <button class="btn small" id="auto">${I.wand} Automatisch</button>
        <button class="btn small" id="full">${I.expand} Ganzes Bild</button>
        <button class="btn small danger" id="del">${I.trash} Löschen</button>
      </div>
      <div style="height:12px"></div>
      <div class="seg" id="mode">
        <button data-m="doc">Dokument</button><button data-m="color">Farbe</button><button data-m="none">Original</button>
      </div>
      <div style="height:14px"></div>
      <button class="btn primary block" id="apply">${I.check} Übernehmen</button>`;
    this.draw();
    this.bind();
    this.setMode(work.mode);
    $("#mode").onclick = (e) => {
      const b = e.target.closest("[data-m]");
      if (b) this.setMode(b.dataset.m);
    };
    $("#rot").onclick = () => {
      work.src = rotateCanvas(work.src, true);
      work.corners = detectCorners(work.src).corners;
      this.draw();
    };
    $("#auto").onclick = () => {
      const r = detectCorners(work.src);
      work.corners = r.corners;
      if (!r.detected) toast("Keine Blattkanten erkannt, bitte von Hand anpassen.");
      this.drawOverlay();
    };
    $("#full").onclick = () => {
      work.corners = defaultCorners(work.src.width, work.src.height, 0);
      this.drawOverlay();
    };
    $("#del").onclick = () => {
      job.pages.splice(S.cropIndex, 1);
      invalidate(job);
      back();
    };
    $("#apply").onclick = () => {
      busy("Seite wird zugeschnitten …");
      setTimeout(() => {
        Object.assign(page, { src: work.src, corners: work.corners, mode: work.mode, detected: true });
        renderPage(page);
        invalidate(job);
        unbusy();
        back();
      }, 30);
    };
  },
  setMode(m) {
    this.work.mode = m;
    $$("#mode [data-m]").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  },
  draw() {
    const { src } = this.work;
    const cv = $("#cv");
    const s = Math.min(1, 1100 / Math.max(src.width, src.height));
    cv.width = Math.round(src.width * s);
    cv.height = Math.round(src.height * s);
    cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
    this.k = s;
    $("#ov").setAttribute("viewBox", `0 0 ${cv.width} ${cv.height}`);
    this.drawOverlay();
  },
  drawOverlay() {
    const k = this.k;
    const pts = this.work.corners.map((c) => [c.x * k, c.y * k]);
    const cv = $("#cv");
    const r = Math.max(cv.width, cv.height) / 34;
    const stroke = Math.max(2, r / 4);
    $("#ov").innerHTML = `
      <path d="M0 0H${cv.width}V${cv.height}H0Z M${pts.map((p) => p.join(" ")).join(" L")} Z" fill="rgba(0,0,0,0.45)" fill-rule="evenodd"/>
      <polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#f0be68" stroke-width="${stroke}"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="rgba(240,190,104,0.35)" stroke="#f0be68" stroke-width="${stroke}"/>`).join("")}`;
  },
  bind() {
    const wrap = $("#wrap");
    let drag = -1;
    const toSrc = (e) => {
      const rect = wrap.getBoundingClientRect();
      const sx = this.work.src.width / rect.width;
      const sy = this.work.src.height / rect.height;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy, scale: sx };
    };
    wrap.addEventListener("pointerdown", (e) => {
      const p = toSrc(e);
      let best = -1;
      let bd = Infinity;
      this.work.corners.forEach((c, i) => {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd) (bd = d), (best = i);
      });
      if (bd / p.scale < 60) {
        drag = best;
        wrap.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });
    wrap.addEventListener("pointermove", (e) => {
      if (drag < 0) return;
      const p = toSrc(e);
      this.work.corners[drag] = {
        x: Math.min(this.work.src.width, Math.max(0, p.x)),
        y: Math.min(this.work.src.height, Math.max(0, p.y)),
      };
      this.drawOverlay();
    });
    const end = () => (drag = -1);
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
  },
};

registerScreen("crop", screen);
