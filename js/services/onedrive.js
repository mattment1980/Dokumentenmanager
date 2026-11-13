/**
 * Microsoft-Anmeldung (MSAL) und OneDrive-Zugriff (Microsoft Graph).
 *
 * Alle Pfade sind relativ zum aktiven Archivordner (setArchive). Das Archiv ist entweder
 *   { mode: "own", path: "11_Dokumentenarchiv" }                     – im eigenen OneDrive
 *   { mode: "shared", driveId, itemId, name, owner }                 – von jemand anderem geteilt
 *
 * Berechtigungen: "Files.ReadWrite" für das eigene OneDrive; "Files.ReadWrite.All" wird nur
 * abgefragt, wenn ein geteilter Ordner genutzt wird. Siehe docs/SICHERHEIT.md.
 *
 * Reiner Dienst: keine Oberfläche, kein App-Zustand. Fehler werden als Error bzw. AuthNeeded geworfen.
 */
import { APP } from "../core/config.js";
import { withSuffix } from "../documents/naming.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
let pca = null;
let account = null;

// Basisadresse der App: die feste, registrierte Adresse, sonst aus der aktuellen Adresse abgeleitet.
function base() {
  if (APP.APP_BASE) {
    const b = new URL(APP.APP_BASE);
    if (b.origin === location.origin && location.pathname.toLowerCase().startsWith(b.pathname.toLowerCase().replace(/\/$/, ""))) {
      return b.href;
    }
  }
  let path = location.pathname;
  if (!path.endsWith("/")) {
    const last = path.split("/").pop();
    path = last.includes(".") ? path.slice(0, path.length - last.length) : path + "/";
  }
  return location.origin + path;
}
export function redirectUri() {
  return base() + "redirect.html";
}
export function appUrl() {
  return base();
}

export async function initAuth(clientId) {
  if (!window.msal) throw new Error("Anmeldebibliothek konnte nicht geladen werden.");
  pca = new window.msal.PublicClientApplication({
    auth: {
      clientId,
      authority: APP.authority,
      redirectUri: redirectUri(),
      postLogoutRedirectUri: appUrl(),
    },
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  let res = null;
  try {
    res = await pca.handleRedirectPromise();
  } catch (e) {
    console.warn("Anmelde-Rückgabe fehlgeschlagen", e);
    throw e;
  }
  if (res && res.account) account = res.account;
  if (!account) {
    const all = pca.getAllAccounts();
    if (all.length) account = all[0];
  }
  if (account) pca.setActiveAccount(account);
  return account;
}

export function currentAccount() {
  return account;
}

export async function login() {
  await pca.loginRedirect({ scopes: APP.scopes, prompt: "select_account" });
}

export async function logout() {
  const acc = account;
  account = null;
  await pca.logoutRedirect({ account: acc, postLogoutRedirectUri: appUrl() });
}

// Berechtigungen: eigenes OneDrive reicht "Files.ReadWrite". Für einen Ordner, den jemand anderes
// geteilt hat, braucht Microsoft "Files.ReadWrite.All". Die wird nur bei Bedarf abgefragt.
export const SHARED_SCOPES = ["User.Read", "Files.ReadWrite.All"];
let archive = { mode: "own", path: APP.defaultArchiveRoot };

export function setArchive(a) {
  archive = a && a.mode === "shared" && a.driveId && a.itemId ? a : { mode: "own", path: (a && a.path) || APP.defaultArchiveRoot };
}
export function getArchive() {
  return archive;
}
function currentScopes() {
  return archive.mode === "shared" ? SHARED_SCOPES : APP.scopes;
}

async function token(scopes = currentScopes()) {
  if (!account) throw new AuthNeeded();
  try {
    const r = await pca.acquireTokenSilent({ scopes, account });
    return r.accessToken;
  } catch (e) {
    const interaction = window.msal && e instanceof window.msal.InteractionRequiredAuthError;
    if (interaction || /interaction_required|login_required|consent_required|no_tokens_found|monitor_window_timeout|timed_out/i.test(String(e && (e.errorCode || e.message)))) {
      throw new AuthNeeded();
    }
    throw e;
  }
}

export async function hasSharedAccess() {
  try {
    await token(SHARED_SCOPES);
    return true;
  } catch {
    return false;
  }
}

export async function requestSharedAccess() {
  await pca.acquireTokenRedirect({ scopes: SHARED_SCOPES, account: account || undefined });
}

export class AuthNeeded extends Error {
  constructor() {
    super("Anmeldung erforderlich");
    this.name = "AuthNeeded";
  }
}

export async function reauth() {
  await pca.acquireTokenRedirect({ scopes: currentScopes(), account: account || undefined });
}

async function gfetch(path, opts = {}, attempt = 0, scopes) {
  const t = await token(scopes);
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) },
  });
  if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 3) {
    const wait = Math.min(10, Number(res.headers.get("Retry-After")) || 2 * (attempt + 1));
    await new Promise((r) => setTimeout(r, wait * 1000));
    return gfetch(path, opts, attempt + 1, scopes);
  }
  if (res.status === 401 && attempt < 1) throw new AuthNeeded();
  return res;
}

async function graphError(res) {
  let msg = `${res.status}`;
  try {
    const j = await res.json();
    msg = j.error?.message || j.error?.code || msg;
  } catch {}
  const err = new Error(`OneDrive: ${msg}`);
  err.status = res.status;
  return err;
}

const enc = (parts) => parts.filter(Boolean).map((p) => encodeURIComponent(p)).join("/");
const rootParts = (a) => String(a.path || "").split("/").filter(Boolean);
// Alle Pfade in dieser Datei sind relativ zum Archivordner. Standard ist das aktive Archiv;
// einzelne Funktionen nehmen optional ein festes Archiv entgegen (opts.archive).
function full(rel, a = archive) {
  return a.mode === "shared" ? rel.filter(Boolean) : [...rootParts(a), ...rel.filter(Boolean)];
}
function baseUrl(parts, a = archive) {
  if (a.mode === "shared") {
    const b = `/drives/${encodeURIComponent(a.driveId)}/items/${encodeURIComponent(a.itemId)}`;
    return parts.length ? `${b}:/${enc(parts)}:` : b;
  }
  return parts.length ? `/me/drive/root:/${enc(parts)}:` : "/me/drive/root";
}
const itemUrl = (rel, a = archive) => baseUrl(full(rel, a), a);
const archiveKey = (a = archive) => (a.mode === "shared" ? `s:${a.driveId}:${a.itemId}` : `o:${a.path}`).toLowerCase();

export async function getMe() {
  const r = await gfetch("/me?$select=displayName,givenName");
  if (!r.ok) throw await graphError(r);
  return r.json();
}

export async function readJson(parts, opts = {}) {
  return (await readJsonMeta(parts, opts)).data;
}

/**
 * Liest eine JSON-Datei samt Versionskennung (eTag) für konfliktsicheres Zurückschreiben.
 * @returns {{ data: object|null, eTag: string|null }}  data = null, wenn die Datei fehlt
 */
export async function readJsonMeta(parts, { archive: a = archive } = {}) {
  const r = await gfetch(itemUrl(parts, a));
  if (r.status === 404) return { data: null, eTag: null };
  if (!r.ok) throw await graphError(r);
  const meta = await r.json();
  const drive = meta.parentReference?.driveId;
  const streamPath = drive && meta.id ? `/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(meta.id)}/contentStream` : "";
  const data = await download(meta["@microsoft.graph.downloadUrl"], itemUrl(parts, a) + "/content", { streamPath, parse: parseJson });
  return { data, eTag: meta.eTag || null };
}

/**
 * Inhalt einer Datei holen. Microsoft stellt privates OneDrive auf neue Speicher um
 * (my.microsoftpersonalcontent.com); deren Download-Links sind nicht mehr „vorab angemeldet“ (tempauth, von
 * Microsoft bis April 2027 abgeschafft) und antworten ohne Anmeldung mit 401, mit Anmeldung fehlt die CORS-Freigabe.
 * Daher mehrere Wege nacheinander; der zuletzt erfolgreiche wird zuerst versucht:
 *   "stream"     Graph …/contentStream (v1.0) – Inhalt direkt von graph.microsoft.com, ohne Umleitung (Microsofts Ersatz)
 *   "streamBeta" dasselbe über /beta, solange contentStream dort noch nicht allgemein freigegeben ist
 *   "pre"    Download-Link ohne Anmeldung (bisheriges Verfahren)
 *   "bearer" Download-Link mit Microsoft-Anmeldung
 *   "graph"  über Graph …/content (Weiterleitung zum Speicher)
 * Es geht nur ein Microsoft-Zugriffsschlüssel an Microsoft-Adressen (my.microsoftpersonalcontent.com u. a.,
 * siehe CSP), nie an fremde Server.
 */
const DL_MODES = ["stream", "streamBeta", "pre", "bearer", "graph"];
const GRAPH_BETA = "https://graph.microsoft.com/beta";
let dlMode = "";
try {
  dlMode = localStorage.getItem("dm.dlMode") || "";
} catch {}

/** getToken/graphFetch nur für Tests austauschbar */
/** Antwort als JSON lesen; bei ungültigem Inhalt Fehler mit den ersten Zeichen (zur Fehlersuche). */
async function parseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    const head = JSON.stringify(text.slice(0, 16)).replace(/\\u0000/g, "\\0");
    throw new Error(`ungültig ${head}`);
  }
}

let dlBlockedUntil = 0; // nach komplettem Fehlschlag kurz nicht erneut alle Wege probieren (sonst bremst Microsoft mit 429)
let dlBlockedMsg = "";

/**
 * parse(response) → Wert; liefert ein Weg zwar „OK“, aber unbrauchbaren Inhalt, wirft parse und der
 * nächste Weg wird versucht (so geschehen während der Microsoft-Störung im November 2026).
 * Ohne parse wird die Antwort selbst zurückgegeben.
 */
export async function download(url, contentPath, { streamPath = "", parse = null, getToken = () => token(), graphFetch = gfetch } = {}) {
  if (Date.now() < dlBlockedUntil) throw new Error(dlBlockedMsg);
  const usable = (m) => (m === "stream" || m === "streamBeta" ? !!streamPath : m === "graph" ? true : !!url);
  const order = [dlMode, ...DL_MODES].filter((m, i, all) => m && all.indexOf(m) === i && usable(m));
  const tried = [];
  for (const m of order) {
    try {
      const d =
        m === "stream"
          ? await graphFetch(streamPath, { cache: "no-store" })
          : m === "streamBeta"
          ? await graphFetch(GRAPH_BETA + streamPath, { cache: "no-store" })
          : m === "pre"
          ? await fetch(url, { cache: "no-store" })
          : m === "bearer"
          ? await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${await getToken()}` } })
          : await graphFetch(contentPath, { cache: "no-store" });
      if (d.ok) {
        let value = d;
        if (parse) {
          try {
            value = await parse(d);
          } catch (e) {
            tried.push(`${m} ${e.message}`);
            continue;
          }
        }
        if (m !== dlMode) {
          dlMode = m;
          try {
            localStorage.setItem("dm.dlMode", m);
          } catch {}
          console.info(`OneDrive-Download über "${m}"`);
        }
        return value;
      }
      tried.push(`${m} ${d.status}`);
    } catch (e) {
      if (e instanceof AuthNeeded) throw e;
      tried.push(`${m} ${e.message === "Failed to fetch" ? "blockiert" : e.message}`);
    }
  }
  // Antwort je Weg mit ausgeben – hilft bei der Fehlersuche, falls Microsoft weiter umstellt
  dlBlockedMsg = `OneDrive: Datei ließ sich nicht herunterladen (${tried.join(", ") || "kein Weg verfügbar"}).`;
  dlBlockedUntil = Date.now() + 10 * 60 * 1000;
  throw new Error(dlBlockedMsg);
}

/** Wird geworfen, wenn eine Datei seit dem Lesen von jemand anderem geändert wurde. */
export class Conflict extends Error {
  constructor() {
    super("Die Datei wurde zwischenzeitlich geändert.");
    this.name = "Conflict";
  }
}

/**
 * Schreibt eine JSON-Datei. Mit ifMatch (eTag aus readJsonMeta) nur, wenn sie seitdem unverändert ist –
 * sonst Conflict. ifMatch = null bei einer neuen Datei: dann nur, wenn sie noch nicht existiert.
 */
export async function writeJson(parts, obj, { ifMatch, archive: a = archive } = {}) {
  const headers = { "Content-Type": "application/json" };
  let behavior = "replace";
  if (ifMatch) headers["If-Match"] = ifMatch;
  else if (ifMatch === null) behavior = "fail";
  const r = await gfetch(`${itemUrl(parts, a)}/content?@microsoft.graph.conflictBehavior=${behavior}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(obj, null, 2),
  });
  if (r.status === 412 || (behavior === "fail" && r.status === 409)) throw new Conflict();
  if (!r.ok) throw await graphError(r);
  return r.json();
}

/**
 * Verschiebt und/oder benennt eine Datei um (per ID, unabhängig vom Archiv).
 * targetRel ist relativ zum angegebenen Archiv; fehlende Ordner werden angelegt.
 * Existiert der Name im Ziel schon, vergibt OneDrive einen neuen Namen.
 * @returns {{ name, webUrl, id }}
 */
export async function moveItem({ driveId, id }, targetRel, newName, { description, archive: a = archive } = {}) {
  await ensureFolder(targetRel, { archive: a });
  const fr = await gfetch(itemUrl(targetRel, a));
  if (!fr.ok) throw await graphError(fr);
  const folder = await fr.json();
  const body = { parentReference: { id: folder.id }, name: newName };
  if (description) body.description = description;
  const url = driveId ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}` : `/me/drive/items/${encodeURIComponent(id)}`;
  const r = await gfetch(`${url}?@microsoft.graph.conflictBehavior=rename`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 404) throw new Error("Die Datei wurde in OneDrive nicht gefunden (verschoben oder gelöscht?).");
  if (!r.ok) throw await graphError(r);
  const item = await r.json();
  return { name: item.name, webUrl: item.webUrl, id: item.id };
}

/**
 * Löscht eine Datei (per ID). Bei privaten OneDrive-Konten landet sie im Papierkorb des Besitzers
 * und lässt sich dort etwa 30 Tage lang wiederherstellen – endgültig gelöscht wird nichts.
 * @returns {Promise<boolean>} false, wenn die Datei schon nicht mehr da war
 */
export async function deleteItem({ driveId, id }) {
  const url = driveId ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(id)}` : `/me/drive/items/${encodeURIComponent(id)}`;
  const r = await gfetch(url, { method: "DELETE" });
  if (r.status === 404) return false;
  if (!r.ok) throw await graphError(r);
  return true;
}

const known = new Set();

export async function ensureFolder(rel, { archive: a = archive } = {}) {
  const clean = full(rel, a);
  // Im geteilten Modus existiert die Basis bereits; im eigenen Modus wird der Archivordner mit angelegt.
  for (let i = 0; i < clean.length; i++) {
    const path = clean.slice(0, i + 1);
    const key = archiveKey(a) + "|" + path.join("/").toLowerCase();
    if (known.has(key)) continue;
    const parent = clean.slice(0, i);
    const r = await gfetch(`${baseUrl(parent, a)}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: path[path.length - 1], folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!(r.ok || r.status === 409)) throw await graphError(r);
    known.add(key);
  }
}

// Legt die komplette Ordnerstruktur an. onProgress(done, total)
export async function ensureStructure(structure, onProgress) {
  const paths = [[]];
  for (const f of structure.folders) {
    paths.push([f.name]);
    for (const c of f.children || []) paths.push([f.name, c.name]);
  }
  let done = 0;
  for (const p of paths) {
    if (p.length || archive.mode === "own") await ensureFolder(p);
    done++;
    onProgress && onProgress(done, paths.length);
  }
}

/**
 * Lädt eine Datei in den Ordner rel (relativ zum Archiv) hoch.
 * Existiert der Name schon, wird "-2", "-3" … angehängt. description landet in den
 * OneDrive-Dateieigenschaften ("Abgelegt von …").
 * @returns {{name: string, webUrl: string, id: string}}
 */
export async function uploadFile(rel, fileName, bytes, contentType = "application/pdf", description = "") {
  await ensureFolder(rel);
  let name = fileName;
  for (let n = 2; n < 50; n++) {
    const r = await gfetch(`${itemUrl([...rel, name])}/content?@microsoft.graph.conflictBehavior=fail`, {
      method: "PUT",
      headers: { "Content-Type": contentType || "application/octet-stream" },
      body: bytes,
    });
    if (r.status === 409) {
      name = withSuffix(fileName, n);
      continue;
    }
    if (!r.ok) throw await graphError(r);
    const item = await r.json();
    if (description) {
      try {
        const driveId = item.parentReference && item.parentReference.driveId;
        await gfetch(driveId ? `/drives/${encodeURIComponent(driveId)}/items/${item.id}` : `/me/drive/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description }),
        });
      } catch (e) {
        console.warn("Beschreibung nicht gesetzt", e);
      }
    }
    return { name, webUrl: item.webUrl, id: item.id, driveId: item.parentReference?.driveId || "" };
  }
  throw new Error("Zu viele gleichnamige Dateien");
}

// ---------- Geteilte Ordner finden ----------
function fromRemote(outer) {
  // Microsoft liefert die Angaben je nach Kontotyp mal am Eintrag selbst, mal unter "remoteItem".
  const ri = outer.remoteItem || {};
  const isFolder = !!(ri.folder || outer.folder || ri.package?.type === "folder");
  const driveId = ri.parentReference?.driveId || outer.parentReference?.driveId;
  const itemId = ri.id || outer.id;
  const name = ri.name || outer.name || "";
  if (!isFolder || !driveId || !itemId || !name) return null;
  const owner =
    ri.shared?.owner?.user?.displayName || ri.shared?.sharedBy?.user?.displayName ||
    outer.shared?.owner?.user?.displayName || ri.createdBy?.user?.displayName || outer.createdBy?.user?.displayName || "";
  return { driveId, itemId, name, owner };
}

// Liefert die Ordner, die andere mit mir geteilt haben (auch als Verknüpfung unter "Meine Dateien").
export async function listSharedFolders() {
  const found = new Map();
  let anyOk = false;
  const add = (x) => x && !found.has(x.driveId + x.itemId) && found.set(x.driveId + x.itemId, x);
  for (const url of ["/me/drive/sharedWithMe?allowexternal=true", "/me/drive/root/children?$top=200"]) {
    try {
      const r = await gfetch(url, {}, 0, SHARED_SCOPES);
      if (!r.ok) continue;
      anyOk = true;
      const j = await r.json();
      for (const it of j.value || []) {
        if (it.remoteItem) add(fromRemote(it));
      }
    } catch (e) {
      if (e instanceof AuthNeeded) throw e;
    }
  }
  if (!anyOk) throw new Error("Geteilte Ordner konnten nicht abgerufen werden.");
  return [...found.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
}

// Löst einen Freigabelink (aus der Einladungsmail oder "Link kopieren") zu einem Ordner auf.
export async function resolveShareLink(link) {
  const b64 = btoa(unescape(encodeURIComponent(link.trim()))).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const r = await gfetch(`/shares/u!${b64}/driveItem`, { headers: { Prefer: "redeemSharingLink" } }, 0, SHARED_SCOPES);
  if (!r.ok) throw await graphError(r);
  const it = await r.json();
  const f = it.remoteItem ? fromRemote(it) : fromRemote({ remoteItem: it });
  if (!f) throw new Error("Der Link zeigt nicht auf einen Ordner oder der Ordner konnte nicht zugeordnet werden.");
  return f;
}

// Prüft, ob im gewählten Ordner eine Konfiguration liegt (also ob es ein Dokumentenmanager-Archiv ist).
export async function probeArchive(a, configName) {
  const prev = archive;
  try {
    setArchive({ mode: "shared", ...a });
    const r = await gfetch(itemUrl([configName]));
    if (r.status === 404) return false;
    if (!r.ok) throw await graphError(r);
    return true;
  } finally {
    archive = prev;
  }
}

/**
 * Lesetest (Einstellungen → Technisches): prüft mit einer kleinen Testdatei im Archivordner, welche Wege
 * Microsoft für dieses Konto zulässt – Herunterladen, Graph-Sammelabfrage ($batch) und wie lang die
 * Beschreibung einer Datei sein darf. Die Testdatei wird danach gelöscht (Papierkorb). Liefert einen Text.
 */
export async function readDiagnostics() {
  const out = [];
  const name = "_Lesetest.json";
  const payload = { test: "dokumentenmanager", t: Date.now() };
  await writeJson([name], payload);
  const r = await gfetch(itemUrl([name]));
  const meta = await r.json();
  const drive = meta.parentReference?.driveId;
  const id = meta.id;
  out.push(`Gemerkter Weg vor dem Test: "${localStorage.getItem("dm.dlMode") || "–"}"`);
  out.push(`Konto: ${account?.username ? account.username.replace(/^(.).*(@.*)$/, "$1…$2") : "?"} · Laufwerk: ${drive?.slice(0, 6)}…`);
  out.push(`Download-Link: ${String(meta["@microsoft.graph.downloadUrl"] || "–").replace(/^(https:\/\/[^/]+).*$/, "$1")} · tempauth: ${/tempauth/i.test(meta["@microsoft.graph.downloadUrl"] || "") ? "ja" : "nein"}`);
  dlBlockedUntil = 0;
  try {
    const got = await download(meta["@microsoft.graph.downloadUrl"], itemUrl([name]) + "/content", {
      streamPath: `/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(id)}/contentStream`,
      parse: parseJson,
    });
    out.push(`Herunterladen: ${got?.t === payload.t ? "OK" : "Inhalt falsch"} über "${dlMode}"`);
  } catch (e) {
    out.push(`Herunterladen: ${e.message}`);
  }
  dlBlockedUntil = 0;
  try {
    const b = await gfetch("/$batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ id: "1", method: "GET", url: `/drives/${drive}/items/${id}/content` }] }),
    });
    const j = await b.json();
    const x = j.responses?.[0] || {};
    const body = typeof x.body === "string" ? x.body : JSON.stringify(x.body || "");
    let decoded = "";
    try {
      decoded = atob(body);
    } catch {}
    const hit = body.includes("dokumentenmanager") || decoded.includes("dokumentenmanager");
    out.push(`$batch: Status ${b.status}/${x.status}${hit ? " · Inhalt erhalten ✓" : ""}${x.headers?.Location ? " · Weiterleitung" : ""}`);
  } catch (e) {
    out.push(`$batch: ${e.message}`);
  }
  for (const n of [1000, 4000, 16000, 64000]) {
    try {
      const text = "x".repeat(n);
      const p = await gfetch(itemUrl([name]), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      if (!p.ok) {
        out.push(`Beschreibung ${n} Zeichen: abgelehnt (${p.status})`);
        break;
      }
      const g = await (await gfetch(itemUrl([name]) + "?$select=description")).json();
      const len = (g.description || "").length;
      out.push(`Beschreibung ${n} Zeichen: ${len === n ? "OK" : `nur ${len} gespeichert`}`);
      if (len !== n) break;
    } catch (e) {
      out.push(`Beschreibung ${n} Zeichen: ${e.message}`);
      break;
    }
  }
  try {
    await deleteItem({ driveId: drive, id });
    out.push("Testdatei gelöscht.");
  } catch (e) {
    out.push(`Testdatei nicht gelöscht: ${e.message}`);
  }
  return out.join("\n");
}
