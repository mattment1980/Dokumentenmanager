// Release-Prüfungen: Version, Offline-Liste des Service Workers, Manifest
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { APP } from "../../js/core/config.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

test("CACHE im Service Worker passt zur App-Version", () => {
  assert.match(sw, new RegExp(`const CACHE = "dm-v${APP.version.replace(/\./g, "\\.")}"`));
});

test("Alle App-Dateien stehen in der Offline-Liste (SHELL)", () => {
  const list = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const needed = [...list("js"), ...list("vendor").filter((f) => f.endsWith(".js"))];
  for (const f of needed) assert.ok(sw.includes(`"${f}"`), `fehlt in sw.js: ${f}`);
});

test("Manifest ist gültig und hat Teilen-Ziel", () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  assert.equal(m.share_target.action, "./share-target");
  assert.ok(m.share_target.params.files[0].accept.includes(".msg"));
});

test("Keine Geheimnisse im Code", () => {
  const files = ["js", "sw.js", "index.html"].flatMap((p) => {
    const full = path.join(ROOT, p);
    return fs.statSync(full).isDirectory() ? fs.readdirSync(full, { recursive: true }).map((f) => path.join(full, f)) : [full];
  });
  for (const f of files) {
    if (fs.statSync(f).isDirectory()) continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /sk-ant-[a-z]+\d*-[A-Za-z0-9_-]{20,}/, f);
  }
});
