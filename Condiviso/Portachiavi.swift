import Foundation
import Security

/// Chi sono su questo telefono: il token del server e i due nomi.
struct Sessione: Codable, Equatable {
    let token: String
    var io: Persona
    var altro: Persona?
}

/// La sessione nel portachiavi condiviso, che leggono anche il widget e
/// l'estensione delle notifiche. `AfterFirstUnlock` perche' il widget e le
/// notifiche lavorano anche a telefono bloccato.
enum Portachiavi {
    private static var base: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.marcorisa.brufco",
            kSecAttrAccount as String: "sessione",
            kSecAttrAccessGroup as String: Costanti.gruppoPortachiavi,
        ]
    }

    static func leggi() -> Sessione? {
        var domanda = base
        domanda[kSecReturnData as String] = true
        domanda[kSecMatchLimit as String] = kSecMatchLimitOne
        var risultato: AnyObject?
        guard SecItemCopyMatching(domanda as CFDictionary, &risultato) == errSecSuccess,
              let dati = risultato as? Data
        else { return nil }
        return try? JSONDecoder().decode(Sessione.self, from: dati)
    }

    static func scrivi(_ sessione: Sessione) {
        guard let dati = try? JSONEncoder().encode(sessione) else { return }
        let valori: [String: Any] = [
            kSecValueData as String: dati,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        if SecItemUpdate(base as CFDictionary, valori as CFDictionary) == errSecItemNotFound {
            var nuovo = base
            valori.forEach { nuovo[$0.key] = $0.value }
            SecItemAdd(nuovo as CFDictionary, nil)
        }
    }
}
