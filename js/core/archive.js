/**
 * Welcher Archivordner ist aktiv? Eigenes OneDrive oder ein geteilter Ordner.
 * Hält App-Zustand (S.archive), dauerhafte Einstellung und den OneDrive-Dienst synchron.
 */
import { S } from "./state.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";

export function initArchive() {
  const a = settings.get("archive", null);
  S.archive = a && a.mode === "shared" && a.driveId ? a : { mode: "own", path: S.root };
  od.setArchive(S.archive);
}

export function setArchive(a) {
  S.archive = a;
  if (a.mode === "own") {
    S.root = a.path;
    settings.set("root", a.path);
  }
  settings.set("archive", a);
  od.setArchive(a);
}

/** Kurzname für Pfadanzeigen. */
export function archiveLabel(a = S.archive) {
  return a.mode === "shared" ? a.name : a.path;
}

/** Ausführliche Beschreibung für Texte. */
export function archiveLong(a = S.archive) {
  return a.mode === "shared" ? `„${a.name}“ (geteilt${a.owner ? " von " + a.owner : ""})` : `„${a.path}“ in deinem OneDrive`;
}
