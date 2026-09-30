import CoreGraphics
import Foundation

enum Costanti {
    /// Il server: la cartella server/ di questo repository.
    static let server = URL(string: "https://brufco.clamafloro.workers.dev")!

    /// Il gruppo del portachiavi che app, widget e notifiche condividono.
    ///
    /// Niente App Group: sul team non si possono creare (l'API di Apple non lo
    /// permette), mentre i profili ad hoc portano gia' `keychain-access-groups`
    /// per tutto il team. Il valore, col prefisso del team, lo scrive Xcode
    /// nell'Info.plist di ogni target (`GruppoPortachiavi`, project.yml): lo
    /// stesso degli entitlements.
    static let gruppoPortachiavi = Bundle.main.object(forInfoDictionaryKey: "GruppoPortachiavi") as? String ?? ""

    /// Il widget di sempre, e quello con le push dei widget, che esiste solo da
    /// iOS 26 (vedi Widget/WidgetBRUFCO.swift).
    static let tipoWidget = "disegno"
    static let tipoWidgetConPush = "disegno-push"

    /// Il lato, in pixel, dell'immagine che va sul widget e nelle notifiche.
    static let latoAnteprima: CGFloat = 1080

    /// Il lato dello spazio in cui si salvano tratti e scritte: uguale su ogni
    /// telefono, cosi' un disegno fatto su un iPhone si riapre giusto sull'altro.
    static let latoDocumento: CGFloat = 1000
}
