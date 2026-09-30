/**
 * L'UDID di un iPhone lontano, senza cavo.
 *
 * Per installare un'app ad hoc il telefono va registrato col suo UDID, che
 * iOS non mostra da nessuna parte. Qui si usa il meccanismo di Apple fatto
 * apposta, il "Profile Service": /udid scarica un profilo che non installa
 * niente, e quando lo si accetta in Impostazioni l'iPhone manda a
 * /udid/risposta i suoi dati (UDID, modello, versione) firmati. Si risponde
 * con un reindirizzamento a una pagina che mostra l'UDID, da mandare a Marco;
 * intanto resta anche su R2 (udid/), da dove si registra con
 * `node strumenti/apple.mjs dispositivo <UDID> "<nome>"`.
 */
import { ErroreHttp } from './http';
import type { Env } from './tipi';

const PROFILO = (origine: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key>
    <string>${origine}/udid/risposta</string>
    <key>DeviceAttributes</key>
    <array>
      <string>UDID</string>
      <string>PRODUCT</string>
      <string>VERSION</string>
    </array>
  </dict>
  <key>PayloadOrganization</key>
  <string>BRU✈️FCO</string>
  <key>PayloadDisplayName</key>
  <string>BRU✈️FCO: il codice di questo iPhone</string>
  <key>PayloadDescription</key>
  <string>Manda a BRU✈️FCO il codice (UDID) di questo iPhone, che serve per installare l'app. Non installa niente e non resta sul telefono.</string>
  <key>PayloadIdentifier</key>
  <string>com.marcorisa.brufco.udid</string>
  <key>PayloadUUID</key>
  <string>6F1C2A9E-3B7D-4E5F-9A1B-2C3D4E5F6A7B</string>
  <key>PayloadType</key>
  <string>Profile Service</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;

export function profiloUdid(origine: string): Response {
  return new Response(PROFILO(origine), {
    headers: {
      'content-type': 'application/x-apple-aspen-config',
      'content-disposition': 'attachment; filename="brufco-udid.mobileconfig"',
    },
  });
}

/** Il valore di `chiave` nel plist che l'iPhone manda (dentro la firma, in chiaro). */
function valore(plist: string, chiave: string): string | null {
  const m = new RegExp(`<key>${chiave}</key>\\s*<string>([^<]*)</string>`).exec(plist);
  return m ? m[1].trim() : null;
}

export async function rispostaUdid(env: Env, req: Request, origine: string): Promise<Response> {
  const dati = new Uint8Array(await req.arrayBuffer());
  if (dati.byteLength > 64 * 1024) throw new ErroreHttp(413, 'Troppo grande.');
  // La risposta e' un plist firmato (PKCS#7): la firma si ignora, il plist e' leggibile.
  const testo = new TextDecoder('latin1').decode(dati);
  const plist = testo.slice(testo.indexOf('<?xml'), testo.indexOf('</plist>') + 8);
  const udid = valore(plist, 'UDID');
  if (!udid || !/^[0-9A-Fa-f-]{24,40}$/.test(udid)) throw new ErroreHttp(400, 'Nessun UDID.');
  const modello = valore(plist, 'PRODUCT') ?? '';
  const versione = valore(plist, 'VERSION') ?? '';
  await env.FILE.put(`udid/${Date.now()}.json`, JSON.stringify({ udid, modello, versione, arrivato: new Date().toISOString() }), {
    httpMetadata: { contentType: 'application/json' },
  });
  // iOS vuole un reindirizzamento: apre Safari su quella pagina.
  const pagina = new URL('/udid/fatto', origine);
  pagina.searchParams.set('udid', udid);
  pagina.searchParams.set('modello', modello);
  return Response.redirect(pagina.toString(), 301);
}

function html(testo: string): string {
  return testo.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function pagina(corpo: string): Response {
  return new Response(
    `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRU✈️FCO</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 17px/1.45 -apple-system, system-ui, sans-serif; background: Canvas; color: CanvasText;
         display: grid; place-items: center; min-height: 100vh; }
  main { padding: 24px; max-width: 380px; }
  h1 { font-size: 30px; margin: 0 0 12px; letter-spacing: -0.02em; }
  ol { padding-left: 20px; }
  li { margin: 6px 0; }
  .tasto { display: block; margin: 20px 0; padding: 14px; border-radius: 14px; background: #0a84ff; color: #fff;
           text-align: center; text-decoration: none; font-weight: 600; border: 0; font-size: 17px; width: 100%; }
  code { display: block; padding: 12px; border-radius: 10px; background: color-mix(in srgb, CanvasText 8%, Canvas);
         font: 15px ui-monospace, monospace; word-break: break-all; }
  .nota { color: GrayText; font-size: 15px; }
</style>
</head>
<body><main>${corpo}</main></body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}

export function paginaUdid(): Response {
  return pagina(`<h1>BRU✈️FCO</h1>
<p>Per installare l'app serve il codice di questo iPhone. Da Safari:</p>
<ol>
  <li>tocca il tasto qui sotto, poi <b>Consenti</b>;</li>
  <li>apri <b>Impostazioni</b>: in alto c'è <b>Profilo scaricato</b>;</li>
  <li>tocca <b>Installa</b> e metti il codice del telefono.</li>
</ol>
<a class="tasto" href="/udid/profilo">Manda il codice</a>
<p class="nota">Il profilo non installa niente e non resta sul telefono: serve solo a leggere il codice.</p>`);
}

export function paginaFatto(url: URL): Response {
  const udid = html(url.searchParams.get('udid') ?? '');
  return pagina(`<h1>Fatto ✈️</h1>
<p>Il codice di questo iPhone è arrivato. Eccolo, se Marco te lo chiede:</p>
<code id="udid">${udid}</code>
<button class="tasto" onclick="navigator.clipboard.writeText(document.getElementById('udid').textContent).then(() => this.textContent = 'Copiato')">Copia</button>
<p class="nota">Adesso Marco lo aggiunge all'app: quando è pronta, ti manda il link per installarla.</p>`);
}
