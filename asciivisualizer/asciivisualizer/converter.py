from __future__ import annotations

from io import BytesIO
import ipaddress
from pathlib import PurePosixPath
import re
import socket
from typing import Any
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import warnings

from PIL import Image, UnidentifiedImageError


ASCII_CHARS = "@%#*+=-:. "
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
ALLOWED_FORMATS = {"JPEG": ".jpg", "PNG": ".png"}
MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MIN_ASCII_WIDTH = 20
MAX_ASCII_WIDTH = 500


def validate_width(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("Width must be an integer.")
    try:
        width = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Width must be an integer.") from exc
    if not MIN_ASCII_WIDTH <= width <= MAX_ASCII_WIDTH:
        raise ValueError(f"Width must be between {MIN_ASCII_WIDTH} and {MAX_ASCII_WIDTH}.")
    return width


def validate_public_url(url: Any) -> str:
    if not isinstance(url, str) or not url.strip():
        raise ValueError("Image URL is required.")
    cleaned = url.strip()
    parsed = urlsplit(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Use a public HTTP or HTTPS image URL.")
    if parsed.username or parsed.password:
        raise ValueError("Image URLs cannot contain credentials.")

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except (OSError, ValueError) as exc:
        raise ValueError("Unable to resolve the image URL host.") from exc
    if not addresses:
        raise ValueError("Unable to resolve the image URL host.")
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Image URL must resolve to a public internet address.")
    return cleaned


class PublicRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        return super().redirect_request(req, fp, code, msg, headers, validate_public_url(newurl))


def fetch_image_url(url: Any) -> tuple[bytes, str, str]:
    safe_url = validate_public_url(url)
    request = Request(safe_url, headers={"User-Agent": "ASCIIVisualizer/0.1"})
    opener = build_opener(PublicRedirectHandler())
    try:
        with opener.open(request, timeout=12) as response:
            final_url = validate_public_url(response.geturl())
            content_type = response.headers.get_content_type().lower()
            if content_type not in ALLOWED_CONTENT_TYPES:
                raise ValueError("URL did not return a PNG or JPEG image.")
            declared_size = response.headers.get("Content-Length")
            if declared_size:
                try:
                    content_length = int(declared_size)
                except ValueError:
                    content_length = 0
                if content_length > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Image download exceeds the 12 MB limit.")
            data = response.read(MAX_DOWNLOAD_BYTES + 1)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Unable to download the image URL.") from exc
    if len(data) > MAX_DOWNLOAD_BYTES:
        raise ValueError("Image download exceeds the 12 MB limit.")
    return data, safe_source_name(final_url), content_type


def safe_source_name(url: str) -> str:
    name = unquote(PurePosixPath(urlsplit(url).path).name) or "image"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", PurePosixPath(name).stem).strip("-._") or "image"
    return stem[:48]


def resize_image(image: Image.Image, new_width: int) -> Image.Image:
    width, height = image.size
    new_height = max(1, int((height / width) * new_width * 0.55))
    return image.resize((new_width, new_height))


def prepare_image(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        image = background
    else:
        image = image.convert("RGB")
    return image.convert("L")


def pixels_to_ascii(image: Image.Image) -> str:
    get_pixels = getattr(image, "get_flattened_data", image.getdata)
    return "".join(ASCII_CHARS[pixel * (len(ASCII_CHARS) - 1) // 255] for pixel in get_pixels())


def convert_image_bytes(data: bytes, source_name: str, width: Any) -> dict[str, Any]:
    ascii_width = validate_width(width)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as original:
                if original.format not in ALLOWED_FORMATS:
                    raise ValueError("Downloaded file is not a PNG or JPEG image.")
                image_format = original.format
                original.load()
                original_width, original_height = original.size
                if original_width * original_height > MAX_IMAGE_PIXELS:
                    raise ValueError("Image exceeds the 40 megapixel limit.")
                resized = resize_image(original, ascii_width)
                grayscale = prepare_image(resized)
    except ValueError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Downloaded file is not a valid PNG or JPEG image.") from exc

    output_width, output_height = grayscale.size
    ascii_string = pixels_to_ascii(grayscale)
    ascii_image = "\n".join(
        ascii_string[index:index + output_width]
        for index in range(0, len(ascii_string), output_width)
    )
    extension = ALLOWED_FORMATS[image_format]
    source_file = f"{source_name}{extension}"
    header = (
        f"Source file: {source_file}\n"
        f"Source resolution: {original_width} x {original_height} pixels\n"
        f"ASCII resolution:  {output_width} x {output_height} characters\n\n"
    )
    return {
        "filename": f"{source_name[:14]}-{output_width}.txt",
        "text": header + ascii_image,
        "sourceWidth": original_width,
        "sourceHeight": original_height,
        "asciiWidth": output_width,
        "asciiHeight": output_height,
    }


def convert_image_url(url: Any, width: Any) -> dict[str, Any]:
    data, source_name, _content_type = fetch_image_url(url)
    return convert_image_bytes(data, source_name, width)
