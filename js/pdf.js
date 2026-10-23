// Minimaler PDF-Erzeuger: legt JPEG-Seiten ohne Fremdbibliothek in ein PDF.
// pages: [{ jpeg: Uint8Array, width: px, height: px }]
// meta: { title, author, subject, keywords }

const enc = new TextEncoder();

function pdfText(s) {
  // UTF-16BE mit BOM als Hex-String, damit Umlaute korrekt angezeigt werden.
  let hex = "FEFF";
  for (const ch of String(s || "")) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0");
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    } else {
      hex += cp.toString(16).padStart(4, "0");
    }
  }
  return `<${hex.toUpperCase()}>`;
}

function pdfDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const oh = p(Math.floor(Math.abs(off) / 60));
  const om = p(Math.abs(off) % 60);
  return `(D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${oh}'${om}')`;
}

export function buildPdf(pages, meta = {}) {
  if (!pages.length) throw new Error("Keine Seiten");
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObj = (n) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  // Objekt-Nummern: 1 Catalog, 2 Pages, 3 Info, danach je Seite: Page, Contents, Image
  const pageObjNums = pages.map((_, i) => 4 + i * 3);
  const totalObjs = 3 + pages.length * 3;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  startObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  startObj(2);
  push(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);

  startObj(3);
  const info = [
    meta.title ? `/Title ${pdfText(meta.title)}` : "",
    meta.author ? `/Author ${pdfText(meta.author)}` : "",
    meta.subject ? `/Subject ${pdfText(meta.subject)}` : "",
    meta.keywords ? `/Keywords ${pdfText(meta.keywords)}` : "",
    `/Creator ${pdfText("Dokumentenmanager")}`,
    `/Producer ${pdfText("Dokumentenmanager")}`,
    `/CreationDate ${pdfDate()}`,
  ].filter(Boolean).join(" ");
  push(`<< ${info} >>\nendobj\n`);

  const A4W = 595.28;
  const A4H = 841.89;
  pages.forEach((pg, i) => {
    const pageN = 4 + i * 3;
    const contN = pageN + 1;
    const imgN = pageN + 2;
    // Seite in A4 (hoch oder quer), Bild zentriert und eingepasst.
    const landscape = pg.width > pg.height;
    const pw = landscape ? A4H : A4W;
    const ph = landscape ? A4W : A4H;
    const scale = Math.min(pw / pg.width, ph / pg.height);
    const w = +(pg.width * scale).toFixed(2);
    const h = +(pg.height * scale).toFixed(2);
    const x = +((pw - w) / 2).toFixed(2);
    const y = +((ph - h) / 2).toFixed(2);

    startObj(pageN);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${imgN} 0 R >> >> /Contents ${contN} 0 R >>\nendobj\n`);

    const content = `q ${w} 0 0 ${h} ${x} ${y} cm /Im${i} Do Q\n`;
    startObj(contN);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    startObj(imgN);
    const cs = pg.gray ? "/DeviceGray" : "/DeviceRGB";
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg);
    push("\nendstream\nendobj\n");
  });

  const xrefStart = length;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= totalObjs; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
