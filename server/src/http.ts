/** Risposte, errori e piccoli attrezzi comuni a tutte le rotte. */

export class ErroreHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(dati: unknown, status = 200): Response {
  return new Response(JSON.stringify(dati), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function corpoJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErroreHttp(400, 'Richiesta non valida.');
  }
}

export function base64url(byte: Uint8Array): string {
  let s = '';
  for (const b of byte) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Un segreto nuovo: 32 byte casuali. */
export function casuale(): string {
  const byte = new Uint8Array(32);
  crypto.getRandomValues(byte);
  return base64url(byte);
}

export async function sha256(testo: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confronto che non dice, col tempo che impiega, quanti caratteri tornano. */
export function ugualiTempoCostante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diversi = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diversi |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diversi === 0;
}
