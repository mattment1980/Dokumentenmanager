/**
 * Kleine UI-Helfer, die von allen Bildschirmen genutzt werden.
 *
 * Sicherheitsregel: Alles, was aus Dokumenten, E-Mails, der KI oder OneDrive kommt, wird vor dem
 * Einfügen in HTML mit esc() maskiert. Siehe docs/SICHERHEIT.md.
 */
import { I } from "./icons.js";

/** Container, in den die Bildschirme gezeichnet werden. */
export const app = document.getElementById("app");

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const $ = (sel, root = app) => root.querySelector(sel);
export const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];

let toastTimer = null;
/** Kurze Meldung am unteren Rand. */
export function toast(msg, ms = 3200) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

/** Blockierende Warteanzeige. busyText() ändert den Text, unbusy() schließt sie. */
export function busy(text) {
  unbusy();
  const o = document.createElement("div");
  o.className = "overlay-busy";
  o.id = "busy";
  o.innerHTML = `<div class="box"><div class="spinner"></div><div id="busyText">${esc(text)}</div></div>`;
  document.body.appendChild(o);
}
export function busyText(text) {
  const el = document.getElementById("busyText");
  if (el) el.textContent = text;
}
export function unbusy() {
  document.getElementById("busy")?.remove();
}

/** Kopfzeile eines Bildschirms. */
export function topbar(title, { back = true, gear = false, sub = "" } = {}) {
  return `<header class="topbar">
    ${back ? `<button class="iconbtn" data-act="back" aria-label="Zurück">${I.back}</button>` : ""}
    <h1>${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</h1>
    ${gear ? `<button class="iconbtn" data-act="settings" aria-label="Einstellungen">${I.gear}</button>` : ""}
  </header>`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopiert");
  } catch {
    toast("Kopieren nicht möglich, bitte manuell markieren.");
  }
}

/** Dateigröße lesbar, z. B. "1,4 MB". */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export const errText = (e) => String((e && e.message) || e);
