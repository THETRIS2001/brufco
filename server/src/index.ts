/**
 * Il server di BRU✈️FCO: un Worker Cloudflare con D1 (persone, disegni,
 * widget) e R2 (i file). Le rotte:
 *
 *   POST   /persone                   iscrizione: nome e codice della coppia
 *   GET    /stato                     io, l'altra persona, cosa c'e' sui due widget
 *   PUT    /dispositivo               i token per le push
 *   GET    /disegni?prima=<ms>        lo storico
 *   POST   /disegni                   un disegno nuovo (multipart), sul widget dell'altro
 *   PUT    /disegni/<id>              lo sostituisce (solo i propri)
 *   DELETE /disegni/<id>              lo elimina (solo i propri)
 *   POST   /disegni/<id>/widget       "rendi attivo": lo rimanda al widget dell'altro
 *   GET    /disegni/<id>/anteprima|documento|sfondo?v=<versione>
 *   GET    /widget                    cosa mostra il mio widget
 *   GET    /installa, /build/<file>   la pagina d'installazione ad hoc
 *   GET    /udid                      leggere l'UDID di un iPhone lontano (udid.ts)
 */
import { caricaBuild, paginaInstalla, scaricaBuild } from './build';
import { crea, elenco, elimina, rimanda, scaricaParte, sostituisci, sulWidgetDi, type Parte } from './disegni';
import { ErroreHttp, corpoJson, json } from './http';
import { aggiornaDispositivo, altra, chiChiama, registra } from './persone';
import { serieDi } from './serie';
import type { Contesto, Env } from './tipi';
import { paginaFatto, paginaUdid, profiloUdid, rispostaUdid } from './udid';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DISEGNO = new RegExp(`^/disegni/(${UUID})(?:/(anteprima|documento|sfondo|widget))?$`);

async function instrada(req: Request, env: Env, ctx: Contesto): Promise<Response> {
  const url = new URL(req.url);
  const percorso = url.pathname.replace(/\/+$/, '') || '/';
  const metodo = req.method;

  // Pubbliche: la pagina d'installazione e i suoi file, e l'iscrizione.
  if (metodo === 'GET' && percorso === '/installa') return paginaInstalla(env, url.origin);
  const build = /^\/build\/([\w.-]+)$/.exec(percorso);
  if (build && metodo === 'GET') return scaricaBuild(env, build[1]);
  if (build && metodo === 'PUT') return caricaBuild(env, build[1], req);
  if (metodo === 'POST' && percorso === '/persone') return registra(env, await corpoJson(req));
  if (metodo === 'GET' && percorso === '/udid') return paginaUdid();
  if (metodo === 'GET' && percorso === '/udid/profilo') return profiloUdid(url.origin);
  if (metodo === 'POST' && percorso === '/udid/risposta') return rispostaUdid(env, req, url.origin);
  if (metodo === 'GET' && percorso === '/udid/fatto') return paginaFatto(url);

  const io = await chiChiama(env, req);

  if (metodo === 'GET' && percorso === '/stato') {
    const lei = await altra(env, io);
    const [mio, suo] = await Promise.all([sulWidgetDi(env, io.id), lei ? sulWidgetDi(env, lei.id) : null]);
    return json({
      io: { id: io.id, nome: io.nome },
      altro: lei ? { id: lei.id, nome: lei.nome } : null,
      mio_widget: mio?.disegno ?? null,
      suo_widget: suo?.disegno ?? null,
      serie: lei ? await serieDi(env, io, lei) : null,
    });
  }
  if (metodo === 'PUT' && percorso === '/dispositivo') return aggiornaDispositivo(env, io, await corpoJson(req));
  if (metodo === 'GET' && percorso === '/widget') {
    const w = await sulWidgetDi(env, io.id);
    return json({ disegno: w?.disegno ?? null, autore: w?.autore ?? null });
  }
  if (percorso === '/disegni') {
    if (metodo === 'GET') {
      const prima = Number(url.searchParams.get('prima'));
      return elenco(env, Number.isFinite(prima) && prima > 0 ? prima : null);
    }
    if (metodo === 'POST') return crea(env, ctx, io, req);
  }

  const d = DISEGNO.exec(percorso);
  if (d) {
    const [, id, parte] = d;
    if (!parte && metodo === 'PUT') return sostituisci(env, ctx, io, id, req);
    if (!parte && metodo === 'DELETE') return elimina(env, ctx, io, id);
    if (parte === 'widget' && metodo === 'POST') {
      const corpo = await corpoJson<{ notifica?: unknown }>(req);
      return rimanda(env, ctx, io, id, corpo?.notifica === true);
    }
    if (parte && parte !== 'widget' && metodo === 'GET') return scaricaParte(env, id, parte as Parte, url.searchParams.get('v'));
  }
  throw new ErroreHttp(404, 'Non trovato.');
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await instrada(req, env, ctx);
    } catch (e) {
      if (e instanceof ErroreHttp) return json({ errore: e.message }, e.status);
      console.error('[errore]', e instanceof Error ? e.stack ?? e.message : e);
      return json({ errore: 'Errore del server.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
