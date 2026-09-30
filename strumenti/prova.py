"""Disegni di prova per BRU✈️FCO, come se li mandasse lei.

    python strumenti/prova.py guarda                    le immagini in build/prova/, senza mandare niente
    python strumenti/prova.py manda cuore               un disegno, con la notifica
    python strumenti/prova.py manda volo --senza-notifica
    python strumenti/prova.py via                       toglie la persona di prova e i suoi disegni

I disegni passano dal server vero (POST /disegni), come quelli fatti
nell'app: arrivano la notifica con l'anteprima, la push del widget e quella
silenziosa. Sono immagini fatte qui; i tratti (PencilKit) restano vuoti, e
va bene: un disegno lo riapre nell'editor solo chi l'ha fatto.

LA PERSONA DI PROVA ("Lei") OCCUPA IL SECONDO POSTO DELLA COPPIA: va tolta
(`via`) prima che lei si iscriva, se no il server le risponde che la coppia
e' gia' completa. Il suo token sta in chiavi/prova.json, fuori dal repository.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import random
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

SERVER = 'https://brufco.clamafloro.workers.dev'
RADICE = Path(__file__).resolve().parent.parent
PROVA = RADICE / 'chiavi' / 'prova.json'
NOME = 'Lei'

LATO = 1080  # come l'anteprima che fa l'app (Costanti.latoAnteprima)
SS = 2  # si disegna al doppio e si rimpicciolisce: bordi morbidi

NERO = '#1c1c1e'
ROSSO = '#ff3b30'
BLU = '#0a84ff'
ROSA = '#ff6b9a'
GIALLO = '#ffcc00'
VERDE = '#34c759'
BIANCO = '#ffffff'
BLU_NOTTE = '#1d3557'


# ---------------------------------------------------------------- disegno

def font_a_mano(corpo: float) -> ImageFont.FreeTypeFont:
    for nome in ('Inkfree.ttf', 'segoepr.ttf'):
        try:
            return ImageFont.truetype(f'C:/Windows/Fonts/{nome}', round(corpo * SS))
        except OSError:
            pass
    return ImageFont.load_default(round(corpo * SS))


def liscia(punti: list[tuple[float, float]], passi: int = 10) -> list[tuple[float, float]]:
    """Catmull-Rom: pochi punti diventano una curva morbida che ci passa sopra."""
    if len(punti) < 3:
        return punti
    p = [punti[0], *punti, punti[-1]]
    fuori = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for s in range(passi):
            t = s / passi
            fuori.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3)
                for k in (0, 1)
            ))
    fuori.append(punti[-1])
    return fuori


def cuore(cx: float, cy: float, s: float, da: float = 0.0, a: float = 2 * math.pi, n: int = 140):
    """La curva del cuore: parte dalla fossetta in alto, la punta e' in basso a cy + 17s."""
    punti = []
    for i in range(n + 1):
        t = da + (a - da) * i / n
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        punti.append((cx + s * x, cy + s * y))
    return punti


class Tela:
    def __init__(self, sfondo: Image.Image | None = None, seme: int = 1):
        grande = (LATO * SS, LATO * SS)
        self.img = sfondo.convert('RGB').resize(grande, Image.LANCZOS) if sfondo else Image.new('RGB', grande, BIANCO)
        self.d = ImageDraw.Draw(self.img)
        self.caso = random.Random(seme)

    def tremola(self, punti, ampiezza: float = 2.5):
        """La mano non e' un righello: uno scostamento lento lungo il tratto."""
        f1, f2 = self.caso.uniform(0.05, 0.12), self.caso.uniform(0.15, 0.3)
        g1, g2 = self.caso.uniform(0, 6), self.caso.uniform(0, 6)
        return [
            (x + ampiezza * math.sin(f1 * i + g1), y + ampiezza * math.sin(f2 * i + g2))
            for i, (x, y) in enumerate(punti)
        ]

    def tratto(self, punti, colore: str, larghezza: float = 10, tremolio: float = 2.0, liscio: bool = True):
        if liscio:
            punti = liscia(punti)
        punti = self.tremola(punti, tremolio) if tremolio else punti
        n = len(punti)
        for i in range(n - 1):
            # Piu' sottile all'inizio e alla fine, come quando si appoggia la penna.
            f = i / max(1, n - 2)
            w = larghezza * SS * (0.72 + 0.28 * math.sin(math.pi * f))
            (x0, y0), (x1, y1) = punti[i], punti[i + 1]
            self.d.line([(x0 * SS, y0 * SS), (x1 * SS, y1 * SS)], fill=colore, width=max(1, round(w)))
            r = w / 2
            self.d.ellipse([x1 * SS - r, y1 * SS - r, x1 * SS + r, y1 * SS + r], fill=colore)

    def pieno(self, punti, colore: str):
        self.d.polygon([(x * SS, y * SS) for x, y in punti], fill=colore)

    def cerchio(self, cx, cy, r, colore: str, larghezza: float = 8, pieno: str | None = None):
        punti = [(cx + r * math.cos(t / 40 * 2 * math.pi), cy + r * math.sin(t / 40 * 2 * math.pi)) for t in range(42)]
        if pieno:
            self.pieno(punti, pieno)
        self.tratto(punti, colore, larghezza, tremolio=0.8, liscio=False)

    def scritta(self, testo: str, x: float, y: float, corpo: float, colore: str, angolo: float = 0):
        font = font_a_mano(corpo)
        if not angolo:
            self.d.text((x * SS, y * SS), testo, font=font, fill=colore, anchor='mm')
            return
        strato = Image.new('RGBA', self.img.size, (0, 0, 0, 0))
        ImageDraw.Draw(strato).text((x * SS, y * SS), testo, font=font, fill=colore, anchor='mm')
        strato = strato.rotate(angolo, center=(x * SS, y * SS), resample=Image.BICUBIC)
        self.img.paste(strato, (0, 0), strato)

    def jpeg(self) -> bytes:
        buf = io.BytesIO()
        self.img.resize((LATO, LATO), Image.LANCZOS).save(buf, 'JPEG', quality=88)
        return buf.getvalue()


def jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.convert('RGB').save(buf, 'JPEG', quality=88)
    return buf.getvalue()


# ---------------------------------------------------------------- i disegni

def disegno_cuore() -> dict:
    t = Tela(seme=3)
    # Il cuore grande, chiuso a mano: parte un po' prima e finisce un po' dopo.
    t.tratto(cuore(540, 400, 21, -0.1, 2 * math.pi + 0.14), ROSSO, 16, tremolio=5, liscio=False)
    for cx, cy, s in ((120, 120, 3.8), (975, 330, 3.0), (900, 740, 3.8), (150, 640, 2.8)):
        t.pieno(cuore(cx, cy, s), ROSA)
    t.scritta('ti penso', 540, 880, 150, BLU_NOTTE, angolo=4)
    return {'anteprima': t.jpeg()}


def atomium(t: Tela, cx: float, cy: float, s: float):
    """Il cubo visto lungo la diagonale: nove sfere, i tubi sugli spigoli e dal centro."""
    b = -math.atan(1 / math.sqrt(2))
    punti = {}
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (-1, 1):
                x1, y1 = x * math.cos(math.pi / 4) - y * math.sin(math.pi / 4), x * math.sin(math.pi / 4) + y * math.cos(math.pi / 4)
                y2 = y1 * math.cos(b) - z * math.sin(b)
                punti[(x, y, z)] = (cx + s * x1, cy - s * y2)
    basso = min(punti.values(), key=lambda p: -p[1])
    for gamba in ((-0.9, 0), (0, 0), (0.9, 0)):
        t.tratto([basso, (basso[0] + gamba[0] * s, basso[1] + 1.1 * s)], NERO, 5, tremolio=0.8)
    for a, pa in punti.items():
        t.tratto([(cx, cy), pa], NERO, 5, tremolio=0.8)
        for b2, pb in punti.items():
            if sum(1 for k in range(3) if a[k] != b2[k]) == 1 and a < b2:
                t.tratto([pa, pb], NERO, 5, tremolio=0.8)
    for x, y in [*punti.values(), (cx, cy)]:
        t.cerchio(x, y, 0.3 * s, NERO, 5, pieno='#dfe6ee')


def colosseo(t: Tela, x0: float, base: float, largo: float, alto: float):
    """Tre ordini di archi e l'attico, col lato destro mangiato dal tempo."""
    piani = 3
    h = alto / (piani + 0.6)
    archi = 6
    passo = largo / archi
    t.tratto([(x0, base), (x0 + largo, base)], NERO, 6)
    t.tratto([(x0, base), (x0, base - alto)], NERO, 6)
    # Il bordo in alto: pieno a sinistra, a gradini a destra.
    t.tratto([
        (x0, base - alto), (x0 + largo * 0.55, base - alto), (x0 + largo * 0.62, base - alto + h * 0.6),
        (x0 + largo * 0.8, base - alto + h * 0.8), (x0 + largo * 0.84, base - h * 2), (x0 + largo, base - h * 1.7),
        (x0 + largo, base),
    ], NERO, 6, liscio=False)
    for p in range(piani):
        y_basso = base - p * h
        riga_su = base - (p + 1) * h
        if p:
            fine = x0 + (largo if p < 2 else largo * 0.84)
            t.tratto([(x0, y_basso), (fine, y_basso)], NERO, 4)
        for a in range(archi):
            if p == 2 and a > 4:
                continue
            ax = x0 + a * passo + passo * 0.22
            larghezza = passo * 0.56
            cima = riga_su + h * 0.22
            arco = [(ax, y_basso - 2), (ax, cima + larghezza / 2)]
            for k in range(1, 12):
                ang = math.pi - math.pi * k / 12
                arco.append((ax + larghezza / 2 + larghezza / 2 * math.cos(ang), cima + larghezza / 2 - larghezza / 2 * math.sin(ang)))
            arco += [(ax + larghezza, cima + larghezza / 2), (ax + larghezza, y_basso - 2)]
            t.tratto(arco, NERO, 4, tremolio=0.6, liscio=False)
    for a in range(4):
        fx = x0 + largo * 0.06 + a * largo * 0.13
        t.tratto([(fx, base - alto + h * 0.2), (fx + largo * 0.05, base - alto + h * 0.2), (fx + largo * 0.05, base - alto + h * 0.45), (fx, base - alto + h * 0.45), (fx, base - alto + h * 0.2)], NERO, 3, tremolio=0.4, liscio=False)


def aereo(t: Tela, x: float, y: float, s: float, angolo: float, colore: str):
    forma = [(1.0, 0), (0.75, 0.09), (0.15, 0.1), (-0.25, 0.62), (-0.42, 0.62), (-0.2, 0.1), (-0.62, 0.1), (-0.8, 0.34),
             (-0.92, 0.34), (-0.82, 0), (-0.92, -0.34), (-0.8, -0.34), (-0.62, -0.1), (-0.2, -0.1), (-0.42, -0.62),
             (-0.25, -0.62), (0.15, -0.1), (0.75, -0.09)]
    c, sn = math.cos(angolo), math.sin(angolo)
    t.pieno([(x + s * (px * c - py * sn), y + s * (px * sn + py * c)) for px, py in forma], colore)


def disegno_volo() -> dict:
    t = Tela(seme=5)
    atomium(t, 215, 610, 78)
    colosseo(t, 690, 820, 300, 230)
    t.scritta('BRU', 215, 900, 96, NERO)
    t.scritta('FCO', 840, 900, 96, NERO)
    # La rotta: una parabola tratteggiata, e l'aereo a meta' strada.
    a, c, b = (250, 440), (540, 70), (830, 520)

    def bezier(u):
        return ((1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1])

    passi = [bezier(i / 400) for i in range(401)]
    lunghezza, tratto_on = 0.0, []
    for i in range(1, len(passi)):
        lunghezza += math.dist(passi[i - 1], passi[i])
        if (lunghezza // 26) % 2 == 0:
            tratto_on.append(passi[i])
        elif tratto_on:
            if len(tratto_on) > 1:
                t.tratto(tratto_on, BLU, 6, tremolio=0, liscio=False)
            tratto_on = []
    u = 0.58
    px, py = bezier(u)
    dx, dy = 2 * (1 - u) * (c[0] - a[0]) + 2 * u * (b[0] - c[0]), 2 * (1 - u) * (c[1] - a[1]) + 2 * u * (b[1] - c[1])
    t.cerchio(px, py, 62, BIANCO, 2, pieno=BIANCO)
    aereo(t, px, py, 58, math.atan2(dy, dx), BLU)
    t.pieno(cuore(868, 540, 3.2), ROSSO)
    t.scritta('conto i giorni', 540, 1010, 84, ROSSO, angolo=-2)
    return {'anteprima': t.jpeg()}


def foto_tramonto() -> Image.Image:
    """Una "foto" di un tramonto sul mare: cielo, sole, riflesso, costa, grana."""
    orizzonte = 640
    colonna = Image.new('RGB', (1, LATO))
    cielo = [(0.0, (38, 40, 102)), (0.45, (196, 88, 110)), (0.8, (246, 146, 86)), (1.0, (255, 214, 140))]
    mare = [(0.0, (120, 70, 96)), (0.3, (62, 50, 96)), (1.0, (22, 24, 58))]

    def sfuma(tappe, f):
        for (f0, c0), (f1, c1) in zip(tappe, tappe[1:]):
            if f <= f1:
                k = (f - f0) / (f1 - f0)
                return tuple(round(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
        return tappe[-1][1]

    for y in range(LATO):
        colonna.putpixel((0, y), sfuma(cielo, y / orizzonte) if y < orizzonte else sfuma(mare, (y - orizzonte) / (LATO - orizzonte)))
    img = colonna.resize((LATO, LATO), Image.BILINEAR)

    luce = Image.new('RGB', (LATO, LATO))
    dl = ImageDraw.Draw(luce)
    dl.ellipse([540 - 230, 610 - 230, 540 + 230, 610 + 230], fill=(120, 60, 20))
    luce = luce.filter(ImageFilter.GaussianBlur(90))
    img = ImageChops.screen(img, luce)
    ImageDraw.Draw(img).ellipse([540 - 92, 608 - 92, 540 + 92, 608 + 92], fill=(255, 226, 170))

    caso = random.Random(11)
    riflesso = Image.new('RGB', (LATO, LATO))
    dr = ImageDraw.Draw(riflesso)
    for i in range(170):
        y = orizzonte + 4 + (i ** 1.35) * 0.9
        if y > LATO:
            break
        mezza = max(8, 150 - i * 0.7) * caso.uniform(0.3, 1.0)
        x = 540 + caso.gauss(0, 20 + i * 0.5)
        dr.line([(x - mezza, y), (x + mezza, y)], fill=(250, 170, 90) if i % 3 else (255, 220, 150), width=caso.choice((2, 3, 4)))
    img = ImageChops.screen(img, riflesso.filter(ImageFilter.GaussianBlur(1.2)))

    costa = [(0, orizzonte)]
    for x in range(0, LATO + 20, 20):
        alto = 18 + 30 * math.exp(-((x - 180) / 150) ** 2) + 12 * math.exp(-((x - 930) / 90) ** 2) + caso.uniform(0, 5)
        costa.append((x, orizzonte - alto))
    costa += [(LATO, orizzonte), (LATO, orizzonte + 3), (0, orizzonte + 3)]
    ImageDraw.Draw(img).polygon(costa, fill=(40, 26, 58))

    grana = Image.effect_noise((LATO, LATO), 18).convert('RGB')
    img = Image.blend(img, ImageChops.overlay(img, grana), 0.25)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def disegno_tramonto() -> dict:
    foto = foto_tramonto()
    t = Tela(foto, seme=9)
    t.scritta('buonanotte', 540, 170, 140, BIANCO, angolo=3)
    for cx, cy, r in ((170, 330, 26), (880, 300, 32), (760, 110, 20), (300, 110, 18)):
        stella = []
        for k in range(11):
            ang = -math.pi / 2 + k * math.pi / 5
            rr = r if k % 2 == 0 else r * 0.45
            stella.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
        t.tratto(stella, BIANCO, 5, tremolio=0.5, liscio=False)
    for bx, by, s in ((330, 420, 24), (390, 380, 18), (700, 440, 20)):
        t.tratto([(bx - s, by), (bx - s / 2, by - s / 2), (bx, by), (bx + s / 2, by - s / 2), (bx + s, by)], BIANCO, 4, tremolio=0.3)
    t.tratto(cuore(540, 830, 5.5, -0.1, 2 * math.pi + 0.12), BIANCO, 9, tremolio=1.2, liscio=False)
    return {'anteprima': t.jpeg(), 'sfondo': jpeg(foto)}


def disegno_noi() -> dict:
    t = Tela(seme=13)
    # Il sole, in un angolo come nei disegni di quando si era piccoli.
    t.cerchio(150, 150, 62, '#f5a300', 8, pieno=GIALLO)
    for k in range(10):
        ang = k * 2 * math.pi / 10 + 0.2
        t.tratto([(150 + 84 * math.cos(ang), 150 + 84 * math.sin(ang)), (150 + 118 * math.cos(ang), 150 + 118 * math.sin(ang))], '#f5a300', 7, tremolio=0.5)
    t.tratto([(40, 860), (200, 850), (380, 866), (560, 852), (760, 868), (940, 850), (1040, 860)], VERDE, 9)
    # Lui.
    t.cerchio(390, 400, 56, NERO, 8)
    t.tratto([(390, 456), (392, 660)], NERO, 9)
    t.tratto([(392, 660), (340, 845)], NERO, 9)
    t.tratto([(392, 660), (446, 845)], NERO, 9)
    t.tratto([(390, 520), (320, 600)], NERO, 9)
    t.tratto([(390, 520), (470, 575), (528, 590)], NERO, 9)
    for ox in (-18, 18):
        t.cerchio(390 + ox, 392, 5, NERO, 5, pieno=NERO)
    t.tratto([(368, 420), (390, 434), (412, 420)], NERO, 5)
    # Lei.
    t.cerchio(690, 405, 52, NERO, 8)
    for k in range(7):
        ang = math.pi + k * math.pi / 6
        x, y = 690 + 58 * math.cos(ang), 400 + 58 * math.sin(ang)
        t.tratto([(x, y), (x + 10 * math.cos(ang + 1.2), y + 10 * math.sin(ang + 1.2)), (x + 4 * math.cos(ang), y + 16 * math.sin(ang))], '#8e5a2b', 7, tremolio=0.4)
    t.tratto([(634, 405), (626, 470), (636, 520)], '#8e5a2b', 8)
    t.tratto([(746, 405), (754, 470), (744, 520)], '#8e5a2b', 8)
    t.pieno([(690, 470), (608, 700), (772, 700)], ROSA)
    t.tratto([(690, 470), (608, 700), (772, 700), (690, 470)], NERO, 6, liscio=False, tremolio=0.8)
    t.tratto([(662, 700), (656, 845)], NERO, 9)
    t.tratto([(718, 700), (724, 845)], NERO, 9)
    t.tratto([(676, 520), (600, 575), (538, 590)], NERO, 9)
    t.tratto([(704, 520), (770, 600)], NERO, 9)
    for ox in (-17, 17):
        t.cerchio(690 + ox, 397, 5, NERO, 5, pieno=NERO)
    t.tratto([(670, 424), (690, 438), (710, 424)], NERO, 5)
    # Il palloncino a cuore, legato alle mani.
    t.tratto([(533, 588), (520, 480), (548, 380), (530, 300)], NERO, 4)
    t.pieno(cuore(530, 205, 5.4), ROSSO)
    t.scritta('noi due', 540, 975, 120, BLU_NOTTE, angolo=-3)
    return {'anteprima': t.jpeg()}


DISEGNI = {
    'cuore': disegno_cuore,
    'volo': disegno_volo,
    'tramonto': disegno_tramonto,
    'noi': disegno_noi,
}


# ---------------------------------------------------------------- server

def chiedi(metodo: str, percorso: str, token: str, corpo: bytes | None = None, tipo: str | None = None):
    intestazioni = {'Authorization': f'Bearer {token}', 'User-Agent': 'brufco-prova'}
    if tipo:
        intestazioni['Content-Type'] = tipo
    richiesta = urllib.request.Request(SERVER + percorso, data=corpo, headers=intestazioni, method=metodo)
    try:
        with urllib.request.urlopen(richiesta, timeout=60) as r:
            testo = r.read()
            return r.status, (json.loads(testo) if testo else None)
    except urllib.error.HTTPError as e:
        testo = e.read()
        try:
            return e.code, json.loads(testo)
        except ValueError:
            return e.code, {'errore': testo[:200].decode('utf8', 'replace')}


def d1(sql: str) -> None:
    with tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf8') as f:
        f.write(sql)
    try:
        r = subprocess.run(
            f'npx wrangler d1 execute brufco --remote --file "{f.name}"',
            cwd=RADICE / 'server', shell=True, capture_output=True, text=True, encoding='utf8',
        )
        if r.returncode != 0:
            sys.exit(f'D1 non ha risposto: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.returncode}')
    finally:
        Path(f.name).unlink(missing_ok=True)


def persona_di_prova() -> dict:
    """Quella di chiavi/prova.json se il server la conosce ancora; se no una nuova."""
    if PROVA.exists():
        prova = json.loads(PROVA.read_text('utf8'))
        stato, _ = chiedi('GET', '/stato', prova['token'])
        if stato == 200:
            return prova
    prova = {'id': str(uuid.uuid4()), 'token': secrets.token_urlsafe(32)}
    hash_ = hashlib.sha256(prova['token'].encode()).hexdigest()
    # Solo se c'e' posto: se lei si e' gia' iscritta non si entra.
    d1(
        "INSERT INTO persone (id, nome, token_hash, creata_at) "
        f"SELECT '{prova['id']}', '{NOME}', '{hash_}', {int(time.time() * 1000)} "
        "WHERE (SELECT COUNT(*) FROM persone) < 2;"
    )
    stato, _ = chiedi('GET', '/stato', prova['token'])
    if stato != 200:
        sys.exit('La coppia e\' gia\' completa: niente persona di prova.')
    PROVA.parent.mkdir(exist_ok=True)
    PROVA.write_text(json.dumps(prova), 'utf8')
    print(f'Persona di prova "{NOME}" creata.')
    return prova


def modulo(campi: dict[str, str], file: dict[str, tuple[str, str, bytes]]) -> tuple[bytes, str]:
    confine = 'brufco-prova-' + secrets.token_hex(12)
    parti = [f'--{confine}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode() for n, v in campi.items()]
    for nome, (nome_file, tipo, dati) in file.items():
        parti.append(
            f'--{confine}\r\nContent-Disposition: form-data; name="{nome}"; filename="{nome_file}"\r\n'
            f'Content-Type: {tipo}\r\n\r\n'.encode() + dati + b'\r\n'
        )
    parti.append(f'--{confine}--\r\n'.encode())
    return b''.join(parti), f'multipart/form-data; boundary={confine}'


def manda(nome: str, notifica: bool) -> None:
    prova = persona_di_prova()
    parti = DISEGNI[nome]()
    documento = json.dumps({'formato': 1, 'tratti': '', 'testi': []}).encode()
    file = {'documento': ('documento', 'application/json', documento), 'anteprima': ('anteprima', 'image/jpeg', parti['anteprima'])}
    if 'sfondo' in parti:
        file['sfondo'] = ('sfondo', 'image/jpeg', parti['sfondo'])
    corpo, tipo = modulo({'notifica': '1' if notifica else '0'}, file)
    stato, risposta = chiedi('POST', '/disegni', prova['token'], corpo, tipo)
    if stato != 201:
        sys.exit(f'Non e\' andata ({stato}): {risposta}')
    print(f'Mandato "{nome}" {"con" if notifica else "senza"} notifica.')


def via() -> None:
    if not PROVA.exists():
        print('Nessuna persona di prova.')
        return
    prova = json.loads(PROVA.read_text('utf8'))
    stato, risposta = chiedi('GET', '/disegni', prova['token'])
    if stato == 200:
        # Ognuno col DELETE vero: il server pulisce R2 e rimette a posto il widget dell'altro.
        for d in risposta['disegni']:
            if d['autore_id'] == prova['id']:
                chiedi('DELETE', f"/disegni/{d['id']}", prova['token'])
    d1(
        f"DELETE FROM widget WHERE destinatario_id = '{prova['id']}'; "
        f"DELETE FROM invii WHERE persona_id = '{prova['id']}'; "
        f"DELETE FROM persone WHERE id = '{prova['id']}';"
    )
    PROVA.unlink()
    print(f'Persona di prova "{NOME}" tolta, coi suoi disegni. Il posto e\' di nuovo libero.')


def guarda() -> None:
    cartella = RADICE / 'build' / 'prova'
    cartella.mkdir(parents=True, exist_ok=True)
    for nome, fai in DISEGNI.items():
        (cartella / f'{nome}.jpg').write_bytes(fai()['anteprima'])
    print(f'Immagini in {cartella}')


if __name__ == '__main__':
    argomenti = sys.argv[1:]
    comando = argomenti[0] if argomenti else ''
    if comando == 'guarda':
        guarda()
    elif comando == 'manda' and len(argomenti) > 1 and argomenti[1] in DISEGNI:
        manda(argomenti[1], '--senza-notifica' not in argomenti)
    elif comando == 'via':
        via()
    else:
        sys.exit(__doc__)
