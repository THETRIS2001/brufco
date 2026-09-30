import UserNotifications
import WidgetKit

/// Parte a ogni notifica con l'anteprima (le push con `mutable-content`), anche
/// ad app chiusa: fa ricaricare il widget subito, e mette il disegno nella
/// notifica. E' la strada veloce e sicura; quella senza notifica passa dalle
/// push silenziose, che iOS consegna quando vuole.
final class NotificationService: UNNotificationServiceExtension {
    private var consegna: ((UNNotificationContent) -> Void)?
    private var contenuto: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        consegna = contentHandler
        contenuto = request.content.mutableCopy() as? UNMutableNotificationContent
        WidgetCenter.shared.reloadAllTimelines()

        let info = request.content.userInfo
        guard let id = info["disegno"] as? String, let versione = info["versione"] as? Int else {
            finisci()
            return
        }
        Task {
            if let dati = try? await API.scarica(.anteprima, id: id, versione: versione) {
                let file = FileManager.default.temporaryDirectory.appending(path: "\(id)-\(versione).jpg")
                if (try? dati.write(to: file)) != nil,
                   let allegato = try? UNNotificationAttachment(identifier: "disegno", url: file)
                {
                    contenuto?.attachments = [allegato]
                }
            }
            finisci()
        }
    }

    /// Il tempo e' finito: la notifica parte com'e', senza anteprima.
    override func serviceExtensionTimeWillExpire() {
        finisci()
    }

    private func finisci() {
        guard let consegna, let contenuto else { return }
        self.consegna = nil
        consegna(contenuto)
    }
}
