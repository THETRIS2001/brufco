import SwiftUI

/// La schermata principale: il disegno che ho sul widget, e lo storico.
struct Casa: View {
    @Environment(Modello.self) private var modello
    @State private var nuovo = false
    @State private var aperto: Disegno?

    private let colonne = [GridItem(.adaptive(minimum: 104), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let sulWidget = modello.stato?.mioWidget {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sul tuo widget").font(.headline)
                            Button { aperto = sulWidget } label: {
                                Miniatura(disegno: sulWidget, pixel: 1080)
                            }
                            .buttonStyle(.plain)
                            Text("\(modello.autore(di: sulWidget)) · \(sulWidget.creato.formatted(.relative(presentation: .named)))")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
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
