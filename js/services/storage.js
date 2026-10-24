/**
 * Lokale Speicherung auf diesem Gerät (nichts davon verlässt das Gerät).
 *
 *   settings – kleine Einstellungen im localStorage (API-Schlüssel, Archivwahl, Kopie der Struktur …)
 *   queue    – Upload-Warteschlange in IndexedDB (fertige Dateien, die noch nach OneDrive müssen)
 *   history  – die letzten 30 abgelegten Dokumente (nur Name, Pfad, Link) für die Startseite
 *
 * Reiner Dienst ohne Oberfläche und ohne App-Zustand.
 */

const PREFIX = "dm.";

export const settings = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

const DB_NAME = "dokumentenmanager";
const DB_VERSION = 1;
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result && "result" in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const queue = {
  add: (item) => tx("queue", "readwrite", (s) => s.put(item)),
  remove: (id) => tx("queue", "readwrite", (s) => s.delete(id)),
  all: () => tx("queue", "readonly", (s) => s.getAll()).then((r) => (r || []).sort((a, b) => a.created - b.created)),
};

export const history = {
  async add(entry) {
    await tx("history", "readwrite", (s) => s.put(entry));
    const all = await history.all();
    const excess = all.slice(30);
    for (const e of excess) await tx("history", "readwrite", (s) => s.delete(e.id));
  },
  all: () => tx("history", "readonly", (s) => s.getAll()).then((r) => (r || []).sort((a, b) => b.created - a.created)),
};
