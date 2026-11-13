/**
 * Kalender – reine Funktionen ohne Oberfläche (in tests/unit/calendar.test.mjs abgedeckt):
 * welche Dokumenttypen fragen, KI-Termine übernehmen, prüfen, Google-Termin bauen.
 */
import { isValidIsoDate } from "../../documents/naming.js";
import { shortDateDe } from "../../documents/values.js";

export const FEATURE = "calendar";
export const DEFAULT_REMINDER_DAYS = 3;
export const REMINDER_CHOICES = [0, 1, 2, 3, 5, 7, 14];
/** Uhrzeit der Erinnerung bei ganztägigen Terminen (Minuten nach Mitternacht): 9:00 Uhr */
const ALLDAY_REMINDER_AT = 9 * 60;

export const KINDS = [
  ["termin", "Termin"],
  ["frist", "Frist"],
];

/**
 * Fragt dieser Dokumenttyp nach einem Kalendereintrag? Merkmal "calendar" in der Konfiguration,
 * sonst Standard: nicht bei Rechnung, Mahnung, Gutschein/Rabatt und Paketbenachrichtigung.
 */
export function asksCalendar(dt) {
  if (!dt) return false;
  if (typeof dt.calendar === "boolean") return dt.calendar;
  if (dt.feature === "vouchers" || dt.feature === "parcels") return false;
  return !/^(rechnung|mahnung|gutschein|paket)/i.test(String(dt.name || ""));
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (s) => TIME.test(String(s || ""));
const clean = (s) => String(s || "").trim();

/** Leerer Eintrag für die Maske. */
export const blankItem = (reminderDays = DEFAULT_REMINDER_DAYS) => ({
  on: true,
  kind: "termin",
  title: "",
  date: "",
  allDay: false,
  start: "",
  end: "",
  location: "",
  reminderDays,
  comment: "",
  computed: false,
  basis: "",
});

/** KI-Antwort (Feld "termine") in Einträge für die Maske umwandeln. Vergangene oder ungültige Daten fallen weg. */
export function fromAi(list, { today, reminderDays = DEFAULT_REMINDER_DAYS } = {}) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && isValidIsoDate(t.datum) && (!today || t.datum >= today))
    .slice(0, 5)
    .map((t) => {
      const kind = t.art === "frist" ? "frist" : "termin";
      const start = isTime(t.beginn) ? t.beginn : "";
      return {
        ...blankItem(reminderDays),
        kind,
        title: clean(t.titel),
        date: t.datum,
        allDay: kind === "frist" || t.art === "ganztags" || !start,
        start,
        end: start && isTime(t.ende) && t.ende > start ? t.ende : "",
        location: clean(t.ort),
        computed: t.berechnet === true,
        basis: clean(t.grundlage),
      };
    });
}

/** Prüft einen Eintrag: "" = in Ordnung, sonst Meldung. */
export function checkItem(it) {
  if (!clean(it.title)) return "Bitte einen Titel für den Termin eintragen.";
  if (!isValidIsoDate(it.date)) return "Bitte ein gültiges Datum für den Termin eingeben.";
  if (!it.allDay) {
    if (!isTime(it.start)) return "Bitte eine Uhrzeit eingeben (oder „ganztägig“ wählen).";
    if (it.end && (!isTime(it.end) || it.end <= it.start)) return "Das Ende muss nach dem Beginn liegen.";
  }
  return "";
}

/** "HH:MM" + Minuten, höchstens bis 23:59 */
export function addMinutes(hhmm, min) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Folgetag eines ISO-Datums (Google: Ende ganztägiger Termine ist exklusiv) */
export function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Erinnerung in Minuten vor Beginn. Ganztägig: am Morgen (9:00) des Tages, X Tage vorher. */
export function reminderMinutes(days, allDay) {
  const n = Math.max(0, Number(days) || 0);
  if (!allDay) return n === 0 ? 60 : n * 1440;
  return Math.max(0, n * 1440 - ALLDAY_REMINDER_AT);
}

/** Titel im Kalender: Fristen bekommen "Frist: " vorangestellt. */
export function summaryOf(it) {
  const t = clean(it.title);
  return it.kind === "frist" && !/^frist\b/i.test(t) ? `Frist: ${t}` : t;
}

/** Kurzanzeige: "Di 25.11. · 10:30–11:30" bzw. "Di 25.11. · ganztägig" */
export function whenText(it) {
  const d = shortDateDe(it.date);
  if (it.allDay) return `${d} · ganztägig`;
  return `${d} · ${it.start}${it.end ? "–" + it.end : ""}`;
}

/** Text für die Erinnerungs-Auswahl */
export const reminderLabel = (n) => (Number(n) === 0 ? "am selben Tag" : Number(n) === 1 ? "1 Tag vorher" : `${n} Tage vorher`);

/**
 * Feste Termin-ID aus Ablage-ID und Nummer. Google erlaubt Kleinbuchstaben a–v und Ziffern (base32hex);
 * Hex-Zeichen sind eine Teilmenge davon. Gleiche ID = kein doppelter Termin bei einem zweiten Versuch.
 */
export function eventId(queueId, idx) {
  const hex = [...String(queueId)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return `dm${hex}${idx}`.slice(0, 1000);
}

/**
 * Termin für die Google-Kalender-API.
 * @param it Eintrag aus der Maske
 * @param ctx { docTitle, fileName, webUrl, by, timeZone, id }
 */
export function eventBody(it, ctx = {}) {
  const lines = [];
  if (clean(it.comment)) lines.push(clean(it.comment), "");
  if (it.computed) lines.push(`⚠ Datum berechnet – bitte prüfen${it.basis ? ": " + it.basis : ""}`, "");
  else if (it.basis) lines.push(`Grundlage: ${it.basis}`, "");
  if (ctx.docTitle || ctx.fileName) lines.push(`Dokument: ${ctx.docTitle || ctx.fileName}`);
  if (ctx.webUrl) lines.push(ctx.webUrl);
  lines.push(`Eingetragen${ctx.by ? " von " + ctx.by : ""} mit dem Dokumentenmanager`);

  const body = {
    summary: summaryOf(it),
    description: lines.join("\n"),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes(it.reminderDays, it.allDay) }] },
  };
  if (ctx.id) body.id = ctx.id;
  if (clean(it.location)) body.location = clean(it.location);
  if (it.allDay) {
    body.start = { date: it.date };
    body.end = { date: nextDay(it.date) };
    body.transparency = "transparent"; // Fristen blockieren keine Zeit
  } else {
    const tz = ctx.timeZone || "Europe/Berlin";
    body.start = { dateTime: `${it.date}T${it.start}:00`, timeZone: tz };
    body.end = { dateTime: `${it.date}T${it.end || addMinutes(it.start, 60)}:00`, timeZone: tz };
  }
  return body;
}
