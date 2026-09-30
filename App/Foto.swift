import SwiftUI
import UIKit

enum SorgenteFoto: String, Identifiable {
    case libreria, fotocamera
    var id: String { rawValue }
}

/// Il selettore di Apple, con il suo ritaglio quadrato: si sceglie (o si
/// scatta) la foto e si decide quale quadrato tenere, come per la foto di un
/// contatto.
struct SelettoreFoto: UIViewControllerRepresentable {
    let sorgente: SorgenteFoto
    /// La foto scelta, o `nil` se si annulla: in tutti e due i casi chi lo
    /// mostra chiude il foglio.
    let fine: (UIImage?) -> Void

    func makeCoordinator() -> Coordinatore { Coordinatore(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let selettore = UIImagePickerController()
        selettore.sourceType = sorgente == .fotocamera ? .camera : .photoLibrary
        selettore.allowsEditing = true
        selettore.delegate = context.coordinator
        return selettore
    }

    func updateUIViewController(_ selettore: UIImagePickerController, context: Context) {}

    final class Coordinatore: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let genitore: SelettoreFoto

        init(_ genitore: SelettoreFoto) {
            self.genitore = genitore
        }

        func imagePickerController(
            _ selettore: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            genitore.fine((info[.editedImage] ?? info[.originalImage]) as? UIImage)
        }

        func imagePickerControllerDidCancel(_ selettore: UIImagePickerController) {
            genitore.fine(nil)
        }
    }
}

enum Foto {
    /// Quadrata (il centro, se il ritaglio non lo e' del tutto) e al massimo
    /// 2048 pixel: la foto che sta sotto il disegno.
    static func quadrata(_ foto: UIImage, massimo: CGFloat = 2048) -> UIImage {
        let corto = min(foto.size.width, foto.size.height)
        let pixel = min(corto * foto.scale, massimo)
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        formato.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: pixel, height: pixel), format: formato).image { _ in
            let scala = pixel / corto
            let larghezza = foto.size.width * scala
            let altezza = foto.size.height * scala
            foto.draw(in: CGRect(x: (pixel - larghezza) / 2, y: (pixel - altezza) / 2, width: larghezza, height: altezza))
        }
    }
}
