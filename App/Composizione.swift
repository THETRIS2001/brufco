import PencilKit
import UIKit

/// Dall'editor al server: l'immagine finita e il documento per riaprirlo.
enum Composizione {
    /// L'immagine del widget, 1080×1080: foto, tratti, scritte.
    static func anteprima(tratti: PKDrawing, lato: CGFloat, scritte: [Scritta], sfondo: UIImage?) -> UIImage {
        let misura = CGSize(width: Costanti.latoAnteprima, height: Costanti.latoAnteprima)
        let area = CGRect(origin: .zero, size: misura)
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        formato.opaque = true
        let disegnati = chiaro {
            tratti.image(from: CGRect(x: 0, y: 0, width: lato, height: lato), scale: Costanti.latoAnteprima / lato)
        }
        return UIGraphicsImageRenderer(size: misura, format: formato).image { contesto in
            UIColor.white.setFill()
            contesto.fill(area)
            sfondo?.draw(in: area)
            disegnati.draw(in: area)
            for scritta in scritte { disegna(scritta, in: area) }
        }
    }

    /// PencilKit adatta i colori al tema: l'immagine si fa sempre col tema chiaro.
    private static func chiaro(_ fai: () -> UIImage) -> UIImage {
        var risultato = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent { risultato = fai() }
        return risultato
    }

    /// Come la disegna `VistaScritta`: centrata nel suo punto, senza andare a capo da sola.
    private static func disegna(_ s: Scritta, in area: CGRect) {
        guard !s.testo.isEmpty else { return }
        let paragrafo = NSMutableParagraphStyle()
        paragrafo.alignment = .center
        let testo = NSAttributedString(string: s.testo, attributes: [
            .font: Scritture.carattere(corpo: s.dimensione * area.width),
            .foregroundColor: UIColor(esadecimale: s.colore),
            .paragraphStyle: paragrafo,
        ])
        let libero = CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
        let misura = testo.boundingRect(with: libero, options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).size
        let riquadro = CGRect(
            x: s.x * area.width - misura.width / 2,
            y: s.y * area.height - misura.height / 2,
            width: ceil(misura.width),
            height: ceil(misura.height)
        )
        testo.draw(with: riquadro, options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
    }

    /// Tratti e scritte nello spazio del documento, uguale su ogni telefono.
    static func documento(tratti: PKDrawing, lato: CGFloat, scritte: [Scritta]) throws -> Data {
        let scala = Costanti.latoDocumento / lato
        let normalizzati = tratti.transformed(using: CGAffineTransform(scaleX: scala, y: scala))
        let documento = Documento(tratti: normalizzati.dataRepresentation().base64EncodedString(), testi: scritte)
        return try JSONEncoder().encode(documento)
    }

    /// Il contrario: i tratti di un documento, alla misura di questa tela.
    static func tratti(da documento: Documento, lato: CGFloat) throws -> PKDrawing {
        guard let dati = Data(base64Encoded: documento.tratti), !dati.isEmpty else { return PKDrawing() }
        let scala = lato / Costanti.latoDocumento
        return try PKDrawing(data: dati).transformed(using: CGAffineTransform(scaleX: scala, y: scala))
    }
}
