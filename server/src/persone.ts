/**
 * Le due persone della coppia: iscrizione, riconoscimento, telefoni.
 *
 * Ci si iscrive una volta, col proprio nome e il codice della coppia (il
 * segreto CODICE_COPPIA, che sceglie Marco). Il server risponde con un token
 * che l'app tiene nel portachiavi; qui ne resta solo l'hash. Dopo la seconda
 * persona le iscrizioni si chiudono da sole: un terzo non entra nemmeno col
 * codice giusto.
 *
 * UN TELEFONO NUOVO: ci si iscrive di nuovo con lo stesso nome e il codice, e
 * si ritrova la stessa persona, coi suoi disegni. Il token vecchio smette di
 * valere. Il codice lo conoscete solo voi due, quindi va bene cosi'.
 */
import { ErroreHttp, casuale, json, sha256, ugualiTempoCostante } from './http';
import type { Env, Persona } from './tipi';

const COLONNE = 'id, nome, apns_token, widget_token';

/** Il codice si scrive come viene: maiuscole, spazi e trattini non contano. */
function normalizzato(codice: string): string {
  return codice.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function registra(env: Env, corpo: { nome?: unknown; codice?: unknown } | null): Promise<Response> {
  if (!env.CODICE_COPPIA) throw new ErroreHttp(503, 'Il server non ha ancora il codice della coppia.');
  const nome = typeof corpo?.nome === 'string' ? corpo.nome.trim() : '';
  const codice = typeof corpo?.codice === 'string' ? corpo.codice.trim() : '';
  if (!nome || nome.length > 40) throw new ErroreHttp(400, 'Scrivi il tuo nome, al massimo 40 caratteri.');
  if (!ugualiTempoCostante(normalizzato(codice), normalizzato(env.CODICE_COPPIA))) {
    throw new ErroreHttp(403, 'Il codice della coppia non è giusto.');
  }

  const token = casuale();
  const giaIscritta = await env.DB.prepare('SELECT id, nome FROM persone WHERE lower(nome) = lower(?)')
    .bind(nome)
    .first<{ id: string; nome: string }>();
  if (giaIscritta) {
    await env.DB.prepare('UPDATE persone SET token_hash = ?, apns_token = NULL, widget_token = NULL WHERE id = ?')
      .bind(await sha256(token), giaIscritta.id)
      .run();
    return json({ token, io: giaIscritta });
  }

  const id = crypto.randomUUID();
  // Il conto e l'inserimento in un'istruzione sola: due iscrizioni insieme non
  // possono diventare tre persone.
  const esito = await env.DB.prepare(
    `INSERT INTO persone (id, nome, token_hash, creata_at)
     SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM persone) < 2`,
  )
    .bind(id, nome, await sha256(token), Date.now())
    .run();
  if (esito.meta.changes !== 1) throw new ErroreHttp(409, 'La coppia è già completa.');
  return json({ token, io: { id, nome } }, 201);
}

/** Chi sta chiamando, dal token. */
export async function chiChiama(env: Env, req: Request): Promise<Persona> {
  const m = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new ErroreHttp(401, 'Serve il token.');
  const persona = await env.DB.prepare(`SELECT ${COLONNE} FROM persone WHERE token_hash = ?`)
    .bind(await sha256(m[1]))
    .first<Persona>();
  if (!persona) throw new ErroreHttp(401, 'Token non valido.');
  return persona;
}

/** L'altra persona della coppia, se si è già iscritta. */
export async function altra(env: Env, io: Persona): Promise<Persona | null> {
  return env.DB.prepare(`SELECT ${COLONNE} FROM persone WHERE id != ? LIMIT 1`).bind(io.id).first<Persona>();
}

const TOKEN_APNS = /^[0-9a-f]{32,200}$/;

/**
 * I token per le push, come li manda il telefono: quello dell'app, quello dei
 * widget, o tutti e due. Un campo assente resta com'era; `null` lo cancella.
 */
export async function aggiornaDispositivo(
  env: Env,
  io: Persona,
  corpo: { apns?: unknown; widget?: unknown } | null,
): Promise<Response> {
  const istruzioni: D1PreparedStatement[] = [];
  for (const [campo, colonna] of [
    ['apns', 'apns_token'],
    ['widget', 'widget_token'],
  ] as const) {
    const valore = corpo?.[campo];
    if (valore === undefined) continue;
    if (valore !== null && (typeof valore !== 'string' || !TOKEN_APNS.test(valore))) {
      throw new ErroreHttp(400, `Token ${campo} non valido.`);
    }
    // Lo stesso telefono non puo' essere di tutti e due: se il token era
    // dell'altra persona (telefono passato di mano), lo perde lei.
    if (valore) istruzioni.push(env.DB.prepare(`UPDATE persone SET ${colonna} = NULL WHERE ${colonna} = ? AND id != ?`).bind(valore, io.id));
    istruzioni.push(env.DB.prepare(`UPDATE persone SET ${colonna} = ? WHERE id = ?`).bind(valore, io.id));
  }
  if (istruzioni.length) await env.DB.batch(istruzioni);
  return new Response(null, { status: 204 });
}

/** Un token che Apple dice morto si toglie, cosi' non ci si riprova. */
export async function dimenticaToken(env: Env, colonna: 'apns_token' | 'widget_token', token: string): Promise<void> {
  await env.DB.prepare(`UPDATE persone SET ${colonna} = NULL WHERE ${colonna} = ?`).bind(token).run();
}
