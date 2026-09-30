# Cosa manca

Aggiornato al 30/09/2026. Chi chiude un punto lo toglie da qui nello stesso
commit; chi ne trova uno lo aggiunge.

## 1. Marco, una volta sola

- **`node strumenti/chiavi.mjs`**, nella cartella BRUFCO: consegna le chiavi al
  server e a GitHub, senza niente da incollare. Chiede solo il codice della
  coppia: con Invio lo inventa lui, lo mostra alla fine e lo tiene in
  `chiavi/codice-coppia.txt` (fuori dal repository).
- **Il suo iPhone 14**: lei apre in Safari
  **https://brufco.clamafloro.workers.dev/udid** e segue i tre passi (un
  profilo che non installa niente manda il codice del telefono). L'UDID
  compare a lei, da girare a Marco, e resta sul server (`udid/` su R2). Poi
  `node strumenti/apple.mjs dispositivo <UDID> "iPhone di ..."` e un tag:
  lo fa Claude, basta l'UDID.

## 2. La prima build

- Lo Swift non è mai stato compilato: la prima build quasi certamente riporta
  errori. Si leggono da `/build/esito.txt`, si correggono, nuovo tag.

## 3. Prove sui due telefoni

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

## 4. Scadenze

- **13/09/2027**: scade il certificato di distribuzione del team, e con lui
  l'app. Come rinnovare: README, "Scadenze".
