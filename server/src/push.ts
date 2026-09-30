/**
 * Le push ad Apple, direttamente su APNs (niente servizi di mezzo).
 *
 * Tre tipi, a seconda di cosa ha scelto chi manda:
 *  - CON NOTIFICA: un avviso con `mutable-content`, che sveglia l'estensione
 *    Notifiche del telefono dell'altro. Quella scarica il disegno, lo mette
 *    nella notifica come anteprima e ricarica il widget: pochi secondi, sempre.
 *  - SENZA NOTIFICA: una push silenziosa all'app (`content-available`), che se
 *    l'app non e' stata chiusa a mano la sveglia e ricarica il widget.
 *  - IN PIU', se il telefono ha iOS 26: la push dei widget, che fa ricaricare
 *    il widget direttamente. Apple le consegna quando puo' (hanno un budget):
 *    e' un canale in piu', non uno sostitutivo.
 *
 * Il JWT per APNs si firma con la chiave .p8 del team: le chiavi APNs valgono
 * per tutte le app del team, cambia solo il topic.
 */
import { dimenticaToken } from './persone';
import type { Env, Persona } from './tipi';

/** Apple vuole il token valido al massimo un'ora, e non rifatto piu' di una volta ogni 20 minuti. */
const VITA_TOKEN_MS = 40 * 60_000;
let cache: { jwt: string; fatto: number; kid: string } | null = null;

function base64url(byte: Uint8Array): string {
  let s = '';
  for (const b of byte) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** La .p8 e' PKCS#8 in PEM: via l'armatura, e i byte DER a importKey. */
async function chiave(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function jwtApns(env: Env): Promise<string> {
  const adesso = Date.now();
  if (cache && cache.kid === env.APNS_KEY_ID && adesso - cache.fatto < VITA_TOKEN_MS) return cache.jwt;
  const kid = env.APNS_KEY_ID!;
  const testo = new TextEncoder();
  const daFirmare = `${base64url(testo.encode(JSON.stringify({ alg: 'ES256', kid })))}.${base64url(
    testo.encode(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(adesso / 1000) })),
  )}`;
  // crypto.subtle da' gia' la firma r||s grezza, il formato di ES256.
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await chiave(env.APNS_KEY_P8!),
    testo.encode(daFirmare),
  );
  cache = { jwt: `${daFirmare}.${base64url(new Uint8Array(firma))}`, fatto: adesso, kid };
  return cache.jwt;
}

/** Ragioni per cui il token del telefono non vale piu': si dimentica. */
const TOKEN_MORTO = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']);

async function invia(
  env: Env,
  colonna: 'apns_token' | 'widget_token',
  token: string,
  intestazioni: Record<string, string>,
  corpo: unknown,
): Promise<void> {
  const r = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: { authorization: `bearer ${await jwtApns(env)}`, ...intestazioni },
    body: JSON.stringify(corpo),
  });
  if (r.ok) return;
  const motivo = ((await r.json().catch(() => ({}))) as { reason?: string }).reason ?? '';
  console.error(`[apns] ${intestazioni['apns-push-type']} rifiutata: ${r.status} ${motivo}`);
  if (TOKEN_MORTO.has(motivo)) await dimenticaToken(env, colonna, token);
}

export type Motivo = 'nuovo' | 'modificato' | 'rimandato' | 'aggiornamento';

const TESTI: Record<Exclude<Motivo, 'aggiornamento'>, string> = {
  nuovo: 'Ti ha mandato un disegno',
  modificato: 'Ha ritoccato un disegno',
  rimandato: 'Ti ha rimandato un disegno',
};

/**
 * Avvisa il telefono di `destinatario` che il suo widget ha un disegno nuovo.
 * `aggiornamento` e' il caso senza niente da dire (un disegno tolto dal widget
 * perche' eliminato): solo push silenziose.
 */
export async function avvisa(
  env: Env,
  destinatario: Persona,
  dati: { disegnoId: string; versione: number; autore: string; notifica: boolean; motivo: Motivo },
): Promise<void> {
  if (!env.APNS_KEY_P8 || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return;
  const invii: Promise<void>[] = [];
  const extra = { disegno: dati.disegnoId, versione: dati.versione };

  if (destinatario.apns_token) {
    if (dati.notifica && dati.motivo !== 'aggiornamento') {
      invii.push(
        invia(
          env,
          'apns_token',
          destinatario.apns_token,
          { 'apns-push-type': 'alert', 'apns-topic': env.BUNDLE_ID, 'apns-priority': '10' },
          {
            aps: {
              alert: { title: dati.autore, body: TESTI[dati.motivo] },
              sound: 'default',
              'mutable-content': 1,
              'thread-id': 'disegni',
            },
            ...extra,
          },
        ),
      );
    } else {
      invii.push(
        invia(
          env,
          'apns_token',
          destinatario.apns_token,
          { 'apns-push-type': 'background', 'apns-topic': env.BUNDLE_ID, 'apns-priority': '5' },
          { aps: { 'content-available': 1 }, ...extra },
        ),
      );
    }
  }
  if (destinatario.widget_token) {
    invii.push(
      invia(
        env,
        'widget_token',
        destinatario.widget_token,
        { 'apns-push-type': 'widgets', 'apns-topic': `${env.BUNDLE_ID}.push-type.widgets` },
        { aps: { 'content-changed': true } },
      ),
    );
  }
  await Promise.all(invii);
}
