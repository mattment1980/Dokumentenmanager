// Rückgabeseite der Google-Anmeldung (js/services/google.js): Ergebnis an die App weiterreichen und schließen.
// Der Zugriffsschlüssel steht im Adress-Anker (#access_token=…) und wird sofort aus der Adresszeile entfernt.
(function () {
  var data = (location.hash || location.search || "").replace(/^[#?]/, "");
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  try { new BroadcastChannel("dm-google").postMessage(data); } catch (e) {}
  try { localStorage.setItem("dm.google.result", JSON.stringify({ data: data, t: Date.now() })); } catch (e) {}
  try { if (window.opener) window.opener.postMessage({ dmGoogle: data }, location.origin); } catch (e) {}
  var msg = document.getElementById("msg");
  msg.textContent = /error=/.test(data) ? "Anmeldung nicht abgeschlossen. Dieses Fenster kann geschlossen werden." : "Fertig – dieses Fenster kann geschlossen werden.";
  setTimeout(function () { window.close(); }, 400);
})();
