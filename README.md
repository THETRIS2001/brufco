# BRU✈️FCO

Un'app per due: si disegna, su bianco o sopra una foto, si manda, e il disegno
compare sul widget dell'iPhone dell'altra persona. È un regalo, installato ad
hoc sui due telefoni: niente App Store.

Cosa manca, in ordine: [`docs/DA-FARE.md`](docs/DA-FARE.md).

## Come funziona

- **App iOS** (iOS 18 e seguenti), tutta nativa: SwiftUI, PencilKit con la sua
  barra degli strumenti, WidgetKit. Tela quadrata; sotto una foto (libreria o
  fotocamera, col ritaglio quadrato di Apple), sopra le scritte (SwiftUI,
  spostabili col dito). Si salvano due cose: l'immagine finita, 1080×1080,
  per widget e notifiche, e il documento (tratti di PencilKit + scritte, in
  uno spazio 1000×1000 uguale su ogni telefono) per riaprirlo e modificarlo.
- **Server**: un Worker Cloudflare (`server/`) con D1 (le due persone, i
  disegni, cosa mostra ogni widget) e R2 (i file). Le rotte stanno in testa a
  `server/src/index.ts`. `https://brufco.clamafloro.workers.dev`
- **Le regole**: il widget di ognuno mostra l'ultimo disegno mandato
  dall'altro; a ogni invio si sceglie se con la notifica o senza; dallo
  storico "mettilo sul widget di…" rimanda un disegno qualsiasi; si modificano
  (sostituendoli) e si eliminano solo i propri.
- **Le push**, dirette ad APNs:
  - *con notifica*: l'estensione Notifiche si sveglia sempre, mette il disegno
    nella notifica e ricarica il widget. Pochi secondi;
  - *senza notifica*: push silenziosa all'app, e da iOS 26 anche la push dei
    widget. iOS le consegna quando vuole: di solito presto, ma senza
    garanzie. In più il widget si ricontrolla da solo ogni mezz'ora.
- **Niente App Group**: sul team non si possono creare (l'API di Apple non lo
  permette). App, widget e notifiche si passano la sessione dal portachiavi
  condiviso, e il widget si scarica il disegno da solo.
- **Il widget, due volte**: le push dei widget esistono solo da iOS 26, e
  WidgetKit non permette di dichiarare un widget in due modi a seconda
  dell'iOS. Ce ne sono due (`disegno` e `disegno-push`), e su iOS 26 il
  primo non offre dimensioni: nella galleria ne resta uno. Da verificare sul
  telefono (`docs/DA-FARE.md`).

## Il progetto Xcode

Non c'è un Mac: il progetto si genera da `project.yml` con XcodeGen, sul Mac
di GitHub Actions. Info.plist ed entitlements li scrive XcodeGen, e non
stanno nel repository. Target: `BRUFCO` (app), `Widget`, `Notifiche`; il
codice comune in `Condiviso/`. L'icona viene dal logo in `strumenti/icona/`
(`python strumenti/icona/icona.py`).

## Build e installazione

```bash
git tag adhoc-$(date +%Y%m%d-%H%M) && git push origin main --tags
```

La build (`.github/workflows/ios.yml`, gratis perché il repository è
pubblico) genera il progetto, firma coi segreti del repository e carica tutto
sul server. Dall'iPhone, in Safari:
**https://brufco.clamafloro.workers.dev/installa**. Com'è andata:
`/build/esito.txt` ("ok <numero>", o gli errori di compilazione, senza nomi).
Un'installazione nuova sostituisce la vecchia, e i disegni restano.

**Il repository è pubblico, i segreti no.** Identificativi del team, chiavi,
certificato, telefoni e profili stanno fuori: in `strumenti/locale.json`
(sul PC, ignorato da git), nei segreti del Worker e in quelli di GitHub.
Li consegnano due script:

- `node strumenti/chiavi.mjs`: le chiavi vere (APNs, certificato), il codice
  della coppia e il permesso di caricare le build. Lo lancia chi le possiede.
- `node strumenti/apple.mjs`: App ID, push e profili ad hoc (anche nei
  segreti `PROFILO_*` della build).

## I telefoni

Solo quelli di `firma/dispositivi.json` (sul PC, fuori dal repository)
installano l'app. Un iPhone nuovo:

```bash
node strumenti/apple.mjs dispositivo <UDID> "iPhone di ..."
```

registra il telefono sul team e rifà i tre profili; poi un tag. L'UDID, senza
cavo: dall'iPhone, in Safari, **https://brufco.clamafloro.workers.dev/udid**
(un profilo che non installa niente fa mandare al server il codice del
telefono, e lo mostra anche a chi lo manda). Oppure da Windows con l'iPhone
collegato via USB:

```powershell
Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like "USB\VID_05AC*" }
```

L'ultimo pezzo dell'`InstanceId` è l'UDID senza trattino: dagli iPhone XS in
poi il trattino va rimesso dopo i primi otto caratteri.

Nell'app ci si iscrive col proprio nome e il codice della coppia. Su un
telefono nuovo, stesso nome e stesso codice: si ritrova la propria persona.

## Scadenze

Il certificato di distribuzione del team, e con lui i profili, scade il
**13/09/2027**: da lì l'app non si apre più. Prima di quella data: un
certificato nuovo, il suo id in `strumenti/locale.json`,
`node strumenti/apple.mjs`, `node strumenti/chiavi.mjs`, un tag, e si
reinstalla dalla pagina.
