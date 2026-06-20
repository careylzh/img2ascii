from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from PIL import Image

from asciivisualizer.converter import convert_image_bytes, validate_public_url, validate_width
from asciivisualizer.server import VisualizerHandler, list_ascii_files, safe_text_path


class ServerTests(unittest.TestCase):
    def test_list_ascii_files_recurses_and_reports_dimensions(self) -> None:
        with TemporaryDirectory() as folder:
            root = Path(folder)
            nested = root / "frames"
            nested.mkdir()
            (root / "one.txt").write_text("ab\ncde\n", encoding="utf-8")
            (nested / "two.txt").write_text("x\n", encoding="utf-8")
            (root / "ignore.md").write_text("nope", encoding="utf-8")

            files = list_ascii_files(root)

        self.assertEqual([file["path"] for file in files], ["frames/two.txt", "one.txt"])
        self.assertEqual(files[1]["rows"], 2)
        self.assertEqual(files[1]["columns"], 3)

    def test_safe_text_path_rejects_outside_root(self) -> None:
        with TemporaryDirectory() as folder:
            root = Path(folder)
            outside = root.parent / "outside.txt"
            outside.write_text("nope", encoding="utf-8")
            self.addCleanup(outside.unlink)

            with self.assertRaises(ValueError):
                safe_text_path(root, "../outside.txt")

    def test_safe_text_path_rejects_non_txt(self) -> None:
        with TemporaryDirectory() as folder:
            root = Path(folder)
            image = root / "image.png"
            image.write_text("nope", encoding="utf-8")

            with self.assertRaises(ValueError):
                safe_text_path(root, "image.png")

    def test_convert_png_bytes_uses_ascii_algorithm(self) -> None:
        buffer = BytesIO()
        image = Image.new("RGBA", (20, 10), (0, 0, 0, 128))
        image.save(buffer, format="PNG")

        result = convert_image_bytes(buffer.getvalue(), "sample", 40)

        self.assertEqual(result["filename"], "sample-40.txt")
        self.assertEqual(result["asciiWidth"], 40)
        self.assertEqual(result["asciiHeight"], 11)
        self.assertIn("Source resolution: 20 x 10 pixels", result["text"])
        self.assertIn("ASCII resolution:  40 x 11 characters", result["text"])

    def test_converter_rejects_private_urls_and_invalid_widths(self) -> None:
        with self.assertRaises(ValueError):
            validate_public_url("http://127.0.0.1/image.png")
        with self.assertRaises(ValueError):
            validate_width(501)

    def test_convert_url_api_returns_generated_text(self) -> None:
        expected = {
            "filename": "sample-120.txt",
            "text": "ASCII",
            "sourceWidth": 10,
            "sourceHeight": 10,
            "asciiWidth": 120,
            "asciiHeight": 66,
        }
        handler = object.__new__(VisualizerHandler)
        handler.path = "/api/convert-url"
        handler.read_json_body = Mock(return_value={"url": "https://example.com/sample.jpg", "width": 120})
        handler.send_json = Mock()
        handler.send_error = Mock()

        with patch("asciivisualizer.server.convert_image_url", return_value=expected) as convert:
            handler.do_POST()

        handler.send_json.assert_called_once_with(expected)
        handler.send_error.assert_not_called()
        convert.assert_called_once_with("https://example.com/sample.jpg", 120)


if __name__ == "__main__":
    unittest.main()
