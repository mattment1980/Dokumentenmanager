/**
 * Google-Kalender – Anmeldung und Zugriff, ohne Bibliothek von Google (keine fremden Skripte, siehe docs/SICHERHEIT.md).
 *
 * Anmeldung: OAuth 2.0 für Browser-Apps ("Implicit Flow") in einem kleinen Fenster:
 *   accounts.google.com → google-redirect.html → Zugriffsschlüssel per BroadcastChannel/localStorage zurück an die App.
 *   Der Schlüssel gilt etwa eine Stunde und wird nur auf diesem Gerät gespeichert. Danach meldet sich die App beim
 *   nächsten Bedarf erneut an – mit bestehender Google-Sitzung ohne Eingabe (prompt=none), das Fenster schließt sich selbst.
 *   Ein Fenster darf nur nach einem Tipp geöffnet werden: login() daher immer direkt im Klick aufrufen.
 *
 * Berechtigungen (nur diese beiden):
 *   calendar.events                     Termine anlegen (die App schreibt nur in den gewählten Kalender)
 *   calendar.calendarlist.readonly      Liste der Kalender, um einen auszuwählen
 *
 * Die Client-ID ist nicht geheim; sie steht in der gemeinsamen Konfiguration (Einstellungen → Google-Kalender).
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const API = "https://www.googleapis.com/calendar/v3";
const KEY = "dm.google";
const RESULT_KEY = "dm.google.result";
const CHANNEL = "dm-google";

export class GoogleAuthNeeded extends Error {
  constructor(msg = "Google-Anmeldung nötig") {
    super(msg);
  }
}

// ---------- gespeicherter Zugang (nur dieses Gerät) ----------

function stored() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function store(patch) {
  const v = { ...stored(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
  return v;
}

/** Mit welchem Google-Konto ist dieses Gerät verbunden? ("" = nicht verbunden) */
export const account = () => stored().email || "";
export const isConnected = () => !!account();
/** Gültiger Zugriffsschlüssel vorhanden (mit 2 Minuten Puffer)? */
export const hasToken = () => {
  const s = stored();
  return !!s.token && s.exp > Date.now() + 120000;
};

/** Adresse der Rückgabeseite – so in der Google Cloud Console eintragen. */
export const redirectUri = () => new URL("google-redirect.html", location.href.split(/[?#]/)[0]).href;
export const origin = () => location.origin;

// ---------- Anmeldung ----------

let pending = null;

/**
 * Meldet an und liefert einen gültigen Zugriffsschlüssel. MUSS direkt aus einem Klick aufgerufen werden
 * (sonst blockiert der Browser das Fenster).
 * @param {{ clientId: string, select?: boolean }} o  select = Konto auswählen lassen (erste Verbindung)
 */
export function login({ clientId, select = false }) {
  if (!clientId) return Promise.reject(new Error("Google-Kalender ist noch nicht eingerichtet (Client-ID fehlt)."));
  if (!select && hasToken()) return Promise.resolve(stored().token);
  if (pending) return pending;

  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  const email = account();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "token",
    scope: SCOPES.join(" "),
    include_granted_scopes: "true",
    state,
  });
  if (select || !email) params.set("prompt", "select_account consent");
  else params.set("login_hint", email);

  const win = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, "dm-google", "width=480,height=640");
  if (!win) return Promise.reject(new Error("Das Anmeldefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben."));

  pending = new Promise((resolve, reject) => {
    let bc = null;
    let handled = false;
    const done = (fn, v) => {
      clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      try {
        bc?.close();
      } catch {}
      try {
        localStorage.removeItem(RESULT_KEY);
      } catch {}
      pending = null;
      fn(v);
    };
    const handle = async (raw) => {
      const p = new URLSearchParams(String(raw || "").replace(/^[#?]/, ""));
      if (p.get("state") !== state || handled) return; // fremde, alte oder schon verarbeitete Antwort
      handled = true; // kommt auf bis zu drei Wegen an (BroadcastChannel, localStorage, opener)
      if (p.get("error")) {
        const e = p.get("error");
        return done(reject, e === "access_denied" ? new Error("Google-Zugriff wurde nicht erlaubt.") : new GoogleAuthNeeded(`Google-Anmeldung: ${e}`));
      }
      const granted = (p.get("scope") || "").split(" ");
      if (!granted.includes(SCOPES[0])) return done(reject, new Error("Bitte bei Google den Zugriff auf den Kalender erlauben (Häkchen setzen)."));
      const token = p.get("access_token");
      store({ token, exp: Date.now() + Number(p.get("expires_in") || 3600) * 1000 });
      if (!stored().email || select) {
        try {
          const primary = await api("/users/me/calendarList/primary");
          store({ email: primary.id });
        } catch {
          store({ email: "Google-Konto" });
        }
      }
      done(resolve, token);
    };
    const onStorage = (e) => e.key === RESULT_KEY && e.newValue && handle(JSON.parse(e.newValue).data);
    const onMessage = (e) => e.origin === location.origin && e.data?.dmGoogle !== undefined && handle(e.data.dmGoogle);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => handle(e.data);
    } catch {}
    // Kein Abbruch über win.closed: Google trennt die Verbindung zum Fenster, das meldet sonst sofort "geschlossen"
    const timer = setTimeout(() => done(reject, new Error("Google-Anmeldung abgebrochen oder abgelaufen.")), 180000);
  });
  return pending;
}

/** Verbindung auf diesem Gerät trennen (Zugriff bei Google zurückziehen). */
export async function disconnect() {
  const { token } = stored();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  if (token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }).catch(() => {});
  }
}

// ---------- Kalender-API ----------

async function api(path, { method = "GET", body } = {}) {
  const { token } = stored();
  if (!token) throw new GoogleAuthNeeded();
  const r = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    store({ token: "", exp: 0 });
    throw new GoogleAuthNeeded();
  }
  if (!r.ok) {
    let msg = `Google-Kalender: Fehler ${r.status}`;
    try {
      const j = await r.json();
      if (j.error?.message) msg = `Google-Kalender: ${j.error.message}`;
    } catch {}
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  return r.status === 204 ? null : r.json();
}

/** Kalender, in die das Konto schreiben darf: [{ id, summary, primary }] */
export async function listCalendars() {
  if (!hasToken()) throw new GoogleAuthNeeded();
  const out = [];
  let pageToken = "";
  do {
    const j = await api(`/users/me/calendarList?minAccessRole=writer&maxResults=250${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`);
    for (const c of j.items || []) out.push({ id: c.id, summary: c.summaryOverride || c.summary || c.id, primary: !!c.primary });
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, "de"));
}

/**
 * Termin anlegen. Mit fester ID (body.id): ein zweiter Versuch legt keinen doppelten Termin an.
 * @returns {Promise<{ htmlLink?: string, existed?: boolean }>}
 */
export async function insertEvent(calendarId, body) {
  if (!hasToken()) throw new GoogleAuthNeeded();
  try {
    return await api(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body });
  } catch (e) {
    if (e.status === 409) return { existed: true };
    throw e;
  }
}
