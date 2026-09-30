import PencilKit
import SwiftUI

/// Disegnare: tela quadrata, strumenti di PencilKit, foto sotto e scritte sopra.
struct Editor: View {
    /// Il disegno da modificare (e sostituire), o `nil` per uno nuovo.
    let originale: Disegno?

    @Environment(Modello.self) private var modello
    @Environment(\.dismiss) private var chiudi

    @State private var tratti = PKDrawing()
    @State private var scritte: [Scritta] = []
    /// Com'era il disegno all'apertura: per chiedere conferma solo se e' cambiato.
    @State private var trattiIniziali = PKDrawing()
    @State private var scritteIniziali: [Scritta] = []
    @State private var sfondo: UIImage?
    @State private var sfondoCambiato = false
    @State private var lato: CGFloat = 0
    @State private var caricato = false
    @State private var sorgenteFoto: SorgenteFoto?
    @State private var scrittaAperta: ScrittaAperta?
    /// Cresce quando la tela deve riprendersi il fuoco, e con lui gli strumenti.
    @State private var fuoco = 0
    @State private var chiediInvio = false
    @State private var chiediUscita = false
    @State private var inviando = false
    @State private var errore: String?

    private var vuoto: Bool { tratti.strokes.isEmpty && scritte.isEmpty && sfondo == nil }

    /// Gli strumenti di PencilKit solo quando non c'e' altro aperto: sopra la
    /// fotocamera ne coprivano i tasti (Marco, 30/09), e su iOS 18 le domande
    /// arrivano dal basso, proprio dove sta la barra.
    private var strumentiVisibili: Bool {
        sorgenteFoto == nil && scrittaAperta == nil && !chiediInvio && !chiediUscita && errore == nil
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let l = floor(geo.size.width - 32)
                VStack(spacing: 0) {
                    tela(l).frame(width: l, height: l)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
                .task(id: l) { await prepara(lato: l) }
            }
            .navigationTitle(originale == nil ? "Nuovo disegno" : "Modifica")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { barra }
            .disabled(inviando)
            .overlay {
                if inviando {
                    ProgressView("Invio…")
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }
        }
        .sheet(item: $sorgenteFoto, onDismiss: { fuoco += 1 }) { sorgente in
            SelettoreFoto(sorgente: sorgente) { foto in
                if let foto {
                    sfondo = Foto.quadrata(foto)
                    sfondoCambiato = true
                }
                sorgenteFoto = nil
            }
            .ignoresSafeArea()
        }
        .sheet(item: $scrittaAperta, onDismiss: chiusaScritta) { aperta in
            FoglioScritta(scritta: legame(aperta.id)) {
                scritte.removeAll { $0.id == aperta.id }
            }
        }
        .confirmationDialog("Mandarlo a \(modello.nomeAltro)?", isPresented: $chiediInvio, titleVisibility: .visible) {
            Button("Con notifica") { Task { await invia(notifica: true) } }
            Button("Senza notifica") { Task { await invia(notifica: false) } }
        } message: {
            Text(Testi.sceltaNotifica)
        }
        .confirmationDialog("Lasciare il disegno?", isPresented: $chiediUscita, titleVisibility: .visible) {
            Button("Lascia perdere", role: .destructive) { chiudi() }
        } message: {
            Text("Quello che hai fatto qui non si salva.")
        }
        .alert("Non è andata", isPresented: Binding(get: { errore != nil }, set: { if !$0 { errore = nil } })) {
            Button("OK") {}
        } message: {
            Text(errore ?? "")
        }
    }

    // MARK: - La tela

    private func tela(_ l: CGFloat) -> some View {
        ZStack {
            Color.white
            if let sfondo {
                Image(uiImage: sfondo)
                    .resizable()
                    .scaledToFill()
                    .frame(width: l, height: l)
                    .clipped()
            }
            TelaPencil(tratti: $tratti, strumenti: strumentiVisibili, fuoco: fuoco)
            ForEach($scritte) { $scritta in
                VistaScritta(scritta: scritta, lato: l)
                    .gesture(
                        DragGesture(coordinateSpace: .named("tela")).onChanged { movimento in
                            scritta.x = min(max(movimento.location.x / l, 0), 1)
                            scritta.y = min(max(movimento.location.y / l, 0), 1)
                        }
                    )
                    .onTapGesture { scrittaAperta = ScrittaAperta(id: scritta.id) }
                    .position(x: scritta.x * l, y: scritta.y * l)
            }
        }
        .coordinateSpace(.named("tela"))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color(.separator)))
    }

    @ToolbarContentBuilder
    private var barra: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Annulla") {
                if cambiato { chiediUscita = true } else { chiudi() }
            }
        }
        ToolbarItem(placement: .principal) {
            HStack(spacing: 24) {
                Menu {
                    Button("Libreria", systemImage: "photo.on.rectangle") { sorgenteFoto = .libreria }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Fotocamera", systemImage: "camera") { sorgenteFoto = .fotocamera }
                    }
                    if sfondo != nil {
                        Button("Togli la foto", systemImage: "trash", role: .destructive) {
                            sfondo = nil
                            sfondoCambiato = true
                        }
                    }
                } label: {
                    Label("Foto", systemImage: "photo")
                }
                Button { nuovaScritta() } label: {
                    Label("Scritta", systemImage: "textformat")
                }
            }
            .labelStyle(.iconOnly)
        }
        ToolbarItem(placement: .confirmationAction) {
            Button("Invia") { chiediInvio = true }
                .disabled(vuoto)
        }
    }

    // MARK: - Le scritte

    private func nuovaScritta() {
        let nuova = Scritta(testo: "", x: 0.5, y: 0.5, dimensione: 0.09, colore: "#111111")
        scritte.append(nuova)
        scrittaAperta = ScrittaAperta(id: nuova.id)
    }

    /// Una scritta lasciata vuota non resta sulla tela.
    private func chiusaScritta() {
        scritte.removeAll { $0.testo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        fuoco += 1
    }

    private func legame(_ id: UUID) -> Binding<Scritta> {
        Binding(
            get: { scritte.first { $0.id == id } ?? Scritta(testo: "", x: 0.5, y: 0.5, dimensione: 0.09, colore: "#111111") },
            set: { nuova in
                if let i = scritte.firstIndex(where: { $0.id == id }) { scritte[i] = nuova }
            }
        )
    }

    // MARK: - Aprire e mandare

    private var cambiato: Bool { sfondoCambiato || tratti != trattiIniziali || scritte != scritteIniziali }

    /// La tela ha preso la sua misura: la prima volta si apre il disegno da modificare.
    private func prepara(lato nuovo: CGFloat) async {
        guard nuovo > 0 else { return }
        if caricato, lato > 0, lato != nuovo {
            let scala = CGAffineTransform(scaleX: nuovo / lato, y: nuovo / lato)
            tratti = tratti.transformed(using: scala)
            trattiIniziali = trattiIniziali.transformed(using: scala)
        }
        lato = nuovo
        guard !caricato else { return }
        caricato = true
        guard let d = originale else { return }
        do {
            let dati = try await API.scarica(.documento, id: d.id, versione: d.versione)
            let documento = try JSONDecoder().decode(Documento.self, from: dati)
            tratti = try Composizione.tratti(da: documento, lato: nuovo)
            scritte = documento.testi
            trattiIniziali = tratti
            scritteIniziali = scritte
            if d.conSfondo {
                sfondo = UIImage(data: try await API.scarica(.sfondo, id: d.id, versione: d.versione))
            }
        } catch {
            errore = "Non riesco ad aprirlo: \(error.localizedDescription)"
        }
    }

    private func invia(notifica: Bool) async {
        guard lato > 0 else { return }
        inviando = true
        defer { inviando = false }
        do {
            let anteprima = Composizione.anteprima(tratti: tratti, lato: lato, scritte: scritte, sfondo: sfondo)
            let pacchetto = Pacchetto(
                documento: try Composizione.documento(tratti: tratti, lato: lato, scritte: scritte),
                anteprima: anteprima.jpegData(compressionQuality: 0.88) ?? Data(),
                sfondo: sfondoCambiato ? sfondo?.jpegData(compressionQuality: 0.85) : nil,
                togliSfondo: sfondoCambiato && sfondo == nil && originale?.conSfondo == true
            )
            try await modello.invia(pacchetto, sostituisce: originale?.id, notifica: notifica)
            chiudi()
        } catch {
            errore = error.localizedDescription
        }
    }
}

struct ScrittaAperta: Identifiable {
    let id: UUID
}
