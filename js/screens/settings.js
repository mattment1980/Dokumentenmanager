/**
 * Bildschirm "settings": Konto, Archivordner (eigen/geteilt), KI-Schlüssel und Modell,
 * Ordnerstruktur und Dokumenttypen bearbeiten, technische Angaben.
 *
 * Die Struktur wird in einer Bearbeitungskopie (S.edit) geändert und erst mit
 * "Struktur speichern" nach OneDrive geschrieben (core/structure.js).
 */
import { APP, DEFAULT_STRUCTURE } from "../core/config.js";
import { S, clone, uploaderName } from "../core/state.js";
import { registerScreen, go, resetTo, isCurrent } from "../core/router.js";
import { on } from "../core/events.js";
import { app, $, $$, esc, topbar, toast, busy, unbusy, copyText, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { setArchive } from "../core/archive.js";
import { loadRemoteConfig, saveStructure, saveFeatures, normalizeStructure, checkStructure } from "../core/structure.js";
import { getFeatures, isEnabled } from "../core/features.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";
import * as ai from "../services/ai.js";
import { cleanFolderName } from "../documents/naming.js";

// Stand der Struktur, von dem die Bearbeitung ausging (ohne Schalter) – zum Erkennen ungespeicherter Änderungen
let base = "";
const comparable = (st) => {
  const { features, ...rest } = normalizeStructure(st);
  return JSON.stringify(rest);
};

const screen = {
  /** Beim Öffnen immer mit der aktuellen Struktur beginnen (ungespeicherte Änderungen verwerfen). */
  enter() {
    S.edit = null;
  },

  render() {
    if (!S.edit) {
      S.edit = clone(S.structure);
      base = comparable(S.edit);
    }
    const key = settings.get("apiKey", "");
    const model = settings.get("model", APP.defaultModel);
    app.innerHTML = `${topbar("Einstellungen")}
      <div class="card stack">
        <h2>Konto</h2>
        ${S.account ? `<dl class="kv"><dt>Angemeldet</dt><dd>${esc(S.account.name || "")} (${esc(S.account.username || "")})</dd><dt>Ablage als</dt><dd>${esc(uploaderName())}</dd></dl>
          <button class="btn small" id="logout">Abmelden</button>` : `<p class="muted">Nicht angemeldet.</p>`}
      </div>

      <div class="card stack">
        <h2>Archivordner</h2>
        <div class="seg" id="amode">
          <button data-m="own" class="${S.archive.mode === "own" ? "on" : ""}">Eigenes OneDrive</button>
          <button data-m="shared" class="${S.archive.mode === "shared" ? "on" : ""}">Geteilter Ordner</button>
        </div>
        ${S.archive.mode === "own" ? `
          <label class="field" style="margin:0"><span>Pfad ab OneDrive-Hauptebene</span><input type="text" id="root" value="${esc(S.root)}"></label>
          <button class="btn small" id="saveRoot">Ordner übernehmen</button>` : `
          <dl class="kv"><dt>Ordner</dt><dd>${esc(S.archive.name)}</dd>${S.archive.owner ? `<dt>Geteilt von</dt><dd>${esc(S.archive.owner)}</dd>` : ""}</dl>
          <button class="btn small" id="pickShared">Anderen geteilten Ordner wählen</button>`}
        <p class="muted small" style="margin:0">${S.archive.mode === "own"
          ? "Für Mitbenutzer: diesen Ordner in OneDrive mit „Kann bearbeiten“ teilen. Sie wählen dann hier „Geteilter Ordner“."
          : "Struktur und KI-Regeln kommen aus diesem Ordner. Änderungen daran gelten für alle, die ihn nutzen."}</p>
      </div>

      <div class="card stack">
        <h2>KI</h2>
        <label class="field" style="margin:0"><span>Anthropic API-Schlüssel ${key ? "(gespeichert)" : ""}</span>
          <input type="password" id="key" placeholder="${key ? "•••• " + esc(key.slice(-4)) : "sk-ant-…"}" autocomplete="off" spellcheck="false"></label>
        <p class="muted small">Wird nur auf diesem Gerät gespeichert und nur direkt an Anthropic gesendet.</p>
        <div class="row">
          <button class="btn small" id="saveKey">Speichern</button>
          <button class="btn small" id="testKey" ${key ? "" : "disabled"}>Testen</button>
          <button class="btn small danger" id="delKey" ${key ? "" : "disabled"}>Entfernen</button>
        </div>
        <label class="field" style="margin:6px 0 0"><span>Modell</span>
          <select id="model">${APP.models.map((m) => `<option value="${m.id}" ${m.id === model ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
      </div>

      <div class="card" id="features">
        <h2>Funktionen</h2>
        <p class="muted small" style="margin-top:0">Gilt für alle, die diesen Archivordner nutzen. Beim Abschalten bleiben Dateien und Listen erhalten.</p>
        ${getFeatures().map((f) => `<label class="pick">
          <input type="checkbox" data-feature="${esc(f.id)}" ${isEnabled(f.id) ? "checked" : ""}>
          <span class="grow"><b>${esc(f.label)}</b><span class="path">${esc(f.description)}</span></span>
        </label>`).join("")}
      </div>

      <div class="card">
        <h2>Ordnerstruktur</h2>
        <p class="muted small">Die Beschreibung ist die Regel, nach der die KI einsortiert. Neue Ordner werden beim Speichern in OneDrive angelegt. Umbenannte oder gelöschte Ordner bleiben in OneDrive unverändert bestehen und müssen dort von Hand umbenannt oder verschoben werden.</p>
        <div id="ed"></div>
        <button class="btn small" id="addFolder">${I.plus} Hauptordner</button>
      </div>

      <div class="card">
        <h2>Dokumenttypen</h2>
        <p class="muted small">Name · Kürzel im Dateinamen</p>
        <div id="dts"></div>
        <button class="btn small" id="addDt">${I.plus} Dokumenttyp</button>
      </div>

      <button class="btn primary block" id="saveStruct">Struktur speichern</button>
      <div style="height:8px"></div>
      <div class="row">
        <button class="btn small grow" id="discard">Änderungen verwerfen</button>
        <button class="btn small grow danger" id="reset">Standard wiederherstellen</button>
      </div>

      <div style="height:14px"></div>
      <div class="card stack">
        <h2>Technisches</h2>
        <dl class="kv">
          <dt>Version</dt><dd>${esc(APP.version)}</dd>
          <dt>Client-ID</dt><dd>${esc(S.clientId || "–")}</dd>
          <dt>Umleitungs-URI</dt><dd>${esc(od.redirectUri())}</dd>
        </dl>
        <div class="row">
          <button class="btn small" id="copyRu">Umleitungs-URI kopieren</button>
          ${APP.CLIENT_ID ? "" : `<button class="btn small" id="chgCid">Client-ID ändern</button>`}
          <button class="btn small" id="reload">App neu laden</button>
        </div>
      </div>`;

    this.renderEditor();
    this.renderDoctypes();

    $("#logout") && ($("#logout").onclick = () => od.logout());
    $("#amode").onclick = async (e) => {
      const b = e.target.closest("[data-m]");
      if (!b || b.dataset.m === S.archive.mode) return;
      if (b.dataset.m === "shared") return go("shared");
      setArchive({ mode: "own", path: S.root || APP.defaultArchiveRoot });
      S.configMissing = false;
      toast("Eigenes OneDrive wird verwendet");
      await loadRemoteConfig();
      S.edit = null;
      this.render();
    };
    $("#pickShared") && ($("#pickShared").onclick = () => go("shared"));
    $("#saveRoot") && ($("#saveRoot").onclick = async () => {
      const parts = $("#root").value.split(/[\/\\]/).map(cleanFolderName).filter(Boolean);
      if (!parts.length) return toast("Bitte einen Ordnernamen eingeben.");
      setArchive({ mode: "own", path: parts.join("/") });
      toast(`Archivordner: ${S.root}`);
      await loadRemoteConfig();
      S.edit = null;
      this.render();
    });
    $("#saveKey").onclick = () => {
      const v = $("#key").value.trim();
      if (!v) return toast("Bitte Schlüssel einfügen.");
      if (!/^sk-ant-/.test(v)) toast("Hinweis: Anthropic-Schlüssel beginnen mit „sk-ant-“.");
      settings.set("apiKey", v);
      toast("Schlüssel gespeichert");
      this.render();
    };
    $("#testKey").onclick = async () => {
      busy("Schlüssel wird getestet …");
      try {
        await ai.testKey(settings.get("apiKey", ""), settings.get("model", APP.defaultModel));
        unbusy();
        toast("Schlüssel funktioniert ✓");
      } catch (e) {
        unbusy();
        toast(errText(e), 6000);
      }
    };
    $("#delKey").onclick = () => {
      if (!confirm("API-Schlüssel von diesem Gerät entfernen?")) return;
      settings.set("apiKey", null);
      this.render();
    };
    $("#model").onchange = (e) => settings.set("model", e.target.value);
    $$("[data-feature]").forEach((cb) => (cb.onchange = () => this.toggleFeature(cb)));
    $("#addFolder").onclick = () => {
      S.edit.folders.push({ name: "Neuer Ordner", description: "", children: [], _open: true });
      this.renderEditor();
    };
    $("#addDt").onclick = () => {
      S.edit.doctypes.push({ name: "", short: "", hint: "" });
      this.renderDoctypes();
    };
    $("#saveStruct").onclick = () => this.save();
    $("#discard").onclick = () => {
      S.edit = null;
      this.render();
    };
    $("#reset").onclick = () => {
      if (!confirm("Ordnerstruktur und Dokumenttypen auf den Standard zurücksetzen? (Erst wirksam nach „Struktur speichern“)")) return;
      S.edit = clone(DEFAULT_STRUCTURE);
      this.render();
    };
    $("#copyRu").onclick = () => copyText(od.redirectUri());
    $("#chgCid") && ($("#chgCid").onclick = () => resetTo("setup"));
    $("#reload").onclick = () => location.reload();
  },

  renderEditor() {
    const ed = $("#ed");
    const fs = S.edit.folders;
    ed.innerHTML = fs.map((f, i) => `
      <details class="fold" data-i="${i}" ${f._open ? "open" : ""}>
        <summary>${esc(f.name || "(ohne Namen)")}<span class="cnt">${(f.children || []).length || ""}</span></summary>
        <div class="body">
          <label class="field"><span>Name</span><input type="text" data-f="name" value="${esc(f.name)}"></label>
          <label class="field"><span>Regel für die KI</span><textarea data-f="description">${esc(f.description || "")}</textarea></label>
          <div class="small muted" style="margin-bottom:6px">Unterordner · Hinweis für die KI (optional)</div>
          ${(f.children || []).map((c, j) => `<div class="subrow" data-j="${j}">
              <input type="text" data-c="name" value="${esc(c.name)}" placeholder="Name">
              <input type="text" data-c="description" value="${esc(c.description || "")}" placeholder="Hinweis">
              <button class="iconbtn" data-del-sub="${j}" aria-label="Unterordner löschen">${I.trash}</button>
            </div>`).join("")}
          <div class="tools">
            <button class="btn small" data-add-sub>${I.plus} Unterordner</button>
            <button class="btn small" data-up ${i === 0 ? "disabled" : ""} aria-label="Nach oben">${I.up}</button>
            <button class="btn small" data-down ${i === fs.length - 1 ? "disabled" : ""} aria-label="Nach unten">${I.down}</button>
            <button class="btn small danger" data-del>${I.trash} Ordner</button>
          </div>
        </div>
      </details>`).join("");

    $$("details.fold", ed).forEach((det) => {
      const i = Number(det.dataset.i);
      const f = fs[i];
      det.addEventListener("toggle", () => (f._open = det.open));
      $$("[data-f]", det).forEach((inp) => inp.addEventListener("input", () => {
        f[inp.dataset.f] = inp.value;
        if (inp.dataset.f === "name") $("summary", det).firstChild.textContent = inp.value || "(ohne Namen)";
      }));
      $$(".subrow", det).forEach((row) => {
        const j = Number(row.dataset.j);
        $$("[data-c]", row).forEach((inp) => inp.addEventListener("input", () => (f.children[j][inp.dataset.c] = inp.value)));
      });
      det.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-add-sub")) {
          f.children = f.children || [];
          f.children.push({ name: "" });
          f._open = true;
        } else if (b.hasAttribute("data-del-sub")) {
          f.children.splice(Number(b.dataset.delSub), 1);
        } else if (b.hasAttribute("data-up") && i > 0) {
          [fs[i - 1], fs[i]] = [fs[i], fs[i - 1]];
        } else if (b.hasAttribute("data-down") && i < fs.length - 1) {
          [fs[i + 1], fs[i]] = [fs[i], fs[i + 1]];
        } else if (b.hasAttribute("data-del")) {
          if (!confirm(`Ordner „${f.name}“ aus der Struktur entfernen? (In OneDrive bleibt er bestehen.)`)) return;
          fs.splice(i, 1);
        } else return;
        this.renderEditor();
      });
    });
  },

  renderDoctypes() {
    const box = $("#dts");
    const ds = S.edit.doctypes;
    box.innerHTML = ds.map((d, i) => `<div class="dtrow" data-i="${i}">
        <input type="text" data-k="name" value="${esc(d.name)}" placeholder="Name">
        <input type="text" data-k="short" value="${esc(d.short)}" placeholder="Kürzel">
        <button class="iconbtn" data-up ${i === 0 ? "disabled" : ""} aria-label="Nach oben">${I.up}</button>
        <button class="iconbtn" data-down ${i === ds.length - 1 ? "disabled" : ""} aria-label="Nach unten">${I.down}</button>
        <button class="iconbtn" data-del aria-label="Löschen">${I.trash}</button>
      </div>`).join("");
    $$(".dtrow", box).forEach((row) => {
      const i = Number(row.dataset.i);
      $$("[data-k]", row).forEach((inp) => inp.addEventListener("input", () => (ds[i][inp.dataset.k] = inp.value)));
      row.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-up") && i > 0) [ds[i - 1], ds[i]] = [ds[i], ds[i - 1]];
        else if (b.hasAttribute("data-down") && i < ds.length - 1) [ds[i + 1], ds[i]] = [ds[i], ds[i + 1]];
        else if (b.hasAttribute("data-del")) ds.splice(i, 1);
        else return;
        this.renderDoctypes();
      });
    });
  },

  /** Funktionsmodul an/aus – wird sofort in der gemeinsamen Konfiguration gespeichert. */
  async toggleFeature(cb) {
    const id = cb.dataset.feature;
    const label = getFeatures().find((f) => f.id === id)?.label || id;
    if (!S.account) {
      cb.checked = !cb.checked;
      return toast("Bitte zuerst anmelden.");
    }
    busy(cb.checked ? `${label} wird eingeschaltet …` : `${label} wird abgeschaltet …`);
    try {
      const st = await saveFeatures({ [id]: cb.checked });
      // Ungespeicherte Änderungen an der Struktur behalten, nur die Schalter übernehmen
      if (S.edit) S.edit.features = clone(st.features);
      unbusy();
      toast(`${label}: ${cb.checked ? "an" : "aus"}`);
    } catch (e) {
      unbusy();
      cb.checked = !cb.checked;
      toast(e instanceof od.AuthNeeded ? "Bitte neu anmelden und nochmal versuchen." : "Speichern fehlgeschlagen: " + errText(e), 6000);
    }
  },

  async save() {
    const st = normalizeStructure(S.edit);
    const err = checkStructure(st);
    if (err) return toast(err, 5000);
    if (!S.account) return toast("Bitte zuerst anmelden.");
    busy("Struktur wird gespeichert …");
    try {
      await saveStructure(st);
      S.edit = null;
      unbusy();
      toast("Struktur gespeichert ✓");
      this.render();
    } catch (e) {
      unbusy();
      if (e instanceof od.AuthNeeded) toast("Bitte neu anmelden und dann nochmal speichern.", 5000);
      else toast("Speichern fehlgeschlagen: " + errText(e), 6000);
    }
  },
};

registerScreen("settings", screen);

// Konfiguration hat sich geändert (z. B. ein eingeschaltetes Modul hat seinen Ordner ergänzt):
// Bearbeitungskopie auffrischen, sofern nichts ungespeichert ist.
on("config:loaded", () => {
  if (!isCurrent("settings") || !S.edit || comparable(S.edit) !== base) return;
  const y = window.scrollY;
  S.edit = null;
  screen.render();
  window.scrollTo(0, y);
});
