/**
 * Funktionsmodul "Kalender": Termine und Fristen aus Dokumenten in einen gemeinsamen Google-Kalender eintragen.
 *
 * Ablauf
 *   1. KI-Feld "termine": die KI liefert Termine (mit Uhrzeit), Fristen und ganztägige Termine; berechnete
 *      Fristen sind markiert. Nur bei Dokumenttypen mit Kalender-Abfrage (Merkmal "calendar", model.js → asksCalendar;
 *      in den Einstellungen je Dokumenttyp umschaltbar).
 *   2. Prüfen-Bildschirm: „Termin erkannt – in den Kalender eintragen?“ Ja/Nein. Bei Ja eine Maske (Titel, Datum,
 *      Uhrzeit oder ganztägig, Ort, Erinnerung, Kommentar). Ohne erkannten Termin: Knopf „Termin eintragen“.
 *      Das Ja meldet bei Google an, falls nötig (Fenster nur nach einem Tipp möglich).
 *   3. Nach dem Hochladen (Ereignis "queue:uploaded") werden die Termine eingetragen – mit Link zum PDF in OneDrive.
 *      Klappt das nicht (keine Anmeldung, kein Netz), bleiben sie auf diesem Gerät vorgemerkt: Box „Kalendereinträge
 *      offen“ auf der Startseite mit „Jetzt eintragen“. Feste Termin-IDs verhindern doppelte Einträge.
 *
 * Einstellungen (Einstellungen → Google-Kalender): Client-ID, Kalender und Standard-Erinnerung gelten für alle
 * Nutzer des Archivs (gemeinsame Konfiguration). Die Verbindung zu Google besteht je Gerät und Person.
 *
 * Abschaltbar in den Einstellungen (core/features.js, id "calendar").
 */
import { S, uploaderName } from "../../core/state.js";
import { esc, toast, busy, unbusy, copyText, errText } from "../../core/ui.js";
import { on, emit } from "../../core/events.js";
import { registerFeature } from "../../core/features.js";
import {
  registerAiField, registerDraftInit, registerReviewSection, registerSaveFilter, registerHomeSection,
  registerDoctypeOption, registerSettingsSection,
} from "../../core/extensions.js";
import { featureSettings, saveFeatureSettings } from "../../core/structure.js";
import { settings } from "../../services/storage.js";
import * as google from "../../services/google.js";
import { todayIso } from "../../documents/naming.js";
import {
  FEATURE, DEFAULT_REMINDER_DAYS, REMINDER_CHOICES, KINDS, asksCalendar, blankItem, fromAi, checkItem,
  whenText, summaryOf, reminderLabel, eventBody, eventId,
} from "./model.js";

registerFeature({
  id: FEATURE,
  label: "Kalender (Google)",
  description: "Termine und Fristen aus Dokumenten erkennen und nach Rückfrage in den gemeinsamen Google-Kalender eintragen.",
});

/** Gemeinsame Einstellungen: { clientId, calendarId, calendarName, reminderDays } */
export const config = () => featureSettings(FEATURE);
const reminderDefault = () => {
  const n = Number(config().reminderDays);
  return REMINDER_CHOICES.includes(n) ? n : DEFAULT_REMINDER_DAYS;
};
/** Ist alles eingerichtet, um einzutragen? (Client-ID und Kalender gewählt) */
export const ready = () => !!(config().clientId && config().calendarId);

const doctypeByName = (name) => S.structure.doctypes.find((d) => d.name === name);
const applies = (job, d) => !!d.doctype && asksCalendar(doctypeByName(d.doctype));

// ---------- Merkmal je Dokumenttyp ----------

registerDoctypeOption({ feature: FEATURE, key: "calendar", label: "Kalender-Abfrage", get: asksCalendar });

// ---------- 1. Entwurf und KI ----------

registerDraftInit((d) => {
  // decided: null = noch nicht gefragt, true = eintragen, false = nicht eintragen
  d.cal = { decided: null, items: [] };
});

registerAiField({
  feature: FEATURE,
  name: "termine",
  schema: {
    type: "array",
    description: "Termine und Fristen für den Kalender, sonst leere Liste.",
    items: {
      type: "object",
      properties: {
        art: { type: "string", enum: ["termin", "frist", "ganztags"] },
        titel: { type: "string" },
        datum: { type: "string", description: "JJJJ-MM-TT" },
        beginn: { type: "string", description: "HH:MM oder leer" },
        ende: { type: "string", description: "HH:MM oder leer" },
        ort: { type: "string" },
        berechnet: { type: "boolean" },
        grundlage: { type: "string" },
      },
    },
  },
  rule:
    "Termine und Fristen, die der Empfänger sich merken oder einhalten muss und die nach heute liegen: Arzt-, Werkstatt-, " +
    "Handwerker- oder Behördentermine, Einladungen, Fristen für Einspruch, Widerspruch, Kündigung, Antrag, Rückmeldung oder " +
    "Unterlagen. Nicht aufnehmen: Briefdatum, Zahlungsziele von Rechnungen und Mahnungen, Lastschrifttermine, Gültigkeit " +
    "von Gutscheinen, Abholfristen von Paketen, reine Zeiträume (z. B. Versicherungszeitraum). Sonst leere Liste. " +
    "art = termin bei fester Uhrzeit, frist bei einem Stichtag, bis zu dem etwas zu tun ist, ganztags bei ganztägigen " +
    "Terminen ohne Uhrzeit; titel = kurz, was zu tun ist bzw. was stattfindet, mit Absender (z. B. 'Zahnarzt Dr. Huber', " +
    "'Einspruch Steuerbescheid 2025', 'Kündigung Fitnessstudio'); datum JJJJ-MM-TT; beginn und ende HH:MM, nur wenn " +
    "genannt; ort = Ort oder Adresse, falls genannt; ist eine Frist nicht als Datum genannt, sondern als Dauer (z. B. " +
    "'innerhalb eines Monats nach Bekanntgabe'), das Datum ausrechnen (bei Bescheiden: Bekanntgabe vier Tage nach dem " +
    "Briefdatum, endet die Frist auf Samstag, Sonntag oder Feiertag, gilt der nächste Werktag) und berechnet = true; " +
    "grundlage = die Textstelle bzw. Regel, kurz.",
  apply(d, v) {
    d.cal.items = fromAi(v, { today: todayIso(), reminderDays: reminderDefault() });
    d.cal.decided = null;
  },
});

// ---------- 2. Abschnitt im Prüfen-Bildschirm ----------

/** Bei Google anmelden, falls nötig – direkt im Klick aufrufen. */
function ensureLogin() {
  if (google.hasToken()) return;
  google.login({ clientId: config().clientId }).catch((e) => toast(errText(e), 6000));
}

function decideYes(d) {
  if (!ready()) {
    toast("Bitte zuerst unter Einstellungen → Google-Kalender die Verbindung einrichten.", 6000);
    return false;
  }
  ensureLogin();
  d.cal.decided = true;
  if (!d.cal.items.length) d.cal.items.push({ ...blankItem(reminderDefault()), title: d.title || "" });
  return true;
}

const itemLine = (it) => `<li><b>${esc(summaryOf(it) || "Termin")}</b><span class="path">${esc(whenText(it))}${it.location ? " · " + esc(it.location) : ""}${it.computed ? ` · <span class="warntext">berechnet</span>` : ""}</span></li>`;

function renderMask(d) {
  const items = d.cal.items;
  const many = items.length > 1;
  return items
    .map((it, i) => `<div class="calitem ${it.on ? "" : "off"}" data-ci="${i}">
      ${many ? `<label class="pick" style="margin:0 0 8px"><input type="checkbox" data-f="on" ${it.on ? "checked" : ""}><span class="grow"><b>Eintragen</b></span></label>` : ""}
      ${it.on ? `
      <div class="seg" style="margin-bottom:12px">${KINDS.map(([k, l]) => `<button data-kind="${k}" class="${it.kind === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <label class="field"><span>Titel</span><input type="text" data-f="title" value="${esc(it.title)}" autocomplete="off"></label>
      <div class="row">
        <label class="field grow"><span>Datum</span><input type="date" data-f="date" value="${esc(it.date)}"></label>
        <label class="pick calday"><input type="checkbox" data-f="allDay" ${it.allDay ? "checked" : ""}><span>ganztägig</span></label>
      </div>
      ${it.allDay ? "" : `<div class="row">
        <label class="field grow"><span>Von</span><input type="time" data-f="start" value="${esc(it.start)}"></label>
        <label class="field grow"><span>Bis</span><input type="time" data-f="end" value="${esc(it.end)}" placeholder="+1 Std."></label>
      </div>`}
      ${it.computed ? `<p class="warntext small" style="margin:-4px 0 10px">Datum berechnet – bitte prüfen${it.basis ? `: ${esc(it.basis)}` : ""}</p>` : ""}
      <label class="field"><span>Ort</span><input type="text" data-f="location" value="${esc(it.location)}" autocomplete="off"></label>
      <label class="field"><span>Erinnerung</span><select data-f="reminderDays">${REMINDER_CHOICES.map((n) => `<option value="${n}" ${Number(it.reminderDays) === n ? "selected" : ""}>${reminderLabel(n)}</option>`).join("")}</select></label>
      <label class="field" style="margin-bottom:0"><span>Kommentar</span><textarea data-f="comment" rows="2" placeholder="z. B. Unterlagen mitnehmen">${esc(it.comment)}</textarea></label>` : `<div class="path">${esc(summaryOf(it))} · ${esc(whenText(it))}</div>`}
    </div>`)
    .join("");
}

registerReviewSection({
  feature: FEATURE,
  id: "calendar",
  applies,
  render(job, d) {
    const c = d.cal;
    const target = config().calendarName ? `in „${esc(config().calendarName)}“` : "in den Kalender";
    if (c.decided === true) {
      return `<div class="card" id="calSec">
        <div class="row" style="align-items:center;margin-bottom:10px"><h2 class="grow" style="margin:0">📅 Kalender</h2>
          <button class="btn small" data-cal="no">Nicht eintragen</button></div>
        <p class="muted small" style="margin-top:0">Wird beim Ablegen ${target} eingetragen – mit Link zum Dokument.${google.hasToken() ? "" : " Google-Anmeldung folgt im kleinen Fenster."}</p>
        ${renderMask(d)}
        <button class="btn small" data-cal="add" style="margin-top:10px">＋ Weiteren Termin</button>
      </div>`;
    }
    if (c.items.length && c.decided === null) {
      return `<div class="card calask" id="calSec">
        <h2>📅 ${c.items.length > 1 ? `${c.items.length} Termine erkannt` : "Termin erkannt"}</h2>
        <ul class="list callist">${c.items.map(itemLine).join("")}</ul>
        <p style="margin:10px 0">In den Kalender eintragen?</p>
        <div class="row"><button class="btn grow" data-cal="no">Nein</button><button class="btn primary grow" data-cal="yes">Ja</button></div>
      </div>`;
    }
    return `<div class="card" id="calSec">
      <div class="row" style="align-items:center"><span class="grow muted small">${c.decided === false ? "Kein Kalendereintrag." : "Kein Termin erkannt."}</span>
      <button class="btn small" data-cal="${c.items.length ? "yes" : "manual"}">📅 Termin eintragen</button></div>
    </div>`;
  },
  bind(root, job, d, rerender, refresh) {
    const sec = root.querySelector("#calSec");
    if (!sec) return;
    sec.querySelectorAll("[data-cal]").forEach((b) =>
      (b.onclick = () => {
        const a = b.dataset.cal;
        if (a === "no") d.cal.decided = false;
        else if (a === "yes" || a === "manual") {
          if (!decideYes(d)) return;
        } else if (a === "add") d.cal.items.push({ ...blankItem(reminderDefault()), title: d.title || "" });
        rerender();
      })
    );
    sec.querySelectorAll("[data-ci]").forEach((box) => {
      const it = d.cal.items[Number(box.dataset.ci)];
      box.querySelectorAll("[data-kind]").forEach((b) =>
        (b.onclick = () => {
          it.kind = b.dataset.kind;
          if (it.kind === "frist") it.allDay = true;
          rerender();
        })
      );
      box.querySelectorAll("[data-f]").forEach((inp) => {
        const f = inp.dataset.f;
        if (inp.type === "checkbox") {
          inp.onchange = () => {
            it[f] = inp.checked;
            rerender();
          };
        } else {
          inp.addEventListener(inp.tagName === "SELECT" ? "change" : "input", () => {
            it[f] = f === "reminderDays" ? Number(inp.value) : inp.value;
            refresh();
          });
        }
      });
    });
  },
  validate(job, d) {
    if (d.cal.decided !== true) return "";
    const on = d.cal.items.filter((it) => it.on);
    if (!on.length) return "Bitte mindestens einen Termin auswählen oder „Nicht eintragen“ tippen.";
    for (const it of on) {
      const e = checkItem(it);
      if (e) return e;
    }
    if (!ready()) return "Google-Kalender ist nicht eingerichtet (Einstellungen).";
    return "";
  },
});

// ---------- 3. Ablegen ----------

registerSaveFilter(
  (plan) => {
    const d = plan.draft;
    if (d.cal?.decided !== true || !applies(plan.job, d)) return;
    const items = d.cal.items.filter((it) => it.on).map(({ on, ...it }) => it);
    if (!items.length) return;
    plan.description += ` · Kalender: ${items.map((it) => summaryOf(it)).join(", ")}`;
    plan.meta.calendar = { items, docTitle: d.title, by: uploaderName(), calendarId: config().calendarId };
  },
  { feature: FEATURE }
);

// ---------- 4. Eintragen (nach dem Hochladen) und Vormerken ----------

const PENDING = "calendarPending";
export const pendingList = () => settings.get(PENDING, []);
function setPending(list) {
  settings.set(PENDING, list);
  emit("home:changed");
}

/** Trägt einen Auftrag ein; gibt die noch offenen Termine zurück (leer = alles erledigt). */
async function writeJob(job) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
  const rest = [];
  let firstErr = null;
  for (const it of job.items) {
    if (firstErr) {
      rest.push(it);
      continue;
    }
    try {
      await google.insertEvent(job.calendarId, eventBody(it, { ...job, timeZone: tz, id: it.id }));
    } catch (e) {
      firstErr = e;
      rest.push(it);
    }
  }
  return { rest, error: firstErr };
}

on("queue:uploaded", async ({ item, result }) => {
  const c = item.meta?.calendar;
  if (!c) return;
  const job = {
    key: item.id,
    calendarId: c.calendarId || config().calendarId,
    docTitle: c.docTitle,
    by: c.by,
    fileName: result.name,
    webUrl: result.webUrl || "",
    items: c.items.map((it, i) => ({ ...it, id: eventId(item.id, i) })),
  };
  const { rest, error } = await writeJob(job);
  if (!rest.length) {
    toast(`📅 ${job.items.length > 1 ? `${job.items.length} Termine` : "Termin"} im Kalender eingetragen`, 3500);
    return;
  }
  setPending([...pendingList().filter((p) => p.key !== job.key), { ...job, items: rest }]);
  toast(
    error instanceof google.GoogleAuthNeeded
      ? "Kalendereintrag vorgemerkt – auf der Startseite „Jetzt eintragen“ tippen (Google-Anmeldung nötig)."
      : `Kalendereintrag vorgemerkt: ${errText(error)}`,
    7000
  );
});

/** Alle vorgemerkten Einträge erneut versuchen (nach Klick, damit die Anmeldung ein Fenster öffnen darf). */
async function retryPending() {
  try {
    await google.login({ clientId: config().clientId });
  } catch (e) {
    return toast(errText(e), 6000);
  }
  busy("Wird eingetragen …");
  let ok = 0;
  let last = null;
  const left = [];
  for (const job of pendingList()) {
    const { rest, error } = await writeJob(job);
    ok += job.items.length - rest.length;
    if (rest.length) {
      left.push({ ...job, items: rest });
      last = error;
    }
  }
  setPending(left);
  unbusy();
  toast(left.length ? `${ok} eingetragen, ${left.length} noch offen: ${errText(last)}` : `📅 ${ok} ${ok === 1 ? "Termin" : "Termine"} eingetragen`, 5000);
}

registerHomeSection({
  feature: FEATURE,
  id: "calendar",
  render() {
    const list = pendingList();
    if (!list.length) return "";
    const items = list.flatMap((j) => j.items);
    return `<div class="card warnsoft" id="calPending">
      <h2>📅 Kalendereinträge offen</h2>
      <ul class="list callist">${items.slice(0, 5).map(itemLine).join("")}</ul>
      ${items.length > 5 ? `<p class="muted small">… und ${items.length - 5} weitere</p>` : ""}
      <div class="row" style="margin-top:10px"><button class="btn small" id="calDrop">Verwerfen</button><button class="btn small primary grow" id="calRetry">Jetzt eintragen</button></div>
    </div>`;
  },
  bind(root) {
    const r = root.querySelector("#calRetry");
    if (r) r.onclick = () => retryPending();
    const x = root.querySelector("#calDrop");
    if (x) x.onclick = () => confirm("Vorgemerkte Kalendereinträge verwerfen? Die Dokumente bleiben abgelegt.") && setPending([]);
  },
});

// ---------- 5. Einstellungen ----------

let calendars = null; // geladene Kalenderliste (nur für die Auswahl)

async function saveConfig(patch, msg) {
  if (!S.account) return toast("Bitte zuerst bei Microsoft anmelden.");
  busy("Wird gespeichert …");
  try {
    await saveFeatureSettings(FEATURE, patch);
    unbusy();
    if (msg) toast(msg);
  } catch (e) {
    unbusy();
    toast("Speichern fehlgeschlagen: " + errText(e), 6000);
  }
}

registerSettingsSection({
  feature: FEATURE,
  id: "calendar",
  render() {
    const c = config();
    const acc = google.account();
    return `<h2>Google-Kalender</h2>
      <p class="muted small" style="margin-top:0">Client-ID, Kalender und Erinnerung gelten für alle Nutzer dieses Archivs. Die Google-Anmeldung macht jede Person auf ihrem Gerät mit dem eigenen Konto.</p>
      <label class="field"><span>Client-ID (aus der Google Cloud Console)</span>
        <input type="text" id="gcId" value="${esc(c.clientId || "")}" placeholder="….apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
      <button class="btn small" id="gcIdSave">Client-ID speichern</button>
      <details class="small" style="margin:10px 0"><summary class="muted">Angaben für die Einrichtung bei Google</summary>
        <dl class="kv" style="margin-top:8px">
          <dt>JavaScript-Ursprung</dt><dd><span class="mono">${esc(google.origin())}</span><button class="iconbtn copybtn" data-copy="${esc(google.origin())}" aria-label="Kopieren">⧉</button></dd>
          <dt>Weiterleitungs-URI</dt><dd><span class="mono">${esc(google.redirectUri())}</span><button class="iconbtn copybtn" data-copy="${esc(google.redirectUri())}" aria-label="Kopieren">⧉</button></dd>
        </dl>
        <p class="muted">Schritt-für-Schritt-Anleitung: docs/GOOGLE-KALENDER.md im Projekt.</p>
      </details>
      ${c.clientId ? `
      <p style="margin:12px 0"><span class="muted">Dieses Gerät:</span> ${acc ? `verbunden als <b>${esc(acc)}</b>` : "nicht verbunden"}</p>
      <div class="row">
        ${acc ? `<button class="btn small" id="gcOff">Trennen</button>` : ""}
        <button class="btn small ${acc ? "" : "primary"}" id="gcOn">${acc ? "Kalender laden" : "Mit Google verbinden"}</button>
      </div>
      <label class="field" style="margin-top:12px"><span>Kalender</span>
        ${calendars ? `<select id="gcCal"><option value="">– bitte wählen –</option>${calendars.map((k) => `<option value="${esc(k.id)}" ${k.id === c.calendarId ? "selected" : ""}>${esc(k.summary)}${k.primary ? " (Hauptkalender)" : ""}</option>`).join("")}</select>`
          : `<div class="fname">${c.calendarName ? esc(c.calendarName) : `<span class="muted">noch keiner gewählt – „${acc ? "Kalender laden" : "Mit Google verbinden"}“ tippen</span>`}</div>`}
      </label>
      <label class="field" style="margin-bottom:0"><span>Standard-Erinnerung</span>
        <select id="gcRem">${REMINDER_CHOICES.map((n) => `<option value="${n}" ${reminderDefault() === n ? "selected" : ""}>${reminderLabel(n)}</option>`).join("")}</select></label>` : ""}`;
  },
  bind(root, rerender) {
    const $ = (s) => root.querySelector(s);
    root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
    $("#gcIdSave").onclick = async () => {
      const v = $("#gcId").value.trim();
      if (v && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) return toast("Das sieht nicht wie eine Google-Client-ID aus (endet auf .apps.googleusercontent.com).", 6000);
      await saveConfig({ clientId: v }, "Client-ID gespeichert");
      rerender();
    };
    const onBtn = $("#gcOn");
    if (onBtn)
      onBtn.onclick = () => {
        const first = !google.isConnected();
        google
          .login({ clientId: config().clientId, select: first })
          .then(() => google.listCalendars())
          .then((list) => {
            calendars = list;
            rerender();
            toast(first ? `Verbunden als ${google.account()}` : "Kalender geladen");
          })
          .catch((e) => toast(errText(e), 6000));
      };
    const off = $("#gcOff");
    if (off)
      off.onclick = async () => {
        await google.disconnect();
        calendars = null;
        rerender();
        toast("Google auf diesem Gerät getrennt");
      };
    const sel = $("#gcCal");
    if (sel)
      sel.onchange = async () => {
        const k = calendars.find((x) => x.id === sel.value);
        await saveConfig({ calendarId: k?.id || "", calendarName: k?.summary || "" }, k ? `Kalender „${k.summary}“ gewählt` : "");
        rerender();
      };
    const rem = $("#gcRem");
    if (rem) rem.onchange = () => saveConfig({ reminderDays: Number(rem.value) }, "Standard-Erinnerung gespeichert");
  },
});
