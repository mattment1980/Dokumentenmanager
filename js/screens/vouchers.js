/**
 * Bildschirm "vouchers": Liste der offenen Gutscheine und Rabatte (Funktionsmodul js/features/vouchers/).
 * Sortiert nach Ablaufdatum; je Eintrag Code/PIN zum Kopieren, „Benutzt“, „Teilweise eingelöst“ (nur Gutscheine
 * mit Betrag), „Abgelaufen“. Mehrfach nutzbare Rabattcodes bleiben einfach in der Liste, bis sie ablaufen.
 */
import { registerScreen, isCurrent, render } from "../core/router.js";
import { app, $, $$, esc, topbar, toast, busy, unbusy, copyText, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { on } from "../core/events.js";
import { list, retire, redeemPartly, removeEntry } from "../features/vouchers/index.js";
import { byExpiry, summarize, validityText, validityState, redeemLabel, checkRest, isDiscount, USED_FOLDER } from "../features/vouchers/model.js";
import { formatAmount, isoToDe } from "../documents/values.js";

let loading = false;
let partOpen = null; // ID des Gutscheins, bei dem gerade der Restbetrag eingegeben wird

registerScreen("vouchers", {
  enter() {
    partOpen = null;
    loading = true;
    list.refresh().finally(() => {
      loading = false;
      if (isCurrent("vouchers")) render();
    });
  },

  render() {
    const items = [...list.current().open].sort(byExpiry);
    const s = summarize(items);
    const sub = s.count ? `${s.count} offen${s.sum ? ` · ${formatAmount(s.sum)}` : ""}` : "";
    app.innerHTML = `${topbar("Gutscheine & Rabatte", { sub: loading ? (sub ? sub + " · wird aktualisiert …" : "wird geladen …") : sub })}
      ${!items.length ? `<div class="center"><span class="ic big ok">${I.check}</span><p class="muted">Keine offenen Gutscheine oder Rabatte.</p></div>` : ""}
      ${items.map(card).join("")}
      ${items.length ? `<p class="muted small">„Benutzt“ und „Abgelaufen“ verschieben in den Unterordner ${esc(USED_FOLDER)}. Mehrfach nutzbare Rabattcodes einfach stehen lassen.</p>` : ""}`;

    const find = (id) => items.find((x) => x.id === id);
    $$("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
    $$("[data-used]").forEach((b) => (b.onclick = () => doRetire(find(b.dataset.used), "used")));
    $$("[data-expired]").forEach((b) => (b.onclick = () => doRetire(find(b.dataset.expired), "expired")));
    $$("[data-remove]").forEach((b) => (b.onclick = () => doRemove(find(b.dataset.remove))));
    $$("[data-part]").forEach((b) => (b.onclick = () => {
      partOpen = partOpen === b.dataset.part ? null : b.dataset.part;
      render();
      $(`[data-rest="${partOpen}"]`)?.focus();
    }));
    $$("[data-savepart]").forEach((b) => (b.onclick = () => doPartly(find(b.dataset.savepart), $(`[data-rest="${b.dataset.savepart}"]`).value)));
  },
});

const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';
const copyBtn = (v, label) => `<button class="iconbtn copybtn" data-copy="${esc(v)}" aria-label="${esc(label)} kopieren" title="Kopieren">${COPY}</button>`;

function card(e) {
  const state = validityState(e.validUntil);
  const color = state === "expired" ? "errtext" : state === "soon" ? "warntext" : "";
  const disc = isDiscount(e);
  const hasAmount = !disc && e.amount !== null && e.amount !== undefined && e.amount !== "";
  // Rechte Spalte: Rabatt-Höhe, Geldwert oder Leistung; darunter, was sonst noch wichtig ist
  const value = disc ? e.discount : hasAmount ? formatAmount(e.amount) : e.what || "";
  const details = [disc && e.what ? `auf ${e.what}` : hasAmount && e.what ? e.what : "", redeemLabel(e.redeem)].filter(Boolean).join(" · ");
  return `<div class="card inv vou ${state}" data-id="${esc(e.id)}">
    <div class="invhead">
      <div class="grow"><div class="fname">${disc ? `<span class="tag">Rabatt</span>` : ""}${esc(e.merchant)}</div>
        <div class="path ${color}">${esc(validityText(e.validUntil))}${e.validUntil ? ` (bis ${esc(isoToDe(e.validUntil))})` : ""}</div>
        ${details ? `<div class="path">${esc(details)}</div>` : ""}</div>
      <div class="amount">${esc(value)}</div>
    </div>
    ${e.code || e.pin ? `<dl class="kv paykv">
      ${e.code ? `<dt>Code</dt><dd><span class="mono">${esc(e.code)}</span>${copyBtn(e.code, "Code")}</dd>` : ""}
      ${e.pin ? `<dt>PIN</dt><dd><span class="mono">${esc(e.pin)}</span>${copyBtn(e.pin, "PIN")}</dd>` : ""}
    </dl>` : ""}
    ${partOpen === e.id ? `<div class="partrow">
      <label class="field grow" style="margin:0"><span>Restbetrag (€)</span><input type="text" data-rest="${esc(e.id)}" inputmode="decimal" autocomplete="off" placeholder="z. B. 12,50"></label>
      <button class="btn small primary" data-savepart="${esc(e.id)}">Speichern</button>
    </div>` : ""}
    <div class="row" style="margin-top:12px">
      ${e.file?.webUrl ? `<a class="btn small" href="${esc(e.file.webUrl)}" target="_blank" rel="noopener">${I.ext} PDF</a>` : ""}
      ${hasAmount ? `<button class="btn small" data-part="${esc(e.id)}">Teilweise</button>` : ""}
      ${state === "expired"
        ? `<button class="btn small primary grow" data-expired="${esc(e.id)}">Abgelaufen – aussortieren</button>`
        : `<button class="btn small primary grow" data-used="${esc(e.id)}">${I.check} Benutzt</button>`}
    </div>
    <details class="small" style="margin-top:8px"><summary class="muted">Mehr</summary>
      <p class="muted" style="margin:6px 0">${esc(e.title || "")} · abgelegt ${esc(new Date(e.created).toLocaleDateString("de-DE"))}${e.createdBy ? " von " + esc(e.createdBy) : ""}</p>
      ${(e.log || []).length ? `<p class="muted" style="margin:6px 0">${e.log.map((l) => `${esc(isoToDe(l.date))}: teilweise eingelöst von ${esc(l.by)}, ${esc(formatAmount(l.from))} → ${esc(formatAmount(l.to))}`).join("<br>")}</p>` : ""}
      <div class="row">
        ${state === "expired" ? `<button class="btn small" data-used="${esc(e.id)}">Doch eingelöst</button>` : `<button class="btn small" data-expired="${esc(e.id)}">Abgelaufen</button>`}
        <button class="btn small danger" data-remove="${esc(e.id)}">Aus der Liste entfernen</button>
      </div>
    </details>
  </div>`;
}

async function doRetire(e, reason) {
  if (!e) return;
  const what = `${isDiscount(e) ? "Rabatt " : ""}${e.merchant}${isDiscount(e) ? (e.discount ? ` (${e.discount})` : "") : e.amount ? ` (${formatAmount(e.amount)})` : ""}`;
  const q = reason === "expired" ? `${what} als abgelaufen aussortieren?` : `${what} als benutzt markieren?`;
  if (!confirm(`${q}\n\nEr wird in den Unterordner „${USED_FOLDER}“ verschoben.`)) return;
  busy("Wird verschoben …");
  try {
    await retire(e, reason);
    unbusy();
    toast(reason === "expired" ? "Aussortiert" : "Als benutzt abgelegt", 3000);
  } catch (err) {
    unbusy();
    if (/nicht gefunden/.test(errText(err)) && confirm(`${errText(err)}\n\nTrotzdem aus der Liste entfernen?`)) {
      await removeEntry(e).catch((x) => toast(errText(x), 6000));
    } else toast(errText(err), 6000);
  }
  render();
}

async function doPartly(e, input) {
  if (!e) return;
  const r = checkRest(input, e.amount);
  if (r.error) return toast(r.error, 4000);
  if (r.value === 0) {
    partOpen = null;
    return doRetire(e, "used");
  }
  busy("Wird gespeichert …");
  try {
    await redeemPartly(e, r.value);
    partOpen = null;
    unbusy();
    toast(`Restbetrag: ${formatAmount(r.value)}`);
  } catch (err) {
    unbusy();
    toast(errText(err), 6000);
  }
  render();
}

async function doRemove(e) {
  if (!e || !confirm(`„${e.merchant}“ aus der Liste entfernen? Die Datei bleibt unverändert, wo sie ist.`)) return;
  busy("Wird entfernt …");
  try {
    await removeEntry(e);
  } catch (err) {
    toast(errText(err), 6000);
  }
  unbusy();
  render();
}

on("vouchers:changed", () => isCurrent("vouchers") && render());
