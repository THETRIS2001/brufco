import Observation
import SwiftUI
import WidgetKit

/// Lo stato dell'app: chi sono, l'altra persona, lo storico.
@MainActor
@Observable
final class Modello {
    static let condiviso = Modello()

    var sessione: Sessione? = Portachiavi.leggi()
    var stato: Stato?
    var disegni: [Disegno] = []
    var errore: String?
    /// Un disegno da aprire: arriva da un tocco sul widget o su una notifica.
    var daAprire: Disegno?

    var io: Persona? { sessione?.io }
    var altro: Persona? { stato?.altro ?? sessione?.altro }
    var nomeAltro: String { altro?.nome ?? "l'altra persona" }

    func eMio(_ d: Disegno) -> Bool { d.autoreId == io?.id }
    func autore(di d: Disegno) -> String { eMio(d) ? "Tu" : (altro?.nome ?? "…") }

    func entra(nome: String, codice: String) async throws {
        let nuova = try await API.registra(nome: nome, codice: codice)
        Portachiavi.scrivi(nuova)
        sessione = nuova
        WidgetCenter.shared.reloadAllTimelines()
        await Permessi.notifiche()
        await aggiorna()
    }

    func aggiorna() async {
        guard sessione != nil else { return }
        do {
            async let s = API.stato()
            async let d = API.disegni()
            let (nuovoStato, nuoviDisegni) = try await (s, d)
            stato = nuovoStato
            disegni = nuoviDisegni
            // I nomi restano anche nel portachiavi: li legge il widget.
            if var s = sessione, s.io != nuovoStato.io || s.altro != nuovoStato.altro {
                s.io = nuovoStato.io
                s.altro = nuovoStato.altro
                Portachiavi.scrivi(s)
                sessione = s
            }
            errore = nil
        } catch {
            errore = error.localizedDescription
        }
    }

    func invia(_ pacchetto: Pacchetto, sostituisce id: String?, notifica: Bool) async throws {
        _ = try await API.invia(pacchetto, sostituisce: id, notifica: notifica)
        await aggiorna()
    }

    func rimanda(_ d: Disegno, notifica: Bool) async throws {
        try await API.rimanda(d.id, notifica: notifica)
        await aggiorna()
    }

    func elimina(_ d: Disegno) async throws {
        try await API.elimina(d.id)
        await aggiorna()
    }

    /// brufco://disegno/<id>, dal widget.
    func apri(_ url: URL) {
        guard url.scheme == "brufco", url.host() == "disegno", let id = url.pathComponents.last, id != "/" else { return }
        Task { await apri(disegno: id) }
    }

    func apri(disegno id: String) async {
        if !disegni.contains(where: { $0.id == id }) { await aggiorna() }
        daAprire = disegni.first { $0.id == id }
    }
}
