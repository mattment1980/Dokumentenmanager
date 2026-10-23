// KI-Vorschlag über die Anthropic API (direkt aus dem Browser, mit eigenem Schlüssel).

const API = "https://api.anthropic.com/v1/messages";

function headers(key) {
  return {
    "content-type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

function b64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

async function apiError(res) {
  let detail = "";
  try {
    const j = await res.json();
    detail = j.error?.message || "";
  } catch {}
  const map = {
    400: "Anfrage ungültig",
    401: "API-Schlüssel ungültig oder gesperrt",
    403: "Schlüssel hat keine Berechtigung",
    404: "Modell nicht gefunden",
    413: "Bilder zu groß",
    429: "Zu viele Anfragen oder Ausgabenlimit erreicht",
    500: "Fehler bei Anthropic",
    529: "KI derzeit überlastet, bitte gleich nochmal versuchen",
  };
  const err = new Error(`${map[res.status] || "KI-Fehler " + res.status}${detail ? ": " + detail : ""}`);
  err.status = res.status;
  return err;
}

export async function testKey(key, model) {
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "Hallo" }] }),
    });
  } catch {
    throw new Error("Keine Verbindung zur KI. Internet prüfen.");
  }
  if (!res.ok) throw await apiError(res);
  return true;
}

function catalog(structure) {
  const lines = [];
  for (const f of structure.folders) {
    lines.push(`- ${f.name}: ${f.description || ""}`);
    for (const c of f.children || []) lines.push(`    - ${c.name}${c.description ? ": " + c.description : ""}`);
  }
  return lines.join("\n");
}

function doctypeList(structure) {
  return structure.doctypes.map((d) => `- ${d.name}: ${d.hint || ""}`).join("\n");
}

export async function suggest({ key, model, structure, images = [], pdf = null, today }) {
  const folders = structure.folders.map((f) => f.name);
  const doctypes = structure.doctypes.map((d) => d.name);
  const system = `Du sortierst eingehende private Post einer Familie in ein Dokumentenarchiv in OneDrive.
Du bekommst Fotos der Seiten eines Dokuments und machst einen Ablagevorschlag.

ORDNERSTRUKTUR (Hauptordner mit Regel, darunter Unterordner):
${catalog(structure)}

DOKUMENTTYPEN:
${doctypeList(structure)}

REGELN:
- Wähle genau einen Hauptordner. Wenn es Unterordner gibt, wähle den passenden (z. B. nach Person, an die der Brief gerichtet ist oder die er betrifft, nach Sparte oder Objekt). Gibt es keine Unterordner, bleibt subfolder leer.
- Nutze 00_Eingang nur, wenn das Dokument unlesbar ist oder wirklich nirgends passt.
- sender: kurzer, wiedererkennbarer Name des Absenders, 1 bis 3 Wörter, ohne Rechtsform (z. B. "Finanzamt", "Allianz", "Stadtwerke", "Dr. Huber").
- title: knappe Inhaltsbeschreibung mit 2 bis 6 Wörtern, mit Jahr oder Zeitraum, wenn erkennbar (z. B. "Einkommensteuer 2025", "Beitragsanpassung 2027", "Nebenkosten 2025").
- letter_date: das Datum des Schreibens (Briefdatum, Ausstellungsdatum, Rechnungsdatum) im Format JJJJ-MM-TT. Nicht das heutige Datum (${today}) erfinden; wenn kein Datum erkennbar ist, leer lassen.
- confidence: 0 bis 1, wie sicher du beim Ordner bist.
- reason: ein kurzer Satz auf Deutsch, warum dieser Ordner.`;

  const content = pdf
    ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(pdf) } }]
    : images.slice(0, 4).map((img) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: b64(img) },
      }));
  const what = pdf ? "ist das Dokument als PDF" : images.length > 1 ? `sind ${Math.min(images.length, 4)} Seiten des Dokuments` : "ist die Seite des Dokuments";
  content.push({ type: "text", text: `Hier ${what}. Bitte gib den Ablagevorschlag über das Werkzeug ablage_vorschlag ab.` });

  const tool = {
    name: "ablage_vorschlag",
    description: "Ablagevorschlag für das Dokument",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", enum: folders },
        subfolder: { type: "string", description: "Name des Unterordners oder leer" },
        doctype: { type: "string", enum: doctypes },
        sender: { type: "string" },
        title: { type: "string" },
        letter_date: { type: "string", description: "JJJJ-MM-TT oder leer" },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
      required: ["folder", "subfolder", "doctype", "sender", "title", "letter_date", "confidence", "reason"],
    },
  };

  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system: system + "\n\nGib deinen Vorschlag immer über das Werkzeug ablage_vorschlag ab, ohne weiteren Text.",
        tools: [tool],
        // Neuere Modelle erlauben kein erzwungenes Werkzeug; "auto" plus klare Anweisung reicht.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content }],
      }),
    });
  } catch {
    throw new Error("Keine Verbindung zur KI. Internet prüfen oder direkt ablegen.");
  }
  if (!res.ok) throw await apiError(res);
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "tool_use" && b.name === "ablage_vorschlag");
  if (block) return normalize(block.input, structure);
  // Absicherung: Vorschlag als JSON im Text
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const parsed = extractJson(text);
  if (parsed && parsed.folder) return normalize(parsed, structure);
  throw new Error("Die KI hat keinen verwertbaren Vorschlag geliefert. Bitte nochmal versuchen oder direkt ablegen.");
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Prüft den Vorschlag gegen die aktuelle Struktur.
export function normalize(s, structure) {
  const folder = structure.folders.find((f) => f.name === s.folder) ||
    structure.folders.find((f) => f.name.toLowerCase() === String(s.folder || "").toLowerCase());
  const target = folder || structure.folders[0];
  let sub = "";
  if (target.children && target.children.length) {
    const want = String(s.subfolder || "").toLowerCase();
    const match = target.children.find((c) => c.name.toLowerCase() === want) ||
      target.children.find((c) => want && (c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase())));
    sub = match ? match.name : "";
  }
  const doctype = structure.doctypes.find((d) => d.name === s.doctype) ||
    structure.doctypes[structure.doctypes.length - 1];
  return {
    folder: target.name,
    subfolder: sub,
    doctype: doctype.name,
    sender: String(s.sender || "").trim(),
    title: String(s.title || "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(s.letter_date || "") ? s.letter_date : "",
    confidence: typeof s.confidence === "number" ? s.confidence : null,
    reason: String(s.reason || "").trim(),
  };
}
