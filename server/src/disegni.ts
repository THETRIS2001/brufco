/**
 * I disegni: crearli, sostituirli, eliminarli, e decidere cosa mostra il
 * widget di ciascuno.
 *
 * LE REGOLE (Marco, 30/09/2026):
 *  - il widget di ognuno mostra l'ultimo disegno che gli ha mandato l'altro;
 *  - salvare dall'editor lo manda: un disegno nuovo, o uno ritoccato, finisce
 *    sul widget dell'altro. Chi manda sceglie se con la notifica o no;
 *  - "rendi attivo" dallo storico rimanda un disegno qualsiasi, suo o tuo, al
 *    widget dell'altro;
 *  - si modificano e si eliminano solo i propri disegni. La modifica
 *    sostituisce l'originale;
 *  - se si elimina un disegno che era su un widget, al suo posto torna il piu'
 *    recente dell'altra persona, o niente.
 *
 * I file stanno su R2 sotto disegni/<id>/. Le chiavi non cambiano con le
 * versioni: le cache del telefono si rinnovano con `?v=<versione>` nell'URL.
 */
import { avvisa, type Motivo } from './push';
import { altra } from './persone';
import { segnaInvio } from './serie';
import { ErroreHttp, json } from './http';
import { daRiga, type Contesto, type Disegno, type Env, type Persona, type RigaDisegno } from './tipi';

const COLONNE = 'id, autore_id, creato_at, modificato_at, versione, con_sfondo';
const MB = 1024 * 1024;

export type Parte = 'anteprima' | 'documento' | 'sfondo';
const FILE: Record<Parte, { nome: string; tipo: string; massimo: number }> = {
  anteprima: { nome: 'anteprima.jpg', tipo: 'image/jpeg', massimo: 5 * MB },
  documento: { nome: 'documento.json', tipo: 'application/json', massimo: 10 * MB },
  sfondo: { nome: 'sfondo.jpg', tipo: 'image/jpeg', massimo: 15 * MB },
};

function chiave(id: string, parte: Parte): string {
  return `disegni/${id}/${FILE[parte].nome}`;
}

async function trova(env: Env, id: string): Promise<Disegno> {
  const r = await env.DB.prepare(`SELECT ${COLONNE} FROM disegni WHERE id = ?`).bind(id).first<RigaDisegno>();
  if (!r) throw new ErroreHttp(404, 'Disegno non trovato.');
  return daRiga(r);
}

function soloMio(io: Persona, d: Disegno): void {
  if (d.autore_id !== io.id) throw new ErroreHttp(403, 'Si modificano e si eliminano solo i propri disegni.');
}

/** Il file `parte` del modulo, se c'e', controllato. */
async function file(modulo: FormData, parte: Parte): Promise<ArrayBuffer | null> {
  const f = modulo.get(parte);
  if (f === null) return null;
  if (typeof f === 'string') throw new ErroreHttp(400, `${parte}: serve un file.`);
  const dati = await f.arrayBuffer();
  if (dati.byteLength === 0 || dati.byteLength > FILE[parte].massimo) throw new ErroreHttp(413, `${parte}: file vuoto o troppo grande.`);
  if (parte === 'documento') controllaDocumento(dati);
  return dati;
}

/** Il documento (tratti e scritte) deve almeno essere quello che l'app sa rileggere. */
function controllaDocumento(dati: ArrayBuffer): void {
  let doc: { formato?: unknown; tratti?: unknown; testi?: unknown };
  try {
    doc = JSON.parse(new TextDecoder().decode(dati));
  } catch {
    throw new ErroreHttp(400, 'documento: non e\' JSON.');
  }
  if (doc.formato !== 1 || typeof doc.tratti !== 'string' || !Array.isArray(doc.testi)) {
    throw new ErroreHttp(400, 'documento: formato sconosciuto.');
  }
}

async function salva(env: Env, id: string, parte: Parte, dati: ArrayBuffer): Promise<void> {
  await env.FILE.put(chiave(id, parte), dati, { httpMetadata: { contentType: FILE[parte].tipo } });
}

/** Mette `disegno` sul widget dell'altro e glielo dice. */
async function mandaAllAltro(
  env: Env,
  ctx: Contesto,
  io: Persona,
  disegno: Disegno,
  notifica: boolean,
  motivo: Motivo,
): Promise<void> {
  const lei = await altra(env, io);
  if (!lei) return;
  await env.DB.prepare(
    `INSERT INTO widget (destinatario_id, disegno_id, impostato_at) VALUES (?, ?, ?)
     ON CONFLICT (destinatario_id) DO UPDATE SET disegno_id = excluded.disegno_id, impostato_at = excluded.impostato_at`,
  )
    .bind(lei.id, disegno.id, Date.now())
    .run();
  ctx.waitUntil(
    avvisa(env, lei, { disegnoId: disegno.id, versione: disegno.versione, autore: io.nome, notifica, motivo }).catch((e) =>
      console.error('[push]', e instanceof Error ? e.message : e),
    ),
  );
}

export async function crea(env: Env, ctx: Contesto, io: Persona, req: Request): Promise<Response> {
  const modulo = await req.formData();
  const [documento, anteprima, sfondo] = await Promise.all([file(modulo, 'documento'), file(modulo, 'anteprima'), file(modulo, 'sfondo')]);
  if (!documento || !anteprima) throw new ErroreHttp(400, 'Servono documento e anteprima.');

  const ora = Date.now();
  const disegno: Disegno = { id: crypto.randomUUID(), autore_id: io.id, creato_at: ora, modificato_at: ora, versione: 1, con_sfondo: !!sfondo };
  // Prima i file, poi la riga: un disegno che si vede c'e' sempre tutto.
  await Promise.all([
    salva(env, disegno.id, 'documento', documento),
    salva(env, disegno.id, 'anteprima', anteprima),
    sfondo ? salva(env, disegno.id, 'sfondo', sfondo) : null,
  ]);
  await env.DB.prepare(`INSERT INTO disegni (${COLONNE}) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(disegno.id, io.id, ora, ora, 1, disegno.con_sfondo ? 1 : 0)
    .run();
  await segnaInvio(env, io.id, ora);
  await mandaAllAltro(env, ctx, io, disegno, modulo.get('notifica') === '1', 'nuovo');
  return json({ disegno }, 201);
}

/**
 * La modifica sostituisce l'originale. La foto: se ne arriva una nuova si
 * sostituisce, con `sfondo_via=1` si toglie, altrimenti resta quella di prima.
 */
export async function sostituisci(env: Env, ctx: Contesto, io: Persona, id: string, req: Request): Promise<Response> {
  const vecchio = await trova(env, id);
  soloMio(io, vecchio);
  const modulo = await req.formData();
  const [documento, anteprima, sfondo] = await Promise.all([file(modulo, 'documento'), file(modulo, 'anteprima'), file(modulo, 'sfondo')]);
  if (!documento || !anteprima) throw new ErroreHttp(400, 'Servono documento e anteprima.');
  const togliSfondo = modulo.get('sfondo_via') === '1';

  await Promise.all([
    salva(env, id, 'documento', documento),
    salva(env, id, 'anteprima', anteprima),
    sfondo ? salva(env, id, 'sfondo', sfondo) : togliSfondo ? env.FILE.delete(chiave(id, 'sfondo')) : null,
  ]);
  const disegno: Disegno = {
    ...vecchio,
    modificato_at: Date.now(),
    versione: vecchio.versione + 1,
    con_sfondo: sfondo ? true : togliSfondo ? false : vecchio.con_sfondo,
  };
  await env.DB.prepare('UPDATE disegni SET modificato_at = ?, versione = ?, con_sfondo = ? WHERE id = ?')
    .bind(disegno.modificato_at, disegno.versione, disegno.con_sfondo ? 1 : 0, id)
    .run();
  await segnaInvio(env, io.id, disegno.modificato_at);
  await mandaAllAltro(env, ctx, io, disegno, modulo.get('notifica') === '1', 'modificato');
  return json({ disegno });
}

/** "Rendi attivo": un disegno qualsiasi, tuo o suo, torna sul widget dell'altro. */
export async function rimanda(env: Env, ctx: Contesto, io: Persona, id: string, notifica: boolean): Promise<Response> {
  const disegno = await trova(env, id);
  await mandaAllAltro(env, ctx, io, disegno, notifica, 'rimandato');
  return json({ disegno });
}

export async function elimina(env: Env, ctx: Contesto, io: Persona, id: string): Promise<Response> {
  const disegno = await trova(env, id);
  soloMio(io, disegno);

  // I widget che lo mostravano: al suo posto il piu' recente dell'altra
  // persona rispetto a chi guarda, o niente.
  const suiWidget = await env.DB.prepare('SELECT destinatario_id FROM widget WHERE disegno_id = ?')
    .bind(id)
    .all<{ destinatario_id: string }>();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM widget WHERE disegno_id = ?').bind(id),
    env.DB.prepare('DELETE FROM disegni WHERE id = ?').bind(id),
  ]);
  await env.FILE.delete((['anteprima', 'documento', 'sfondo'] as const).map((p) => chiave(id, p)));

  for (const { destinatario_id } of suiWidget.results ?? []) {
    const alPosto = await env.DB.prepare(`SELECT ${COLONNE} FROM disegni WHERE autore_id != ? ORDER BY creato_at DESC LIMIT 1`)
      .bind(destinatario_id)
      .first<RigaDisegno>();
    if (alPosto) {
      await env.DB.prepare('INSERT INTO widget (destinatario_id, disegno_id, impostato_at) VALUES (?, ?, ?)')
        .bind(destinatario_id, alPosto.id, Date.now())
        .run();
    }
    const chi = await env.DB.prepare('SELECT id, nome, apns_token, widget_token FROM persone WHERE id = ?')
      .bind(destinatario_id)
      .first<Persona>();
    if (chi) {
      ctx.waitUntil(
        avvisa(env, chi, { disegnoId: alPosto?.id ?? '', versione: alPosto?.versione ?? 0, autore: io.nome, notifica: false, motivo: 'aggiornamento' }).catch(
          (e) => console.error('[push]', e instanceof Error ? e.message : e),
        ),
      );
    }
  }
  return new Response(null, { status: 204 });
}

/** Lo storico, dal piu' recente. `prima` (ms) per le pagine successive. */
export async function elenco(env: Env, prima: number | null): Promise<Response> {
  const righe = await env.DB.prepare(`SELECT ${COLONNE} FROM disegni WHERE creato_at < ? ORDER BY creato_at DESC LIMIT 60`)
    .bind(prima ?? Number.MAX_SAFE_INTEGER)
    .all<RigaDisegno>();
  return json({ disegni: (righe.results ?? []).map(daRiga) });
}

/**
 * Un file del disegno. Con `v` uguale alla versione attuale si puo' tenere in
 * cache per sempre: a ogni modifica la versione sale e l'URL cambia.
 */
export async function scaricaParte(env: Env, id: string, parte: Parte, versione: string | null): Promise<Response> {
  const disegno = await trova(env, id);
  const oggetto = await env.FILE.get(chiave(id, parte));
  if (!oggetto) throw new ErroreHttp(404, 'File non trovato.');
  const perSempre = versione === String(disegno.versione);
  return new Response(oggetto.body, {
    headers: {
      'content-type': FILE[parte].tipo,
      'cache-control': perSempre ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    },
  });
}

/** Il disegno sul widget di `chi`, con il nome di chi l'ha fatto. */
export async function sulWidgetDi(env: Env, chi: string): Promise<{ disegno: Disegno; autore: string } | null> {
  const r = await env.DB.prepare(
    `SELECT d.id, d.autore_id, d.creato_at, d.modificato_at, d.versione, d.con_sfondo, p.nome AS autore
     FROM widget w JOIN disegni d ON d.id = w.disegno_id JOIN persone p ON p.id = d.autore_id
     WHERE w.destinatario_id = ?`,
  )
    .bind(chi)
    .first<RigaDisegno & { autore: string }>();
  if (!r) return null;
  const { autore, ...riga } = r;
  return { disegno: daRiga(riga), autore };
}
