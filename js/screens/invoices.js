/**
 * Bildschirm "invoices": Liste der offenen Rechnungen (Funktionsmodul js/features/invoices/).
 * Sortiert nach Fälligkeit; je Eintrag Kopieren-Knöpfe für die Überweisung und "Überwiesen".
 */
import { registerScreen, isCurrent, render } from "../core/router.js";
import { app, $$, esc, topbar, toast, busy, unbusy, copyText, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { on } from "../core/events.js";
import * as register from "../features/invoices/register.js";
import { markPaid, removeEntry, summary } from "../features/invoices/index.js";
import { formatAmount, formatIban, plainAmount, isoToDe, dueText, daysUntil } from "../features/invoices/payment.js";

let loading = false;

registerScreen("invoices", {
  enter() {
    // Beim Öffnen frisch aus OneDrive laden (die andere Person könnte etwas geändert haben)
    loading = true;
    register.refresh().finally(() => {
      loading = false;
      if (isCurrent("invoices")) render();
    });
  },

  render() {
    const d = register.current();
    const items = [...d.open].sort((a, b) => (a.due || "0000") .localeCompare(b.due || "0000") || a.created - b.created);
    const s = summary(d);
    app.innerHTML = `${topbar("Offene Rechnungen", { sub: s.count ? `${s.count} offen · ${formatAmount(s.sum)}${loading ? " · wird aktualisiert …" : ""}` : loading ? "wird geladen …" : "" })}
      ${!items.length ? `<div class="center"><span class="ic big ok">${I.check}</span><p class="muted">Keine offenen Rechnungen.</p></div>` : ""}
      ${items.map((e) => card(e)).join("")}
      ${items.length ? `<p class="muted small">Die App überweist nicht selbst. Daten kopieren, im Banking überweisen, dann hier „Überwiesen“ tippen – die Rechnung wandert dann mit dem Vermerk „bezahlt“ in ihren Ordner.</p>` : ""}`;

    $$("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
    $$("[data-paid]").forEach((b) => (b.onclick = () => paid(items.find((x) => x.id === b.dataset.paid))));
    $$("[data-remove]").forEach((b) => (b.onclick = () => remove(items.find((x) => x.id === b.dataset.remove))));
  },
});

function card(e) {
  const days = daysUntil(e.due);
  const overdue = days !== null && days < 0;
  const soon = days !== null && days >= 0 && days <= 3;
  const copyBtn = (v, label) => `<button class="iconbtn copybtn" data-copy="${esc(v)}" aria-label="${esc(label)} kopieren" title="Kopieren">${COPY}</button>`;
  return `<div class="card inv ${overdue ? "overdue" : ""}">
    <div class="invhead">
      <div class="grow"><div class="fname">${esc(e.recipient)}</div>
        <div class="path ${overdue ? "errtext" : soon ? "warntext" : ""}">${esc(dueText(e.due))}${e.due ? ` (${esc(isoToDe(e.due))})` : ""}${/^mahnung/i.test(e.doctype) ? " · Mahnung" : ""}</div></div>
      <div class="amount">${esc(formatAmount(e.amount))}</div>
    </div>
    ${e.ibanWarning ? `<div class="banner err"><span class="grow"><b>Neue IBAN für diesen Empfänger</b> – vor dem Überweisen auf bekanntem Weg prüfen.</span></div>` : ""}
    <dl class="kv paykv">
      <dt>Empfänger</dt><dd>${esc(e.recipient)}${copyBtn(e.recipient, "Empfänger")}</dd>
      <dt>IBAN</dt><dd>${e.iban ? `<span class="mono">${esc(formatIban(e.iban))}</span>${copyBtn(e.iban, "IBAN")}` : `<span class="muted">nicht angegeben</span>`}</dd>
      <dt>Betrag</dt><dd>${esc(formatAmount(e.amount))}${copyBtn(plainAmount(e.amount), "Betrag")}</dd>
      <dt>Zweck</dt><dd>${e.purpose ? `${esc(e.purpose)}${copyBtn(e.purpose, "Verwendungszweck")}` : `<span class="muted">–</span>`}</dd>
    </dl>
    <div class="row" style="margin-top:12px">
      ${e.file?.webUrl ? `<a class="btn small" href="${esc(e.file.webUrl)}" target="_blank" rel="noopener">${I.ext} PDF</a>` : ""}
      <button class="btn small primary grow" data-paid="${esc(e.id)}">${I.check} Überwiesen</button>
    </div>
    <details class="small" style="margin-top:8px"><summary class="muted">Mehr</summary>
      <p class="muted" style="margin:6px 0">${esc(e.title || "")} · abgelegt ${esc(new Date(e.created).toLocaleDateString("de-DE"))}${e.createdBy ? " von " + esc(e.createdBy) : ""}<br>Ziel nach Zahlung: ${esc((e.targetRel || []).join(" / "))}</p>
      <button class="btn small danger" data-remove="${esc(e.id)}">Aus der Liste entfernen</button>
    </details>
  </div>`;
}

const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';

async function paid(e) {
  if (!e) return;
  if (!confirm(`${e.recipient}: ${formatAmount(e.amount)} als überwiesen markieren?\n\nDie Rechnung wird nach „${(e.targetRel || []).join(" / ")}“ verschoben und als bezahlt gekennzeichnet.`)) return;
  busy("Wird als bezahlt abgelegt …");
  try {
    const moved = await markPaid(e);
    unbusy();
    toast(`Bezahlt abgelegt: ${moved.name}`, 4000);
  } catch (err) {
    unbusy();
    if (/nicht gefunden/.test(errText(err)) && confirm(`${errText(err)}\n\nTrotzdem aus der Liste entfernen?`)) {
      await removeEntry(e).catch((x) => toast(errText(x), 6000));
    } else toast(errText(err), 6000);
  }
  render();
}

async function remove(e) {
  if (!e || !confirm(`„${e.recipient}“ aus der Liste entfernen? Die Datei bleibt unverändert, wo sie ist.`)) return;
  busy("Wird entfernt …");
  try {
    await removeEntry(e);
  } catch (err) {
    toast(errText(err), 6000);
  }
  unbusy();
  render();
}

// Liste aktualisieren, wenn sich das Register ändert (z. B. nach einem Upload im Hintergrund)
on("invoices:changed", () => isCurrent("invoices") && render());
