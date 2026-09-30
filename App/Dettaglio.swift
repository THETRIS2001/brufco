import SwiftUI

/// Un disegno dello storico: rimandarlo, modificarlo, eliminarlo, condividerlo.
struct Dettaglio: View {
    let disegno: Disegno
    @Environment(Modello.self) private var modello
    @Environment(\.dismiss) private var chiudi
    @State private var immagine: UIImage?
    @State private var chiediInvio = false
    @State private var chiediEliminazione = false
    @State private var modifica = false
    @State private var inCorso = false
    @State private var errore: String?

    /// Dopo una modifica ha una versione nuova: si legge dal modello.
    private var attuale: Disegno { modello.disegni.first { $0.id == disegno.id } ?? disegno }
    private var mio: Bool { modello.eMio(attuale) }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Miniatura(disegno: attuale, pixel: 1080)
                Text("\(modello.autore(di: attuale)) · \(attuale.creato.formatted(date: .abbreviated, time: .shortened))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if modello.stato?.suoWidget?.id == attuale.id {
                    Label("È sul widget di \(modello.nomeAltro)", systemImage: "checkmark.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Button { chiediInvio = true } label: {
                    Label("Mettilo sul widget di \(modello.nomeAltro)", systemImage: "paperplane")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(modello.altro == nil || inCorso)
                if mio {
                    Button { modifica = true } label: {
                        Label("Modifica", systemImage: "pencil.tip")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
            }
            .padding()
        }
        .navigationTitle(mio ? "Il tuo disegno" : "Da \(modello.nomeAltro)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    if let immagine {
                        let foto = Image(uiImage: immagine)
                        ShareLink(item: foto, preview: SharePreview("Disegno", image: foto))
                    }
                    if mio {
                        Button("Elimina", systemImage: "trash", role: .destructive) { chiediEliminazione = true }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Mandarlo a \(modello.nomeAltro)?", isPresented: $chiediInvio, titleVisibility: .visible) {
            Button("Con notifica") { Task { await rimanda(notifica: true) } }
            Button("Senza notifica") { Task { await rimanda(notifica: false) } }
        } message: {
            Text(Testi.sceltaNotifica)
        }
        .confirmationDialog("Eliminare il disegno?", isPresented: $chiediEliminazione, titleVisibility: .visible) {
            Button("Elimina", role: .destructive) { Task { await elimina() } }
        } message: {
            Text("Sparisce anche dallo storico di \(modello.nomeAltro).")
        }
        .fullScreenCover(isPresented: $modifica) { Editor(originale: attuale) }
        .alert("Non è andata", isPresented: Binding(get: { errore != nil }, set: { if !$0 { errore = nil } })) {
            Button("OK") {}
        } message: {
            Text(errore ?? "")
        }
        .task(id: attuale.versione) {
            immagine = await Immagini.condivise.immagine(di: attuale, pixel: 1080)
        }
    }

    private func rimanda(notifica: Bool) async {
        inCorso = true
        defer { inCorso = false }
        do { try await modello.rimanda(attuale, notifica: notifica) } catch { errore = error.localizedDescription }
    }

    private func elimina() async {
        inCorso = true
        defer { inCorso = false }
        do {
            try await modello.elimina(attuale)
            chiudi()
        } catch {
            errore = error.localizedDescription
        }
    }
}
