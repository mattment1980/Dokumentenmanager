/**
 * Ereignis-Bus der App.
 *
 * Module melden hierüber, dass etwas passiert ist, ohne zu wissen, wer darauf reagiert.
 * So können neue Funktionen (z. B. Fristen in den Kalender eintragen) an bestehende
 * Abläufe andocken, ohne deren Code zu ändern.
 *
 * Bekannte Ereignisse (Details siehe docs/ARCHITEKTUR.md):
 *   "document:saved"  – ein Dokument wurde abgelegt oder in die Warteschlange gestellt
 *   "queue:changed"   – die Upload-Warteschlange hat sich verändert
 *   "config:loaded"   – die Ordnerstruktur wurde (neu) geladen
 *
 * Fehler in einem Empfänger werden protokolliert und brechen den Ablauf nicht ab.
 */

const listeners = new Map();

/** Meldet einen Empfänger an. Gibt eine Funktion zum Abmelden zurück. */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  listeners.get(name)?.delete(fn);
}

/** Löst ein Ereignis aus. Asynchrone Empfänger werden nicht abgewartet. */
export function emit(name, detail) {
  for (const fn of listeners.get(name) || []) {
    try {
      const r = fn(detail);
      if (r && typeof r.catch === "function") r.catch((e) => console.error(`Ereignis ${name}:`, e));
    } catch (e) {
      console.error(`Ereignis ${name}:`, e);
    }
  }
}
