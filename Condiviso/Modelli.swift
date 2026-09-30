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
