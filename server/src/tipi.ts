export interface Env {
  DB: D1Database;
  FILE: R2Bucket;
  /** Id della chiave APNs e del team: le chiavi APNs valgono per tutte le app del team. */
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  /** Il bundle dell'app: topic delle push, e base di quello delle push dei widget. */
  BUNDLE_ID: string;
  /** Segreti: la chiave .p8, il codice della coppia, il permesso di caricare le build. */
  APNS_KEY_P8?: string;
  CODICE_COPPIA?: string;
  CARICA_BUILD?: string;
}

export interface Contesto {
  waitUntil(promessa: Promise<unknown>): void;
}

export interface Persona {
  id: string;
  nome: string;
  apns_token: string | null;
  widget_token: string | null;
}

export interface Disegno {
  id: string;
  autore_id: string;
  creato_at: number;
  modificato_at: number;
  versione: number;
  con_sfondo: boolean;
}

/** La riga di D1, con l'intero al posto del booleano. */
export interface RigaDisegno extends Omit<Disegno, 'con_sfondo'> {
  con_sfondo: number;
}

export function daRiga(r: RigaDisegno): Disegno {
  return { ...r, con_sfondo: r.con_sfondo === 1 };
}
