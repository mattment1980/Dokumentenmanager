/**
 * Gemeinsame Liste in OneDrive – eine JSON-Datei im Archivordner, die alle Nutzer des Archivs sehen
 * (z. B. offene Gutscheine, Paketbenachrichtigungen). Dasselbe Verfahren wie die Rechnungsliste
 * (features/invoices/register.js), hier allgemein für weitere Funktionsmodule.
 *
 *   const list = sharedList({ file: "_Gutscheine.json", cacheKey: "vouchers", event: "vouchers:changed" });
 *   list.current()            lokale Kopie, sofort verfügbar (auch offline)
 *   await list.refresh()      neu aus OneDrive laden
 *   await list.update((d) => { d.open.push(…) }, archive?)   konfliktsicher ändern
 *
 * Datei: { version: 1, open: [Eintrag, …] }
 *
 * Gleichzeitige Änderungen von zwei Geräten: update() liest samt Versionskennung und schreibt nur,
 * wenn die Datei zwischenzeitlich unverändert ist – sonst neuer Versuch.
 * Nach jeder Änderung: Ereignis `event` und "home:changed" (Startseite aktualisiert sich).
 */
import { S } from "./state.js";
import { emit } from "./events.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";

const empty = () => ({ version: 1, open: [] });

function normalize(d) {
  const x = d && typeof d === "object" ? d : {};
  return { ...x, version: 1, open: Array.isArray(x.open) ? x.open : [] };
}

const sameArchive = (a, b) => JSON.stringify([a?.mode, a?.path, a?.driveId, a?.itemId]) === JSON.stringify([b?.mode, b?.path, b?.driveId, b?.itemId]);

/** Neue Eintrags-ID, z. B. "g lz3k9a7f" */
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function sharedList({ file, cacheKey, event, label = "Liste" }) {
  let cache = normalize(settings.get(cacheKey, null));

  function setCache(d) {
    cache = d;
    settings.set(cacheKey, d);
    emit(event, d);
    emit("home:changed");
  }

  return {
    file,

    current: () => cache,

    /** Neu aus OneDrive laden (aktives Archiv). Fehler: Anzeige bleibt beim bisherigen Stand. */
    async refresh() {
      try {
        const { data } = await od.readJsonMeta([file]);
        setCache(normalize(data));
      } catch (e) {
        if (!(e instanceof od.AuthNeeded)) console.warn(`${label} nicht geladen`, e);
      }
      return cache;
    },

    /** Ändert die Liste konfliktsicher. change(d) verändert d direkt. */
    async update(change, archive = S.archive) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data, eTag } = await od.readJsonMeta([file], { archive });
        const d = normalize(data);
        change(d);
        try {
          await od.writeJson([file], d, { ifMatch: eTag, archive });
          if (sameArchive(archive, S.archive)) setCache(d);
          return d;
        } catch (e) {
          if (e instanceof od.Conflict) continue;
          throw e;
        }
      }
      throw new Error(`Die ${label} wird gerade von einem anderen Gerät geändert. Bitte gleich nochmal versuchen.`);
    },

    /** Eintrag entfernen. */
    remove(id) {
      return this.update((d) => {
        d.open = d.open.filter((e) => e.id !== id);
      });
    },

    reset() {
      setCache(empty());
    },
  };
}

/** Wer hat abgelegt? Aus dem Vermerk "Abgelegt von: Name am …" der Warteschlange. */
export const createdByFrom = (description) => String(description || "").match(/Abgelegt von: ([^ ]+)/)?.[1] || "";
