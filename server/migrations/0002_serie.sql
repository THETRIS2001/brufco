-- La serie: i giorni in cui ognuno ha mandato almeno un disegno, nuovo o
-- ritoccato. Una riga per persona e giorno (di Roma, 'AAAA-MM-GG'), e resta
-- anche se il disegno poi si elimina: la serie non si perde cancellando.
CREATE TABLE invii (
  persona_id TEXT NOT NULL REFERENCES persone(id),
  giorno TEXT NOT NULL,
  PRIMARY KEY (persona_id, giorno)
);

-- I disegni che ci sono gia': tutti del 30/09/2026, ora legale (+2).
INSERT OR IGNORE INTO invii (persona_id, giorno)
  SELECT autore_id, date(creato_at / 1000, 'unixepoch', '+2 hours') FROM disegni;
