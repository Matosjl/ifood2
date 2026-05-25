"""
Gera uma imagem JPG sintética simulando um cupom fiscal brasileiro.
Útil pra testar o pipeline OCR sem precisar tirar foto de cupom real.

Uso:
    python test/generate_sample.py
    # cria test/sample-receipt.jpg
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent / "sample-receipt.jpg"


def _font(size: int):
    candidates = [
        "C:/Windows/Fonts/consola.ttf",   # Consolas (Windows)
        "C:/Windows/Fonts/cour.ttf",      # Courier New (Windows)
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",  # Linux
        "/System/Library/Fonts/Menlo.ttc",  # Mac
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generate():
    W, H = 600, 1000
    img = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(img)

    f_lg = _font(22)
    f_md = _font(16)
    f_sm = _font(14)

    lines = [
        ("ATACADAO PRAIA REAL LTDA",        f_lg, "center"),
        ("CNPJ: 12.345.678/0001-90",         f_sm, "center"),
        ("Av. Beira Mar, 1500 - Praia Real", f_sm, "center"),
        ("", f_sm, "left"),
        ("CUPOM FISCAL ELETRONICO",          f_md, "center"),
        ("Data: 24/05/2026  14:32",          f_sm, "center"),
        ("Cupom: 000147832",                  f_sm, "center"),
        ("", f_sm, "left"),
        ("--------------------------------",   f_sm, "left"),
        ("ITEM    DESCRICAO          QT  TOTAL", f_sm, "left"),
        ("--------------------------------",   f_sm, "left"),
        ("001 COCA COLA 2L PET     12   102,00", f_sm, "left"),
        ("002 OLEO SOJA 900ML        6    43,50", f_sm, "left"),
        ("003 ARROZ T1 5KG            4    79,80", f_sm, "left"),
        ("004 FEIJAO CARIOCA 1KG     8    71,20", f_sm, "left"),
        ("005 ACUCAR REFINADO 1KG  10    49,90", f_sm, "left"),
        ("006 FARINHA TRIGO 1KG     5    27,45", f_sm, "left"),
        ("007 SAL REFINADO 1KG       3     8,85", f_sm, "left"),
        ("008 OVOS BRANCO 30UN       2    35,80", f_sm, "left"),
        ("009 LEITE INTEGRAL 1L     12    68,00", f_sm, "left"),
        ("--------------------------------",   f_sm, "left"),
        ("", f_sm, "left"),
        ("TOTAL ........... R$ 487,50",        f_md, "right"),
        ("FORMA PAGTO ..... PIX",               f_sm, "right"),
        ("", f_sm, "left"),
        ("Obrigado pela preferencia!",         f_sm, "center"),
    ]

    y = 30
    line_h = 28
    for txt, font, align in lines:
        if not txt:
            y += line_h // 2
            continue
        bbox = draw.textbbox((0, 0), txt, font=font)
        tw = bbox[2] - bbox[0]
        if align == "center":
            x = (W - tw) // 2
        elif align == "right":
            x = W - tw - 30
        else:
            x = 30
        draw.text((x, y), txt, fill="black", font=font)
        y += line_h

    img.save(OUT, format="JPEG", quality=92)
    print(f"created: {OUT}  ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    generate()
