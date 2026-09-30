import SwiftUI

@main
struct BRUFCOApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegato
    @State private var modello = Modello.condiviso

    var body: some Scene {
        WindowGroup {
            Group {
                if modello.sessione == nil {
                    Iscrizione()
                } else {
                    Casa()
                }
            }
            .environment(modello)
            .onOpenURL { modello.apri($0) }
        }
    }
}

enum Testi {
    static let sceltaNotifica =
        "Con la notifica il widget si aggiorna subito. Senza, lo trova quando guarda il widget: può metterci qualche minuto."
}
