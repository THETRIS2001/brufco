import SwiftUI

/// La schermata principale: i due widget, il mio e il suo, e lo storico.
struct Casa: View {
    @Environment(Modello.self) private var modello
    @State private var nuovo = false
    @State private var aperto: Disegno?

    private let colonne = [GridItem(.adaptive(minimum: 104), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let serie = modello.stato?.serie {
                        VistaSerie(serie: serie, nomeAltro: modello.nomeAltro)
                    }
                    // Quello che vedo io e quello che vede l'altra persona,
                    // affiancati: finche' lei non c'e', solo il mio.
                    if modello.altro != nil || modello.stato?.mioWidget != nil {
                        HStack(alignment: .top, spacing: 12) {
                            RiquadroWidget(titolo: "Sul tuo widget", disegno: modello.stato?.mioWidget) { aperto = $0 }
                            if modello.altro != nil {
                                RiquadroWidget(titolo: "Sul widget di \(modello.nomeAltro)", disegno: modello.stato?.suoWidget) { aperto = $0 }
                            }
                        }
                    }

                    if modello.disegni.isEmpty {
                        ContentUnavailableView {
                            Label("Ancora nessun disegno", systemImage: "scribble.variable")
                        } description: {
                            Text("Il primo che fai finisce sul widget di \(modello.nomeAltro).")
                        } actions: {
                            Button("Disegna") { nuovo = true }
                                .buttonStyle(.borderedProminent)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tutti i disegni").font(.headline)
                            LazyVGrid(columns: colonne, spacing: 8) {
                                ForEach(modello.disegni) { d in
                                    Button { aperto = d } label: {
                                        Miniatura(disegno: d)
                                            .overlay(alignment: .bottomLeading) {
                                                Text(modello.autore(di: d))
                                                    .font(.caption2.weight(.semibold))
                                                    .padding(.horizontal, 7)
                                                    .padding(.vertical, 3)
                                                    .background(.ultraThinMaterial, in: Capsule())
                                                    .padding(6)
                                            }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("BRU✈️FCO")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { nuovo = true } label: {
                        Label("Nuovo disegno", systemImage: "plus")
                    }
                }
            }
            .refreshable { await modello.aggiorna() }
            .navigationDestination(item: $aperto) { Dettaglio(disegno: $0) }
        }
        .fullScreenCover(isPresented: $nuovo) { Editor(originale: nil) }
        .task { await modello.aggiorna() }
        .onChange(of: modello.daAprire) { _, disegno in
            guard let disegno else { return }
            aperto = disegno
            modello.daAprire = nil
        }
    }
}

/// La serie: i giorni di fila, chi manca oggi, il record e di chi e' la colpa
/// dell'ultima finita.
struct VistaSerie: View {
    let serie: Serie
    let nomeAltro: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "flame.fill")
                .font(.title)
                .foregroundStyle(serie.giorni > 0 ? Color.orange : Color.secondary)
            VStack(alignment: .leading, spacing: 3) {
                Text(serie.giorni == 1 ? "1 giorno di fila" : "\(serie.giorni) giorni di fila")
                    .font(.headline)
                Text(oggi)
                    .font(.footnote)
                    .foregroundStyle(serie.oggi.io ? Color.secondary : Color.orange)
                if let persa {
                    Text(persa)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if serie.record > serie.giorni {
                VStack(spacing: 0) {
                    Text("\(serie.record)").font(.headline.monospacedDigit())
                    Text("record").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var oggi: String {
        switch (serie.oggi.io, serie.oggi.altro) {
        case (true, true): "Oggi fatto, tutti e due"
        case (true, false): "Oggi manca \(nomeAltro)"
        case (false, true): "Oggi manchi tu"
        case (false, false): "Oggi mancate tutti e due"
        }
    }

    /// "L'ultima (5 giorni) è finita ieri: colpa di Giulia".
    private var persa: String? {
        guard let p = serie.persa else { return nil }
        let colpa = switch (p.chi.contains("io"), p.chi.contains("altro")) {
        case (true, true): "colpa di tutti e due"
        case (true, false): "colpa tua"
        default: "colpa di \(nomeAltro)"
        }
        let durata = p.durata == 1 ? "1 giorno" : "\(p.durata) giorni"
        return "L'ultima (\(durata)) è finita \(quando(p.giorno)): \(colpa)"
    }

    private func quando(_ giorno: String) -> String {
        let lettore = DateFormatter()
        lettore.calendar = Calendar(identifier: .gregorian)
        lettore.locale = Locale(identifier: "en_US_POSIX")
        lettore.timeZone = TimeZone(identifier: "Europe/Rome")
        lettore.dateFormat = "yyyy-MM-dd HH:mm"
        guard let data = lettore.date(from: "\(giorno) 12:00") else { return "il \(giorno)" }
        if Calendar.current.isDateInYesterday(data) { return "ieri" }
        return "il " + data.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "it_IT")))
    }
}

/// Uno dei due widget in cima alla Home: il disegno che mostra, o un posto vuoto.
struct RiquadroWidget: View {
    let titolo: String
    let disegno: Disegno?
    let apri: (Disegno) -> Void
    @Environment(Modello.self) private var modello

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titolo)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if let disegno {
                Button { apri(disegno) } label: {
                    Miniatura(disegno: disegno, pixel: 540)
                }
                .buttonStyle(.plain)
                Text("\(modello.autore(di: disegno)) · \(disegno.creato.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Color(.secondarySystemBackground)
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        Text("Ancora niente")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Un disegno quadrato, dall'anteprima del server (in cache per versione).
struct Miniatura: View {
    let disegno: Disegno
    var pixel = 480
    @State private var immagine: UIImage?

    var body: some View {
        Color(.secondarySystemBackground)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let immagine {
                    Image(uiImage: immagine).resizable().scaledToFill()
                } else {
                    ProgressView()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .task(id: "\(disegno.id)-\(disegno.versione)-\(pixel)") {
                immagine = await Immagini.condivise.immagine(di: disegno, pixel: pixel)
            }
    }
}

/// Le anteprime: su disco una per versione, in memoria alla misura chiesta.
actor Immagini {
    static let condivise = Immagini()
    private let memoria = NSCache<NSString, UIImage>()
    private let cartella = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appending(path: "disegni", directoryHint: .isDirectory)

    func immagine(di d: Disegno, pixel: Int) async -> UIImage? {
        let chiave = "\(d.id)-\(d.versione)-\(pixel)" as NSString
        if let pronta = memoria.object(forKey: chiave) { return pronta }
        let file = cartella.appending(path: "\(d.id)-\(d.versione).jpg")
        if !FileManager.default.fileExists(atPath: file.path(percentEncoded: false)) {
            guard let dati = try? await API.scarica(.anteprima, id: d.id, versione: d.versione) else { return nil }
            try? FileManager.default.createDirectory(at: cartella, withIntermediateDirectories: true)
            try? dati.write(to: file)
        }
        guard let immagine = Ridimensiona.daFile(file, pixel: pixel) else { return nil }
        memoria.setObject(immagine, forKey: chiave)
        return immagine
    }
}
