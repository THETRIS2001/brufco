/**
 * La serie: i giorni di fila in cui avete disegnato tutti e due.
 *
 * LE REGOLE (Marco, 30/09/2026):
 *  - un giorno conta se ognuno dei due ha mandato almeno un disegno, nuovo o
 *    ritoccato. Rimetterne uno vecchio sul widget non conta: basterebbe un
 *    tasto;
 *  - i giorni sono quelli di Roma (Bruxelles ha la stessa ora);
 *  - oggi non rompe niente finche' non e' finito: se manca qualcuno, la serie
 *    vale fino a ieri;
 *  - quando una serie finisce si sa di chi e' la colpa: di chi quel giorno
 *    non ha disegnato (o di tutti e due).
 * I giorni stanno in `invii`, che eliminare un disegno non tocca.
 */
import type { Env, Persona } from './tipi';

const ROMA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Il giorno di Roma di un istante: 'AAAA-MM-GG'. */
export function giorno(ms: number): string {
  return ROMA.format(new Date(ms));
}

/** Il giorno prima, sul calendario: le ore legali non c'entrano. */
export function giornoPrima(g: string): string {
  const d = new Date(`${g}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface Serie {
  /** Giorni di fila, oggi compreso se l'avete gia' fatto tutti e due. */
  giorni: number;
  /** Chi ha gia' disegnato oggi. */
  oggi: { io: boolean; altro: boolean };
  /** La serie piu' lunga di sempre (anche quella in corso). */
  record: number;
  /** L'ultima serie finita: il giorno in cui e' finita, quanto era lunga, chi quel giorno non ha disegnato. */
  persa: { giorno: string; durata: number; chi: ('io' | 'altro')[] } | null;
}

/** La serie dai giorni di ognuno, vista da "io". */
export function calcola(mie: Set<string>, sue: Set<string>, oggi: string): Serie {
  const entrambi = (g: string) => mie.has(g) && sue.has(g);
  const comuni = [...mie].filter((g) => sue.has(g)).sort();

  let record = 0;
  let fila = 0;
  comuni.forEach((g, i) => {
    fila = i > 0 && giornoPrima(g) === comuni[i - 1] ? fila + 1 : 1;
    record = Math.max(record, fila);
  });

  let g = entrambi(oggi) ? oggi : giornoPrima(oggi);
  let giorni = 0;
  while (entrambi(g)) {
    giorni++;
    g = giornoPrima(g);
  }

  // `g` e' il primo giorno, andando indietro, che non conta. Prima di lui,
  // la serie finita piu' di recente: il giorno dopo il suo ultimo e' quello
  // in cui qualcuno non ha disegnato (e non e' mai oggi).
  let persa: Serie['persa'] = null;
  const precedente = comuni.filter((c) => c < g).pop();
  if (precedente) {
    let durata = 0;
    for (let c = precedente; entrambi(c); c = giornoPrima(c)) durata++;
    const finita = giornoDopo(precedente);
    const chi: ('io' | 'altro')[] = [];
    if (!mie.has(finita)) chi.push('io');
    if (!sue.has(finita)) chi.push('altro');
    persa = { giorno: finita, durata, chi };
  }

  return { giorni, oggi: { io: mie.has(oggi), altro: sue.has(oggi) }, record, persa };
}

function giornoDopo(g: string): string {
  const d = new Date(`${g}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Chi ha appena mandato un disegno ha fatto la sua parte di oggi. */
export async function segnaInvio(env: Env, persona: string, ms = Date.now()): Promise<void> {
  await env.DB.prepare('INSERT OR IGNORE INTO invii (persona_id, giorno) VALUES (?, ?)').bind(persona, giorno(ms)).run();
}

export async function serieDi(env: Env, io: Persona, altro: Persona, ms = Date.now()): Promise<Serie> {
  const righe = await env.DB.prepare('SELECT persona_id, giorno FROM invii WHERE persona_id IN (?, ?)')
    .bind(io.id, altro.id)
    .all<{ persona_id: string; giorno: string }>();
  const mie = new Set<string>();
  const sue = new Set<string>();
  for (const r of righe.results ?? []) (r.persona_id === io.id ? mie : sue).add(r.giorno);
  return calcola(mie, sue, giorno(ms));
}
