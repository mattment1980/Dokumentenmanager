/**
 * Ordnerstruktur und Dokumenttypen: aus OneDrive laden, prüfen, speichern.
 *
 * Die maßgebliche Konfiguration liegt als JSON-Datei im Archivordner (APP.configFileName).
 * Auf dem Gerät gibt es nur eine Kopie (für Offline-Betrieb). Im geteilten Modus wird nie eine
 * eigene Struktur angelegt – sie kommt vom Besitzer des Ordners.
 */
import { APP, DEFAULT_STRUCTURE } from "./config.js";
import { S, clone } from "./state.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";
import { busy, busyText, unbusy, toast, errText } from "./ui.js";
import { archiveLabel } from "./archive.js";
import { emit } from "./events.js";
import { cleanFolderName } from "../documents/naming.js";

export async function loadRemoteConfig() {
  try {
    const remote = await od.readJson([APP.configFileName]);
    if (remote && Array.isArray(remote.folders) && Array.isArray(remote.doctypes)) {
      apply(remote);
      return;
    }
    if (S.archive.mode === "shared") {
      S.configMissing = true;
      toast("Im geteilten Ordner fehlt die Konfiguration des Dokumentenmanagers.", 6000);
      return;
    }
    // Erster Start im eigenen OneDrive: Struktur anlegen und Konfiguration speichern
    busy("Ordnerstruktur wird in OneDrive angelegt …");
    const st = S.structure?.folders?.length ? S.structure : clone(DEFAULT_STRUCTURE);
    await od.ensureStructure(st, (d, t) => busyText(`Ordnerstruktur wird in OneDrive angelegt … ${d}/${t}`));
    await od.writeJson([APP.configFileName], st);
    apply(st);
    unbusy();
    toast(`Ordnerstruktur in „${archiveLabel()}“ angelegt`);
  } catch (e) {
    unbusy();
    if (e instanceof od.AuthNeeded) S.authProblem = true;
    else if (navigator.onLine) toast("Konfiguration konnte nicht geladen werden: " + errText(e), 5000);
  }
}

function apply(st) {
  S.structure = st;
  settings.set("structure", st);
  S.configLoaded = true;
  S.configMissing = false;
  emit("config:loaded", st);
}

/** Speichert eine (bereits bereinigte) Struktur: fehlende Ordner anlegen, Konfiguration schreiben. */
export async function saveStructure(st) {
  await od.ensureStructure(st, (d, t) => busyText(`Ordner werden geprüft … ${d}/${t}`));
  await od.writeJson([APP.configFileName], st);
  apply(st);
}

/**
 * Ergänzt die Konfiguration um Teile, die ein Funktionsmodul braucht (z. B. Dokumenttyp „Gutschein“,
 * Ordner „15_Gutscheine“). Liest dazu die aktuelle Fassung aus OneDrive und schreibt konfliktsicher.
 *
 * @param {(st) => ({ ensure?: string[][] } | null)} change  ändert st direkt; gibt null zurück, wenn
 *        nichts fehlt, sonst optional Ordner (relativ zum Archiv), die in OneDrive angelegt werden sollen
 * @returns {Promise<boolean>} true, wenn die Konfiguration geändert wurde
 */
let extendChain = Promise.resolve();
export function extendStructure(change) {
  // Nacheinander ausführen, damit sich zwei Module beim ersten Start nicht gegenseitig überschreiben
  const run = extendChain.then(() => extendOnce(change));
  extendChain = run.catch(() => {});
  return run;
}

async function extendOnce(change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, eTag } = await od.readJsonMeta([APP.configFileName]);
    if (!data || !Array.isArray(data.folders) || !Array.isArray(data.doctypes)) return false;
    const st = clone(data);
    const r = change(st);
    if (!r) {
      if (JSON.stringify(data) !== JSON.stringify(S.structure)) apply(data);
      return false;
    }
    for (const rel of r.ensure || []) await od.ensureFolder(rel);
    try {
      await od.writeJson([APP.configFileName], st, eTag ? { ifMatch: eTag } : {});
    } catch (e) {
      if (e instanceof od.Conflict) continue;
      throw e;
    }
    apply(st);
    return true;
  }
  throw new Error("Die Konfiguration wird gerade von einem anderen Gerät geändert.");
}

/**
 * Für Funktionsmodule: fehlende Teile ergänzen und Fehler sichtbar machen. Scheitert es, versucht das Modul
 * es beim nächsten Laden der Konfiguration (spätestens beim nächsten Start) erneut.
 */
export async function ensureFeatureSetup(label, change) {
  if (!navigator.onLine) return false;
  try {
    return await extendStructure(change);
  } catch (e) {
    if (e instanceof od.AuthNeeded) {
      S.authProblem = true;
      return false;
    }
    console.warn(`Einrichtung ${label}`, e);
    toast(`${label}: Einrichtung in OneDrive fehlgeschlagen (${errText(e)}). Wird beim nächsten Start erneut versucht.`, 8000);
    return false;
  }
}

/**
 * Funktionsmodule an-/abschalten (gilt für alle Nutzer des Archivs). Ändert nur den Eintrag
 * "features" der Konfiguration, alles andere bleibt, wie es in OneDrive steht.
 */
export async function saveFeatures(features) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, eTag } = await od.readJsonMeta([APP.configFileName]);
    const st = data && Array.isArray(data.folders) ? clone(data) : clone(S.structure);
    st.features = { ...(st.features || {}), ...features };
    try {
      await od.writeJson([APP.configFileName], st, eTag ? { ifMatch: eTag } : {});
    } catch (e) {
      if (e instanceof od.Conflict) continue;
      throw e;
    }
    apply(st);
    return st;
  }
  throw new Error("Die Konfiguration wird gerade von einem anderen Gerät geändert. Bitte gleich nochmal versuchen.");
}

/** Bearbeitungskopie (mit Hilfsfeldern wie _open) in eine saubere Struktur umwandeln. */
export function normalizeStructure(edit) {
  return {
    version: 1,
    // Schalter der Funktionsmodule (core/features.js) unverändert übernehmen
    ...(edit.features && typeof edit.features === "object" ? { features: { ...edit.features } } : {}),
    folders: edit.folders.map((f) => ({
      name: cleanFolderName(f.name),
      description: String(f.description || "").trim(),
      // Zugehörigkeit zu einem Funktionsmodul erhalten (z. B. feature: "vouchers" für 15_Gutscheine)
      ...(f.feature ? { feature: String(f.feature) } : {}),
      children: (f.children || [])
        .map((c) => ({ name: cleanFolderName(c.name), ...(String(c.description || "").trim() ? { description: String(c.description).trim() } : {}) }))
        .filter((c) => c.name),
    })),
    doctypes: edit.doctypes
      .map((d) => ({
        name: String(d.name || "").trim(),
        short: String(d.short || d.name || "").trim(),
        hint: String(d.hint || "").trim(),
        // Zusatzmerkmale von Funktionsmodulen erhalten (z. B. payable für das Rechnungsmodul)
        ...(typeof d.payable === "boolean" ? { payable: d.payable } : {}),
        ...(d.feature ? { feature: String(d.feature) } : {}),
      }))
      .filter((d) => d.name),
  };
}

/** Prüft eine Struktur. Gibt eine Fehlermeldung zurück oder "" wenn alles passt. */
export function checkStructure(st) {
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
