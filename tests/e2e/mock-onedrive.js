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
const st = JSON.parse(localStorage.getItem("__od") || "null") || { uploads: [], config: null, sharedConfig: null, sharedOk: false };
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
export async function readJson() {
  return archive.mode === "shared" ? st.sharedConfig : st.config;
}
export async function writeJson(parts, obj) {
  if (archive.mode === "shared") st.sharedConfig = obj;
  else st.config = JSON.parse(JSON.stringify(obj));
  save();
}
export async function ensureFolder() {}
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
  return { name, webUrl: "https://onedrive.example/x", id: String(st.uploads.length) };
}
