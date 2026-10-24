# Fremdbibliotheken (`vendor/`)

Alle Bibliotheken liegen fest im Repository, damit die App keinen Code von fremden Servern lädt
(siehe `docs/SICHERHEIT.md`). Keine davon verwendet `eval` oder `new Function`.

| Datei | Bibliothek | Version | Lizenz | Herkunft |
|-------|-----------|---------|--------|----------|
| `msal-browser.min.js`, `msal-redirect-bridge.min.js` | @azure/msal-browser | 5.26.0 | MIT | npm, Ordner `lib/` unverändert |
| `pdf-lib.esm.min.js` | pdf-lib | 1.17.1 | MIT | npm, `dist/pdf-lib.esm.min.js` unverändert |
| `postal-mime.esm.js` | postal-mime | 4.0.2 | MIT-0 | mit esbuild zu einer Datei gebündelt |
| `msgreader.esm.js` | @kenjiuno/msgreader (+ @kenjiuno/decompressrtf) | 1.28.0 | Apache-2.0 (+ BSD-2) | mit esbuild gebündelt, `iconv-lite` durch `iconv-shim.js` ersetzt |

Lizenztexte liegen jeweils neben den Dateien in `vendor/`.

## Neu bündeln

```bash
mkdir /tmp/vendor-build && cd /tmp/vendor-build && npm init -y
npm i @kenjiuno/msgreader@1.28.0 postal-mime@4.0.2 esbuild
cp <repo>/tools/vendor/*.js .

# .msg (Outlook): iconv-lite wird durch die eingebaute TextDecoder-API ersetzt
npx esbuild msgreader-entry.js --bundle --format=esm --platform=browser --minify \
  --alias:iconv-lite=./iconv-shim.js --legal-comments=eof --outfile=msgreader.esm.js

# .eml
sed -i 's#./postal-mime/dist#postal-mime/dist#' postal-mime-entry.js
npx esbuild postal-mime-entry.js --bundle --format=esm --platform=browser --minify \
  --legal-comments=eof --outfile=postal-mime.esm.js
```

Nach einem Update: Version hier eintragen, `npm test` und den Browsertest laufen lassen.
