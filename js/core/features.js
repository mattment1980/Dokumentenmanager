/**
 * Funktionsmodule an- und abschalten.
 *
 * Jedes Modul in js/features/ meldet sich hier mit registerFeature() an. Ob es aktiv ist, steht in der
 * gemeinsamen Konfiguration im Archivordner (S.structure.features = { vouchers: true, … }) und gilt
 * damit für alle, die das Archiv nutzen. Fehlt ein Eintrag, ist das Modul an.
 *
 * Abgeschaltete Module:
 *   - ihre Erweiterungen (KI-Felder, Prüfen-Abschnitte, Ablage-Filter, Startseiten-Bausteine) werden
 *     nicht aufgerufen (core/extensions.js filtert nach def.feature),
 *   - ihre Dokumenttypen (doctype.feature) werden im Prüfen-Bildschirm und für die KI ausgeblendet,
 *   - ihre Daten (z. B. die Liste in OneDrive) bleiben unverändert erhalten.
 *
 * Schalten: core/structure.js → saveFeatures(); Oberfläche: Einstellungen → „Funktionen“.
 */
import { S } from "./state.js";

const features = [];

/** Modul anmelden: { id, label, description } */
export function registerFeature(def) {
  if (!features.some((f) => f.id === def.id)) features.push(def);
}

export const getFeatures = () => features;

/** Ist das Modul aktiv? (Standard: ja) */
export function isEnabled(id, structure = S.structure) {
  if (!id) return true;
  return structure?.features?.[id] !== false;
}

/** Dokumenttyp sichtbar? Typen eines abgeschalteten Moduls werden ausgeblendet. */
export const doctypeActive = (dt, structure = S.structure) => !dt?.feature || isEnabled(dt.feature, structure);

/** Struktur, wie Prüfen-Bildschirm und KI sie sehen sollen (ohne Dokumenttypen abgeschalteter Module). */
export function activeStructure(structure = S.structure) {
  return { ...structure, doctypes: structure.doctypes.filter((d) => doctypeActive(d, structure)) };
}
