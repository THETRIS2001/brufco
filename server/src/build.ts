/**
 * La pagina da cui i due iPhone installano l'app (distribuzione ad hoc).
 *
 * La build (GitHub Actions) carica qui il pacchetto firmato e il manifesto che
 * iOS legge per installare da un link (`PUT /build/<file>`, col segreto
 * CARICA_BUILD); dal telefono si apre /installa in Safari e si tocca il tasto.
 * Il pacchetto e' pubblico, ed e' giusto cosi': si installa solo sui telefoni
 * registrati nel profilo, gli altri non lo aprono.
 */
import { ErroreHttp, ugualiTempoCostante } from './http';
import type { Env } from './tipi';

const FILE_BUILD: Record<string, string> = {
  'app.ipa': 'application/octet-stream',
  'manifest.plist': 'text/xml; charset=utf-8',
  'info.json': 'application/json; charset=utf-8',
  // Le due icone che il manifesto chiede a iOS di mostrare mentre installa.
  'icona-57.png': 'image/png',
  'icona-512.png': 'image/png',
  // Com'e' andata l'ultima build: "ok" col numero, o gli errori di
  // compilazione. Senza un Mac e' l'unico modo di leggerli da qui.
  'esito.txt': 'text/plain; charset=utf-8',
};

export async function caricaBuild(env: Env, nome: string, req: Request): Promise<Response> {
  const m = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '');
  if (!env.CARICA_BUILD || !m || !ugualiTempoCostante(m[1], env.CARICA_BUILD)) throw new ErroreHttp(401, 'Non autorizzato.');
  if (!(nome in FILE_BUILD)) throw new ErroreHttp(404, 'File sconosciuto.');
  await env.FILE.put(`build/${nome}`, await req.arrayBuffer(), { httpMetadata: { contentType: FILE_BUILD[nome] } });
  return new Response(null, { status: 204 });
}

export async function scaricaBuild(env: Env, nome: string): Promise<Response> {
  if (!(nome in FILE_BUILD)) throw new ErroreHttp(404, 'File sconosciuto.');
  const oggetto = await env.FILE.get(`build/${nome}`);
  if (!oggetto) throw new ErroreHttp(404, 'Nessuna build ancora.');
  return new Response(oggetto.body, { headers: { 'content-type': FILE_BUILD[nome], 'cache-control': 'no-store' } });
}

function html(testo: string): string {
  return testo.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export async function paginaInstalla(env: Env, origine: string): Promise<Response> {
  const info = (await (await env.FILE.get('build/info.json'))?.json<{ numero?: string; data?: string }>().catch(() => null)) ?? null;
  const manifesto = encodeURIComponent(`${origine}/build/manifest.plist`);
  const corpo = info
    ? `<p class="nota">Build ${html(info.numero ?? '')}${info.data ? ` · ${html(info.data)}` : ''}</p>
       <a class="tasto" href="itms-services://?action=download-manifest&amp;url=${manifesto}">Installa</a>
       <p class="nota">Aprila da Safari sull'iPhone. L'installazione sostituisce quella di prima e i disegni restano.</p>`
    : '<p class="nota">Nessuna build ancora.</p>';
  return new Response(
    `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BRU✈️FCO</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 17px/1.4 -apple-system, system-ui, sans-serif; background: Canvas; color: CanvasText;
         display: grid; place-items: center; min-height: 100vh; text-align: center; }
  main { padding: 24px; max-width: 360px; }
  h1 { font-size: 34px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .tasto { display: block; margin: 24px 0 16px; padding: 14px; border-radius: 14px; background: #0a84ff;
           color: #fff; text-decoration: none; font-weight: 600; }
  .nota { color: GrayText; font-size: 15px; margin: 0; }
</style>
</head>
<body><main><h1>BRU✈️FCO</h1>${corpo}</main></body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
