/**
 * Gemeinsamer Laufzeit-Zustand der App.
 *
 * Bewusst ein einfaches Objekt: Bildschirme lesen und schreiben es direkt.
 * Dauerhafte Einstellungen liegen NICHT hier, sondern in services/storage.js (settings).
 */
import { APP, DEFAULT_STRUCTURE } from "./config.js";
import { settings } from "../services/storage.js";

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const S = {
  /** Microsoft-Anwendungs-ID (fest im Code oder auf dem Gerät eingetragen) */
  clientId: APP.CLIENT_ID || settings.get("clientId", ""),
  /** Angemeldetes Microsoft-Konto (MSAL) und Profil (Graph /me) */
  account: null,
  me: null,
  /** Archiv: { mode: "own", path } oder { mode: "shared", driveId, itemId, name, owner } – siehe core/archive.js */
  archive: null,
  /** Pfad des eigenen Archivordners (für den Modus "own") */
  root: settings.get("root", APP.defaultArchiveRoot),
  /** Ordnerstruktur und Dokumenttypen (lokale Kopie der Konfiguration aus OneDrive) */
  structure: settings.get("structure", null) || clone(DEFAULT_STRUCTURE),
  configLoaded: false,
  configMissing: false,
  authProblem: false,
  setupError: "",

  /** Laufender Stapel von Dokument-Aufträgen – siehe core/pipeline.js */
  batch: null,
  /** Aktueller Auftrag (Kurzform für S.batch.jobs[S.batch.index]) */
  job: null,
  /** Eingelesene E-Mail, bevor Anhänge ausgewählt sind – siehe screens/mail.js */
  mailImport: null,
  /** Ergebnisse des zuletzt abgeschlossenen Stapels (für den Bildschirm "done") */
  lastResults: [],

  /** Bearbeitungskopie der Struktur im Einstellungsbildschirm */
  edit: null,
  /** Index der Seite im Zuschnitt-Bildschirm */
  cropIndex: 0,
  /** Läuft gerade ein Upload? */
  uploading: false,
};

export const folderByName = (n) => S.structure.folders.find((f) => f.name === n);
export const doctypeByName = (n) => S.structure.doctypes.find((d) => d.name === n);

/** Vorname der angemeldeten Person, für "Abgelegt von". */
export function uploaderName() {
  const n = S.me?.givenName || S.account?.name || "";
  return n.split(/\s+/)[0] || "Unbekannt";
}

/** Läuft gerade eine Bearbeitung, die ein Neuladen der App nicht unterbrechen darf? */
export function isBusyWithDocument() {
  return !!(S.batch || S.mailImport);
}
