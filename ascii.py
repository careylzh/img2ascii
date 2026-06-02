from pathlib import Path
from PIL import Image
import sys
from time import sleep

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
    get_pixels = getattr(image, "get_flattened_data", image.getdata)
    pixels = get_pixels()
    return "".join(
        ASCII_CHARS[pixel * (len(ASCII_CHARS) - 1) // 255]
        for pixel in pixels
    )


def image_to_ascii(image_path, width=120):
    try:
        original_image = Image.open(image_path)
    except Exception as e:
        print(f"Skipping {image_path.name}: unable to open image ({e})")
        return None

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

    return full_output


def save_ascii_file(image_path, ascii_output):
    output_file = image_path.with_suffix(".txt")
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(ascii_output)

    print(f"Saved: {output_file}")
    return output_file


def iter_repo_images(repo_dir):
    return sorted(
        file for file in repo_dir.rglob("*")
        if file.is_file()
        and file.suffix.lower() in SUPPORTED_EXTENSIONS
        and ".git" not in file.parts
    )


def main():
    repo_dir = Path(__file__).resolve().parent
    width = int(sys.argv[1]) if len(sys.argv) > 1 else 120

    image_files = iter_repo_images(repo_dir)

    if not image_files:
        print("No .png, .jpg, or .jpeg files found in this repo.")
        return

    print(f"Found {len(image_files)} image(s) in {repo_dir}\n")

    for index, image_file in enumerate(image_files, start=1):
        ascii_output = image_to_ascii(image_file, width)
        if ascii_output is None:
            continue

        save_ascii_file(image_file, ascii_output)
        print()
        print(ascii_output)

        if index < len(image_files):
            sleep(3)

    print("\nDone.")


if __name__ == "__main__":
    main()
