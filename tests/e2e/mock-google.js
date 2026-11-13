// Attrappe für js/services/google.js in den Browsertests: keine Verbindung zu Google.
// Zustand in localStorage "__gcal": { email, token, events: [{ calendarId, body }], expireOnInsert }
const K = "__gcal";
const st = () => JSON.parse(localStorage.getItem(K) || '{"events":[]}');
const save = (s) => localStorage.setItem(K, JSON.stringify(s));

export const SCOPES = ["calendar.events", "calendar.calendarlist.readonly"];
export class GoogleAuthNeeded extends Error {
  constructor(msg = "Google-Anmeldung nötig") {
    super(msg);
  }
}
export const account = () => st().email || "";
export const isConnected = () => !!account();
export const hasToken = () => !!st().token;
export const redirectUri = () => new URL("google-redirect.html", location.href.split(/[?#]/)[0]).href;
export const origin = () => location.origin;

export async function login({ clientId, select = false }) {
  if (!clientId) throw new Error("Google-Kalender ist noch nicht eingerichtet (Client-ID fehlt).");
  const s = st();
  s.logins = (s.logins || 0) + 1;
  s.token = true;
  s.email = s.email || "test@gmail.com";
  save(s);
  return "tok";
}
export async function disconnect() {
  const s = st();
  delete s.email;
  s.token = false;
  save(s);
}
export async function listCalendars() {
  if (!hasToken()) throw new GoogleAuthNeeded();
  return [
    { id: "test@gmail.com", summary: "Test Person", primary: true },
    { id: "familie123@group.calendar.google.com", summary: "Familie", primary: false },
  ];
}
export async function insertEvent(calendarId, body) {
  const s = st();
  if (s.expireOnInsert) {
    s.expireOnInsert = false;
    s.token = false;
    save(s);
  }
  if (!st().token) throw new GoogleAuthNeeded();
  const t = st();
  if (t.events.some((e) => e.body.id === body.id)) return { existed: true };
  t.events.push({ calendarId, body });
  save(t);
  return { htmlLink: "https://calendar.google.com/x" };
}
