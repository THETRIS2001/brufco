import PencilKit
import SwiftUI

/// La tela di PencilKit con la sua barra degli strumenti: tutto nativo Apple.
struct TelaPencil: UIViewRepresentable {
    @Binding var tratti: PKDrawing
    /// La barra degli strumenti sta sopra a tutto, anche alla fotocamera e
    /// alle domande in basso, e sparisce da sola solo quando qualcun altro
    /// prende il fuoco (la fotocamera non lo prende): la si toglie a mano
    /// finche' c'e' altro aperto.
    let strumenti: Bool
    /// Quando cambia, la tela si riprende il fuoco (e la barra degli
    /// strumenti ricompare): serve dopo un foglio che l'ha tolto.
    let fuoco: Int

    func makeCoordinator() -> Coordinatore { Coordinatore(tratti: $tratti) }

    func makeUIView(context: Context) -> PKCanvasView {
        let tela = PKCanvasView()
        tela.drawingPolicy = .anyInput
        tela.backgroundColor = .clear
        tela.isOpaque = false
        tela.isScrollEnabled = false
        // I colori restano quelli scelti: PencilKit altrimenti li inverte col tema scuro.
        tela.overrideUserInterfaceStyle = .light
        tela.drawing = tratti
        tela.delegate = context.coordinator

        let barra = context.coordinator.barra
        barra.colorUserInterfaceStyle = .light
        barra.addObserver(tela)
        barra.setVisible(strumenti, forFirstResponder: tela)
        context.coordinator.visibili = strumenti
        context.coordinator.ultimoFuoco = fuoco
        if strumenti { DispatchQueue.main.async { tela.becomeFirstResponder() } }
        return tela
    }

    func updateUIView(_ tela: PKCanvasView, context: Context) {
        if tela.drawing != tratti { tela.drawing = tratti }
        let c = context.coordinator
        if c.visibili != strumenti {
            c.visibili = strumenti
            c.barra.setVisible(strumenti, forFirstResponder: tela)
            if strumenti {
                // Chi era aperto sta ancora sparendo: il fuoco si riprende dopo.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    if c.visibili { tela.becomeFirstResponder() }
                }
            } else {
                tela.resignFirstResponder()
            }
        }
        if c.ultimoFuoco != fuoco {
            c.ultimoFuoco = fuoco
            DispatchQueue.main.async {
                if c.visibili { tela.becomeFirstResponder() }
            }
        }
    }

    final class Coordinatore: NSObject, PKCanvasViewDelegate {
        let barra = PKToolPicker()
        var visibili = true
        var ultimoFuoco = 0
        private let tratti: Binding<PKDrawing>

        init(tratti: Binding<PKDrawing>) {
            self.tratti = tratti
        }

        func canvasViewDrawingDidChange(_ tela: PKCanvasView) {
            if tratti.wrappedValue != tela.drawing { tratti.wrappedValue = tela.drawing }
        }
    }
}
