/**
 * Wiederverwendbare Bausteine für mehrere Bildschirme.
 */
import { esc } from "../core/ui.js";
import { I } from "../core/icons.js";
import { describe } from "../documents/job.js";

/** Kleine Karte "welches Dokument ist das?" (Dateiname, Art, Herkunft). */
export function jobCard(job) {
  const d = describe(job);
  const from = job.mail ? `aus E-Mail: ${job.mail.subject || job.mail.from || ""}` : "";
  return `<div class="card jobcard">
    <span class="ic">${job.mail ? I.clip : I.file}</span>
    <div class="grow"><div class="fname">${esc(d.title)}</div><div class="path">${esc(d.kind)}${from ? " · " + esc(from) : ""}</div></div>
  </div>`;
}
