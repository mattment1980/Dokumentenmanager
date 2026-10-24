/**
 * Bildschirm "shared": einen Archivordner wählen, den jemand anderes geteilt hat
 * (z. B. für die Ehefrau das Archiv des Ehemanns). Fragt bei Bedarf die zusätzliche
 * Microsoft-Berechtigung "Files.ReadWrite.All" ab.
 */
import { APP } from "../core/config.js";
import { S, clone } from "../core/state.js";
import { registerScreen, isCurrent, back } from "../core/router.js";
import { app, $, $$, esc, topbar, toast, busy, unbusy, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { setArchive } from "../core/archive.js";
import { loadRemoteConfig } from "../core/structure.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";

registerScreen("shared", {
  async render() {
    app.innerHTML = `${topbar("Geteilter Ordner", { sub: "Archiv, das jemand mit dir geteilt hat" })}
      <div class="center"><div class="spinner"></div><div class="muted">Berechtigung wird geprüft …</div></div>`;
    if (!S.account) {
      app.innerHTML = `${topbar("Geteilter Ordner")}<div class="card"><p class="muted">Bitte zuerst anmelden.</p></div>`;
      return;
    }
    const ok = await od.hasSharedAccess();
    if (!isCurrent("shared")) return;
    if (!ok) {
      app.innerHTML = `${topbar("Geteilter Ordner")}
        <div class="card stack">
          <h2>Zugriff auf geteilte Ordner erlauben</h2>
          <p class="muted">Um in einen Ordner zu schreiben, den jemand anderes mit dir geteilt hat, braucht die App eine zusätzliche Erlaubnis von Microsoft. Du wirst kurz zu Microsoft weitergeleitet und bestätigst dort mit „Akzeptieren“.</p>
          <button class="btn primary block" id="grant">Zugriff erlauben</button>
        </div>`;
      $("#grant").onclick = async () => {
        settings.set("pendingShared", true);
        try {
          await od.requestSharedAccess();
        } catch (e) {
          settings.set("pendingShared", null);
          toast("Freigabe fehlgeschlagen: " + (e.message || e), 6000);
        }
      };
      return;
    }
    app.innerHTML = `${topbar("Geteilter Ordner", { sub: "Archiv auswählen" })}
      <div class="card"><h2>Mit dir geteilte Ordner</h2><div id="list"><div class="center" style="padding:16px"><div class="spinner"></div></div></div></div>
      <div class="card stack">
        <h2>Oder per Freigabelink</h2>
        <p class="muted small">Falls der Ordner oben nicht auftaucht: den Link aus der Einladungsmail bzw. aus „Link kopieren“ in OneDrive hier einfügen.</p>
        <input type="text" id="link" placeholder="https://1drv.ms/…" autocomplete="off" spellcheck="false">
        <button class="btn small" id="useLink">Link verwenden</button>
      </div>`;
    $("#useLink").onclick = async () => {
      const v = $("#link").value.trim();
      if (!/^https?:\/\//.test(v)) return toast("Bitte einen vollständigen Link einfügen.");
      busy("Link wird geprüft …");
      try {
        const f = await od.resolveShareLink(v);
        unbusy();
        await choose(f);
      } catch (e) {
        unbusy();
        toast(errText(e), 6000);
      }
    };
    try {
      const folders = await od.listSharedFolders();
      if (!isCurrent("shared")) return;
      $("#list").innerHTML = folders.length
        ? `<ul class="list">${folders.map((f, i) => `<li><button class="btn block" data-i="${i}" style="justify-content:flex-start;text-align:left">${I.file}<span><b>${esc(f.name)}</b>${f.owner ? `<br><span class="small muted">von ${esc(f.owner)}</span>` : ""}</span></button></li>`).join("")}</ul>`
        : `<p class="muted">Keine geteilten Ordner gefunden. Wurde die Einladung schon angenommen? Sonst den Freigabelink unten verwenden.</p>`;
      $$("#list [data-i]").forEach((b) => (b.onclick = () => choose(folders[Number(b.dataset.i)])));
    } catch (e) {
      $("#list").innerHTML = `<p class="muted">${esc(e.message || e)}</p>`;
    }

    async function choose(f) {
      busy("Archiv wird geprüft …");
      try {
        const isArchive = await od.probeArchive(f, APP.configFileName);
        if (!isArchive) {
          unbusy();
          return toast(`„${f.name}“ ist kein Dokumentenmanager-Archiv. Bitte den Archivordner wählen (z. B. 11_Dokumentenarchiv).`, 6000);
        }
        setArchive({ mode: "shared", driveId: f.driveId, itemId: f.itemId, name: f.name, owner: f.owner || "" });
        S.configMissing = false;
        await loadRemoteConfig();
        S.edit = clone(S.structure);
        unbusy();
        toast(`Archiv „${f.name}“ wird verwendet ✓`);
        back();
      } catch (e) {
        unbusy();
        if (e instanceof od.AuthNeeded) toast("Bitte Zugriff erneut erlauben.", 5000);
        else toast(errText(e), 6000);
      }
    }
  },
});
