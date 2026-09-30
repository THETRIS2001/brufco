// Le chiavi di BRU✈️FCO, consegnate da chi le ha in mano. Nessuna si stampa.
//
//   node strumenti/chiavi.mjs            consegna quello che manca
//   node strumenti/chiavi.mjs --tutto    rifa' tutto (chiavi nuove, codice nuovo)
//
// Un comando solo, niente da incollare, e si puo' rilanciare: fa solo i passi
// che mancano (guarda i nomi dei segreti, mai i valori).
// 1. al server (segreti del Worker): la chiave APNs (APNS_KEY_P8), il codice
//    della coppia (CODICE_COPPIA: lo scrivi tu, o con Invio lo inventa lo
//    script, lo mostra alla fine e lo tiene in chiavi/codice-coppia.txt) e il
//    permesso di caricare le build (CARICA_BUILD, nuovo e casuale);
// 2. a GitHub (segreti del repository, che la build usa): il certificato di
//    distribuzione (APPLE_CERT_P12 e APPLE_CERT_PASSWORD) e lo stesso
//    CARICA_BUILD.
// I file vengono da strumenti/locale.json, fuori dal repository. Com'e' andato
// ogni passo, senza valori, sta in chiavi/consegna.log.

import { randomBytes, randomInt } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE = JSON.parse(readFileSync(join(RADICE, 'strumenti', 'locale.json'), 'utf8'));
const CHIAVI = join(RADICE, 'chiavi');
const REGISTRO = join(CHIAVI, 'consegna.log');
const REPO = 'THETRIS2001/brufco';
const WINDOWS = process.platform === 'win32';
const TUTTO = process.argv.includes('--tutto');

mkdirSync(CHIAVI, { recursive: true });
writeFileSync(REGISTRO, `consegna del ${new Date().toISOString()}\n`);

function annota(riga) {
  console.log(riga);
  appendFileSync(REGISTRO, `${riga}\n`);
}

/** gh col percorso completo e senza token nell'ambiente: usa il suo accesso salvato. */
const GH = (() => {
  if (!WINDOWS) return 'gh';
  const trovato = spawnSync('where.exe', ['gh'], { encoding: 'utf8' });
  return String(trovato.stdout ?? '').split(/\r?\n/).find((r) => r.toLowerCase().endsWith('gh.exe')) || 'gh';
})();
const AMBIENTE_GH = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'GH_TOKEN' && k !== 'GITHUB_TOKEN'));
// Lanciato da certi terminali l'ambiente arriva senza le cartelle dell'utente,
// e gh non trova il suo accesso: si rimettono al loro posto.
if (WINDOWS) {
  AMBIENTE_GH.APPDATA ??= join(homedir(), 'AppData', 'Roaming');
  AMBIENTE_GH.LOCALAPPDATA ??= join(homedir(), 'AppData', 'Local');
  AMBIENTE_GH.USERPROFILE ??= homedir();
}
// L'app Claude per Windows e' un'app "pacchettizzata" (MSIX): quello che i
// programmi lanciati da li' scrivono in AppData finisce nella sua cartella
// privata. Se gh ha fatto il login da li', le finestre aperte da Esplora file
// non lo vedono ("gh auth login"). Il token sta nel Gestore credenziali, che
// e' di tutti; basta dire a gh dov'e' la sua configurazione (30/09/2026).
if (WINDOWS && !AMBIENTE_GH.GH_CONFIG_DIR) {
  const pacchetti = join(homedir(), 'AppData', 'Local', 'Packages');
  const dentroClaude = existsSync(pacchetti)
    ? readdirSync(pacchetti)
        .filter((d) => /^Claude_/i.test(d))
        .map((d) => join(pacchetti, d, 'LocalCache', 'Roaming', 'GitHub CLI'))
        .find((d) => existsSync(join(d, 'hosts.yml')))
    : undefined;
  if (dentroClaude) AMBIENTE_GH.GH_CONFIG_DIR = dentroClaude;
}

/** Un comando con un valore sullo standard input: il valore non passa mai dagli argomenti. */
function conValore(comando, argomenti, valore, opzioni = {}) {
  const r = spawnSync(comando, argomenti, { input: valore, stdio: ['pipe', 'ignore', 'pipe'], encoding: 'utf8', ...opzioni });
  if (r.error) throw new Error(`${comando}: ${r.error.message}`);
  if (r.status !== 0) {
    const perche = String(r.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' | ');
    throw new Error(`${argomenti.slice(0, 3).join(' ')}: ${perche || 'uscita ' + r.status}`);
  }
}

function segretoServer(nome, valore) {
  conValore('npx', ['wrangler', 'secret', 'put', nome], valore, { cwd: join(RADICE, 'server'), shell: WINDOWS });
  annota(`Server: ${nome} consegnato.`);
}

/** GitHub a volte non risponde per qualche secondo: tre tentativi, con una pausa. */
function segretoGithub(nome, valore) {
  for (let tentativo = 1; ; tentativo++) {
    try {
      conValore(GH, ['secret', 'set', nome, '--repo', REPO], valore, { env: AMBIENTE_GH });
      annota(`GitHub: ${nome} consegnato.`);
      return;
    } catch (e) {
      if (tentativo === 3) throw e;
      annota(`GitHub: ${nome}, tentativo ${tentativo} non riuscito (${e.message.slice(0, 120)}); riprovo.`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000 * tentativo);
    }
  }
}

/** I nomi dei segreti che ci sono gia' (mai i valori). */
function nomiServer() {
  const r = spawnSync('npx', ['wrangler', 'secret', 'list', '--format', 'json'], { cwd: join(RADICE, 'server'), shell: WINDOWS, encoding: 'utf8' });
  try {
    return new Set(JSON.parse(r.stdout).map((s) => s.name));
  } catch {
    return new Set();
  }
}

function nomiGithub() {
  const r = spawnSync(GH, ['secret', 'list', '--repo', REPO, '--json', 'name'], { env: AMBIENTE_GH, encoding: 'utf8' });
  try {
    return new Set(JSON.parse(r.stdout).map((s) => s.name));
  } catch {
    annota(`GitHub: non riesco a leggere i segreti (${String(r.stderr ?? r.error?.message ?? '').trim().split('\n').pop()}).`);
    return new Set();
  }
}

function file(percorso) {
  if (!existsSync(percorso)) throw new Error(`manca ${percorso}`);
  return readFileSync(percorso);
}

async function passo(nome, fai) {
  try {
    await fai();
  } catch (e) {
    annota(`${nome}: non riuscito (${e.message}). Gli altri passi vanno avanti.`);
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

{
  const stato = spawnSync(GH, ['auth', 'status', '--hostname', 'github.com'], { env: AMBIENTE_GH, encoding: 'utf8' });
  annota(`GitHub: accesso ${stato.status === 0 ? 'ok' : 'NON trovato'} (gh in ${GH}, configurazione in ${AMBIENTE_GH.GH_CONFIG_DIR ?? 'AppData'}).`);
}

const server = TUTTO ? new Set() : nomiServer();
const github = TUTTO ? new Set() : nomiGithub();
const gia = (nome) => annota(`${nome}: c'era gia'.`);

await passo('APNS_KEY_P8', () =>
  server.has('APNS_KEY_P8') ? gia('APNS_KEY_P8') : segretoServer('APNS_KEY_P8', file(LOCALE.apns.file).toString('utf8').replace(/\r/g, '')),
);

let codiceScelto = null;
await passo('CODICE_COPPIA', async () => {
  if (server.has('CODICE_COPPIA')) return gia('CODICE_COPPIA (e resta quello: e\' in chiavi/codice-coppia.txt)');
  const codice = await codiceDellaCoppia();
  segretoServer('CODICE_COPPIA', codice);
  writeFileSync(join(CHIAVI, 'codice-coppia.txt'), `${codice}\n`);
  codiceScelto = codice;
});

// Il permesso delle build deve essere uguale sui due lati: se manca da una
// parte, se ne fa uno nuovo per tutte e due.
await passo('CARICA_BUILD', () => {
  if (server.has('CARICA_BUILD') && github.has('CARICA_BUILD')) return gia('CARICA_BUILD');
  const valore = randomBytes(32).toString('base64url');
  segretoServer('CARICA_BUILD', valore);
  segretoGithub('CARICA_BUILD', valore);
});

await passo('APPLE_CERT_P12', () =>
  github.has('APPLE_CERT_P12') ? gia('APPLE_CERT_P12') : segretoGithub('APPLE_CERT_P12', file(LOCALE.certificato.p12).toString('base64')),
);
await passo('APPLE_CERT_PASSWORD', () =>
  github.has('APPLE_CERT_PASSWORD')
    ? gia('APPLE_CERT_PASSWORD')
    : segretoGithub('APPLE_CERT_PASSWORD', file(LOCALE.certificato.password).toString('utf8').trim()),
);

annota('\nFatto.');
if (codiceScelto) {
  // Solo sullo schermo di chi lo lancia: nel registro non va.
  console.log(`\nIl codice della coppia e': ${codiceScelto}`);
  console.log("Lo scrivete tutti e due nell'app la prima volta. E' anche in chiavi/codice-coppia.txt, fuori dal repository.");
}
