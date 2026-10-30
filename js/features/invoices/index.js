/**
 * Funktionsmodul "Rechnungen": Bezahlt-Frage beim Ablegen, Liste offener Rechnungen, "Überwiesen".
 *
 * Ablauf
 *   1. Dokumenttyp Rechnung oder Mahnung → im Prüfen-Bildschirm erscheint "Bezahlt?"
 *      (Bezahlt · Offen · Wird abgebucht). Die KI füllt Empfänger, IBAN, Betrag, Verwendungszweck,
 *      Fälligkeit vor (KI-Feld "zahlung").
 *   2. Ablage-Filter:
 *        Bezahlt        → Zielordner, Dateiname mit "_bezahlt", Vermerk in den Eigenschaften
 *        Wird abgebucht → Zielordner, Dateiname mit "_Lastschrift", Vermerk
 *        Offen          → 00_Eingang/Unbezahlte Rechnungen; Zielordner wird für später gemerkt
 *   3. Nach dem Hochladen (Ereignis "queue:uploaded") wird die offene Rechnung ins Register eingetragen.
 *   4. "Überwiesen" (screens/invoices.js → markPaid) verschiebt die Datei in den Zielordner,
 *      hängt "_bezahlt" an und entfernt den Eintrag aus der Liste.
 *
 * Schutz: IBAN-Prüfsumme; Warnung, wenn ein Empfänger plötzlich eine andere IBAN nutzt.
 * Die App überweist nie selbst.
 *
 * Abschaltbar in den Einstellungen (core/features.js, id "invoices").
 */
import { APP } from "../../core/config.js";
import { S, doctypeByName, uploaderName } from "../../core/state.js";
import { esc } from "../../core/ui.js";
import { on } from "../../core/events.js";
import { registerFeature } from "../../core/features.js";
import { registerAiField, registerDraftInit, registerReviewSection, registerSaveFilter, registerHomeSection } from "../../core/extensions.js";
import { go } from "../../core/router.js";
import { history } from "../../services/storage.js";
import * as od from "../../services/onedrive.js";
import * as register from "./register.js";
import { normalizeIban, isValidIban, formatIban, parseAmount, formatAmount, isoToDe, withNameTag, daysUntil } from "./payment.js";
import { isValidIsoDate } from "../../documents/naming.js";

export const FEATURE = "invoices";

registerFeature({
  id: FEATURE,
  label: "Rechnungen",
  description: "Bei Rechnungen und Mahnungen „Bezahlt?“ fragen, Liste offener Rechnungen mit Überweisungsdaten.",
});

/** Unterordner im Eingang für offene Rechnungen. */
export const OPEN_FOLDER = [APP.inboxFolder, "Unbezahlte Rechnungen"];
export const TAG_PAID = "bezahlt";
export const TAG_DEBIT = "Lastschrift";

/** Ist der Dokumenttyp zahlungsrelevant? (Flag "payable" in der Konfiguration, sonst nach Name) */
export function isPayable(doctypeName) {
  const dt = doctypeByName(doctypeName);
  if (dt && typeof dt.payable === "boolean") return dt.payable;
  return /^(rechnung|mahnung)\b/i.test(String(doctypeName || ""));
}
const isReminder = (doctypeName) => /^mahnung/i.test(String(doctypeName || ""));

// ---------- 1. Entwurf und KI ----------

registerDraftInit((d) => {
  d.payment = { status: "", recipient: "", iban: "", amount: "", purpose: "", due: "" };
});

registerAiField({
  feature: FEATURE,
  name: "zahlung",
  schema: {
    type: "object",
    description: "Nur bei Rechnungen und Mahnungen ausfüllen.",
    properties: {
      empfaenger: { type: "string" },
      iban: { type: "string" },
      betrag: { type: "number" },
      verwendungszweck: { type: "string" },
      faellig_am: { type: "string", description: "JJJJ-MM-TT oder leer" },
      lastschrift: { type: "boolean" },
      bereits_bezahlt: { type: "boolean" },
    },
  },
  rule:
    "nur bei Rechnung oder Mahnung, sonst weglassen. empfaenger = Zahlungsempfänger kurz (wie sender); " +
    "iban = IBAN, auf die überwiesen werden soll, ohne Leerzeichen (leer, wenn keine angegeben); " +
    "betrag = zu zahlender Gesamtbetrag in Euro (bei Mahnungen inklusive Gebühren); " +
    "verwendungszweck = genau wie auf dem Dokument verlangt (z. B. Rechnungs-, Kunden- oder Vertragsnummer); " +
    "faellig_am = Fälligkeitsdatum JJJJ-MM-TT; bei Angaben wie 'zahlbar innerhalb 14 Tagen' ab Rechnungsdatum berechnen, sonst leer; " +
    "lastschrift = true, wenn der Betrag per Lastschrift/Bankeinzug abgebucht wird; " +
    "bereits_bezahlt = true, wenn das Dokument die Zahlung bereits bestätigt (z. B. Quittung, 'Betrag dankend erhalten').",
  apply(d, v) {
    if (!v || typeof v !== "object") return;
    const amount = parseAmount(v.betrag);
    Object.assign(d.payment, {
      recipient: String(v.empfaenger || "").trim() || d.sender,
      iban: normalizeIban(v.iban),
      amount: amount !== null ? String(amount.toFixed(2)).replace(".", ",") : "",
      purpose: String(v.verwendungszweck || "").trim(),
      due: isValidIsoDate(v.faellig_am) ? v.faellig_am : "",
      status: v.lastschrift ? "debit" : v.bereits_bezahlt ? "paid" : "",
    });
  },
});

// ---------- 2. Abschnitt im Prüfen-Bildschirm ----------

const STATUS = [
  ["paid", "Bezahlt"],
  ["open", "Offen"],
  ["debit", "Wird abgebucht"],
];

registerReviewSection({
  feature: FEATURE,
  id: "payment",
  applies: (job, d) => isPayable(d.doctype),
  render(job, d) {
    const p = d.payment;
    const ibanOk = !p.iban || isValidIban(p.iban);
    const changed = p.status === "open" && ibanOk && p.iban ? register.ibanChange(p.recipient || d.sender, p.iban) : null;
    const related = isReminder(d.doctype) ? register.openForPayee(p.recipient || d.sender) : [];
    return `<div class="card" id="pay">
      <h2>Bezahlt?</h2>
      <div class="seg" id="payStatus">${STATUS.map(([v, l]) => `<button data-s="${v}" class="${p.status === v ? "on" : ""}">${l}</button>`).join("")}</div>
      ${p.status === "paid" ? `<p class="muted small" style="margin:10px 0 0">Wird mit dem Vermerk „bezahlt“ im Zielordner abgelegt.</p>` : ""}
      ${p.status === "debit" ? `<p class="muted small" style="margin:10px 0 0">Wird mit dem Vermerk „Lastschrift“ im Zielordner abgelegt, nicht in der Liste.</p>` : ""}
      ${p.status === "open" ? `
        <p class="muted small" style="margin:10px 0 12px">Kommt nach <b>${esc(OPEN_FOLDER.join(" / "))}</b> und in die Liste „Offene Rechnungen“. Nach „Überwiesen“ wird sie in den gewählten Ordner verschoben.</p>
        ${related.length ? `<div class="banner info"><span class="grow">Für diesen Empfänger ist bereits ${related.length === 1 ? "eine Rechnung" : related.length + " Rechnungen"} offen: ${related.map((e) => `${esc(formatAmount(e.amount))} (${esc(e.title || e.purpose || "")})`).join(", ")}</span></div>` : ""}
        <label class="field"><span>Empfänger</span><input type="text" data-p="recipient" value="${esc(p.recipient)}" autocomplete="off"></label>
        <label class="field"><span>IBAN ${p.iban ? (ibanOk ? `<span class="okmark">✓ gültig</span>` : `<span class="errmark">✗ Prüfziffer falsch</span>`) : ""}</span>
          <input type="text" data-p="iban" value="${esc(p.iban ? formatIban(p.iban) : "")}" autocomplete="off" spellcheck="false" inputmode="text"></label>
        ${changed ? `<div class="banner err"><span class="grow"><b>Achtung: neue IBAN für diesen Empfänger.</b><br>Bisher: ${changed.map((x) => esc(formatIban(x))).join(", ")}. Vor der Überweisung beim Empfänger auf bekanntem Weg prüfen – geänderte Kontodaten sind eine typische Betrugsmasche.</span></div>` : ""}
        <div class="row">
          <label class="field grow"><span>Betrag (€)</span><input type="text" data-p="amount" value="${esc(p.amount)}" inputmode="decimal" autocomplete="off"></label>
          <label class="field grow"><span>Fällig am</span><input type="date" data-p="due" value="${esc(p.due)}"></label>
        </div>
        <label class="field" style="margin-bottom:0"><span>Verwendungszweck</span><input type="text" data-p="purpose" value="${esc(p.purpose)}" autocomplete="off"></label>` : ""}
    </div>`;
  },
  bind(root, job, d, rerender, refresh) {
    root.querySelector("#payStatus").onclick = (e) => {
      const b = e.target.closest("[data-s]");
      if (!b) return;
      d.payment.status = d.payment.status === b.dataset.s ? "" : b.dataset.s;
      if (d.payment.status === "open" && !d.payment.recipient) d.payment.recipient = d.sender;
      rerender();
    };
    root.querySelectorAll("[data-p]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.p;
        d.payment[k] = k === "iban" ? normalizeIban(inp.value) : inp.value;
        refresh();
      });
      // IBAN-Prüfung und Warnungen nach dem Verlassen des Feldes aktualisieren
      if (inp.dataset.p === "iban" || inp.dataset.p === "recipient") inp.addEventListener("change", rerender);
    });
  },
  validate(job, d) {
    const p = d.payment;
    if (!p.status) return "Bitte angeben: bezahlt, offen oder Lastschrift.";
    if (p.status !== "open") return "";
    if (!String(p.recipient).trim()) return "Bitte Empfänger der Zahlung eintragen.";
    const a = parseAmount(p.amount);
    if (a === null || a <= 0) return "Bitte Betrag eintragen.";
    if (p.iban && !isValidIban(p.iban)) return "Die IBAN ist ungültig (Prüfziffer falsch).";
    if (p.due && !isValidIsoDate(p.due)) return "Bitte gültiges Fälligkeitsdatum eingeben.";
    return "";
  },
});

// ---------- 3. Ablage-Filter ----------

registerSaveFilter((plan) => {
  const d = plan.draft;
  if (!isPayable(d.doctype) || !d.payment?.status) return;
  const p = d.payment;
  const today = new Date().toLocaleDateString("de-DE");
  const iban = isValidIban(p.iban) ? normalizeIban(p.iban) : "";
  if (iban) plan.meta.iban = { payee: p.recipient || d.sender, iban };

  if (p.status === "paid") {
    plan.fileName = withNameTag(plan.fileName, TAG_PAID);
    plan.description += ` · Als bezahlt abgelegt am ${today} von ${plan.who}`;
  } else if (p.status === "debit") {
    plan.fileName = withNameTag(plan.fileName, TAG_DEBIT);
    plan.description += " · Zahlung per Lastschrift";
  } else if (p.status === "open") {
    const targetRel = plan.rel;
    const description = plan.description;
    plan.rel = [...OPEN_FOLDER];
    plan.description += ` · Offen${p.due ? `, fällig am ${isoToDe(p.due)}` : ""}`;
    plan.meta.invoice = {
      doctype: d.doctype,
      sender: d.sender,
      title: d.title,
      recipient: String(p.recipient).trim(),
      iban,
      amount: parseAmount(p.amount),
      purpose: String(p.purpose || "").trim(),
      due: p.due || "",
      ibanWarning: !!(iban && register.ibanChange(p.recipient || d.sender, iban)),
      targetRel,
      targetFileName: withNameTag(plan.fileName, TAG_PAID),
      description,
    };
  }
}, { feature: FEATURE });

// ---------- 4. Nach dem Hochladen: Register pflegen ----------

on("queue:uploaded", async ({ item, result }) => {
  const inv = item.meta?.invoice;
  const ib = item.meta?.iban;
  if (!inv && !ib) return;
  try {
    await register.update((reg) => {
      if (ib) register.rememberIban(reg, ib.payee, ib.iban);
      if (inv && !reg.open.some((e) => e.file?.id === result.id)) {
        reg.open.push({
          ...inv,
          id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          created: Date.now(),
          createdBy: item.description?.match(/Abgelegt von: ([^ ]+)/)?.[1] || "",
          file: { driveId: result.driveId || "", id: result.id, name: result.name, webUrl: result.webUrl || "" },
        });
      }
    }, item.archive);
  } catch (e) {
    console.error("Rechnungsliste konnte nicht aktualisiert werden", e);
  }
});

// Register mit der Konfiguration (also nach Anmeldung bzw. Archivwechsel) neu laden
on("config:loaded", () => register.refresh());

// ---------- 5. Aktionen aus der Liste ----------

/** Rechnung als überwiesen markieren: Datei verschieben, umbenennen, aus der Liste nehmen. */
export async function markPaid(entry) {
  const who = uploaderName();
  const today = new Date().toLocaleDateString("de-DE");
  const moved = await od.moveItem(entry.file, entry.targetRel, entry.targetFileName, {
    description: `${entry.description} · Bezahlt am ${today} von ${who}`,
    archive: S.archive,
  });
  await register.update((reg) => {
    reg.open = reg.open.filter((e) => e.id !== entry.id);
  });
  await history.add({ id: `paid-${entry.id}`, created: Date.now(), name: moved.name, path: [S.archive.mode === "shared" ? S.archive.name : S.archive.path, ...entry.targetRel].join(" / "), webUrl: moved.webUrl });
  return moved;
}

/** Eintrag nur aus der Liste nehmen (Datei bleibt, wo sie ist). */
export async function removeEntry(entry) {
  await register.update((reg) => {
    reg.open = reg.open.filter((e) => e.id !== entry.id);
  });
}

/** Zusammenfassung für Startseite und Liste. */
export function summary(d = register.current()) {
  const open = d.open;
  return {
    count: open.length,
    sum: open.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    overdue: open.filter((e) => (daysUntil(e.due) ?? 0) < 0).length,
  };
}

// ---------- 6. Kachel auf der Startseite ----------

registerHomeSection({
  feature: FEATURE,
  id: "invoices",
  render() {
    const s = summary();
    return `<button class="tile ${s.overdue ? "warn" : ""} ${s.count ? "" : "quiet"}" id="tileInvoices">
      <span class="grow"><b>Offene Rechnungen</b><span class="path">${s.count ? `${s.count} offen${s.overdue ? ` · ${s.overdue} überfällig` : ""}` : "Keine offenen Rechnungen"}</span></span>
      ${s.count ? `<span class="amount">${esc(formatAmount(s.sum))}</span>` : ""}
    </button>`;
  },
  bind(root) {
    const b = root.querySelector("#tileInvoices");
    if (b) b.onclick = () => go("invoices");
  },
});
