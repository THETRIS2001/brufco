// Le chiavi di BRU✈️FCO, consegnate da chi le ha in mano. Nessuna si stampa.
//
//   node strumenti/chiavi.mjs
//
// Un comando solo, niente da incollare:
// 1. al server (segreti del Worker): la chiave APNs (APNS_KEY_P8), il codice
//    della coppia (CODICE_COPPIA: lo scrivi tu, o con Invio lo inventa lo
//    script, lo mostra alla fine e lo tiene in chiavi/codice-coppia.txt) e il
//    permesso di caricare le build (CARICA_BUILD, nuovo e casuale);
// 2. a GitHub (segreti del repository, che la build usa): il certificato di
//    distribuzione (APPLE_CERT_P12 e APPLE_CERT_PASSWORD) e lo stesso
//    CARICA_BUILD.
// I file vengono da strumenti/locale.json, fuori dal repository.
//
// Ogni passo sta in piedi da solo: se uno non va, gli altri si fanno lo stesso.

import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE = JSON.parse(readFileSync(join(RADICE, 'strumenti', 'locale.json'), 'utf8'));
const REPO = 'THETRIS2001/brufco';
const WINDOWS = process.platform === 'win32';

/** Un comando con un valore sullo standard input: il valore non passa mai dagli argomenti. */
function conValore(comando, argomenti, valore, cartella = RADICE) {
  const r = spawnSync(comando, argomenti, { input: valore, cwd: cartella, stdio: ['pipe', 'ignore', 'pipe'], shell: WINDOWS, encoding: 'utf8' });
  if (r.status !== 0) {
    const perche = String(r.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' | ');
    throw new Error(`${comando} ${argomenti.slice(0, 3).join(' ')}: ${perche || 'uscita ' + r.status}`);
  }
}

function segretoServer(nome, valore) {
  conValore('npx', ['wrangler', 'secret', 'put', nome], valore, join(RADICE, 'server'));
  console.log(`Server: ${nome} consegnato.`);
}

function segretoGithub(nome, valore) {
  conValore('gh', ['secret', 'set', nome, '--repo', REPO], valore);
  console.log(`GitHub: ${nome} consegnato.`);
}

function file(percorso) {
  if (!existsSync(percorso)) throw new Error(`manca ${percorso}`);
  return readFileSync(percorso);
}

async function passo(nome, fai) {
  try {
    await fai();
  } catch (e) {
    console.log(`${nome}: non riuscito (${e.message}). Gli altri passi vanno avanti.`);
  }
}

/** Un codice facile da scrivere su un telefono: tre parole e un numero. */
function codiceInventato() {
  const parole = [
    'aereo', 'luna', 'gelato', 'nuvola', 'stella', 'treno', 'mare', 'vento', 'ciliegia', 'girasole',
    'bussola', 'valigia', 'cometa', 'pinguino', 'arcobaleno', 'fragola', 'faro', 'onda', 'biscotto', 'lampone',
  ];
  const scelte = Array.from({ length: 3 }, () => parole[randomInt(parole.length)]);
  return `${scelte.join('-')}-${randomInt(10, 100)}`;
}

/** Il codice della coppia: scritto adesso, o inventato con un Invio. */
async function codiceDellaCoppia() {
  if (!process.stdin.isTTY) return codiceInventato();
  const domanda = createInterface({ input: process.stdin, output: process.stdout });
  const scritto = (await domanda.question('\nIl codice della coppia (premi Invio e lo invento io): ')).trim();
  domanda.close();
  if (!scritto) return codiceInventato();
  if (scritto.length < 8) throw new Error('troppo corto: almeno 8 caratteri');
  return scritto;
}

await passo('APNS_KEY_P8', () => segretoServer('APNS_KEY_P8', file(LOCALE.apns.file).toString('utf8').replace(/\r/g, '')));

let codiceScelto = null;
await passo('CODICE_COPPIA', async () => {
  const codice = await codiceDellaCoppia();
  segretoServer('CODICE_COPPIA', codice);
  mkdirSync(join(RADICE, 'chiavi'), { recursive: true });
  writeFileSync(join(RADICE, 'chiavi', 'codice-coppia.txt'), `${codice}\n`);
  codiceScelto = codice;
});

await passo('CARICA_BUILD', () => {
  const valore = randomBytes(32).toString('base64url');
  segretoServer('CARICA_BUILD', valore);
  segretoGithub('CARICA_BUILD', valore);
});

await passo('APPLE_CERT_P12', () => segretoGithub('APPLE_CERT_P12', file(LOCALE.certificato.p12).toString('base64')));
await passo('APPLE_CERT_PASSWORD', () =>
  segretoGithub('APPLE_CERT_PASSWORD', file(LOCALE.certificato.password).toString('utf8').trim()),
);

console.log('\nFatto.');
if (codiceScelto) {
  console.log(`\nIl codice della coppia e': ${codiceScelto}`);
  console.log("Lo scrivete tutti e due nell'app la prima volta. E' anche in chiavi/codice-coppia.txt, fuori dal repository.");
}
