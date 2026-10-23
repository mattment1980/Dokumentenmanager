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

async function token() {
  if (!account) throw new AuthNeeded();
  try {
    const r = await pca.acquireTokenSilent({ scopes: APP.scopes, account });
    return r.accessToken;
  } catch (e) {
    const interaction = window.msal && e instanceof window.msal.InteractionRequiredAuthError;
    if (interaction || /interaction_required|login_required|consent_required|no_tokens_found|monitor_window_timeout|timed_out/i.test(String(e && (e.errorCode || e.message)))) {
      throw new AuthNeeded();
    }
    throw e;
  }
}

export class AuthNeeded extends Error {
  constructor() {
    super("Anmeldung erforderlich");
    this.name = "AuthNeeded";
  }
}

export async function reauth() {
  await pca.acquireTokenRedirect({ scopes: APP.scopes, account: account || undefined });
}

async function gfetch(path, opts = {}, attempt = 0) {
  const t = await token();
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) },
  });
  if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 3) {
    const wait = Math.min(10, Number(res.headers.get("Retry-After")) || 2 * (attempt + 1));
    await new Promise((r) => setTimeout(r, wait * 1000));
    return gfetch(path, opts, attempt + 1);
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
const itemUrl = (parts) => (parts.filter(Boolean).length ? `/me/drive/root:/${enc(parts)}:` : "/me/drive/root");

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

export async function ensureFolder(parts) {
  const clean = parts.filter(Boolean);
  for (let i = 0; i < clean.length; i++) {
    const path = clean.slice(0, i + 1);
    const key = path.join("/").toLowerCase();
    if (known.has(key)) continue;
    const parent = clean.slice(0, i);
    const url = parent.length ? `${itemUrl(parent)}/children` : "/me/drive/root/children";
    const r = await gfetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: path[path.length - 1], folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
    if (!(r.ok || r.status === 409)) throw await graphError(r);
    known.add(key);
  }
}

// Legt die komplette Ordnerstruktur an. onProgress(done, total)
export async function ensureStructure(root, structure, onProgress) {
  const paths = [[root]];
  for (const f of structure.folders) {
    paths.push([root, f.name]);
    for (const c of f.children || []) paths.push([root, f.name, c.name]);
  }
  let done = 0;
  for (const p of paths) {
    await ensureFolder(p);
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
        await gfetch(`/me/drive/items/${item.id}`, {
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
