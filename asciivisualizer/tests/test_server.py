from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from asciivisualizer.server import list_ascii_files, safe_text_path


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


if __name__ == "__main__":
    unittest.main()
