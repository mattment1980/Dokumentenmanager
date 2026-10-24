"""
Erzeugt die Testdateien in tests/fixtures/ (nur ausgedachte Daten).
Aufruf: python3 tests/fixtures/make_fixtures.py   (braucht Pillow)
"""
import os, io
from email.message import EmailMessage
from email.utils import format_datetime
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
TZ = timezone(timedelta(hours=2))

def font(size, bold=False):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else "")]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def tiny_pdf(text):
    """Minimales einseitiges PDF mit Text (ohne Fremdbibliothek)."""
    content = f"BT /F1 18 Tf 72 760 Td ({text}) Tj ET".encode("latin-1")
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO(); out.write(b"%PDF-1.4\n"); offs = []
    for i, o in enumerate(objs, 1):
        offs.append(out.tell()); out.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    x = out.tell(); out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for o in offs: out.write(b"%010d 00000 n \n" % o)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x))
    return out.getvalue()

def letter_photo(path):
    W, H = 1500, 2000
    bg = Image.new("RGB", (W, H), (74, 58, 44)); d = ImageDraw.Draw(bg)
    for i in range(0, H, 9): d.line([(0, i), (W, i + 15)], fill=(66, 51, 39), width=3)
    paper = Image.new("RGB", (1050, 1485), (246, 244, 238)); p = ImageDraw.Draw(paper)
    p.text((80, 90), "Finanzamt Musterstadt", font=font(30, True), fill=(20, 20, 20))
    p.text((80, 150), "Herrn Max Mustermann", font=font(22), fill=(30, 30, 30))
    p.text((700, 260), "14.10.2026", font=font(22), fill=(30, 30, 30))
    p.text((80, 350), "Bescheid für 2025 über Einkommensteuer", font=font(28, True), fill=(20, 20, 20))
    for i in range(22): p.text((80, 430 + i * 42), f"Zeile {i + 1}: Festsetzung, Betrag, Erläuterung …", font=font(20), fill=(40, 40, 40))
    m = Image.new("L", paper.size, 255).rotate(6, expand=True)
    paper = paper.rotate(6, expand=True)
    bg.paste(paper, (180, 200), m)
    bg.filter(ImageFilter.GaussianBlur(0.8)).save(path, quality=85)

def mail(subject, html=None, text=None, atts=(), date=datetime(2026, 10, 14, 9, 12, tzinfo=TZ)):
    m = EmailMessage()
    m["From"] = "Stadtwerke Musterstadt <rechnung@stadtwerke.example>"
    m["To"] = "Max Mustermann <max@example.com>"
    m["Subject"] = subject
    m["Date"] = format_datetime(date)
    if text is None and html:
        m.set_content(html, subtype="html")  # nur HTML, kein Textteil
    else:
        m.set_content(text or "")
        if html: m.add_alternative(html, subtype="html")
    for name, mime, data, inline in atts:
        maintype, subtype = mime.split("/")
        m.add_attachment(data, maintype=maintype, subtype=subtype, filename=name, disposition="inline" if inline else "attachment")
        if inline: m.get_payload()[-1]["Content-ID"] = "<logo1>"
    return bytes(m)

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c63f8cfc0f00f000501020184a98c210000000049454e44ae426082")

if __name__ == "__main__":
    letter_photo(os.path.join(HERE, "brief.jpg"))
    open(os.path.join(HERE, "rechnung-mit-anhang.eml"), "wb").write(mail(
        "Ihre Jahresabrechnung 2025 für Strom",
        html="<p>Sehr geehrter Herr Mustermann,</p><p>anbei Ihre Jahresabrechnung für 2025.<br>Freundliche Grüße</p><img src='cid:logo1'><script>alert(1)</script>",
        text="Sehr geehrter Herr Mustermann,\n\nanbei Ihre Jahresabrechnung für 2025.\n\nFreundliche Grüße",
        atts=[("logo.png", "image/png", PNG, True), ("Jahresabrechnung_2025.pdf", "application/pdf", tiny_pdf("Jahresabrechnung 2025"), False)]))
    open(os.path.join(HERE, "zwei-anhaenge.eml"), "wb").write(mail(
        "Unterlagen zu Ihrem Vertrag",
        text="Hallo,\n\nanbei der Vertrag und die Preisliste.\n\nViele Grüße 😀",
        atts=[("Vertrag.pdf", "application/pdf", tiny_pdf("Vertrag"), False),
              ("Preisliste.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"PK\x03\x04 Testinhalt", False)]))
    open(os.path.join(HERE, "ohne-anhang.eml"), "wb").write(mail(
        "Bestätigung Ihrer Kündigung",
        html="<h1>Kündigungsbestätigung</h1><p>Ihr Vertrag endet zum 31.12.2026.</p>",
        text=None))
    print("Fixtures erzeugt in", HERE)
