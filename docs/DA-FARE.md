# Cosa manca

Aggiornato al 30/09/2026. Chi chiude un punto lo toglie da qui nello stesso
commit; chi ne trova uno lo aggiunge.

La prima build ad hoc è pubblicata (30/09, build 202609302027): compila
pulita, firmata per il solo iPhone di Marco. Si installa da
https://brufco.clamafloro.workers.dev/installa. Le chiavi sono tutte al loro
posto (server e GitHub).

## 1. Il suo iPhone 14

- Lei apre in Safari **https://brufco.clamafloro.workers.dev/udid** e segue i
  tre passi (un profilo che non installa niente manda il codice del telefono).
  L'UDID compare a lei, da girare a Marco, e resta sul server (`udid/` su R2).
  Poi `node strumenti/apple.mjs dispositivo <UDID> "iPhone di ..."` e un tag:
  lo fa Claude, basta l'UDID (e la conferma di Marco che il telefono è il suo).

## 2. Prove sui due telefoni

- Iscrizione dei due (nome + codice), permesso per le notifiche.
- Un disegno su bianco e uno su foto (libreria e fotocamera), con scritte:
  l'immagine sul widget deve coincidere con la tela, scritte comprese.
- Invio con notifica: arriva la notifica con l'anteprima e il widget cambia
  subito. Senza notifica: il widget cambia da solo (quanto ci mette?).
- Widget piccolo e grande. **Su iOS 26** nella galleria deve comparire un solo
  BRU✈️FCO: se ne compaiono due, o nessuno, il trucco delle dimensioni vuote
  (`Widget/WidgetBRUFCO.swift`) va rivisto.
- Storico, "mettilo sul widget di…", modifica (sostituisce), eliminazione
  (il widget dell'altra persona torna al disegno precedente).
- Tema scuro: la tela deve restare bianca e i colori quelli scelti.

## 3. Scadenze

- **13/09/2027**: scade il certificato di distribuzione del team, e con lui
  l'app. Come rinnovare: README, "Scadenze".
