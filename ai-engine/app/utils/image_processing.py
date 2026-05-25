import io
import base64
import logging
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)


def prepare_receipt_image(
    raw_bytes: bytes,
    max_side_px: int = 1024,
    jpeg_quality: int = 85,
) -> tuple[bytes, str]:
    """
    Redimensiona, normaliza orientação EXIF e converte pra JPEG.
    Reduz dramaticamente a RAM consumida pelo Ollama Vision na VPS de 8GB.

    Retorna (jpeg_bytes, base64_str).
    """
    with Image.open(io.BytesIO(raw_bytes)) as img:
        img = ImageOps.exif_transpose(img)

        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        w, h = img.size
        longest = max(w, h)
        if longest > max_side_px:
            scale = max_side_px / longest
            new_size = (int(w * scale), int(h * scale))
            img = img.resize(new_size, Image.LANCZOS)
            logger.info(
                "resized image %dx%d -> %dx%d (max_side=%d)",
                w, h, new_size[0], new_size[1], max_side_px,
            )

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=jpeg_quality, optimize=True)
        jpeg_bytes = out.getvalue()

    b64 = base64.b64encode(jpeg_bytes).decode("ascii")
    return jpeg_bytes, b64
