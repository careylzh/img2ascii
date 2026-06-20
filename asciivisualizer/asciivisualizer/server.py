from __future__ import annotations

import argparse
import json
import mimetypes
import os
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


STATIC_DIR = Path(__file__).with_name("static")


@dataclass
class AppConfig:
    root: Path
    host: str
    port: int


def resolve_folder(folder: str) -> Path:
    root = Path(folder).expanduser().resolve()
    if not root.exists():
        raise ValueError(f"Folder does not exist: {root}")
    if not root.is_dir():
        raise ValueError(f"Not a folder: {root}")
    return root


def normalize_root(folder: str) -> Path:
    try:
        return resolve_folder(folder)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


def safe_text_path(root: Path, relative_path: str) -> Path:
    if not relative_path:
        raise ValueError("Missing file path.")

    requested = (root / unquote(relative_path)).resolve()
    try:
        requested.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path is outside the configured folder.") from exc

    if requested.suffix.lower() != ".txt":
        raise ValueError("Only .txt files can be viewed.")
    if not requested.is_file():
        raise FileNotFoundError(relative_path)
    return requested


def text_dimensions(path: Path) -> tuple[int, int]:
    rows = 0
    columns = 0
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            rows += 1
            columns = max(columns, len(line.rstrip("\n\r")))
    return rows, columns


def list_ascii_files(root: Path) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.txt"), key=lambda item: item.relative_to(root).as_posix().lower()):
        if not path.is_file():
            continue
        stat = path.stat()
        rows, columns = text_dimensions(path)
        relative = path.relative_to(root).as_posix()
        files.append(
            {
                "path": relative,
                "name": path.name,
                "folder": path.parent.relative_to(root).as_posix() if path.parent != root else "",
                "size": stat.st_size,
                "modified": int(stat.st_mtime),
                "rows": rows,
                "columns": columns,
            }
        )
    return files


class VisualizerHandler(BaseHTTPRequestHandler):
    config: AppConfig

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/", "/index.html"}:
            self.send_static(STATIC_DIR / "index.html", include_body=False)
            return
        if parsed.path.startswith("/static/"):
            relative_static = parsed.path.removeprefix("/static/")
            self.send_static(STATIC_DIR / relative_static, include_body=False)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/files":
                self.send_json({"root": str(self.config.root), "files": list_ascii_files(self.config.root)})
                return
            if parsed.path == "/api/file":
                query = parse_qs(parsed.query)
                relative = query.get("path", [""])[0]
                path = safe_text_path(self.config.root, relative)
                self.send_text(path.read_text(encoding="utf-8", errors="replace"))
                return
            if parsed.path in {"/", "/index.html"}:
                self.send_static(STATIC_DIR / "index.html")
                return
            if parsed.path.startswith("/static/"):
                relative_static = parsed.path.removeprefix("/static/")
                self.send_static(STATIC_DIR / relative_static)
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
        except FileNotFoundError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
        except ValueError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, str(exc))

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/folder":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            payload = self.read_json_body()
            folder = payload.get("folder", "")
            if not isinstance(folder, str):
                raise ValueError("Folder must be a string.")
            self.config.root = resolve_folder(folder)
            self.send_json({"root": str(self.config.root), "files": list_ascii_files(self.config.root)})
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON body")
        except ValueError as exc:
            self.send_error(HTTPStatus.BAD_REQUEST, str(exc))

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("Missing request body.")
        if length > 8192:
            raise ValueError("Request body is too large.")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object.")
        return payload

    def send_json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text: str) -> None:
        body = text.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_static(self, path: Path, include_body: bool = True) -> None:
        requested = path.resolve()
        try:
            requested.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid static path")
            return
        if not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "Asset not found")
            return

        body = requested.read_bytes()
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def make_handler(config: AppConfig) -> type[VisualizerHandler]:
    class ConfiguredHandler(VisualizerHandler):
        pass

    ConfiguredHandler.config = config
    return ConfiguredHandler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve a local ASCII art folder in a browser UI.")
    parser.add_argument("folder", nargs="?", default=os.getcwd(), help="Folder containing .txt ASCII files.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind. Defaults to 127.0.0.1.")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind. Defaults to 8765.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = AppConfig(root=normalize_root(args.folder), host=args.host, port=args.port)
    server = ThreadingHTTPServer((config.host, config.port), make_handler(config))
    print(f"Serving ASCII files from {config.root}")
    print(f"Open http://{config.host}:{config.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")


if __name__ == "__main__":
    main()
