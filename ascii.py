from pathlib import Path
from PIL import Image
import sys

ASCII_CHARS = "@%#*+=-:. "
SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg"}


def resize_image(image, new_width=120):
    width, height = image.size
    aspect_ratio = height / width
    new_height = int(aspect_ratio * new_width * 0.55)
    return image.resize((new_width, max(1, new_height)))


def prepare_image(image):
    # Handle PNGs with transparency by compositing onto a white background
    if image.mode in ("RGBA", "LA"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[-1])
        image = background
    else:
        image = image.convert("RGB")
    return image.convert("L")


def pixels_to_ascii(image):
    pixels = image.getdata()
    return "".join(
        ASCII_CHARS[pixel * (len(ASCII_CHARS) - 1) // 255]
        for pixel in pixels
    )


def image_to_ascii_file(image_path, output_dir, width=120):
    try:
        original_image = Image.open(image_path)
    except Exception as e:
        print(f"Skipping {image_path.name}: unable to open image ({e})")
        return

    original_width, original_height = original_image.size

    resized_image = resize_image(original_image, width)
    ascii_width, ascii_height = resized_image.size

    grayscale_image = prepare_image(resized_image)
    ascii_str = pixels_to_ascii(grayscale_image)

    ascii_img = "\n".join(
        ascii_str[i:i + ascii_width]
        for i in range(0, len(ascii_str), ascii_width)
    )

    header = (
        f"Source file: {image_path.name}\n"
        f"Source resolution: {original_width} x {original_height} pixels\n"
        f"ASCII resolution:  {ascii_width} x {ascii_height} characters\n\n"
    )

    full_output = header + ascii_img

    output_file = output_dir / f"{image_path.stem}.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(full_output)

    print(f"Saved: {output_file}")


def main():
    downloads_dir = Path.home() / "Downloads"
    output_dir = Path.home() / "Desktop"
    output_dir.mkdir(exist_ok=True)

    width = int(sys.argv[1]) if len(sys.argv) > 1 else 120

    image_files = [
        file for file in downloads_dir.iterdir()
        if file.is_file() and file.suffix.lower() in SUPPORTED_EXTENSIONS
    ]

    if not image_files:
        print("No .png, .jpg, or .jpeg files found in Downloads.")
        return

    print(f"Found {len(image_files)} image(s) in {downloads_dir}")
    print(f"Saving ASCII outputs to {output_dir}\n")

    for image_file in image_files:
        image_to_ascii_file(image_file, output_dir, width)

    print("\nDone.")


if __name__ == "__main__":
    main()