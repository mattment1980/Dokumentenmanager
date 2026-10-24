/**
 * Einstiegspunkt der App: Module laden, Service Worker anmelden, Anmeldung prüfen, starten.
 *
 * Aufbau und Datenfluss sind in docs/ARCHITEKTUR.md beschrieben.
 * Neue Bildschirme: Datei in js/screens/ anlegen (registerScreen) und hier importieren.
 */
import { S, isBusyWithDocument } from "./core/state.js";
import { resetTo, setStack } from "./core/router.js";
import { initArchive } from "./core/archive.js";
import { loadRemoteConfig } from "./core/structure.js";
import { processQueue } from "./core/uploader.js";
import { settings } from "./services/storage.js";
import * as od from "./services/onedrive.js";
import { checkShareInbox, listenForLaunchFiles } from "./importers/sources.js";

// Funktionsmodule (melden sich an den Erweiterungspunkten in core/extensions.js an)
import "./features/invoices/index.js";

// Bildschirme (melden sich selbst beim Router an)
import "./screens/setup.js";
import "./screens/login.js";
import "./screens/home.js";
import "./screens/pages.js";
import "./screens/crop.js";
import "./screens/mail.js";
import "./screens/route.js";
import "./screens/review.js";
import "./screens/done.js";
import "./screens/shared.js";
import "./screens/settings.js";
import "./screens/invoices.js";

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => reg?.update())
    .catch((e) => console.warn("Service Worker", e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Neue Version aktiv: einmal neu laden – aber nie mitten in einer Bearbeitung.
    if (!hadController || reloaded || isBusyWithDocument()) return;
    reloaded = true;
    location.reload();
  });
}

async function start() {
  registerServiceWorker();
  initArchive();
  if (!S.clientId) return resetTo("setup");
  try {
    S.account = await od.initAuth(S.clientId);
  } catch (e) {
    S.setupError = String(e.message || e);
  }
  if (!S.account) return resetTo("login");

  resetTo("home");
  if (settings.get("pendingShared", false)) {
    // Rückkehr von der Microsoft-Freigabe für geteilte Ordner
    settings.set("pendingShared", null);
    setStack(["home", "settings", "shared"]);
  }
  // Über "Teilen" oder "Öffnen mit" angekommene Dateien übernehmen
  checkShareInbox();
  listenForLaunchFiles();

  try {
    S.me = await od.getMe();
  } catch (e) {
    if (e instanceof od.AuthNeeded) S.authProblem = true;
  }
  await loadRemoteConfig();
  processQueue();
}

start();
