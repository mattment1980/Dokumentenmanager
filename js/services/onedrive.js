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
  const url = meta["@microsoft.graph.downloadUrl"];
  const d = url ? await fetch(url, { cache: "no-store" }) : await gfetch(itemUrl(parts, a) + "/content");
  if (!d.ok) throw new Error(`OneDrive: Datei nicht lesbar (${d.status})`);
  return { data: await d.json(), eTag: meta.eTag || null };
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
