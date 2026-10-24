/**
 * Upload-Warteschlange: Fertige Dateien werden zuerst lokal gespeichert (IndexedDB) und dann
 * nach OneDrive hochgeladen. So geht ohne Netz nichts verloren.
 *
 * Eintrag in der Warteschlange:
 *   { id, created, rel: ["06_Steuern","Gemeinsam"], archive, fileName, bytes, mime, description, meta }
 * (archive = Ziel zum Zeitpunkt des Ablegens; ein späterer Archivwechsel ändert das Ziel nicht;
 *  meta = Zusatzdaten von Erweiterungen, siehe core/pipeline.js planSave)
 *
 * Nach jedem erfolgreichen Upload: Ereignis "queue:uploaded" mit { item (ohne bytes), result }.
 */
import { S } from "./state.js";
import { queue, history } from "../services/storage.js";
import * as od from "../services/onedrive.js";
import { archiveLabel } from "./archive.js";
import { emit } from "./events.js";

export async function enqueue(item) {
  await queue.add(item);
  emit("queue:changed");
}

/**
 * Lädt alle wartenden Einträge hoch (nacheinander). Bricht beim ersten Fehler ab;
 * der Eintrag bleibt mit lastError in der Warteschlange.
 * @returns {Map<string, {name, webUrl, id}>} erfolgreich hochgeladene Einträge nach Warteschlangen-ID
 */
export async function processQueue() {
  const done = new Map();
  if (S.uploading || !S.account) return done;
  S.uploading = true;
  try {
    const items = await queue.all();
    for (const it of items) {
      if (!navigator.onLine) break;
      // Ältere Einträge (vor Version 1.2) enthielten den Archivordner noch im Pfad
      const rel = it.rel || (it.folderParts || []).slice(1);
      const target = it.archive || S.archive;
      const prev = od.getArchive();
      try {
        od.setArchive(target);
        const res = await od.uploadFile(rel, it.fileName, it.bytes, it.mime || "application/pdf", it.description);
        await history.add({ id: it.id, created: Date.now(), name: res.name, path: [archiveLabel(target), ...rel].join(" / "), webUrl: res.webUrl });
        await queue.remove(it.id);
        done.set(it.id, res);
        S.authProblem = false;
        const { bytes, ...info } = it;
        emit("queue:uploaded", { item: { ...info, rel, archive: target }, result: res });
      } catch (e) {
        if (e instanceof od.AuthNeeded) {
          S.authProblem = true;
          break;
        }
        console.warn("Upload fehlgeschlagen", e);
        it.lastError = String(e.message || e);
        await queue.add(it);
        break;
      } finally {
        od.setArchive(prev);
      }
    }
  } finally {
    S.uploading = false;
    emit("queue:changed");
  }
  return done;
}

window.addEventListener("online", () => processQueue());
