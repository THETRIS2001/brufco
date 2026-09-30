import SwiftUI
import UserNotifications
import WidgetKit

/// Le push: il token per il server, le push silenziose, le notifiche toccate.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Il token puo' cambiare: a ogni avvio lo si richiede, e va al server.
        if Portachiavi.leggi() != nil { application.registerForRemoteNotifications() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { try? await API.tokenApp(token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] registrazione non riuscita: \(error.localizedDescription)")
    }

    /// La push silenziosa: c'e' un disegno nuovo per il widget. `nonisolated`:
    /// il dizionario della push non passa nel contesto principale, ci passa
    /// solo l'aggiornamento del modello.
    nonisolated func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any]
    ) async -> UIBackgroundFetchResult {
        WidgetCenter.shared.reloadAllTimelines()
        await Modello.condiviso.aggiorna()
        return .newData
    }

    /// Una notifica arrivata con l'app aperta: si vede lo stesso, e lo storico si aggiorna.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        await Modello.condiviso.aggiorna()
        return [.banner, .list, .sound]
    }

    /// Toccata una notifica: si apre quel disegno.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let id = response.notification.request.content.userInfo["disegno"] as? String else { return }
        await Modello.condiviso.apri(disegno: id)
    }
}

enum Permessi {
    /// Le notifiche servono per quelle con l'anteprima; il token serve comunque.
    @MainActor static func notifiche() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        UIApplication.shared.registerForRemoteNotifications()
    }
}
