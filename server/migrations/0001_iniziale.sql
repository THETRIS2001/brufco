-- BRU✈️FCO: due persone, i disegni che si mandano, e cosa mostra il widget
-- di ciascuno.

-- Le due persone della coppia. Il token si tiene solo come hash: quello vero
-- sta nel portachiavi del telefono.
CREATE TABLE IF NOT EXISTS persone (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  -- Il token APNs dell'app: notifiche e push silenziose.
  apns_token TEXT,
  -- Il token delle push dei widget (WidgetKit, solo da iOS 26).
  widget_token TEXT,
  creata_at INTEGER NOT NULL
);

-- I disegni. I file stanno su R2, sotto disegni/<id>/: anteprima.jpg (quella
-- del widget), documento.json (tratti e scritte, per riaprirlo) e, se c'e',
-- sfondo.jpg. `versione` sale a ogni modifica e fa da chiave per le cache.
CREATE TABLE IF NOT EXISTS disegni (
  id TEXT PRIMARY KEY,
  autore_id TEXT NOT NULL REFERENCES persone(id),
  creato_at INTEGER NOT NULL,
  modificato_at INTEGER NOT NULL,
  versione INTEGER NOT NULL DEFAULT 1,
  con_sfondo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_disegni_creato ON disegni(creato_at DESC);

-- Cosa mostra il widget di ciascuno: una riga per chi lo guarda.
CREATE TABLE IF NOT EXISTS widget (
  destinatario_id TEXT PRIMARY KEY REFERENCES persone(id),
  disegno_id TEXT NOT NULL REFERENCES disegni(id),
  impostato_at INTEGER NOT NULL
);
