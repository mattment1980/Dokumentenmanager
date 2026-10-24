/**
 * Navigation zwischen Bildschirmen.
 *
 * Jeder Bildschirm ist ein Objekt mit render() und wird mit registerScreen(name, screen)
 * angemeldet. Optional:
 *   enter() – wird beim Öffnen über go() aufgerufen (nicht beim Zurückkehren)
 *   leave() – wird beim Verlassen über die Zurück-Taste aufgerufen
 *
 * Der Verlauf ist ein einfacher Stapel von Namen; die Zurück-Taste von Android/Browser
 * wird über history.pushState/popstate angebunden.
 */
import { app } from "./ui.js";

const screens = {};
let stack = [];

export function registerScreen(name, screen) {
  screens[name] = screen;
}

export const current = () => stack[stack.length - 1] || "home";
export const isCurrent = (name) => current() === name;
export const stackDepth = () => stack.length;

export function render() {
  window.scrollTo(0, 0);
  const s = screens[current()];
  if (!s) throw new Error(`Unbekannter Bildschirm: ${current()}`);
  s.render();
}

/** Öffnet einen Bildschirm (mit Eintrag im Zurück-Verlauf). */
export function go(name) {
  screens[name]?.enter?.();
  stack.push(name);
  try {
    window.history.pushState({ dm: stack.length }, "");
  } catch {}
  render();
}

/** Ersetzt den kompletten Verlauf, z. B. nach dem Ablegen: setStack(["home", "done"]). */
export function setStack(names) {
  stack = [...names];
  try {
    window.history.pushState({ dm: stack.length }, "");
  } catch {}
  render();
}

/** Zurück zur Startseite bzw. zu einem einzelnen Bildschirm ohne Verlauf. */
export function resetTo(name) {
  stack = [name];
  render();
}

/** Zurück wie mit der Zurück-Taste. */
export function back() {
  if (stack.length > 1) window.history.back();
}

window.addEventListener("popstate", () => {
  if (stack.length > 1) {
    screens[current()]?.leave?.();
    stack.pop();
    render();
  }
});

// Globale Knöpfe: data-act="back" | "settings" | "home"
app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "back") return back();
  if (act === "settings") return go("settings");
  if (act === "home") return resetTo("home");
});
