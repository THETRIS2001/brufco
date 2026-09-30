import { afterEach, describe, expect, it } from 'vitest';
import { DOCUMENTO, modulo, nuovoServer } from './ambiente';

type Server = Awaited<ReturnType<typeof nuovoServer>>;
let server: Server;

afterEach(() => server?.ripristina());

/** Marco e Giulia iscritti, coi telefoni registrati per le push. */
async function coppia(opzioni?: Parameters<typeof nuovoServer>[0]) {
  server = await nuovoServer(opzioni);
  const marco = (await (await server.chiedi('POST', '/persone', { nome: 'Marco', codice: 'bruxelles-roma' })).json()) as {
    token: string;
    io: { id: string };
  };
  const giulia = (await (await server.chiedi('POST', '/persone', { nome: 'Giulia', codice: 'bruxelles-roma' })).json()) as {
    token: string;
    io: { id: string };
  };
  await server.chiedi('PUT', '/dispositivo', { apns: 'a'.repeat(64), widget: 'b'.repeat(64) }, marco.token);
  await server.chiedi('PUT', '/dispositivo', { apns: 'c'.repeat(64) }, giulia.token);
  return { marco, giulia };
}

async function disegna(token: string, notifica = true, sfondo?: string): Promise<{ id: string; versione: number }> {
  const r = await server.chiedi('POST', '/disegni', modulo({ documento: DOCUMENTO, anteprima: 'JPEG', sfondo, notifica }), token);
  expect(r.status).toBe(201);
  return ((await r.json()) as { disegno: { id: string; versione: number } }).disegno;
}

async function widgetDi(token: string) {
  return (await (await server.chiedi('GET', '/widget', undefined, token)).json()) as {
    disegno: { id: string; versione: number } | null;
    autore: string | null;
  };
}

describe('iscrizione', () => {
  it('col codice giusto entra, e dopo due persone la coppia si chiude', async () => {
    server = await nuovoServer();
    expect((await server.chiedi('POST', '/persone', { nome: 'Marco', codice: 'sbagliato' })).status).toBe(403);
    expect((await server.chiedi('POST', '/persone', { nome: '  ', codice: 'bruxelles-roma' })).status).toBe(400);
    expect((await server.chiedi('POST', '/persone', { nome: 'Marco', codice: 'bruxelles-roma' })).status).toBe(201);
    expect((await server.chiedi('POST', '/persone', { nome: 'Giulia', codice: 'bruxelles-roma' })).status).toBe(201);
    expect((await server.chiedi('POST', '/persone', { nome: 'Terzo', codice: 'bruxelles-roma' })).status).toBe(409);
  });

  it(`stesso nome e codice su un telefono nuovo: la stessa persona, e il token vecchio non vale piu`, async () => {
    const { marco } = await coppia();
    const r = await server.chiedi('POST', '/persone', { nome: 'marco', codice: 'bruxelles-roma' });
    expect(r.status).toBe(200);
    const nuovo = (await r.json()) as { token: string; io: { id: string; nome: string } };
    expect(nuovo.io).toEqual({ id: marco.io.id, nome: 'Marco' });
    expect((await server.chiedi('GET', '/stato', undefined, marco.token)).status).toBe(401);
    expect((await server.chiedi('GET', '/stato', undefined, nuovo.token)).status).toBe(200);
  });

  it('il codice si scrive come viene: maiuscole e spazi non contano', async () => {
    server = await nuovoServer();
    expect((await server.chiedi('POST', '/persone', { nome: 'Marco', codice: 'Bruxelles Roma' })).status).toBe(201);
    expect((await server.chiedi('POST', '/persone', { nome: 'Giulia', codice: 'BRUXELLESROMA' })).status).toBe(201);
  });

  it('senza token o con un token inventato non si passa', async () => {
    await coppia();
    expect((await server.chiedi('GET', '/stato')).status).toBe(401);
    expect((await server.chiedi('GET', '/stato', undefined, 'inventato')).status).toBe(401);
  });

  it('lo stato dice chi sono io e chi e\' l\'altra persona', async () => {
    const { marco, giulia } = await coppia();
    const stato = (await (await server.chiedi('GET', '/stato', undefined, marco.token)).json()) as {
      io: { id: string; nome: string };
      altro: { id: string; nome: string };
    };
    expect(stato.io).toEqual({ id: marco.io.id, nome: 'Marco' });
    expect(stato.altro).toEqual({ id: giulia.io.id, nome: 'Giulia' });
  });
});

describe('mandare un disegno', () => {
  it('finisce sul widget dell\'altra persona, non sul mio', async () => {
    const { marco, giulia } = await coppia();
    const d = await disegna(marco.token);
    expect((await widgetDi(giulia.token)).disegno?.id).toBe(d.id);
    expect((await widgetDi(giulia.token)).autore).toBe('Marco');
    expect((await widgetDi(marco.token)).disegno).toBeNull();
  });

  it('con la notifica: un avviso che sveglia l\'estensione, col nome di chi manda', async () => {
    const { marco } = await coppia();
    const d = await disegna(marco.token, true);
    const alGiulia = server.push.filter((p) => p.token === 'c'.repeat(64));
    expect(alGiulia).toHaveLength(1);
    expect(alGiulia[0].tipo).toBe('alert');
    expect(alGiulia[0].topic).toBe('com.marcorisa.brufco');
    expect(alGiulia[0].corpo.aps).toMatchObject({ 'mutable-content': 1, alert: { title: 'Marco' } });
    expect(alGiulia[0].corpo.disegno).toBe(d.id);
  });

  it('senza notifica: push silenziosa all\'app e push dei widget dove c\'e\' il token', async () => {
    const { giulia } = await coppia();
    await disegna(giulia.token, false);
    const aMarco = server.push.filter((p) => p.token !== 'c'.repeat(64));
    expect(aMarco.map((p) => p.tipo).sort()).toEqual(['background', 'widgets']);
    const widget = aMarco.find((p) => p.tipo === 'widgets')!;
    expect(widget.token).toBe('b'.repeat(64));
    expect(widget.topic).toBe('com.marcorisa.brufco.push-type.widgets');
    expect(widget.corpo).toEqual({ aps: { 'content-changed': true } });
    expect(aMarco.find((p) => p.tipo === 'background')!.corpo.aps).toEqual({ 'content-available': 1 });
  });

  it('senza la chiave APNs il disegno si salva lo stesso, e nessuna push parte', async () => {
    const { marco, giulia } = await coppia({ conChiave: false });
    const d = await disegna(marco.token);
    expect((await widgetDi(giulia.token)).disegno?.id).toBe(d.id);
    expect(server.push).toHaveLength(0);
  });

  it('un token che Apple dice morto si dimentica', async () => {
    const { marco } = await coppia({ rispostaApple: () => Response.json({ reason: 'Unregistered' }, { status: 410 }) });
    await disegna(marco.token);
    server.push.length = 0;
    await disegna(marco.token);
    expect(server.push).toHaveLength(0);
  });

  it('senza documento o anteprima, o con un documento sconosciuto, no', async () => {
    const { marco } = await coppia();
    expect((await server.chiedi('POST', '/disegni', modulo({ anteprima: 'JPEG' }), marco.token)).status).toBe(400);
    expect((await server.chiedi('POST', '/disegni', modulo({ documento: { formato: 9 }, anteprima: 'JPEG' }), marco.token)).status).toBe(400);
  });
});

describe('i file del disegno', () => {
  it('si scaricano, e con la versione giusta si tengono in cache per sempre', async () => {
    const { marco, giulia } = await coppia();
    const d = await disegna(marco.token, true, 'FOTO');
    const anteprima = await server.chiedi('GET', `/disegni/${d.id}/anteprima?v=1`, undefined, giulia.token);
    expect(await anteprima.text()).toBe('JPEG');
    expect(anteprima.headers.get('cache-control')).toContain('immutable');
    const vecchia = await server.chiedi('GET', `/disegni/${d.id}/anteprima?v=0`, undefined, giulia.token);
    expect(vecchia.headers.get('cache-control')).toContain('no-cache');
    expect(await (await server.chiedi('GET', `/disegni/${d.id}/sfondo`, undefined, giulia.token)).text()).toBe('FOTO');
    expect(JSON.parse(await (await server.chiedi('GET', `/disegni/${d.id}/documento`, undefined, giulia.token)).text())).toEqual(DOCUMENTO);
  });
});

describe('modificare', () => {
  it('sostituisce l\'originale, sale di versione e lo rimanda', async () => {
    const { marco, giulia } = await coppia();
    const d = await disegna(marco.token, false, 'FOTO');
    server.push.length = 0;
    const r = await server.chiedi('PUT', `/disegni/${d.id}`, modulo({ documento: DOCUMENTO, anteprima: 'JPEG2', notifica: true }), marco.token);
    expect(r.status).toBe(200);
    const nuovo = ((await r.json()) as { disegno: { versione: number; con_sfondo: boolean } }).disegno;
    expect(nuovo).toMatchObject({ versione: 2, con_sfondo: true });
    expect(await (await server.chiedi('GET', `/disegni/${d.id}/anteprima`, undefined, giulia.token)).text()).toBe('JPEG2');
    expect(server.push.find((p) => p.tipo === 'alert')?.corpo.versione).toBe(2);
  });

  it('con sfondo_via la foto se ne va', async () => {
    const { marco } = await coppia();
    const d = await disegna(marco.token, false, 'FOTO');
    await server.chiedi('PUT', `/disegni/${d.id}`, modulo({ documento: DOCUMENTO, anteprima: 'J', sfondoVia: true }), marco.token);
    expect(server.file.oggetti.has(`disegni/${d.id}/sfondo.jpg`)).toBe(false);
  });

  it('i disegni dell\'altra persona non si modificano', async () => {
    const { marco, giulia } = await coppia();
    const d = await disegna(marco.token);
    const r = await server.chiedi('PUT', `/disegni/${d.id}`, modulo({ documento: DOCUMENTO, anteprima: 'J' }), giulia.token);
    expect(r.status).toBe(403);
  });
});

describe('rendi attivo', () => {
  it('rimanda un disegno qualsiasi, anche suo, al widget dell\'altra persona', async () => {
    const { marco, giulia } = await coppia();
    const vecchio = await disegna(marco.token);
    await disegna(marco.token);
    const suo = await disegna(giulia.token);
    await server.chiedi('POST', `/disegni/${vecchio.id}/widget`, { notifica: false }, marco.token);
    expect((await widgetDi(giulia.token)).disegno?.id).toBe(vecchio.id);
    await server.chiedi('POST', `/disegni/${suo.id}/widget`, { notifica: false }, marco.token);
    expect((await widgetDi(giulia.token)).disegno?.id).toBe(suo.id);
  });
});

describe('eliminare', () => {
  it('solo i propri, e il widget che lo mostrava torna al piu\' recente dell\'altra persona', async () => {
    const { marco, giulia } = await coppia();
    const primo = await disegna(marco.token);
    const secondo = await disegna(marco.token);
    expect((await server.chiedi('DELETE', `/disegni/${secondo.id}`, undefined, giulia.token)).status).toBe(403);

    server.push.length = 0;
    expect((await server.chiedi('DELETE', `/disegni/${secondo.id}`, undefined, marco.token)).status).toBe(204);
    expect((await widgetDi(giulia.token)).disegno?.id).toBe(primo.id);
    // Niente notifica per un disegno tolto: solo le push silenziose.
    expect(server.push.map((p) => p.tipo)).toEqual(['background']);
    expect([...server.file.oggetti.keys()].some((k) => k.includes(secondo.id))).toBe(false);

    await server.chiedi('DELETE', `/disegni/${primo.id}`, undefined, marco.token);
    expect((await widgetDi(giulia.token)).disegno).toBeNull();
  });
});

describe('storico', () => {
  it('dal piu\' recente, con i disegni di tutti e due', async () => {
    const { marco, giulia } = await coppia();
    const a = await disegna(marco.token);
    await new Promise((r) => setTimeout(r, 5));
    const b = await disegna(giulia.token);
    const { disegni } = (await (await server.chiedi('GET', '/disegni', undefined, marco.token)).json()) as { disegni: { id: string }[] };
    expect(disegni.map((d) => d.id)).toEqual([b.id, a.id]);
  });
});

describe('installazione', () => {
  it('le build si caricano solo col segreto, e la pagina porta al manifesto', async () => {
    server = await nuovoServer();
    expect((await server.chiedi('PUT', '/build/app.ipa', 'IPA')).status).toBe(401);
    const carica = (nome: string, dati: string) => server.chiedi('PUT', `/build/${nome}`, dati, 'segreto-delle-build');
    expect((await carica('app.ipa', 'IPA')).status).toBe(204);
    expect((await carica('altro.txt', 'x')).status).toBe(404);
    await carica('info.json', JSON.stringify({ numero: '7', data: '1 ottobre' }));
    const pagina = await (await server.chiedi('GET', '/installa')).text();
    expect(pagina).toContain('itms-services://?action=download-manifest&amp;url=https%3A%2F%2Fbrufco.test%2Fbuild%2Fmanifest.plist');
    expect(pagina).toContain('Build 7');
    expect(await (await server.chiedi('GET', '/build/app.ipa')).text()).toBe('IPA');
    expect((await carica('esito.txt', 'ok 7')).status).toBe(204);
    expect(await (await server.chiedi('GET', '/build/esito.txt')).text()).toBe('ok 7');
  });

  it('le icone col trattino nel nome si caricano e si scaricano', async () => {
    server = await nuovoServer();
    const carica = (nome: string) => server.chiedi('PUT', `/build/${nome}`, 'PNG', 'segreto-delle-build');
    expect((await carica('icona-57.png')).status).toBe(204);
    expect((await carica('icona-512.png')).status).toBe(204);
    expect(await (await server.chiedi('GET', '/build/icona-57.png')).text()).toBe('PNG');
    expect(await (await server.chiedi('GET', '/build/icona-512.png')).text()).toBe('PNG');
  });
});

describe('udid di un iPhone lontano', () => {
  it(`il profilo punta alla risposta, e la risposta tiene l'UDID e porta alla pagina che lo mostra`, async () => {
    server = await nuovoServer();
    const profilo = await server.chiedi('GET', '/udid/profilo');
    expect(profilo.headers.get('content-type')).toBe('application/x-apple-aspen-config');
    expect(await profilo.text()).toContain('<string>https://brufco.test/udid/risposta</string>');

    // Quello che manda iOS: un plist dentro una firma PKCS#7 (qui dei byte a caso intorno).
    const plist = `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
      <key>PRODUCT</key><string>iPhone14,7</string>
      <key>UDID</key><string>00008110-000A1B2C3D4E5F60</string>
      <key>VERSION</key><string>22A3354</string></dict></plist>`;
    const r = await server.chiedi('POST', '/udid/risposta', `FIRMA-${plist}-FIRMA`);
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toContain('udid=00008110-000A1B2C3D4E5F60');
    const salvati = [...server.file.oggetti.keys()].filter((k) => k.startsWith('udid/'));
    expect(salvati).toHaveLength(1);

    const fatto = await (await server.chiedi('GET', '/udid/fatto?udid=00008110-000A1B2C3D4E5F60')).text();
    expect(fatto).toContain('00008110-000A1B2C3D4E5F60');
    expect((await server.chiedi('POST', '/udid/risposta', 'niente')).status).toBe(400);
  });
});
