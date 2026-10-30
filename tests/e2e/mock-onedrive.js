/**
 * Ersatz für js/services/onedrive.js im Browsertest (kein echtes Microsoft-Konto nötig).
 * Speichert alles in localStorage["__od"], damit der Test es auslesen kann.
 * Muss dieselben Exporte haben wie der echte Dienst.
 */
export class AuthNeeded extends Error {
  constructor() {
    super("Anmeldung erforderlich");
    this.name = "AuthNeeded";
  }
}
const st = JSON.parse(localStorage.getItem("__od") || "null") || { uploads: [], config: null, sharedConfig: null, sharedOk: false, files: {}, moves: [] };
st.files = st.files || {};
st.moves = st.moves || [];
st.deleted = st.deleted || [];
window.__od = st;
const save = () => localStorage.setItem("__od", JSON.stringify(st));
let archive = { mode: "own", path: "11_Dokumentenarchiv" };

export const SHARED_SCOPES = [];
export const redirectUri = () => new URL("redirect.html", location.href).href;
export const appUrl = () => new URL("./", location.href).href;
export const currentAccount = () => null;
export async function initAuth() {
  return { name: "Test Person", username: "test@example.com" };
}
export async function login() {}
export async function logout() {}
export async function reauth() {}
export async function getMe() {
  return { displayName: "Test Person", givenName: "Testi" };
}
export function setArchive(a) {
  archive = a && a.mode === "shared" ? a : { mode: "own", path: (a && a.path) || "11_Dokumentenarchiv" };
}
export const getArchive = () => archive;
export async function hasSharedAccess() {
  return st.sharedOk;
}
export async function requestSharedAccess() {}
export async function listSharedFolders() {
  return [{ driveId: "D1", itemId: "I1", name: "11_Dokumentenarchiv", owner: "Besitzer" }];
}
export async function resolveShareLink() {
  return { driveId: "D1", itemId: "I1", name: "11_Dokumentenarchiv", owner: "Besitzer" };
}
export async function probeArchive(f) {
  return f.name === "11_Dokumentenarchiv";
}
export class Conflict extends Error {
  constructor() {
    super("Konflikt");
    this.name = "Conflict";
  }
}
// Konfiguration liegt (wie bisher) in st.config / st.sharedConfig, alle anderen JSON-Dateien in st.files
const isConfig = (parts) => parts.join("/").endsWith("Konfiguration.json");
const key = (parts, a) => ((a || archive).mode === "shared" ? "shared:" : "own:") + parts.join("/");
export async function readJsonMeta(parts, { archive: a } = {}) {
  if (isConfig(parts)) return { data: (a || archive).mode === "shared" ? st.sharedConfig : st.config, eTag: "c" };
  const f = st.files[key(parts, a)];
  return f ? { data: JSON.parse(JSON.stringify(f.data)), eTag: "v" + f.v } : { data: null, eTag: null };
}
export async function readJson(parts, opts) {
  return (await readJsonMeta(parts, opts)).data;
}
export async function writeJson(parts, obj, { ifMatch, archive: a } = {}) {
  if (isConfig(parts)) {
    if ((a || archive).mode === "shared") st.sharedConfig = obj;
    else st.config = JSON.parse(JSON.stringify(obj));
    save();
    return {};
  }
  const k = key(parts, a);
  const f = st.files[k];
  if (ifMatch && (!f || "v" + f.v !== ifMatch)) throw new Conflict();
  if (ifMatch === null && f) throw new Conflict();
  st.files[k] = { data: JSON.parse(JSON.stringify(obj)), v: (f?.v || 0) + 1 };
  save();
  return {};
}
export async function moveItem(file, targetRel, newName, { description } = {}) {
  st.moves.push({ id: file.id, targetRel: targetRel.join("/"), newName, description });
  save();
  return { name: newName, webUrl: "https://onedrive.example/moved", id: file.id };
}
export async function deleteItem(file) {
  st.deleted.push(file.id);
  save();
  return true;
}
export async function ensureFolder(rel) {
  st.folders = st.folders || [];
  st.folders.push((rel || []).join("/"));
  save();
}
export async function ensureStructure(s, cb) {
  st.structureCreated = (st.structureCreated || 0) + 1;
  cb && cb(1, 1);
  save();
}
export async function uploadFile(rel, name, bytes, mime, description) {
  let b = "";
  for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  st.uploads.push({ archive: archive.mode === "shared" ? archive.name + "@shared" : archive.path, rel: rel.join("/"), name, mime, description, size: bytes.length, b64: btoa(b) });
  save();
  return { name, webUrl: "https://onedrive.example/x", id: String(st.uploads.length), driveId: "drv" };
}
