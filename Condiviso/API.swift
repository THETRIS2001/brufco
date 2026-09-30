import Foundation

/// Un errore detto dal server, col suo messaggio.
struct ErroreServer: LocalizedError {
    let messaggio: String
    let status: Int
    var errorDescription: String? { messaggio }
}

/// Quello che l'editor manda al server.
struct Pacchetto {
    /// Il `Documento` in JSON.
    let documento: Data
    /// L'immagine finita, quella del widget.
    let anteprima: Data
    /// Una foto nuova sotto il disegno, se e' cambiata.
    let sfondo: Data?
    /// La foto c'era, e adesso non c'e' piu'.
    let togliSfondo: Bool
}

/// Le rotte del server (server/src/index.ts). Il token si legge dal
/// portachiavi a ogni richiesta: app, widget e notifiche lo condividono.
enum API {
    enum Parte: String {
        case anteprima, documento, sfondo
    }

    private static let decodificatore: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private static func richiesta(
        _ metodo: String,
        _ percorso: String,
        query: [URLQueryItem] = [],
        autenticata: Bool = true
    ) -> URLRequest {
        var componenti = URLComponents(url: Costanti.server.appending(path: percorso), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { componenti.queryItems = query }
        var r = URLRequest(url: componenti.url!)
        r.httpMethod = metodo
        if autenticata, let token = Portachiavi.leggi()?.token {
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return r
    }

    private static func conCorpo<T: Encodable>(_ r: URLRequest, _ corpo: T) throws -> URLRequest {
        var r = r
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONEncoder().encode(corpo)
        return r
    }

    @discardableResult
    private static func esegui(_ r: URLRequest, caricando corpo: Data? = nil) async throws -> Data {
        let dati: Data
        let risposta: URLResponse
        if let corpo {
            (dati, risposta) = try await URLSession.shared.upload(for: r, from: corpo)
        } else {
            (dati, risposta) = try await URLSession.shared.data(for: r)
        }
        let status = (risposta as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(status) else {
            let messaggio = (try? JSONDecoder().decode([String: String].self, from: dati))?["errore"]
            throw ErroreServer(messaggio: messaggio ?? "Il server ha risposto \(status).", status: status)
        }
        return dati
    }

    private static func leggi<T: Decodable>(_ tipo: T.Type, _ r: URLRequest) async throws -> T {
        try decodificatore.decode(T.self, from: try await esegui(r))
    }

    // MARK: - Persone

    static func registra(nome: String, codice: String) async throws -> Sessione {
        struct Risposta: Decodable {
            let token: String
            let io: Persona
        }
        let r = try conCorpo(richiesta("POST", "persone", autenticata: false), ["nome": nome, "codice": codice])
        let risposta = try await leggi(Risposta.self, r)
        return Sessione(token: risposta.token, io: risposta.io, altro: nil)
    }

    static func stato() async throws -> Stato {
        try await leggi(Stato.self, richiesta("GET", "stato"))
    }

    /// Il token dell'app, per le notifiche e le push silenziose.
    static func tokenApp(_ token: String) async throws {
        try await esegui(conCorpo(richiesta("PUT", "dispositivo"), ["apns": token]))
    }

    /// Il token delle push dei widget (iOS 26); `nil` se non c'e' nessun widget.
    static func tokenWidget(_ token: String?) async throws {
        let corpo: [String: String?] = ["widget": token]
        try await esegui(conCorpo(richiesta("PUT", "dispositivo"), corpo))
    }

    // MARK: - Disegni

    static func disegni(prima: Double? = nil) async throws -> [Disegno] {
        struct Risposta: Decodable { let disegni: [Disegno] }
        let query = prima.map { [URLQueryItem(name: "prima", value: String(Int64($0)))] } ?? []
        return try await leggi(Risposta.self, richiesta("GET", "disegni", query: query)).disegni
    }

    /// Manda il disegno all'altra persona: nuovo, o al posto di `sostituisce`.
    static func invia(_ p: Pacchetto, sostituisce id: String?, notifica: Bool) async throws -> Disegno {
        struct Risposta: Decodable { let disegno: Disegno }
        let confine = "brufco-\(UUID().uuidString)"
        var corpo = Data()
        func campo(_ nome: String, _ valore: String) {
            corpo.aggiungi("--\(confine)\r\nContent-Disposition: form-data; name=\"\(nome)\"\r\n\r\n\(valore)\r\n")
        }
        func file(_ nome: String, _ tipo: String, _ dati: Data) {
            corpo.aggiungi("--\(confine)\r\nContent-Disposition: form-data; name=\"\(nome)\"; filename=\"\(nome)\"\r\n")
            corpo.aggiungi("Content-Type: \(tipo)\r\n\r\n")
            corpo.append(dati)
            corpo.aggiungi("\r\n")
        }
        file("documento", "application/json", p.documento)
        file("anteprima", "image/jpeg", p.anteprima)
        if let sfondo = p.sfondo { file("sfondo", "image/jpeg", sfondo) }
        if p.togliSfondo { campo("sfondo_via", "1") }
        campo("notifica", notifica ? "1" : "0")
        corpo.aggiungi("--\(confine)--\r\n")

        var r = richiesta(id == nil ? "POST" : "PUT", id.map { "disegni/\($0)" } ?? "disegni")
        r.setValue("multipart/form-data; boundary=\(confine)", forHTTPHeaderField: "Content-Type")
        let dati = try await esegui(r, caricando: corpo)
        return try decodificatore.decode(Risposta.self, from: dati).disegno
    }

    static func elimina(_ id: String) async throws {
        try await esegui(richiesta("DELETE", "disegni/\(id)"))
    }

    /// "Rendi attivo": lo rimanda sul widget dell'altra persona.
    static func rimanda(_ id: String, notifica: Bool) async throws {
        try await esegui(conCorpo(richiesta("POST", "disegni/\(id)/widget"), ["notifica": notifica]))
    }

    static func scarica(_ parte: Parte, id: String, versione: Int) async throws -> Data {
        let query = [URLQueryItem(name: "v", value: String(versione))]
        return try await esegui(richiesta("GET", "disegni/\(id)/\(parte.rawValue)", query: query))
    }

    /// Cosa c'e' sul mio widget.
    static func sulMioWidget() async throws -> SulWidget {
        try await leggi(SulWidget.self, richiesta("GET", "widget"))
    }
}

extension Data {
    mutating func aggiungi(_ testo: String) {
        append(Data(testo.utf8))
    }
}
