import PencilKit
import SwiftUI

/// La tela di PencilKit con la sua barra degli strumenti: tutto nativo Apple.
struct TelaPencil: UIViewRepresentable {
    @Binding var tratti: PKDrawing
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

        let strumenti = context.coordinator.strumenti
        strumenti.colorUserInterfaceStyle = .light
        strumenti.addObserver(tela)
        strumenti.setVisible(true, forFirstResponder: tela)
        context.coordinator.ultimoFuoco = fuoco
        DispatchQueue.main.async { tela.becomeFirstResponder() }
        return tela
    }

    func updateUIView(_ tela: PKCanvasView, context: Context) {
        if tela.drawing != tratti { tela.drawing = tratti }
        if context.coordinator.ultimoFuoco != fuoco {
            context.coordinator.ultimoFuoco = fuoco
            DispatchQueue.main.async { tela.becomeFirstResponder() }
        }
    }

    final class Coordinatore: NSObject, PKCanvasViewDelegate {
        let strumenti = PKToolPicker()
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
