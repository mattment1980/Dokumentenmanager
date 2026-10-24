"""
Browsertest der kompletten App mit nachgebildetem OneDrive und nachgebildeter KI.

Voraussetzung: Python 3 mit Playwright und Chromium  (pip install playwright && playwright install chromium)
Aufruf:        python3 tests/e2e/run.py          Bildschirmfotos landen in tests/e2e/screens/

Geprüft werden: Scannen (KI und direkt), E-Mail mit einem Anhang (direkt weiter, Mailtext angehängt),
E-Mail mit mehreren Anhängen (Auswahl, Stapel, Überspringen), Mail ohne Anhang, Hineinziehen,
Teilen (Android), Struktur bearbeiten, geteilter Ordner, Service Worker für das Teilen-Ziel.
"""
import base64, functools, http.server, io, json, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(ROOT, "tests", "fixtures")
SHOTS = os.path.join(HERE, "screens")
os.makedirs(SHOTS, exist_ok=True)
PORT = 8790

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}/"

ai_calls = []
SUGGESTIONS = [
    {"folder": "06_Steuern", "subfolder": "Gemeinsam", "doctype": "Bescheid", "sender": "Finanzamt", "title": "Einkommensteuer 2025", "letter_date": "2026-10-14", "confidence": 0.93, "reason": "Steuerbescheid."},
    {"folder": "11_Verträge & Abos", "subfolder": "Sonstige", "doctype": "Abrechnung", "sender": "Stadtwerke", "title": "Jahresabrechnung Strom 2025", "letter_date": "", "confidence": 0.8, "reason": "Stromabrechnung laut E-Mail."},
]
# Für den Rechnungstest (Abschnitt 11) wird SUGGESTIONS umgestellt
INVOICE = {"folder": "13_Anschaffungen & Garantien", "subfolder": "", "doctype": "Rechnung", "sender": "Elektro Muster", "title": "Waschmaschine", "letter_date": "2026-10-20", "confidence": 0.9, "reason": "Rechnung für ein Gerät.",
           "zahlung": {"empfaenger": "Elektro Muster GmbH", "iban": "DE89 3704 0044 0532 0130 00", "betrag": 649.9, "verwendungszweck": "RE-2026-4711", "faellig_am": "2026-11-03", "lastschrift": False}}

def anthropic(route):
    body = json.loads(route.request.post_data)
    ai_calls.append(body)
    if body.get("tool_choice", {}).get("type") in ("tool", "any"):
        return route.fulfill(status=400, headers={"access-control-allow-origin": "*"}, body='{"error":{"message":"tool_choice not supported"}}')
    if body.get("max_tokens") == 1:
        return route.fulfill(status=200, headers={"access-control-allow-origin": "*", "content-type": "application/json"}, body='{"content":[]}')
    sug = INVOICE if USE_INVOICE[0] else SUGGESTIONS[min(len([c for c in ai_calls if c.get("max_tokens") != 1]) - 1, len(SUGGESTIONS) - 1)]
    route.fulfill(status=200, headers={"access-control-allow-origin": "*", "content-type": "application/json"},
                  body=json.dumps({"content": [{"type": "tool_use", "name": "ablage_vorschlag", "input": sug}]}))

errors, checks = [], []
USE_INVOICE = [False]

def check(name, cond, info=""):
    checks.append((name, bool(cond)))
    print(("  ok   " if cond else "  FEHL ") + name + (f"  [{info}]" if info and not cond else ""))

def uploads(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('__od')||'{}').uploads||[]")

def pdf_pages(b64):
    data = base64.b64decode(b64)
    try:
        import pypdf
        return len(pypdf.PdfReader(io.BytesIO(data)).pages)
    except ImportError:
        return data.count(b"/Type /Page") - data.count(b"/Type /Pages")

def drop_files(pg, paths):
    """Simuliert Hineinziehen von Dateien aufs Fenster."""
    payload = []
    for p in paths:
        payload.append({"name": os.path.basename(p), "b64": base64.b64encode(open(p, "rb").read()).decode()})
    pg.evaluate("""(files) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bin = atob(f.b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        dt.items.add(new File([u], f.name));
      }
      for (const t of ["dragenter", "dragover", "drop"]) document.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }""", payload)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers="block")
    ctx.add_init_script("if(!localStorage.getItem('dm.apiKey')) localStorage.setItem('dm.apiKey', JSON.stringify('sk-ant-api03-test'));")
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.route("**/js/services/onedrive.js", lambda r: r.fulfill(path=os.path.join(HERE, "mock-onedrive.js"), headers={"content-type": "text/javascript"}))
    pg.route("https://api.anthropic.com/**", anthropic)

    print("1) Start und Struktur")
    pg.goto(BASE); pg.wait_for_selector("#scan", timeout=15000); pg.wait_for_timeout(400)
    check("Struktur beim ersten Start angelegt", pg.evaluate("JSON.parse(localStorage.getItem('__od')).structureCreated") == 1)
    pg.screenshot(path=f"{SHOTS}/01_home.png")

    print("2) Scan mit KI")
    pg.set_input_files("#camInput", os.path.join(FX, "brief.jpg"))
    pg.wait_for_selector(".thumb[data-i]", timeout=20000)
    pg.click("#next"); pg.wait_for_selector("#ai"); pg.click("#ai"); pg.wait_for_selector("#save", timeout=20000)
    check("Dateiname aus KI-Vorschlag", "2026-10-14_Finanzamt_Bescheid_Einkommensteuer-2025.pdf" in pg.inner_text("#pv"))
    check("KI-Anfrage ohne erzwungenes Werkzeug", ai_calls[-1]["tool_choice"]["type"] == "auto")
    pg.click("#save"); pg.wait_for_selector("#again")
    u = uploads(pg)[-1]
    check("Scan hochgeladen nach 06_Steuern/Gemeinsam", u["rel"] == "06_Steuern/Gemeinsam" and u["mime"] == "application/pdf", u)
    check("Vermerk 'Abgelegt von'", u["description"].startswith("Abgelegt von: Testi"))

    print("3) Scan direkt")
    pg.click("[data-act=home]"); pg.wait_for_selector("#scan")
    pg.set_input_files("#camInput", os.path.join(FX, "brief.jpg")); pg.wait_for_selector("#next", timeout=20000); pg.click("#next")
    pg.click("#direct"); pg.wait_for_selector("#save")
    pg.click("#dt [data-v='Rechnung']"); pg.click("#fo [data-v='05_Gesundheit']"); pg.click("#sf [data-v='Person 2']")
    pg.fill("#sender", "Dr. Huber"); pg.fill("#title", "Vorsorge")
    pg.click("#payStatus [data-s=paid]")
    pg.click("#save"); pg.wait_for_selector("#again")
    check("Direkt abgelegt", uploads(pg)[-1]["rel"] == "05_Gesundheit/Person 2")

    print("4) E-Mail mit einem PDF-Anhang (Dateiauswahl)")
    pg.click("[data-act=home]"); pg.wait_for_selector("#scan")
    n_ai = len(ai_calls)
    pg.set_input_files("#fileInput", os.path.join(FX, "rechnung-mit-anhang.eml"))
    pg.wait_for_selector("#ai", timeout=15000)
    check("Ein Anhang: direkt zum Weg-Bildschirm (ohne Auswahl)", pg.is_visible("#direct"))
    pg.screenshot(path=f"{SHOTS}/04_route_mail.png")
    pg.click("#ai"); pg.wait_for_selector("#save", timeout=20000)
    req = ai_calls[n_ai]
    texts = [c["text"] for c in req["messages"][0]["content"] if c["type"] == "text"]
    check("KI bekommt PDF und Mailtext", any(c["type"] == "document" for c in req["messages"][0]["content"]) and "Jahresabrechnung für 2025" in texts[-1])
    check("Systemanweisung schützt vor Anweisungen in Dokumenten", "befolgst du nicht" in req["system"])
    check("Schalter 'Mailtext anhängen' ist an", pg.is_checked("#appendMail"))
    check("Ohne Datum im Dokument: Datum der Mail", "2026-10-14_Stadtwerke" in pg.inner_text("#pv"), pg.inner_text("#pv"))
    pg.screenshot(path=f"{SHOTS}/05_review_mail.png", full_page=True)
    pg.click("#save"); pg.wait_for_selector("#again")
    u = uploads(pg)[-1]
    check("PDF mit angehängter Mailseite (2 Seiten)", pdf_pages(u["b64"]) == 2, pdf_pages(u["b64"]))

    print("5) E-Mail mit zwei Anhängen (Hineinziehen) → Auswahl, Stapel, Überspringen")
    pg.click("[data-act=home]"); pg.wait_for_selector("#scan")
    drop_files(pg, [os.path.join(FX, "zwei-anhaenge.eml")])
    pg.wait_for_selector("#go", timeout=15000)
    pg.screenshot(path=f"{SHOTS}/06_mail_select.png", full_page=True)
    check("Auswahl zeigt 2 Anhänge vorausgewählt", "2 Dokumente" in pg.inner_text("#go"))
    pg.check("#textDoc"); pg.wait_for_timeout(100)
    check("Mailtext als eigenes Dokument zählt mit", "3 Dokumente" in pg.inner_text("#go"))
    pg.click("#go"); pg.wait_for_selector("#direct", timeout=15000)
    check("Stapelanzeige 'Dokument 1 von 3'", "Dokument 1 von 3" in pg.inner_text(".topbar"))
    pg.click("#direct"); pg.wait_for_selector("#save")
    pg.click("#dt [data-v='Vertrag']"); pg.click("#fo [data-v='11_Verträge & Abos']"); pg.click("#sf [data-v='Sonstige']")
    pg.fill("#sender", "Stadtwerke"); pg.fill("#title", "Vertrag Strom")
    pg.uncheck("#appendMail")
    pg.click("#save"); pg.wait_for_selector("#direct", timeout=15000)
    u = uploads(pg)[-1]
    check("Dok. 1 ohne Mailseite (abgeschaltet)", pdf_pages(u["b64"]) == 1)
    check("Weiter zu 'Dokument 2 von 3'", "Dokument 2 von 3" in pg.inner_text(".topbar"))
    pg.click("#direct"); pg.wait_for_selector("#save")
    check("Word-Datei: Hinweis 'im Original'", "im Original (DOCX)" in pg.inner_text("#app"))
    pg.click("#skip"); pg.wait_for_selector("#direct", timeout=15000)
    pg.click("#direct"); pg.wait_for_selector("#save")
    check("Mailtext-Dokument: Titel aus Betreff vorbelegt", pg.input_value("#title").startswith("Unterlagen zu Ihrem Vertrag"))
    pg.click("#dt [data-v='Information/Sonstiges']"); pg.click("#fo [data-v='00_Eingang']"); pg.fill("#sender", "Stadtwerke")
    pg.click("#save"); pg.wait_for_selector("#again", timeout=15000)
    pg.screenshot(path=f"{SHOTS}/07_done_batch.png", full_page=True)
    done = pg.inner_text("#app")
    check("Ergebnis zeigt 2 abgelegt + 1 übersprungen", "2 Dokumente abgelegt" in done and "übersprungen" in done)

    print("6) E-Mail ohne Anhang")
    pg.click("[data-act=home]"); pg.wait_for_selector("#scan")
    pg.set_input_files("#fileInput", os.path.join(FX, "ohne-anhang.eml")); pg.wait_for_selector("#direct", timeout=15000)
    pg.click("#direct"); pg.wait_for_selector("#save")
    check("Kein Mailtext-Schalter beim Mailtext-Dokument", not pg.query_selector("#appendMail"))
    pg.click("[data-act=back]"); pg.click("[data-act=back]"); pg.wait_for_selector("#scan")
    check("Startseite zeigt angefangene Bearbeitung", "Noch in Bearbeitung" in pg.inner_text("#app"))
    pg.click("#discard"); pg.wait_for_timeout(200)
    check("Verwerfen funktioniert", "Noch in Bearbeitung" not in pg.inner_text("#app"))

    print("7) Teilen (Android): Dateien aus dem Teilen-Zwischenspeicher")
    pdf = base64.b64encode(open(os.path.join(FX, "rechnung-mit-anhang.eml"), "rb").read()).decode()
    pg.evaluate("""async (b64) => {
      const c = await caches.open('dm-share'); const base = new URL('./', location.href);
      const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      await c.put(new URL('__share/0', base).href, new Response(u, {headers: {'content-type':'message/rfc822','x-name': encodeURIComponent('Weitergeleitet.eml')}}));
      await c.put(new URL('__share/meta', base).href, new Response(JSON.stringify({count:1})));
    }""", pdf)
    pg.goto(BASE + "?share=1"); pg.wait_for_selector("#direct", timeout=15000)
    check("Geteilte Datei wird übernommen", "Wie ablegen" in pg.inner_text(".topbar"))
    check("Adresszeile bereinigt", "share=" not in pg.url)
    check("Teilen-Zwischenspeicher geleert", not pg.evaluate("caches.has('dm-share')"))
    pg.click("[data-act=back]"); pg.wait_for_selector("#discard"); pg.click("#discard")

    print("8) Einstellungen: Struktur bearbeiten")
    pg.click("[data-act=settings]"); pg.wait_for_selector("#saveStruct")
    pg.click("details.fold[data-i='10'] summary"); pg.click("details.fold[data-i='10'] [data-add-sub]")
    pg.fill("details.fold[data-i='10'] .subrow[data-j='0'] [data-c='name']", "Auto")
    pg.click("#saveStruct"); pg.wait_for_timeout(500)
    cfg = pg.evaluate("JSON.parse(localStorage.getItem('__od')).config")
    check("Neuer Unterordner gespeichert", cfg["folders"][10]["children"][0]["name"] == "Auto")
    pg.screenshot(path=f"{SHOTS}/08_settings.png", full_page=True)

    print("9) Geteilter Ordner")
    pg.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('__od')); s.sharedOk=true; s.sharedConfig=s.config; localStorage.setItem('__od',JSON.stringify(s));}""")
    pg.reload(); pg.wait_for_selector("#scan"); pg.click("[data-act=settings]"); pg.wait_for_selector("#amode")
    pg.click("#amode [data-m=shared]"); pg.wait_for_selector("#list [data-i]", timeout=10000); pg.click("#list [data-i='0']")
    pg.wait_for_selector("#pickShared", timeout=10000)
    pg.click("[data-act=back]"); pg.wait_for_selector("#scan")
    pg.set_input_files("#fileInput", os.path.join(FX, "rechnung-mit-anhang.eml")); pg.wait_for_selector("#direct", timeout=15000)
    pg.click("#direct"); pg.wait_for_selector("#save")
    pg.click("#dt [data-v='Rechnung']"); pg.click("#fo [data-v='00_Eingang']"); pg.fill("#sender", "X"); pg.fill("#title", "Y")
    pg.click("#payStatus [data-s=debit]")
    pg.click("#save"); pg.wait_for_selector("#again")
    check("Ablage im geteilten Ordner", uploads(pg)[-1]["archive"] == "11_Dokumentenarchiv@shared")

    print("11) Rechnungen: offen ablegen, Liste, IBAN-Warnung, Überwiesen")
    # zurück ins eigene OneDrive
    pg.click("[data-act=home]"); pg.click("[data-act=settings]"); pg.wait_for_selector("#amode")
    pg.click("#amode [data-m=own]"); pg.wait_for_selector("#saveRoot", timeout=10000)
    pg.click("[data-act=back]"); pg.wait_for_selector("#scan")
    USE_INVOICE[0] = True
    n_ai = len(ai_calls)
    pg.set_input_files("#camInput", os.path.join(FX, "brief.jpg")); pg.wait_for_selector("#next", timeout=20000); pg.click("#next")
    pg.click("#ai"); pg.wait_for_selector("#save", timeout=20000)
    req = ai_calls[n_ai]
    check("KI-Schema enthält Zahlungsfelder", "zahlung" in req["tools"][0]["input_schema"]["properties"])
    check("Frage 'Bezahlt?' erscheint bei Rechnung", pg.is_visible("#payStatus"))
    check("Ohne Antwort kein Ablegen", pg.is_disabled("#save"))
    pg.click("#payStatus [data-s=paid]"); pg.wait_for_timeout(100)
    check("Bezahlt: Dateiname mit _bezahlt im Zielordner", "_Waschmaschine_bezahlt.pdf" in pg.inner_text("#pv") and "13_Anschaffungen" in pg.inner_text("#pv"), pg.inner_text("#pv"))
    pg.click("#payStatus [data-s=debit]"); pg.wait_for_timeout(100)
    check("Lastschrift: Dateiname mit _Lastschrift", "_Lastschrift.pdf" in pg.inner_text("#pv"))
    pg.click("#payStatus [data-s=open]"); pg.wait_for_selector("[data-p=iban]")
    check("Offen: Ziel ist Eingang/Unbezahlte Rechnungen", "00_Eingang / Unbezahlte Rechnungen" in pg.inner_text("#pv"), pg.inner_text("#pv"))
    check("KI-Werte vorbelegt (IBAN gültig, Betrag)", "✓ gültig" in pg.inner_text("#pay") and pg.input_value("[data-p=amount]") == "649,90")
    pg.fill("[data-p=iban]", "DE89370400440532013001"); pg.dispatch_event("[data-p=iban]", "change"); pg.wait_for_timeout(100)
    check("Falsche IBAN wird erkannt und blockiert", "Prüfziffer falsch" in pg.inner_text("#pay") and pg.is_disabled("#save"))
    pg.fill("[data-p=iban]", "DE89 3704 0044 0532 0130 00"); pg.dispatch_event("[data-p=iban]", "change"); pg.wait_for_timeout(100)
    pg.screenshot(path=f"{SHOTS}/10_review_invoice.png", full_page=True)
    pg.click("#save"); pg.wait_for_selector("#again", timeout=15000)
    u = uploads(pg)[-1]
    check("Upload nach 00_Eingang/Unbezahlte Rechnungen", u["rel"] == "00_Eingang/Unbezahlte Rechnungen", u["rel"])
    check("Vermerk 'Offen, fällig am'", "Offen, fällig am 03.11.2026" in u["description"])
    reg = pg.evaluate("JSON.parse(localStorage.getItem('__od')).files['own:_Offene-Rechnungen.json'].data")
    e = reg["open"][0] if reg["open"] else {}
    check("Register-Eintrag mit allen Zahlungsdaten", e.get("amount") == 649.9 and e.get("iban") == "DE89370400440532013000" and e.get("purpose") == "RE-2026-4711" and e.get("targetRel") == ["13_Anschaffungen & Garantien"], e)
    check("IBAN für Empfänger gemerkt", reg["knownIbans"].get("elektro muster") == ["DE89370400440532013000"], reg["knownIbans"])
    pg.click("[data-act=home]"); pg.wait_for_selector("#tileInvoices"); pg.wait_for_timeout(200)
    check("Startseite: Kachel mit Summe", "649,90" in pg.inner_text("#tileInvoices") and "1 offen" in pg.inner_text("#tileInvoices"))
    pg.screenshot(path=f"{SHOTS}/11_home_invoice.png")

    # Zweite Rechnung desselben Empfängers mit anderer IBAN → Warnung
    INVOICE["zahlung"]["iban"] = "GB82WEST12345698765432"; INVOICE["doctype"] = "Mahnung"; INVOICE["title"] = "Mahnung Waschmaschine"
    pg.set_input_files("#camInput", os.path.join(FX, "brief.jpg")); pg.wait_for_selector("#next", timeout=20000); pg.click("#next")
    pg.click("#ai"); pg.wait_for_selector("#save", timeout=20000)
    pg.click("#payStatus [data-s=open]"); pg.wait_for_selector("[data-p=iban]")
    txt = pg.inner_text("#pay")
    check("Warnung bei neuer IBAN", "neue IBAN für diesen Empfänger" in txt)
    check("Mahnung: Hinweis auf offene Rechnung", "bereits eine Rechnung" in txt)
    pg.click("#save"); pg.wait_for_selector("#again", timeout=15000)

    pg.click("[data-act=home]"); pg.wait_for_selector("#tileInvoices"); pg.click("#tileInvoices")
    pg.wait_for_selector(".inv", timeout=10000); pg.wait_for_timeout(300)
    check("Liste zeigt 2 offene, Summe", pg.locator(".inv").count() == 2 and "2 offen" in pg.inner_text(".topbar"))
    check("Warnhinweis in der Liste", "Neue IBAN für diesen Empfänger" in pg.inner_text("#app"))
    pg.screenshot(path=f"{SHOTS}/12_invoices.png", full_page=True)
    first = pg.locator("[data-paid]").first
    first.click(); pg.wait_for_timeout(600)
    mv = pg.evaluate("JSON.parse(localStorage.getItem('__od')).moves")
    check("Überwiesen: verschoben in Zielordner mit _bezahlt", mv and mv[-1]["targetRel"] == "13_Anschaffungen & Garantien" and mv[-1]["newName"].endswith("_bezahlt.pdf") and "Bezahlt am" in mv[-1]["description"], mv)
    reg = pg.evaluate("JSON.parse(localStorage.getItem('__od')).files['own:_Offene-Rechnungen.json'].data")
    check("Register danach mit 1 Eintrag", len(reg["open"]) == 1)
    check("Liste aktualisiert", pg.locator(".inv").count() == 1)
    USE_INVOICE[0] = False

    # Desktop-Ansicht der Startseite
    pg.set_viewport_size({"width": 1280, "height": 800}); pg.click("[data-act=back]"); pg.wait_for_selector("#scan"); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{SHOTS}/09_home_desktop.png")
    ctx.close()

    print("10) Service Worker: Teilen-Ziel nimmt Dateien an")
    ctx2 = b.new_context()
    pg2 = ctx2.new_page()
    pg2.goto(BASE + "redirect.html")
    pg2.evaluate("navigator.serviceWorker.register('sw.js')")
    pg2.wait_for_function("navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
    pg2.reload(); pg2.wait_for_function("!!navigator.serviceWorker.controller", timeout=20000)
    res = pg2.evaluate("""async () => {
      const fd = new FormData(); fd.append('title','Test'); fd.append('files', new File([new Uint8Array([37,80,68,70])], 'a.pdf', {type:'application/pdf'}));
      const r = await fetch('share-target', {method:'POST', body: fd, redirect: 'manual'});
      const c = await caches.open('dm-share'); const meta = await (await c.match(new URL('__share/meta', location.href).href)).json();
      return { type: r.type, status: r.status, meta };
    }""")
    check("Teilen-Ziel speichert Datei und leitet weiter", res["meta"]["count"] == 1 and res["meta"]["title"] == "Test" and res["type"] in ("opaqueredirect",) , res)
    ctx2.close()
    b.close()

srv.shutdown()
bad = [c for c in checks if not c[1]]
relevant_errors = [e for e in errors if "favicon" not in e]
print(f"\n{len(checks) - len(bad)}/{len(checks)} Prüfungen bestanden; Konsolenfehler: {len(relevant_errors)}")
for e in relevant_errors[:10]:
    print("  ", e[:200])
sys.exit(1 if bad or relevant_errors else 0)
