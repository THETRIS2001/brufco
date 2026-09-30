// Apple, dal PC: gli App ID, le push, i telefoni e i profili ad hoc.
//
//   node strumenti/apple.mjs                                 App ID, push e profili
//   node strumenti/apple.mjs dispositivo <UDID> "<nome>"     registra un iPhone e rifa' i profili
//   node strumenti/apple.mjs --elenco                        i telefoni del team
//
// Gli identificativi del team e delle chiavi stanno in strumenti/locale.json,
// fuori dal repository (che e' pubblico). Nessuna chiave si stampa.
//
// I profili valgono solo per i telefoni di firma/dispositivi.json (anche quello
// fuori dal repository). Un profilo ad hoc porta dentro l'elenco dei telefoni,
// quindi si rifa' ogni volta che l'elenco cambia: finisce in firma/ e nei
// segreti PROFILO_* di GitHub, da cui lo prende la build. Dopo, un tag adhoc-*.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIRMA = path.join(RADICE, 'firma');
const ELENCO = path.join(FIRMA, 'dispositivi.json');
const LOCALE = JSON.parse(fs.readFileSync(path.join(RADICE, 'strumenti', 'locale.json'), 'utf8'));
const REPO = 'THETRIS2001/brufco';

/** I tre target di project.yml, coi nomi dei profili e dei segreti che la build usa. */
const TARGET = [
  { bundle: 'com.marcorisa.brufco', nome: 'BRUFCO', profilo: 'BRUFCO Ad Hoc', segreto: 'PROFILO_APP', push: true },
  // Anche il widget: le push dei widget (iOS 26) vogliono la capability sull'estensione.
  { bundle: 'com.marcorisa.brufco.widget', nome: 'BRUFCO Widget', profilo: 'BRUFCO Widget Ad Hoc', segreto: 'PROFILO_WIDGET', push: true },
  { bundle: 'com.marcorisa.brufco.notifiche', nome: 'BRUFCO Notifiche', profilo: 'BRUFCO Notifiche Ad Hoc', segreto: 'PROFILO_NOTIFICHE', push: false },
];

function token() {
  const chiave = fs.readFileSync(LOCALE.chiaveApi.file, 'utf8').replace(/\r/g, '');
  const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const adesso = Math.floor(Date.now() / 1000);
  const daFirmare = `${b64({ alg: 'ES256', kid: LOCALE.chiaveApi.id, typ: 'JWT' })}.${b64({
    iss: LOCALE.chiaveApi.emittente,
    iat: adesso,
    exp: adesso + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  const firma = crypto.sign('sha256', Buffer.from(daFirmare), { key: chiave, dsaEncoding: 'ieee-p1363' });
  return `${daFirmare}.${firma.toString('base64url')}`;
}

async function api(metodo, percorso, corpo) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${percorso}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 204) return null;
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const dettagli = (json.errors ?? []).map((e) => `${e.title}: ${e.detail}`).join('; ');
    throw new Error(`${metodo} ${percorso} -> ${r.status} ${dettagli}`);
  }
  return json;
}

/** Un segreto di GitHub, dallo standard input: il valore non passa dagli argomenti. */
function segretoGithub(nome, valore) {
  const r = spawnSync('gh', ['secret', 'set', nome, '--repo', REPO], {
    input: valore,
    stdio: ['pipe', 'ignore', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`gh secret set ${nome}: ${String(r.stderr).trim().split('\n').pop()}`);
}

async function telefoniDelTeam() {
  return (await api('GET', '/v1/devices?limit=200&filter[platform]=IOS')).data;
}

function scelti() {
  return fs.existsSync(ELENCO) ? JSON.parse(fs.readFileSync(ELENCO, 'utf8')) : [];
}

/** L'App ID, creato se manca, con le push accese se servono. */
async function appId(t) {
  const trovati = await api('GET', `/v1/bundleIds?filter[identifier]=${t.bundle}&limit=20`);
  let id = trovati.data.find((b) => b.attributes.identifier === t.bundle)?.id;
  if (!id) {
    id = (await api('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier: t.bundle, name: t.nome, platform: 'IOS' } } })).data.id;
    console.log(`App ID creato: ${t.bundle}`);
  }
  if (t.push) {
    const capacita = await api('GET', `/v1/bundleIds/${id}/bundleIdCapabilities`);
    if (!capacita.data.some((c) => c.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) {
      await api('POST', '/v1/bundleIdCapabilities', {
        data: {
          type: 'bundleIdCapabilities',
          attributes: { capabilityType: 'PUSH_NOTIFICATIONS' },
          relationships: { bundleId: { data: { type: 'bundleIds', id } } },
        },
      });
      console.log(`Push accese: ${t.bundle}`);
    }
  }
  return id;
}

async function profili() {
  const team = await telefoniDelTeam();
  const telefoni = scelti().map((s) => {
    const t = team.find((d) => d.attributes.udid === s.udid);
    if (!t) throw new Error(`${s.nome}: non e' registrato sul team (node strumenti/apple.mjs dispositivo ...)`);
    if (t.attributes.status !== 'ENABLED') throw new Error(`${s.nome}: e' disattivato sul team`);
    return t.id;
  });
  if (!telefoni.length) throw new Error('firma/dispositivi.json e\' vuoto.');
  for (const t of TARGET) {
    const id = await appId(t);
    const vecchi = await api('GET', `/v1/profiles?filter[name]=${encodeURIComponent(t.profilo)}&limit=20`);
    for (const p of vecchi.data) if (p.attributes.name === t.profilo) await api('DELETE', `/v1/profiles/${p.id}`);
    const nuovo = await api('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: t.profilo, profileType: 'IOS_APP_ADHOC' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id } },
          certificates: { data: [{ type: 'certificates', id: LOCALE.certificato.id }] },
          devices: { data: telefoni.map((d) => ({ type: 'devices', id: d })) },
        },
      },
    });
    const contenuto = nuovo.data.attributes.profileContent;
    fs.writeFileSync(path.join(FIRMA, `${t.profilo}.mobileprovision`), Buffer.from(contenuto, 'base64'));
    segretoGithub(t.segreto, contenuto);
    console.log(`Profilo "${t.profilo}": ${telefoni.length} iPhone, scade il ${nuovo.data.attributes.expirationDate.slice(0, 10)}, in ${t.segreto}`);
  }
  console.log('\nPronti per la build: un tag adhoc-*.');
}

async function registra(udid, nome) {
  if (!udid || !nome) throw new Error('Uso: node strumenti/apple.mjs dispositivo <UDID> "<nome>"');
  if (!(await telefoniDelTeam()).some((d) => d.attributes.udid === udid)) {
    await api('POST', '/v1/devices', { data: { type: 'devices', attributes: { name: nome, udid, platform: 'IOS' } } });
    console.log(`Registrato sul team: ${nome}`);
  }
  const elenco = scelti();
  if (!elenco.some((s) => s.udid === udid)) {
    elenco.push({ nome, udid });
    fs.mkdirSync(FIRMA, { recursive: true });
    fs.writeFileSync(ELENCO, JSON.stringify(elenco, null, 2) + '\n');
  }
  await profili();
}

const [comando, ...resto] = process.argv.slice(2);
try {
  if (comando === '--elenco') {
    for (const d of await telefoniDelTeam()) console.log(`${d.attributes.name} | ${d.attributes.model ?? '?'} | ${d.attributes.status} | ${d.attributes.udid}`);
  } else if (comando === 'dispositivo') {
    await registra(resto[0], resto[1]);
  } else {
    await profili();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
