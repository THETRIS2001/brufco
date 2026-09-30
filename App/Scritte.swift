import SwiftUI
import UIKit

/// Il carattere delle scritte: quello di sistema, arrotondato e in grassetto.
/// Lo stesso sulla tela e nell'immagine finita, cosi' coincidono.
enum Scritture {
    static func carattere(corpo: CGFloat) -> UIFont {
        let dimensione = max(corpo, 1)
        let base = UIFont.systemFont(ofSize: dimensione, weight: .bold)
        guard let arrotondato = base.fontDescriptor.withDesign(.rounded) else { return base }
        return UIFont(descriptor: arrotondato, size: dimensione)
    }
}

/// Una scritta sulla tela. Si trascina col dito e si tocca per modificarla
/// (i gesti li mette l'editor).
struct VistaScritta: View {
    let scritta: Scritta
    let lato: CGFloat

    var body: some View {
        Text(scritta.testo.isEmpty ? "Aa" : scritta.testo)
            .font(Font(Scritture.carattere(corpo: scritta.dimensione * lato) as CTFont))
            .foregroundStyle(Color(uiColor: UIColor(esadecimale: scritta.colore)))
            .multilineTextAlignment(.center)
            .fixedSize()
            .padding(6)
            .contentShape(Rectangle())
    }
}

/// Il foglio per scrivere: testo, colore, grandezza.
struct FoglioScritta: View {
    @Binding var scritta: Scritta
    let elimina: () -> Void
    @Environment(\.dismiss) private var chiudi
    @FocusState private var scrivendo: Bool

    var body: some View {
        NavigationStack {
            Form {
                TextField("Scrivi qui", text: $scritta.testo, axis: .vertical)
                    .focused($scrivendo)
                ColorPicker(
                    "Colore",
                    selection: Binding(
                        get: { Color(uiColor: UIColor(esadecimale: scritta.colore)) },
                        set: { scritta.colore = UIColor($0).esadecimale }
                    ),
                    supportsOpacity: false
                )
                LabeledContent("Grandezza") {
                    Slider(value: $scritta.dimensione, in: 0.04 ... 0.2)
                }
                Section {
                    Button("Elimina la scritta", role: .destructive) {
                        elimina()
                        chiudi()
                    }
                }
            }
            .navigationTitle("Scritta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { chiudi() }
                }
            }
            .onAppear { scrivendo = true }
        }
        .presentationDetents([.medium])
    }
}

extension UIColor {
    /// Da "#RRGGBB".
    convenience init(esadecimale: String) {
        let valore = UInt64(esadecimale.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(
            red: CGFloat((valore >> 16) & 0xFF) / 255,
            green: CGFloat((valore >> 8) & 0xFF) / 255,
            blue: CGFloat(valore & 0xFF) / 255,
            alpha: 1
        )
    }

    /// In "#RRGGBB".
    var esadecimale: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        func canale(_ x: CGFloat) -> Int { Int((min(max(x, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", canale(r), canale(g), canale(b))
    }
}
