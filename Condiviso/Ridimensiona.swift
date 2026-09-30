import ImageIO
import UIKit

enum Ridimensiona {
    /// L'immagine di un file, gia' rimpicciolita a `pixel` sul lato lungo.
    /// ImageIO non decodifica mai l'originale intero: conta per il widget e per
    /// l'estensione delle notifiche, che hanno poca memoria.
    static func daFile(_ url: URL, pixel: Int) -> UIImage? {
        guard let sorgente = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let opzioni: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: pixel,
        ]
        guard let immagine = CGImageSourceCreateThumbnailAtIndex(sorgente, 0, opzioni as CFDictionary) else { return nil }
        return UIImage(cgImage: immagine)
    }
}
