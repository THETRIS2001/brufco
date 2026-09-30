import Foundation

struct Persona: Codable, Hashable, Identifiable {
    let id: String
    let nome: String
}

/// Un disegno come lo racconta il server. I file (anteprima, documento, foto)
/// si scaricano a parte, con la versione nell'URL.
struct Disegno: Codable, Hashable, Identifiable {
    let id: String
    let autoreId: String
    let creatoAt: Double
    let modificatoAt: Double
    let versione: Int
    let conSfondo: Bool

    var creato: Date { Date(timeIntervalSince1970: creatoAt / 1000) }
}

struct Stato: Codable {
    let io: Persona
    let altro: Persona?
    /// Il disegno che vedo io sul mio widget.
    let mioWidget: Disegno?
    /// Quello che vede l'altra persona sul suo.
    let suoWidget: Disegno?
    /// I giorni di fila in cui avete disegnato tutti e due: `nil` finche' si e' da soli.
    let serie: Serie?
}

/// La serie, come la calcola il server (i giorni sono quelli di Roma).
struct Serie: Codable, Hashable {
    /// Giorni di fila, oggi compreso se l'avete gia' fatto tutti e due.
    let giorni: Int
    let oggi: Oggi
    /// La serie piu' lunga di sempre.
    let record: Int
    /// L'ultima serie finita.
    let persa: Persa?

    struct Oggi: Codable, Hashable {
        let io: Bool
        let altro: Bool
    }

    struct Persa: Codable, Hashable {
        /// Il giorno in cui qualcuno non ha disegnato, "AAAA-MM-GG".
        let giorno: String
        /// Quanto era lunga.
        let durata: Int
        /// "io" e/o "altro": chi quel giorno non ha disegnato.
        let chi: [String]
    }
}

struct SulWidget: Codable {
    let disegno: Disegno?
    let autore: String?
}

/// Quello che serve per riaprire un disegno e continuarlo: i tratti di
/// PencilKit e le scritte, nello spazio `Costanti.latoDocumento`.
struct Documento: Codable {
    var formato = 1
    /// `PKDrawing.dataRepresentation()`, in base64.
    var tratti: String
    var testi: [Scritta]
}

/// Una scritta sopra il disegno. Posizione e grandezza sono frazioni del lato
/// della tela, cosi' restano giuste a qualunque dimensione.
struct Scritta: Codable, Hashable, Identifiable {
    var id = UUID()
    var testo: String
    /// Il centro della scritta, da 0 a 1.
    var x: Double
    var y: Double
    /// Il corpo del carattere, in frazione del lato.
    var dimensione: Double
    /// "#RRGGBB".
    var colore: String
}
