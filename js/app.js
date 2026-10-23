import { APP, DEFAULT_STRUCTURE } from "./config.js";
import { settings, queue, history } from "./store.js";
import { buildFileName, todayIso, isValidIsoDate, cleanFolderName } from "./naming.js";
import { buildPdf } from "./pdf.js";
import { loadImage, detectCorners, defaultCorners, warp, enhance, rotateCanvas, canvasToJpeg, AI_MAX_EDGE } from "./scan.js";
import * as od from "./onedrive.js";
import * as ai from "./ai.js";

// ---------- Zustand ----------
const S = {
  clientId: APP.CLIENT_ID || settings.get("clientId", ""),
  account: null,
  me: null,
  root: settings.get("root", APP.defaultArchiveRoot),
  structure: settings.get("structure", null) || clone(DEFAULT_STRUCTURE),
  configLoaded: false,
  authProblem: false,
  pages: [],
  pdfInput: null,
  pdf: null,
  draft: null,
  lastResult: null,
  stack: [],
  edit: null,
  uploading: false,
};

const app = document.getElementById("app");
const camInput = document.getElementById("camInput");
const fileInput = document.getElementById("fileInput");

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];

const I = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.4-2h7l1.4 2h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.8"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h10M4 17h7"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L15 9M14 4v2M18 6l-1.5 1.5M20 10h-2M9 6l1 1"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};

// ---------- kleine UI-Helfer ----------
let toastTimer = null;
function toast(msg, ms = 3200) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

function busy(text) {
  unbusy();
  const o = document.createElement("div");
  o.className = "overlay-busy";
  o.id = "busy";
  o.innerHTML = `<div class="box"><div class="spinner"></div><div id="busyText">${esc(text)}</div></div>`;
  document.body.appendChild(o);
}
function busyText(text) {
  const el = document.getElementById("busyText");
  if (el) el.textContent = text;
}
function unbusy() {
  document.getElementById("busy")?.remove();
}

function topbar(title, { back = true, gear = false, sub = "" } = {}) {
  return `<header class="topbar">
    ${back ? `<button class="iconbtn" data-act="back" aria-label="Zurück">${I.back}</button>` : ""}
    <h1>${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</h1>
    ${gear ? `<button class="iconbtn" data-act="settings" aria-label="Einstellungen">${I.gear}</button>` : ""}
  </header>`;
}

// ---------- Navigation ----------
const screens = {};
function go(name, { replace = false } = {}) {
  if (replace && S.stack.length) S.stack[S.stack.length - 1] = name;
  else {
    S.stack.push(name);
    try { history_push(); } catch {}
  }
  render();
}
function history_push() {
  window.history.pushState({ dm: S.stack.length }, "");
}
function back() {
  if (S.stack.length > 1) {
    S.stack.pop();
    render();
  }
}
window.addEventListener("popstate", () => {
  if (S.stack.length > 1) {
    const cur = S.stack[S.stack.length - 1];
    if (cur === "crop") screens.crop.leave?.();
    S.stack.pop();
    render();
  }
});
function resetTo(name) {
  if (name !== "settings") S.edit = null;
  S.stack = [name];
  render();
}
function render() {
  const name = S.stack[S.stack.length - 1] || "home";
  window.scrollTo(0, 0);
  screens[name].render();
}

app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "back") return S.stack.length > 1 ? window.history.back() : undefined;
  if (act === "settings") return go("settings");
  if (act === "home") return resetTo("home");
});

// ---------- Strukturhilfen ----------
const folderByName = (n) => S.structure.folders.find((f) => f.name === n);
const doctypeByName = (n) => S.structure.doctypes.find((d) => d.name === n);
function uploaderName() {
  const n = S.me?.givenName || S.account?.name || "";
  return n.split(/\s+/)[0] || "Unbekannt";
}

// ---------- Start ----------
async function start() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => reg.update()).catch((e) => console.warn("SW", e));
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return; // Erstinstallation, kein Update
      // Neue Version aktiv: einmal neu laden, außer mitten in einem Scan
      if (reloaded || S.pages.length || S.pdfInput || S.draft) return;
      reloaded = true;
      location.reload();
    });
  }
  if (!S.clientId) return resetTo("setup");
  try {
    S.account = await od.initAuth(S.clientId);
  } catch (e) {
    S.setupError = String(e.message || e);
    return resetTo(S.account ? "home" : "login");
  }
  if (!S.account) return resetTo("login");
  resetTo("home");
  afterLogin();
}

async function afterLogin() {
  try {
    S.me = await od.getMe();
  } catch (e) {
    if (e instanceof od.AuthNeeded) S.authProblem = true;
  }
  await loadRemoteConfig();
  processQueue();
  refreshHome();
}

async function loadRemoteConfig() {
  try {
    const remote = await od.readJson([S.root, APP.configFileName]);
    if (remote && Array.isArray(remote.folders) && Array.isArray(remote.doctypes)) {
      S.structure = remote;
      settings.set("structure", remote);
      S.configLoaded = true;
      return;
    }
    // Erster Start: Struktur anlegen und Konfiguration speichern
    busy("Ordnerstruktur wird in OneDrive angelegt …");
    const st = S.structure && S.structure.folders?.length ? S.structure : clone(DEFAULT_STRUCTURE);
    await od.ensureStructure(S.root, st, (d, t) => busyText(`Ordnerstruktur wird in OneDrive angelegt … ${d}/${t}`));
    await od.writeJson([S.root, APP.configFileName], st);
    S.structure = st;
    settings.set("structure", st);
    S.configLoaded = true;
    unbusy();
    toast(`Ordnerstruktur in „${S.root}“ angelegt`);
  } catch (e) {
    unbusy();
    if (e instanceof od.AuthNeeded) S.authProblem = true;
    else if (navigator.onLine) toast("Konfiguration konnte nicht geladen werden: " + (e.message || e), 5000);
  }
}

function refreshHome() {
  if (S.stack[S.stack.length - 1] === "home") render();
}

// ---------- Warteschlange ----------
async function processQueue() {
  if (S.uploading) return;
  if (!S.account) return;
  S.uploading = true;
  let lastOk = null;
  try {
    const items = await queue.all();
    for (const it of items) {
      if (!navigator.onLine) break;
      try {
        const res = await od.uploadPdf(it.folderParts, it.fileName, it.bytes, it.description);
        await history.add({ id: it.id, created: Date.now(), name: res.name, path: it.folderParts.join(" / "), webUrl: res.webUrl });
        await queue.remove(it.id);
        lastOk = { id: it.id, ...res };
        S.authProblem = false;
      } catch (e) {
        if (e instanceof od.AuthNeeded) {
          S.authProblem = true;
          break;
        }
        console.warn("Upload fehlgeschlagen", e);
        it.lastError = String(e.message || e);
        await queue.add(it);
        break;
      }
    }
  } finally {
    S.uploading = false;
  }
  refreshHome();
  return lastOk;
}
window.addEventListener("online", () => processQueue());

// ---------- Bildschirm: Einrichtung ----------
screens.setup = {
  render() {
    app.innerHTML = `${topbar("Einrichtung", { back: false })}
      <div class="card stack">
        <h2>Verbindung zu Microsoft</h2>
        <p class="muted">Für die Anmeldung braucht die App die <b>Anwendungs-ID (Client-ID)</b> aus deiner Microsoft-App-Registrierung. Dort als Umleitungs-URI (Typ „Single-Page-Anwendung“) genau diese Adresse eintragen:</p>
        <code class="copy" id="ru">${esc(od.redirectUri())}</code>
        <button class="btn small" id="copyRu">Adresse kopieren</button>
        <label class="field"><span>Anwendungs-ID (Client-ID)</span>
          <input type="text" id="cid" placeholder="z. B. 1a2b3c4d-…" value="${esc(S.clientId)}" autocomplete="off" spellcheck="false"></label>
        <button class="btn primary block" id="saveCid">Speichern und weiter</button>
      </div>`;
    $("#copyRu").onclick = () => copy(od.redirectUri());
    $("#saveCid").onclick = () => {
      const v = $("#cid").value.trim();
      if (!/^[0-9a-f-]{32,40}$/i.test(v)) return toast("Das sieht nicht wie eine Client-ID aus.");
      settings.set("clientId", v);
      location.reload();
    };
  },
};

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopiert");
  } catch {
    toast("Kopieren nicht möglich, bitte manuell markieren.");
  }
}

// ---------- Bildschirm: Anmeldung ----------
screens.login = {
  render() {
    app.innerHTML = `${topbar(APP.name, { back: false, gear: true })}
      <div class="center">
        <img src="icons/icon-192.png" alt="" width="96" height="96" style="border-radius:22px">
        <div><h2 style="margin:0 0 6px">Willkommen</h2>
        <p class="muted">Melde dich mit deinem Microsoft-Konto an. Die Dokumente werden in deinem OneDrive im Ordner „${esc(S.root)}“ abgelegt.</p></div>
        ${S.setupError ? `<div class="banner err">${esc(S.setupError)}</div>` : ""}
        <button class="btn primary block" id="login">Mit Microsoft anmelden</button>
      </div>`;
    $("#login").onclick = async () => {
      try {
        await od.login();
      } catch (e) {
        toast("Anmeldung fehlgeschlagen: " + (e.message || e), 6000);
      }
    };
  },
};

// ---------- Bildschirm: Start ----------
screens.home = {
  async render() {
    const [pending, hist] = await Promise.all([queue.all().catch(() => []), history.all().catch(() => [])]);
    if (S.stack[S.stack.length - 1] !== "home") return;
    const name = S.me?.givenName || S.account?.name?.split(" ")[0] || "";
    app.innerHTML = `${topbar(APP.name, { back: false, gear: true, sub: name ? `Hallo ${name}` : "" })}
      ${S.authProblem ? `<div class="banner warn"><span class="grow">Die Anmeldung ist abgelaufen.</span><button class="btn small" id="reauth">Neu anmelden</button></div>` : ""}
      ${pending.length ? `<div class="banner info"><span class="grow">${pending.length} Dokument${pending.length > 1 ? "e warten" : " wartet"} auf das Hochladen${navigator.onLine ? "" : " (offline)"}.${pending[0].lastError ? `<br><span class="small">${esc(pending[0].lastError)}</span>` : ""}</span>${navigator.onLine && !S.authProblem ? `<button class="btn small" id="retry">Jetzt</button>` : ""}</div>` : ""}
      <button class="hero" id="scan">${I.camera}<span>Dokument scannen</span></button>
      <button class="btn block" id="pick">${I.file} Foto oder PDF auswählen</button>
      <div style="height:18px"></div>
      <div class="card">
        <h2>Zuletzt abgelegt</h2>
        ${hist.length ? `<ul class="list">${hist.slice(0, 10).map((h) => `<li>
            <div class="fname">${esc(h.name)}</div>
            <div class="path">${esc(h.path)} · ${new Date(h.created).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</div>
            ${h.webUrl ? `<a class="small" href="${esc(h.webUrl)}" target="_blank" rel="noopener">In OneDrive öffnen</a>` : ""}
          </li>`).join("")}</ul>` : `<p class="muted">Noch nichts abgelegt. Leg los mit „Dokument scannen“.</p>`}
      </div>`;
    $("#scan").onclick = () => startScan();
    $("#pick").onclick = () => fileInput.click();
    $("#retry") && ($("#retry").onclick = () => processQueue());
    $("#reauth") && ($("#reauth").onclick = () => od.reauth());
  },
};

function startScan() {
  S.pages = [];
  S.pdfInput = null;
  S.pdf = null;
  S.draft = null;
  camInput.value = "";
  camInput.click();
}

camInput.addEventListener("change", async () => {
  const files = [...camInput.files];
  camInput.value = "";
  if (!files.length) return;
  await addImages(files);
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (!files.length) return;
  const pdfs = files.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const imgs = files.filter((f) => !pdfs.includes(f));
  const cur = S.stack[S.stack.length - 1];
  if (pdfs.length && cur === "pages") toast("PDFs können nicht zu fotografierten Seiten hinzugefügt werden.");
  if (pdfs.length && cur !== "pages") {
    if (pdfs.length > 1 || imgs.length) toast("Es wird nur das erste PDF übernommen.");
    S.pages = [];
    S.pdf = null;
    S.draft = null;
    const bytes = new Uint8Array(await pdfs[0].arrayBuffer());
    S.pdfInput = { bytes, name: pdfs[0].name };
    S.pdf = { bytes, pages: null, aiImages: [], fromFile: true };
    go("route");
    return;
  }
  if (cur !== "pages") {
    S.pages = [];
    S.pdfInput = null;
  }
  if (imgs.length) await addImages(imgs);
});

async function addImages(files) {
  busy(files.length > 1 ? "Bilder werden verarbeitet …" : "Bild wird verarbeitet …");
  try {
    for (const [i, f] of files.entries()) {
      if (files.length > 1) busyText(`Bild ${i + 1} von ${files.length} wird verarbeitet …`);
      const src = await loadImage(f);
      const { corners, detected } = detectCorners(src);
      const page = { src, corners, mode: "doc", detected };
      processPage(page);
      S.pages.push(page);
    }
  } catch (e) {
    toast("Bild konnte nicht verarbeitet werden: " + (e.message || e), 5000);
  } finally {
    unbusy();
  }
  S.pdf = null;
  if (S.stack[S.stack.length - 1] !== "pages") go("pages");
  else render();
}

function processPage(page) {
  const out = enhance(warp(page.src, page.corners), page.mode);
  page.out = out;
  const t = document.createElement("canvas");
  const s = 360 / Math.max(out.width, out.height);
  t.width = Math.round(out.width * s);
  t.height = Math.round(out.height * s);
  t.getContext("2d").drawImage(out, 0, 0, t.width, t.height);
  page.thumb = t.toDataURL("image/jpeg", 0.7);
}

// ---------- Bildschirm: Seiten ----------
screens.pages = {
  render() {
    const n = S.pages.length;
    app.innerHTML = `${topbar("Seiten", { sub: `${n} Seite${n === 1 ? "" : "n"} · tippen zum Zuschneiden` })}
      <div class="pages">
        ${S.pages.map((p, i) => `<button class="thumb" data-i="${i}" aria-label="Seite ${i + 1} bearbeiten"><img src="${p.thumb}" alt=""><span class="no">${i + 1}</span></button>`).join("")}
        <button class="thumb add" id="addCam" aria-label="Weitere Seite fotografieren">${I.plus}</button>
      </div>
      ${S.pages.some((p) => !p.detected) ? `<p class="muted small" style="margin-top:12px">Bei mindestens einer Seite wurden die Blattkanten nicht sicher erkannt. Tippe sie an, um die Ecken anzupassen.</p>` : ""}
      <div style="height:16px"></div>
      <div class="row">
        <button class="btn grow" id="addCam2">${I.camera} Weitere Seite</button>
        <button class="btn" id="addFile" aria-label="Aus Galerie">${I.file}</button>
      </div>
      <div style="height:10px"></div>
      <button class="btn primary block" id="next" ${n ? "" : "disabled"}>Weiter</button>`;
    $$(".thumb[data-i]").forEach((b) => (b.onclick = () => {
      S.cropIndex = Number(b.dataset.i);
      go("crop");
    }));
    $("#addCam").onclick = $("#addCam2").onclick = () => {
      camInput.value = "";
      camInput.click();
    };
    $("#addFile").onclick = () => fileInput.click();
    $("#next").onclick = () => go("route");
  },
};

// ---------- Bildschirm: Zuschnitt ----------
screens.crop = {
  render() {
    const page = S.pages[S.cropIndex];
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
      S.pages.splice(S.cropIndex, 1);
      S.pdf = null;
      window.history.back();
    };
    $("#apply").onclick = () => {
      busy("Seite wird zugeschnitten …");
      setTimeout(() => {
        page.src = work.src;
        page.corners = work.corners;
        page.mode = work.mode;
        page.detected = true;
        processPage(page);
        S.pdf = null;
        unbusy();
        window.history.back();
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

// ---------- PDF ----------
async function preparePdf() {
  if (S.pdf) return S.pdf;
  const jpegs = [];
  const aiImages = [];
  for (const p of S.pages) {
    const j = await canvasToJpeg(p.out, 0.78);
    jpegs.push({ jpeg: j.bytes, width: j.width, height: j.height });
    const a = await canvasToJpeg(p.out, 0.82, AI_MAX_EDGE);
    aiImages.push(a.bytes);
  }
  S.pdf = { pages: jpegs, aiImages, bytes: buildPdf(jpegs, {}), fromFile: false };
  return S.pdf;
}

// ---------- Bildschirm: Weg wählen ----------
screens.route = {
  async render() {
    const hasKey = !!settings.get("apiKey", "");
    if (!S.pdf) {
      app.innerHTML = `${topbar("Ablegen")}<div class="center"><div class="spinner"></div><div class="muted">PDF wird erstellt …</div></div>`;
      try {
        await preparePdf();
      } catch (e) {
        toast("PDF konnte nicht erstellt werden: " + (e.message || e), 6000);
        return back();
      }
      if (S.stack[S.stack.length - 1] !== "route") return;
    }
    const pdfSize = (S.pdf.bytes.length / 1024 / 1024).toFixed(1).replace(".", ",");
    const info = S.pdf.fromFile ? `PDF: ${S.pdfInput.name}` : `${S.pages.length} Seite${S.pages.length === 1 ? "" : "n"}`;
    const model = APP.models.find((m) => m.id === settings.get("model", APP.defaultModel));
    app.innerHTML = `${topbar("Wie ablegen?", { sub: `${info} · ${pdfSize} MB` })}
      <div class="route">
        <button id="ai" ${hasKey ? "" : "disabled"}>
          <span class="ic">${I.spark}</span>
          <span><b>KI-Vorschlag</b><span class="muted">Die KI liest das Dokument und schlägt Ordner, Typ, Absender, Titel und Datum vor. Du prüfst und bestätigst.${hasKey ? `<br><span class="small">${esc(model ? model.label : "")}</span>` : `<br><span class="small">Erst in den Einstellungen einen API-Schlüssel hinterlegen.</span>`}</span></span>
        </button>
        <button id="direct">
          <span class="ic">${I.hand}</span>
          <span><b>Direkt ablegen</b><span class="muted">Ohne KI: Typ und Ordner per Tipp wählen, Absender und Titel eintippen. Das Dokument geht nur an OneDrive.</span></span>
        </button>
      </div>`;
    $("#ai").onclick = () => {
      S.draft = newDraft();
      S.draft.aiPending = true;
      go("review");
      runAi();
    };
    $("#direct").onclick = () => {
      S.draft = newDraft();
      go("review");
    };
  },
};

function newDraft() {
  return { date: todayIso(), doctype: "", folder: "", subfolder: "", sender: "", title: "", ai: null, aiPending: false, aiError: "" };
}

async function runAi() {
  const d = S.draft;
  try {
    const sug = await ai.suggest({
      key: settings.get("apiKey", ""),
      model: settings.get("model", APP.defaultModel),
      structure: S.structure,
      images: S.pdf.fromFile ? [] : S.pdf.aiImages,
      pdf: S.pdf.fromFile ? S.pdf.bytes : null,
      today: todayIso(),
    });
    if (S.draft !== d) return;
    Object.assign(d, {
      ai: sug,
      folder: sug.folder,
      subfolder: sug.subfolder,
      doctype: sug.doctype,
      sender: sug.sender,
      title: sug.title,
      date: sug.date || d.date,
      dateFromAi: !!sug.date,
    });
  } catch (e) {
    if (S.draft !== d) return;
    d.aiError = String(e.message || e);
  }
  d.aiPending = false;
  if (S.stack[S.stack.length - 1] === "review") render();
}

// ---------- Bildschirm: Prüfen & Ablegen ----------
screens.review = {
  render() {
    const d = S.draft;
    if (!d) return resetTo("home");
    if (d.aiPending) {
      app.innerHTML = `${topbar("KI-Vorschlag")}<div class="center"><div class="spinner"></div><div><b>Die KI liest das Dokument …</b><div class="muted small">Das dauert meist 5 bis 15 Sekunden.</div></div>
        <button class="btn" id="skip">Abbrechen und direkt ablegen</button></div>`;
      $("#skip").onclick = () => {
        S.draft = newDraft();
        render();
      };
      return;
    }
    const folder = folderByName(d.folder);
    const subs = folder?.children || [];
    const ai = d.ai;
    const conf = ai && typeof ai.confidence === "number" ? Math.round(ai.confidence * 100) : null;
    app.innerHTML = `${topbar("Prüfen & ablegen")}
      ${d.aiError ? `<div class="banner err"><span class="grow">${esc(d.aiError)}<br><span class="small">Du kannst das Dokument trotzdem direkt ablegen.</span></span></div>` : ""}
      ${ai ? `<div class="banner ${conf !== null && conf < 60 ? "warn" : "info"}"><span class="grow"><b>KI-Vorschlag${conf !== null ? ` (${conf} % sicher)` : ""}</b><br>${esc(ai.reason)}${!d.dateFromAi ? "<br>Kein Briefdatum erkannt, heutiges Datum eingesetzt." : ""}</span></div>` : ""}

      <div class="card">
        <h2>Dokumenttyp</h2>
        <div class="chips" id="dt">${S.structure.doctypes.map((t) => `<button class="chip ${d.doctype === t.name ? "on" : ""} ${ai && ai.doctype === t.name ? "ai" : ""}" data-v="${esc(t.name)}">${esc(t.name)}</button>`).join("")}</div>
      </div>

      <div class="card">
        <h2>Ordner</h2>
        <div class="folders" id="fo">${S.structure.folders.map((f) => {
          const m = f.name.match(/^(\d+)_(.*)$/);
          return `<button class="chip ${d.folder === f.name ? "on" : ""} ${ai && ai.folder === f.name ? "ai" : ""}" data-v="${esc(f.name)}">${m ? `<span class="n">${esc(m[1])}</span>${esc(m[2])}` : esc(f.name)}</button>`;
        }).join("")}</div>
        ${subs.length ? `<div style="height:12px"></div><h2>Unterordner</h2>
          <div class="chips" id="sf">${subs.map((c) => `<button class="chip ${d.subfolder === c.name ? "on" : ""} ${ai && ai.subfolder === c.name && ai.folder === d.folder ? "ai" : ""}" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      </div>

      <div class="card">
        <label class="field"><span>Briefdatum</span><input type="date" id="date" value="${esc(d.date)}"></label>
        <label class="field"><span>Absender (kurz)</span><input type="text" id="sender" value="${esc(d.sender)}" placeholder="z. B. Finanzamt" autocomplete="off"></label>
        <label class="field" style="margin-bottom:0"><span>Titel (Inhalt)</span><input type="text" id="title" value="${esc(d.title)}" placeholder="z. B. Einkommensteuer 2025" autocomplete="off"></label>
      </div>

      <div class="actionbar">
        <div class="preview" id="pv"></div>
        <button class="btn primary block" id="save">${I.check} Ablegen</button>
      </div>`;

    $("#dt").onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      d.doctype = b.dataset.v;
      render();
    };
    $("#fo").onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      if (d.folder !== b.dataset.v) {
        d.folder = b.dataset.v;
        const f = folderByName(d.folder);
        d.subfolder = f && f.children && f.children.length === 1 ? f.children[0].name : "";
        if (ai && ai.folder === d.folder) d.subfolder = ai.subfolder || d.subfolder;
      }
      render();
    };
    $("#sf") && ($("#sf").onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      d.subfolder = b.dataset.v;
      render();
    });
    for (const id of ["date", "sender", "title"]) {
      $("#" + id).addEventListener("input", (e) => {
        d[id] = e.target.value;
        this.preview();
      });
    }
    $("#save").onclick = () => saveDocument();
    this.preview();
  },
  preview() {
    const d = S.draft;
    const v = validate(d);
    const name = currentFileName(d);
    $("#pv").innerHTML = `${esc(name)}<div class="path">${esc([S.root, d.folder || "…", d.subfolder].filter(Boolean).join(" / "))}</div>${v ? `<div class="path" style="color:var(--warn)">${esc(v)}</div>` : ""}`;
    $("#save").disabled = !!v;
  },
};

function currentFileName(d) {
  const dt = doctypeByName(d.doctype);
  return buildFileName({ date: d.date, sender: d.sender, doctypeShort: dt ? dt.short : "", title: d.title });
}

function validate(d) {
  if (!d.doctype) return "Bitte Dokumenttyp wählen.";
  if (!d.folder) return "Bitte Ordner wählen.";
  const f = folderByName(d.folder);
  if (f && f.children && f.children.length && !d.subfolder) return "Bitte Unterordner wählen.";
  if (!isValidIsoDate(d.date)) return "Bitte gültiges Datum eingeben.";
  if (!d.sender.trim()) return "Bitte Absender eintragen.";
  if (!d.title.trim()) return "Bitte Titel eintragen.";
  return "";
}

async function saveDocument() {
  const d = S.draft;
  if (validate(d)) return;
  const fileName = currentFileName(d);
  const folderParts = [S.root, d.folder, d.subfolder].filter(Boolean);
  const who = uploaderName();
  const today = new Date().toLocaleDateString("de-DE");
  const description = `Abgelegt von: ${who} am ${today} · Dokumenttyp: ${d.doctype} · Absender: ${d.sender.trim()}`;
  busy("Wird abgelegt …");
  try {
    let bytes = S.pdf.bytes;
    if (!S.pdf.fromFile) {
      bytes = buildPdf(S.pdf.pages, {
        title: `${d.sender.trim()} – ${d.title.trim()}`,
        author: who,
        subject: `${d.doctype} · Abgelegt von ${who}`,
        keywords: [d.doctype, d.folder, d.subfolder, d.sender].filter(Boolean).join(", "),
      });
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await queue.add({ id, created: Date.now(), folderParts, fileName, bytes, description });
    let res = null;
    if (navigator.onLine) {
      res = await processQueue();
    }
    const stillQueued = (await queue.all()).some((q) => q.id === id);
    S.lastResult = {
      fileName: res && res.id === id ? res.name : fileName,
      path: folderParts.join(" / "),
      webUrl: res && res.id === id ? res.webUrl : null,
      queued: stillQueued,
      authProblem: S.authProblem,
    };
    unbusy();
    S.pages = [];
    S.pdf = null;
    S.pdfInput = null;
    S.draft = null;
    S.stack = ["home", "done"];
    try { window.history.pushState({ dm: 2 }, ""); } catch {}
    render();
  } catch (e) {
    unbusy();
    toast("Ablegen fehlgeschlagen: " + (e.message || e), 6000);
  }
}

// ---------- Bildschirm: Fertig ----------
screens.done = {
  render() {
    const r = S.lastResult;
    app.innerHTML = `${topbar("Fertig", { back: false })}
      <div class="center">
        <div class="route"><span class="ic" style="width:64px;height:64px;border-radius:20px;${r.queued ? "" : "background:var(--ok-soft);color:var(--ok)"}">${r.queued ? I.file : I.check}</span></div>
        <div>
          <h2 style="margin:0 0 6px">${r.queued ? "Gespeichert, wird hochgeladen" : "Abgelegt"}</h2>
          <p class="muted">${r.queued ? (r.authProblem ? "Bitte neu anmelden, dann wird das Dokument hochgeladen." : "Sobald wieder Internet da ist und die App geöffnet ist, wird das Dokument automatisch hochgeladen.") : "Das Dokument liegt jetzt in OneDrive."}</p>
        </div>
        <div class="preview" style="width:100%;text-align:left">${esc(r.fileName)}<div class="path">${esc(r.path)}</div></div>
        ${r.webUrl ? `<a class="btn block" href="${esc(r.webUrl)}" target="_blank" rel="noopener">${I.ext} In OneDrive öffnen</a>` : ""}
        <button class="btn primary block" id="again">${I.camera} Nächstes Dokument scannen</button>
        <button class="btn block" data-act="home">Zur Startseite</button>
      </div>`;
    $("#again").onclick = () => {
      S.stack = ["home"];
      startScan();
    };
  },
};

// ---------- Bildschirm: Einstellungen ----------
screens.settings = {
  render() {
    if (!S.edit) S.edit = clone(S.structure);
    const key = settings.get("apiKey", "");
    const model = settings.get("model", APP.defaultModel);
    app.innerHTML = `${topbar("Einstellungen")}
      <div class="card stack">
        <h2>Konto</h2>
        ${S.account ? `<dl class="kv"><dt>Angemeldet</dt><dd>${esc(S.account.name || "")} (${esc(S.account.username || "")})</dd><dt>Ablage als</dt><dd>${esc(uploaderName())}</dd></dl>
          <button class="btn small" id="logout">Abmelden</button>` : `<p class="muted">Nicht angemeldet.</p>`}
      </div>

      <div class="card stack">
        <h2>Archivordner in OneDrive</h2>
        <label class="field" style="margin:0"><span>Pfad ab OneDrive-Hauptebene</span><input type="text" id="root" value="${esc(S.root)}"></label>
        <button class="btn small" id="saveRoot">Ordner übernehmen</button>
      </div>

      <div class="card stack">
        <h2>KI</h2>
        <label class="field" style="margin:0"><span>Anthropic API-Schlüssel ${key ? "(gespeichert)" : ""}</span>
          <input type="password" id="key" placeholder="${key ? "•••• " + esc(key.slice(-4)) : "sk-ant-…"}" autocomplete="off" spellcheck="false"></label>
        <p class="muted small">Wird nur auf diesem Gerät gespeichert und nur direkt an Anthropic gesendet.</p>
        <div class="row">
          <button class="btn small" id="saveKey">Speichern</button>
          <button class="btn small" id="testKey" ${key ? "" : "disabled"}>Testen</button>
          <button class="btn small danger" id="delKey" ${key ? "" : "disabled"}>Entfernen</button>
        </div>
        <label class="field" style="margin:6px 0 0"><span>Modell</span>
          <select id="model">${APP.models.map((m) => `<option value="${m.id}" ${m.id === model ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
      </div>

      <div class="card">
        <h2>Ordnerstruktur</h2>
        <p class="muted small">Die Beschreibung ist die Regel, nach der die KI einsortiert. Neue Ordner werden beim Speichern in OneDrive angelegt. Umbenannte oder gelöschte Ordner bleiben in OneDrive unverändert bestehen und müssen dort von Hand umbenannt oder verschoben werden.</p>
        <div id="ed"></div>
        <button class="btn small" id="addFolder">${I.plus} Hauptordner</button>
      </div>

      <div class="card">
        <h2>Dokumenttypen</h2>
        <p class="muted small">Name · Kürzel im Dateinamen</p>
        <div id="dts"></div>
        <button class="btn small" id="addDt">${I.plus} Dokumenttyp</button>
      </div>

      <button class="btn primary block" id="saveStruct">Struktur speichern</button>
      <div style="height:8px"></div>
      <div class="row">
        <button class="btn small grow" id="discard">Änderungen verwerfen</button>
        <button class="btn small grow danger" id="reset">Standard wiederherstellen</button>
      </div>

      <div style="height:14px"></div>
      <div class="card stack">
        <h2>Technisches</h2>
        <dl class="kv">
          <dt>Version</dt><dd>${esc(APP.version)}</dd>
          <dt>Client-ID</dt><dd>${esc(S.clientId || "–")}</dd>
          <dt>Umleitungs-URI</dt><dd>${esc(od.redirectUri())}</dd>
        </dl>
        <div class="row">
          <button class="btn small" id="copyRu">Umleitungs-URI kopieren</button>
          ${APP.CLIENT_ID ? "" : `<button class="btn small" id="chgCid">Client-ID ändern</button>`}
          <button class="btn small" id="reload">App neu laden</button>
        </div>
      </div>`;

    this.renderEditor();
    this.renderDoctypes();

    $("#logout") && ($("#logout").onclick = () => od.logout());
    $("#saveRoot").onclick = async () => {
      const parts = $("#root").value.split(/[\/\\]/).map(cleanFolderName).filter(Boolean);
      if (!parts.length) return toast("Bitte einen Ordnernamen eingeben.");
      S.root = parts.join("/");
      settings.set("root", S.root);
      toast(`Archivordner: ${S.root}`);
      await loadRemoteConfig();
      S.edit = clone(S.structure);
      render();
    };
    $("#saveKey").onclick = () => {
      const v = $("#key").value.trim();
      if (!v) return toast("Bitte Schlüssel einfügen.");
      if (!/^sk-ant-/.test(v)) toast("Hinweis: Anthropic-Schlüssel beginnen mit „sk-ant-“.");
      settings.set("apiKey", v);
      toast("Schlüssel gespeichert");
      render();
    };
    $("#testKey").onclick = async () => {
      busy("Schlüssel wird getestet …");
      try {
        await ai.testKey(settings.get("apiKey", ""), settings.get("model", APP.defaultModel));
        unbusy();
        toast("Schlüssel funktioniert ✓");
      } catch (e) {
        unbusy();
        toast(String(e.message || e), 6000);
      }
    };
    $("#delKey").onclick = () => {
      if (!confirm("API-Schlüssel von diesem Gerät entfernen?")) return;
      settings.set("apiKey", null);
      render();
    };
    $("#model").onchange = (e) => settings.set("model", e.target.value);
    $("#addFolder").onclick = () => {
      S.edit.folders.push({ name: "Neuer Ordner", description: "", children: [], _open: true });
      this.renderEditor();
    };
    $("#addDt").onclick = () => {
      S.edit.doctypes.push({ name: "", short: "", hint: "" });
      this.renderDoctypes();
    };
    $("#saveStruct").onclick = () => this.save();
    $("#discard").onclick = () => {
      S.edit = clone(S.structure);
      render();
    };
    $("#reset").onclick = () => {
      if (!confirm("Ordnerstruktur und Dokumenttypen auf den Standard zurücksetzen? (Erst wirksam nach „Struktur speichern“)")) return;
      S.edit = clone(DEFAULT_STRUCTURE);
      render();
    };
    $("#copyRu").onclick = () => copy(od.redirectUri());
    $("#chgCid") && ($("#chgCid").onclick = () => resetTo("setup"));
    $("#reload").onclick = () => location.reload();
  },

  renderEditor() {
    const ed = $("#ed");
    const fs = S.edit.folders;
    ed.innerHTML = fs.map((f, i) => `
      <details class="fold" data-i="${i}" ${f._open ? "open" : ""}>
        <summary>${esc(f.name || "(ohne Namen)")}<span class="cnt">${(f.children || []).length || ""}</span></summary>
        <div class="body">
          <label class="field"><span>Name</span><input type="text" data-f="name" value="${esc(f.name)}"></label>
          <label class="field"><span>Regel für die KI</span><textarea data-f="description">${esc(f.description || "")}</textarea></label>
          <div class="small muted" style="margin-bottom:6px">Unterordner · Hinweis für die KI (optional)</div>
          ${(f.children || []).map((c, j) => `<div class="subrow" data-j="${j}">
              <input type="text" data-c="name" value="${esc(c.name)}" placeholder="Name">
              <input type="text" data-c="description" value="${esc(c.description || "")}" placeholder="Hinweis">
              <button class="iconbtn" data-del-sub="${j}" aria-label="Unterordner löschen">${I.trash}</button>
            </div>`).join("")}
          <div class="tools">
            <button class="btn small" data-add-sub>${I.plus} Unterordner</button>
            <button class="btn small" data-up ${i === 0 ? "disabled" : ""} aria-label="Nach oben">${I.up}</button>
            <button class="btn small" data-down ${i === fs.length - 1 ? "disabled" : ""} aria-label="Nach unten">${I.down}</button>
            <button class="btn small danger" data-del>${I.trash} Ordner</button>
          </div>
        </div>
      </details>`).join("");

    $$("details.fold", ed).forEach((det) => {
      const i = Number(det.dataset.i);
      const f = fs[i];
      det.addEventListener("toggle", () => (f._open = det.open));
      $$("[data-f]", det).forEach((inp) => inp.addEventListener("input", () => {
        f[inp.dataset.f] = inp.value;
        if (inp.dataset.f === "name") $("summary", det).firstChild.textContent = inp.value || "(ohne Namen)";
      }));
      $$(".subrow", det).forEach((row) => {
        const j = Number(row.dataset.j);
        $$("[data-c]", row).forEach((inp) => inp.addEventListener("input", () => (f.children[j][inp.dataset.c] = inp.value)));
      });
      det.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-add-sub")) {
          f.children = f.children || [];
          f.children.push({ name: "" });
          f._open = true;
        } else if (b.hasAttribute("data-del-sub")) {
          f.children.splice(Number(b.dataset.delSub), 1);
        } else if (b.hasAttribute("data-up") && i > 0) {
          [fs[i - 1], fs[i]] = [fs[i], fs[i - 1]];
        } else if (b.hasAttribute("data-down") && i < fs.length - 1) {
          [fs[i + 1], fs[i]] = [fs[i], fs[i + 1]];
        } else if (b.hasAttribute("data-del")) {
          if (!confirm(`Ordner „${f.name}“ aus der Struktur entfernen? (In OneDrive bleibt er bestehen.)`)) return;
          fs.splice(i, 1);
        } else return;
        this.renderEditor();
      });
    });
  },

  renderDoctypes() {
    const box = $("#dts");
    const ds = S.edit.doctypes;
    box.innerHTML = ds.map((d, i) => `<div class="dtrow" data-i="${i}">
        <input type="text" data-k="name" value="${esc(d.name)}" placeholder="Name">
        <input type="text" data-k="short" value="${esc(d.short)}" placeholder="Kürzel">
        <button class="iconbtn" data-up ${i === 0 ? "disabled" : ""} aria-label="Nach oben">${I.up}</button>
        <button class="iconbtn" data-down ${i === ds.length - 1 ? "disabled" : ""} aria-label="Nach unten">${I.down}</button>
        <button class="iconbtn" data-del aria-label="Löschen">${I.trash}</button>
      </div>`).join("");
    $$(".dtrow", box).forEach((row) => {
      const i = Number(row.dataset.i);
      $$("[data-k]", row).forEach((inp) => inp.addEventListener("input", () => (ds[i][inp.dataset.k] = inp.value)));
      row.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-up") && i > 0) [ds[i - 1], ds[i]] = [ds[i], ds[i - 1]];
        else if (b.hasAttribute("data-down") && i < ds.length - 1) [ds[i + 1], ds[i]] = [ds[i], ds[i + 1]];
        else if (b.hasAttribute("data-del")) ds.splice(i, 1);
        else return;
        this.renderDoctypes();
      });
    });
  },

  async save() {
    const st = {
      version: 1,
      folders: S.edit.folders.map((f) => ({
        name: cleanFolderName(f.name),
        description: String(f.description || "").trim(),
        children: (f.children || [])
          .map((c) => ({ name: cleanFolderName(c.name), ...(String(c.description || "").trim() ? { description: String(c.description).trim() } : {}) }))
          .filter((c) => c.name),
      })),
      doctypes: S.edit.doctypes
        .map((d) => ({ name: String(d.name || "").trim(), short: String(d.short || d.name || "").trim(), hint: String(d.hint || "").trim() }))
        .filter((d) => d.name),
    };
    const err = checkStructure(st);
    if (err) return toast(err, 5000);
    if (!S.account) return toast("Bitte zuerst anmelden.");
    busy("Struktur wird gespeichert …");
    try {
      await od.ensureStructure(S.root, st, (d, t) => busyText(`Ordner werden geprüft … ${d}/${t}`));
      await od.writeJson([S.root, APP.configFileName], st);
      S.structure = st;
      settings.set("structure", st);
      S.edit = clone(st);
      unbusy();
      toast("Struktur gespeichert ✓");
      render();
    } catch (e) {
      unbusy();
      if (e instanceof od.AuthNeeded) toast("Bitte neu anmelden und dann nochmal speichern.", 5000);
      else toast("Speichern fehlgeschlagen: " + (e.message || e), 6000);
    }
  },
};

function checkStructure(st) {
  if (!st.folders.length) return "Mindestens ein Ordner ist nötig.";
  const seen = new Set();
  for (const f of st.folders) {
    if (!f.name) return "Jeder Hauptordner braucht einen Namen.";
    const k = f.name.toLowerCase();
    if (seen.has(k)) return `Ordnername doppelt: „${f.name}“`;
    seen.add(k);
    const sub = new Set();
    for (const c of f.children) {
      const ck = c.name.toLowerCase();
      if (sub.has(ck)) return `Unterordner doppelt in „${f.name}“: „${c.name}“`;
      sub.add(ck);
    }
  }
  if (!st.doctypes.length) return "Mindestens ein Dokumenttyp ist nötig.";
  const dt = new Set();
  for (const d of st.doctypes) {
    if (dt.has(d.name.toLowerCase())) return `Dokumenttyp doppelt: „${d.name}“`;
    dt.add(d.name.toLowerCase());
  }
  return "";
}

// Verlassen der Einstellungen: ungespeicherte Bearbeitung verwerfen
window.addEventListener("popstate", () => {
  if (S.stack[S.stack.length - 1] !== "settings") S.edit = null;
});

start();
