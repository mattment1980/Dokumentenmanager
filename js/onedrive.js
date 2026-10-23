// Microsoft-Anmeldung (MSAL) und OneDrive-Zugriff (Microsoft Graph).
import { APP } from "./config.js";
import { withSuffix } from "./naming.js";

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
const rootParts = () => String(archive.path || "").split("/").filter(Boolean);
// Alle Pfade in dieser Datei sind relativ zum Archivordner.
function full(rel) {
  return archive.mode === "shared" ? rel.filter(Boolean) : [...rootParts(), ...rel.filter(Boolean)];
}
function baseUrl(parts) {
  if (archive.mode === "shared") {
    const b = `/drives/${encodeURIComponent(archive.driveId)}/items/${encodeURIComponent(archive.itemId)}`;
    return parts.length ? `${b}:/${enc(parts)}:` : b;
  }
  return parts.length ? `/me/drive/root:/${enc(parts)}:` : "/me/drive/root";
}
const itemUrl = (rel) => baseUrl(full(rel));
const archiveKey = () => (archive.mode === "shared" ? `s:${archive.driveId}:${archive.itemId}` : `o:${archive.path}`).toLowerCase();

export async function getMe() {
  const r = await gfetch("/me?$select=displayName,givenName");
  if (!r.ok) throw await graphError(r);
  return r.json();
}

export async function readJson(parts) {
  const r = await gfetch(itemUrl(parts));
  if (r.status === 404) return null;
  if (!r.ok) throw await graphError(r);
  const meta = await r.json();
  const url = meta["@microsoft.graph.downloadUrl"];
  const d = url ? await fetch(url) : await gfetch(itemUrl(parts) + "/content");
  if (!d.ok) throw new Error(`OneDrive: Konfiguration nicht lesbar (${d.status})`);
  return d.json();
}

export async function writeJson(parts, obj) {
  const r = await gfetch(`${itemUrl(parts)}/content?@microsoft.graph.conflictBehavior=replace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj, null, 2),
  });
  if (!r.ok) throw await graphError(r);
  return r.json();
}

const known = new Set();

export async function ensureFolder(rel) {
  const clean = full(rel);
  // Im geteilten Modus existiert die Basis bereits; im eigenen Modus wird der Archivordner mit angelegt.
  for (let i = 0; i < clean.length; i++) {
    const path = clean.slice(0, i + 1);
    const key = archiveKey() + "|" + path.join("/").toLowerCase();
    if (known.has(key)) continue;
    const parent = clean.slice(0, i);
    const r = await gfetch(`${baseUrl(parent)}/children`, {
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

// Lädt ein PDF hoch. Existiert der Name schon, wird "-2", "-3" … angehängt.
export async function uploadPdf(folderParts, fileName, bytes, description) {
  await ensureFolder(folderParts);
  let name = fileName;
  for (let n = 2; n < 50; n++) {
    const r = await gfetch(`${itemUrl([...folderParts, name])}/content?@microsoft.graph.conflictBehavior=fail`, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
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
    return { name, webUrl: item.webUrl, id: item.id };
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
