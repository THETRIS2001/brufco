# BRU✈️FCO: regole di lavoro

- **Cosa manca**: `docs/DA-FARE.md`. Si legge prima di cominciare; chi chiude un
  punto lo toglie, chi ne trova uno lo aggiunge, nello stesso commit.
- **Il repository è pubblico.** Niente nomi di persone oltre a Marco, niente
  Team ID, id di chiavi o certificati, UDID o profili: stanno in
  `strumenti/locale.json` e `firma/` (ignorati da git) e nei segreti. Prima di
  ogni commit: `git grep` di quello che non deve esserci. Nei log della build
  (pubblici) non si stampa l'uscita di xcodebuild.
- **Tutto nativo Apple** (Marco): SwiftUI, PencilKit, WidgetKit. Niente
  librerie di terzi nell'app.
- **Niente Mac**: lo Swift si compila solo su GitHub Actions (un tag
  `adhoc-*`), e gli errori si leggono da
  `https://brufco.clamafloro.workers.dev/build/esito.txt`. Le API si
  controllano sulla documentazione Apple, non a memoria.
- **Il progetto Xcode è `project.yml`** (XcodeGen): Info.plist ed entitlements
  si cambiano lì.
- **Server**: `cd server && npx tsc --noEmit && npx vitest run` prima di ogni
  `npx wrangler deploy`, in catena con `&&` e senza filtrare l'uscita dei test.
- **"Pubblicare"** vuol dire: commit, deploy del server se è cambiato, e un tag
  `adhoc-*` se è cambiata l'app.
- **Domande sempre a scelta multipla**, cliccabili. **Commit** con la riga
  `Co-Authored-By` di Claude.
- **Mai** stampare segreti: le chiavi le consegna Marco con
  `node strumenti/chiavi.mjs`. Sul team Apple si crea solo quello che serve a
  quest'app.
