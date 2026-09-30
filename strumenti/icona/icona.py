"""L'icona dell'app dal logo di Marco (strumenti/icona/logo.png).

    python strumenti/icona/icona.py

1024x1024, senza trasparenza (Apple la rifiuta), su bianco pieno. iOS
arrotonda gli angoli dell'icona, e il logo arriva fino ai bordi: qui si cerca
la scala piu' grande per cui niente del disegno finisce fuori dagli angoli,
con un po' di margine. Il fondo quasi bianco dell'originale diventa bianco
pieno, cosi' non si vede dove finisce il logo.
"""
from pathlib import Path

from PIL import Image

QUI = Path(__file__).resolve().parent
USCITA = QUI.parents[1] / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'icona.png'
LATO = 1024
# Il raggio degli angoli di iOS e' circa il 22% del lato; con le curve
# continue Apple taglia un po' prima di un arco semplice: si tiene il 25%.
RAGGIO = 0.25 * LATO
MARGINE = 10
BIANCO = 250


def pulito(logo):
    """Il fondo quasi bianco diventa bianco pieno."""
    logo = logo.convert('RGB')
    pixel = logo.load()
    for y in range(logo.height):
        for x in range(logo.width):
            if min(pixel[x, y]) >= BIANCO:
                pixel[x, y] = (255, 255, 255)
    return logo


def punti_del_disegno(logo, passo=4):
    """I pixel che non sono fondo, uno ogni `passo`: basta per il controllo."""
    pixel = logo.load()
    return [(x, y) for y in range(0, logo.height, passo) for x in range(0, logo.width, passo) if min(pixel[x, y]) < BIANCO]


def dentro(x, y):
    """Il punto (sull'icona) sta dentro il quadrato ad angoli arrotondati, col margine?"""
    r = RAGGIO + MARGINE
    cx = min(max(x, r), LATO - r)
    cy = min(max(y, r), LATO - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= RAGGIO**2 and MARGINE <= x <= LATO - MARGINE and MARGINE <= y <= LATO - MARGINE


def scala_massima(logo, punti):
    basso, alto = 0.5, 1.0
    for _ in range(20):
        prova = (basso + alto) / 2
        misura = LATO * prova
        spostamento = (LATO - misura) / 2
        fattore = misura / logo.width
        if all(dentro(spostamento + x * fattore, spostamento + y * fattore) for x, y in punti):
            basso = prova
        else:
            alto = prova
    return basso


logo = pulito(Image.open(QUI / 'logo.png'))
quota = scala_massima(logo, punti_del_disegno(logo))
misura = round(LATO * quota)
icona = Image.new('RGB', (LATO, LATO), (255, 255, 255))
icona.paste(logo.resize((misura, misura), Image.LANCZOS), ((LATO - misura) // 2, (LATO - misura) // 2))
icona.save(USCITA, optimize=True)
print(f'{USCITA} {icona.size} {icona.mode}, logo al {quota:.0%}')
