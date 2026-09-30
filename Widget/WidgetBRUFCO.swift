import SwiftUI
import WidgetKit

/// Il widget: l'ultimo disegno che ti ha mandato l'altra persona, a tutta
/// superficie, piccolo o grande.
///
/// DUE DICHIARAZIONI, UN WIDGET. Le push dei widget esistono solo da iOS 26
/// (`pushHandler`), e il costruttore dei widget ammette un `if #available`
/// ma non il suo `else`. Allora: il widget di sempre (`tipoWidget`) e, da
/// iOS 26, quello con le push (`tipoWidgetConPush`); su iOS 26 il primo non
/// offre nessuna dimensione, cosi' nella galleria ne compare uno solo.

private let dimensioni: [WidgetFamily] = [.systemSmall, .systemLarge]

private var conPushDeiWidget: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
}

@MainActor
private func configurazione(tipo: String) -> some WidgetConfiguration {
    StaticConfiguration(kind: tipo, provider: Fornitore()) { voce in
        VistaWidget(voce: voce)
    }
    .configurationDisplayName("BRU✈️FCO")
    .description("L'ultimo disegno che ti hanno mandato.")
    .contentMarginsDisabled()
}

struct WidgetDisegno: Widget {
    var body: some WidgetConfiguration {
        configurazione(tipo: Costanti.tipoWidget)
            .supportedFamilies(conPushDeiWidget ? [] : dimensioni)
    }
}

@available(iOS 26.0, *)
struct WidgetDisegnoConPush: Widget {
    var body: some WidgetConfiguration {
        configurazione(tipo: Costanti.tipoWidgetConPush)
            .supportedFamilies(dimensioni)
            .pushHandler(GestorePushWidget.self)
    }
}

/// Il token delle push dei widget va al server, che lo usa per i disegni
/// mandati senza notifica. Senza widget sulla schermata, niente token.
@available(iOS 26.0, *)
struct GestorePushWidget: WidgetPushHandler {
    func pushTokenDidChange(_ pushInfo: WidgetPushInfo, widgets: [WidgetInfo]) {
        let token = pushInfo.token.map { String(format: "%02x", $0) }.joined()
        let serve = !widgets.isEmpty
        Task { try? await API.tokenWidget(serve ? token : nil) }
    }
}

@main
struct WidgetBRUFCO: WidgetBundle {
    var body: some Widget {
        WidgetDisegno()
        if #available(iOS 26.0, *) {
            WidgetDisegnoConPush()
        }
    }
}

// MARK: - Dati

struct Voce: TimelineEntry {
    enum Condizione {
        case disegno, vuoto, daIscrivere, errore
    }

    let date: Date
    let condizione: Condizione
    var immagine: UIImage?
    var disegnoId: String?
}

struct Fornitore: TimelineProvider {
    func placeholder(in context: Context) -> Voce {
        Voce(date: .now, condizione: .vuoto)
    }

    func getSnapshot(in context: Context, completion: @escaping (Voce) -> Void) {
        completion(Archivio.ultima() ?? Voce(date: .now, condizione: .vuoto))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Voce>) -> Void) {
        Task {
            let voce = await Archivio.aggiorna()
            // Il grosso lo fanno le push; ogni mezz'ora un controllo, se non arrivano.
            completion(Timeline(entries: [voce], policy: .after(.now.addingTimeInterval(30 * 60))))
        }
    }
}

/// L'ultimo disegno scaricato, nella cache del widget: cosi' il widget ha
/// sempre qualcosa da mostrare, anche senza rete.
enum Archivio {
    private struct Info: Codable {
        let id: String
        let versione: Int
    }

    private static let cartella = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appending(path: "widget", directoryHint: .isDirectory)
    private static let fileInfo = cartella.appending(path: "ultimo.json")

    private static func file(_ info: Info) -> URL {
        cartella.appending(path: "\(info.id)-\(info.versione).jpg")
    }

    static func aggiorna() async -> Voce {
        guard Portachiavi.leggi() != nil else { return Voce(date: .now, condizione: .daIscrivere) }
        do {
            guard let d = try await API.sulMioWidget().disegno else {
                try? FileManager.default.removeItem(at: cartella)
                return Voce(date: .now, condizione: .vuoto)
            }
            let info = Info(id: d.id, versione: d.versione)
            if !FileManager.default.fileExists(atPath: file(info).path(percentEncoded: false)) {
                let dati = try await API.scarica(.anteprima, id: d.id, versione: d.versione)
                try? FileManager.default.removeItem(at: cartella)
                try FileManager.default.createDirectory(at: cartella, withIntermediateDirectories: true)
                try dati.write(to: file(info))
            }
            try JSONEncoder().encode(info).write(to: fileInfo)
            return voce(info) ?? Voce(date: .now, condizione: .errore)
        } catch {
            return ultima() ?? Voce(date: .now, condizione: .errore)
        }
    }

    static func ultima() -> Voce? {
        guard let dati = try? Data(contentsOf: fileInfo), let info = try? JSONDecoder().decode(Info.self, from: dati) else { return nil }
        return voce(info)
    }

    private static func voce(_ info: Info) -> Voce? {
        guard let immagine = Ridimensiona.daFile(file(info), pixel: 1100) else { return nil }
        return Voce(date: .now, condizione: .disegno, immagine: immagine, disegnoId: info.id)
    }
}

// MARK: - Vista

struct VistaWidget: View {
    let voce: Voce

    var body: some View {
        contenuto
            .containerBackground(for: .widget) {
                if let immagine = voce.immagine {
                    Image(uiImage: immagine)
                        .resizable()
                        .widgetAccentedRenderingMode(.fullColor)
                        .scaledToFill()
                } else {
                    Color(.systemBackground)
                }
            }
            .widgetURL(URL(string: voce.disegnoId.map { "brufco://disegno/\($0)" } ?? "brufco://"))
    }

    @ViewBuilder
    private var contenuto: some View {
        switch voce.condizione {
        case .disegno:
            Color.clear
        case .vuoto:
            messaggio("Ancora nessun disegno", simbolo: "scribble.variable")
        case .daIscrivere:
            messaggio("Apri BRU✈️FCO per cominciare", simbolo: "hand.wave")
        case .errore:
            messaggio("Non riesco a caricarlo", simbolo: "wifi.exclamationmark")
        }
    }

    private func messaggio(_ testo: String, simbolo: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: simbolo).font(.title2)
            Text(testo).font(.caption).multilineTextAlignment(.center)
        }
        .foregroundStyle(.secondary)
        .padding()
    }
}
