import SwiftUI

/// La prima volta: il proprio nome e il codice della coppia.
struct Iscrizione: View {
    @Environment(Modello.self) private var modello
    @State private var nome = ""
    @State private var codice = ""
    @State private var inCorso = false
    @State private var errore: String?

    private var pronto: Bool {
        !nome.trimmingCharacters(in: .whitespaces).isEmpty && !codice.isEmpty && !inCorso
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Il tuo nome", text: $nome)
                        .textContentType(.givenName)
                    TextField("Codice della coppia", text: $codice)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } footer: {
                    Text("Il codice ve lo siete dati voi due: serve solo adesso. Maiuscole e spazi non contano.")
                }
                if let errore {
                    Section {
                        Text(errore).foregroundStyle(.red)
                    }
                }
                Section {
                    Button {
                        Task { await entra() }
                    } label: {
                        HStack {
                            Text("Entra")
                            Spacer()
                            if inCorso { ProgressView() }
                        }
                    }
                    .disabled(!pronto)
                }
            }
            .navigationTitle("BRU✈️FCO")
        }
    }

    private func entra() async {
        inCorso = true
        defer { inCorso = false }
        do {
            try await modello.entra(nome: nome.trimmingCharacters(in: .whitespaces), codice: codice)
        } catch {
            errore = error.localizedDescription
        }
    }
}
