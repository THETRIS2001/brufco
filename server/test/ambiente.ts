/**
 * Un Worker da provare senza Cloudflare: D1 e' SQLite vero (node:sqlite) con
 * la stessa migrazione, R2 una mappa, e le chiamate ad Apple si intercettano.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index';
import type { Env } from '../src/tipi';

type Valore = string | number | null;

function valore(v: unknown): Valore {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v as Valore;
}

class Istruzione {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly valori: Valore[] = [],
  ) {}
  bind(...valori: unknown[]): Istruzione {
    return new Istruzione(this.db, this.sql, valori.map(valore));
  }
  eseguiSubito() {
    const r = this.db.prepare(this.sql).run(...this.valori);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async first<T>(): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.valori);
    return r ? ({ ...r } as T) : null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.valori).map((r) => ({ ...r }) as T) };
  }
  async run() {
    return this.eseguiSubito();
  }
}

function d1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_iniziale.sql', import.meta.url), 'utf-8'));
  return {
    prepare: (sql: string) => new Istruzione(db, sql),
    async batch(istruzioni: Istruzione[]) {
      db.exec('BEGIN');
      try {
        const esiti = istruzioni.map((i) => i.eseguiSubito());
        db.exec('COMMIT');
        return esiti;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
}

export function r2() {
  const oggetti = new Map<string, { dati: Uint8Array; tipo?: string }>();
  const bucket = {
    async put(chiave: string, dati: ArrayBuffer | string, opzioni?: { httpMetadata?: { contentType?: string } }) {
      const byte = typeof dati === 'string' ? new TextEncoder().encode(dati) : new Uint8Array(dati);
      oggetti.set(chiave, { dati: byte, tipo: opzioni?.httpMetadata?.contentType });
    },
    async get(chiave: string) {
      const o = oggetti.get(chiave);
      if (!o) return null;
      return {
        body: new Blob([o.dati]).stream(),
        json: async () => JSON.parse(new TextDecoder().decode(o.dati)),
      };
    },
    async delete(chiavi: string | string[]) {
      for (const c of [chiavi].flat()) oggetti.delete(c);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, oggetti };
}

/** Una chiave P-256 in PEM, come la .p8 di Apple. */
export async function chiaveDiProva(): Promise<string> {
  const coppia = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', coppia.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...der));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

export interface Push {
  token: string;
  tipo: string;
  topic: string;
  corpo: { aps: Record<string, unknown>; disegno?: string; versione?: number };
}

/** Un server nuovo, con le push ad Apple registrate in `push` invece che mandate. */
export async function nuovoServer(opzioni: { conChiave?: boolean; rispostaApple?: () => Response } = {}) {
  const file = r2();
  const env: Env = {
    DB: d1(),
    FILE: file.bucket,
    APNS_KEY_ID: 'CHIAVE1234',
    APNS_TEAM_ID: 'TEAM123456',
    BUNDLE_ID: 'com.marcorisa.brufco',
    APNS_KEY_P8: opzioni.conChiave === false ? undefined : await chiaveDiProva(),
    CODICE_COPPIA: 'bruxelles-roma',
    CARICA_BUILD: 'segreto-delle-build',
  };
  const push: Push[] = [];
  const inSospeso: Promise<unknown>[] = [];
  const fetchVero = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    push.push({
      token: String(url).split('/').pop()!,
      tipo: h['apns-push-type'],
      topic: h['apns-topic'],
      corpo: JSON.parse(String(init.body)),
    });
    return opzioni.rispostaApple?.() ?? new Response(null, { status: 200 });
  }) as typeof fetch;

  async function chiedi(metodo: string, percorso: string, corpo?: BodyInit | object, token?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (corpo instanceof FormData || typeof corpo === 'string' || corpo instanceof ArrayBuffer) body = corpo;
    else if (corpo !== undefined) {
      body = JSON.stringify(corpo);
      headers['content-type'] = 'application/json';
    }
    const risposta = await worker.fetch(new Request(`https://brufco.test${percorso}`, { method: metodo, headers, body }), env, {
      waitUntil: (p: Promise<unknown>) => void inSospeso.push(p),
      passThroughOnException() {},
    } as unknown as ExecutionContext);
    await Promise.all(inSospeso.splice(0));
    return risposta;
  }

  return { env, file, push, chiedi, ripristina: () => (globalThis.fetch = fetchVero) };
}

export function modulo(campi: { documento?: object; anteprima?: string; sfondo?: string; notifica?: boolean; sfondoVia?: boolean }): FormData {
  const f = new FormData();
  if (campi.documento) f.set('documento', new Blob([JSON.stringify(campi.documento)], { type: 'application/json' }), 'documento.json');
  if (campi.anteprima) f.set('anteprima', new Blob([campi.anteprima], { type: 'image/jpeg' }), 'anteprima.jpg');
  if (campi.sfondo) f.set('sfondo', new Blob([campi.sfondo], { type: 'image/jpeg' }), 'sfondo.jpg');
  if (campi.notifica !== undefined) f.set('notifica', campi.notifica ? '1' : '0');
  if (campi.sfondoVia) f.set('sfondo_via', '1');
  return f;
}

export const DOCUMENTO = { formato: 1, tratti: 'AAAA', testi: [] };
